/**
 * Stock Service — Transactional Stock Mutations
 *
 * All stock-changing operations go through this module.
 * Every mutation is wrapped in a transaction with movement logging.
 *
 * Uses @neondatabase/serverless Pool for real transactions
 * (the neon-http driver used by lib/db does not support transactions).
 */

import { Pool } from '@neondatabase/serverless';
import { sanitizeInt } from './stock-domain';

// ── Types ──────────────────────────────────────────────

export type StockAdjustmentReason =
  | 'manual-edit'
  | 'import'
  | 'quote-reserve'
  | 'quote-release'
  | 'sale'
  | 'refund'
  | 'cancel'
  | 'activation'
  | 'deactivation';

export type MovementActor = 'admin' | 'system' | 'webhook' | 'cron';

export type StockResult = {
  success: true;
  productId: string;
  stockBefore: number;
  stockAfter: number;
  delta: number;
  movementId: string | null;
} | {
  success: false;
  error: string;
  code: 'NOT_FOUND' | 'INSUFFICIENT_STOCK' | 'INVALID_INPUT' | 'ALREADY_RELEASED' | 'DB_ERROR';
};

export type ReleaseResult = {
  success: true;
  releasedCount: number;
  restoredProducts: Array<{ productId: string; quantityRestored: number }>;
} | {
  success: false;
  error: string;
  code: string;
};

export interface AdjustStockParams {
  productId: string;
  newStock: number;
  reason: StockAdjustmentReason;
  actor: MovementActor;
  actorUserId?: string | null;
  bookingId?: string | null;
  note?: string;
}

export interface ReserveStockParams {
  tyreId: string;
  quantity: number;
  expiresAt: Date;
  actor: MovementActor;
  actorUserId?: string | null;
  note?: string;
}

export type ReserveStockResult = {
  success: true;
  reservationId: string;
  stockAfter: number;
} | {
  success: false;
  error: string;
  code: 'NOT_FOUND' | 'INSUFFICIENT_STOCK' | 'UNAVAILABLE' | 'DB_ERROR';
};

export interface ReleaseReservationsParams {
  /** Release by specific reservation IDs */
  reservationIds?: string[];
  /** Release by tyre ID (all unreleased) */
  tyreId?: string;
  /** Release by booking ID */
  bookingId?: string;
  /** Whether to restore stock (true for expirations/cancellations, false for sales) */
  restoreStock: boolean;
  reason: StockAdjustmentReason;
  actor: MovementActor;
  actorUserId?: string | null;
  note?: string;
}

export interface RestoreBookingStockParams {
  bookingId: string;
  reason: StockAdjustmentReason;
  actor: MovementActor;
  actorUserId?: string | null;
  note?: string;
}

export interface LogMovementParams {
  tyreId: string;
  bookingId?: string | null;
  movementType: string;
  quantityDelta: number;
  stockAfter: number;
  actor: MovementActor;
  actorUserId?: string | null;
  note?: string;
}

// ── Pool Helper ────────────────────────────────────────

function getPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8_000,
  });
}

// ── Adjust Stock (manual edit, import, etc.) ───────────

export async function adjustStock(params: AdjustStockParams): Promise<StockResult> {
  const { productId, newStock, reason, actorUserId, bookingId, note } = params;

  if (newStock < 0) {
    return { success: false, error: 'Stock cannot be negative', code: 'INVALID_INPUT' };
  }
  if (!Number.isInteger(newStock)) {
    return { success: false, error: 'Stock must be an integer', code: 'INVALID_INPUT' };
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, stock_new FROM tyre_products WHERE id = $1 FOR UPDATE`,
      [productId],
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: `Product not found: ${productId}`, code: 'NOT_FOUND' };
    }

    const stockBefore = sanitizeInt(rows[0].stock_new);
    const delta = newStock - stockBefore;

    if (delta === 0) {
      await client.query('ROLLBACK');
      return { success: true, productId, stockBefore, stockAfter: newStock, delta: 0, movementId: null };
    }

    await client.query(
      `UPDATE tyre_products SET stock_new = $1, updated_at = NOW() WHERE id = $2`,
      [newStock, productId],
    );

    const movementType = mapReasonToMovementType(reason, delta);
    const { rows: movRows } = await client.query(
      `INSERT INTO inventory_movements (id, tyre_id, booking_id, movement_type, quantity_delta, stock_after, actor_user_id, note)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [productId, bookingId ?? null, movementType, delta, newStock, actorUserId ?? null, note ?? `${reason}: ${stockBefore} → ${newStock}`],
    );

    await client.query('COMMIT');

    return {
      success: true,
      productId,
      stockBefore,
      stockAfter: newStock,
      delta,
      movementId: movRows[0]?.id ?? null,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[adjustStock] error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown DB error', code: 'DB_ERROR' };
  } finally {
    client.release();
    await pool.end();
  }
}

// ── Reserve Stock (quote creation) ─────────────────────

export async function reserveStock(params: ReserveStockParams): Promise<ReserveStockResult> {
  const { tyreId, quantity, expiresAt, actorUserId, note } = params;

  if (quantity <= 0 || !Number.isInteger(quantity)) {
    return { success: false, error: 'Quantity must be a positive integer', code: 'INSUFFICIENT_STOCK' };
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '8s'");

    // Lock row and check stock
    const { rows } = await client.query(
      `SELECT id, stock_new, available_new, price_new FROM tyre_products WHERE id = $1 FOR UPDATE SKIP LOCKED`,
      [tyreId],
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Product locked or not found', code: 'NOT_FOUND' };
    }

    const row = rows[0];
    if (!row.available_new) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Product is not available', code: 'UNAVAILABLE' };
    }

    const currentStock = sanitizeInt(row.stock_new);
    if (currentStock < quantity) {
      await client.query('ROLLBACK');
      return { success: false, error: `Insufficient stock: ${currentStock} available, ${quantity} requested`, code: 'INSUFFICIENT_STOCK' };
    }

    const newStock = currentStock - quantity;

    // Decrement stock
    const updateResult = await client.query(
      `UPDATE tyre_products SET stock_new = stock_new - $1, updated_at = NOW() WHERE id = $2 AND stock_new >= $1 RETURNING id`,
      [quantity, tyreId],
    );

    if (updateResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Stock changed during processing', code: 'INSUFFICIENT_STOCK' };
    }

    // Create reservation
    const { rows: resRows } = await client.query(
      `INSERT INTO inventory_reservations (id, tyre_id, booking_id, quantity, expires_at, released)
       VALUES (gen_random_uuid(), $1, NULL, $2, $3, false)
       RETURNING id`,
      [tyreId, quantity, expiresAt],
    );

    // Log movement
    await client.query(
      `INSERT INTO inventory_movements (id, tyre_id, booking_id, movement_type, quantity_delta, stock_after, actor_user_id, note)
       VALUES (gen_random_uuid(), $1, NULL, 'reserve', $2, $3, $4, $5)`,
      [tyreId, -quantity, newStock, actorUserId ?? null, note ?? `Reserved ${quantity} for quote`],
    );

    await client.query('COMMIT');

    return {
      success: true,
      reservationId: resRows[0].id,
      stockAfter: newStock,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[reserveStock] error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown DB error', code: 'DB_ERROR' };
  } finally {
    client.release();
    await pool.end();
  }
}

// ── Release Reservations ───────────────────────────────

export async function releaseReservations(params: ReleaseReservationsParams): Promise<ReleaseResult> {
  const { reservationIds, tyreId, bookingId, restoreStock, reason, actorUserId, note } = params;

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Build WHERE clause for finding reservations
    let whereClause: string;
    let whereParams: unknown[];

    if (reservationIds && reservationIds.length > 0) {
      whereClause = `id = ANY($1) AND released = false`;
      whereParams = [reservationIds];
    } else if (bookingId) {
      whereClause = `booking_id = $1 AND released = false`;
      whereParams = [bookingId];
    } else if (tyreId) {
      whereClause = `tyre_id = $1 AND released = false`;
      whereParams = [tyreId];
    } else {
      await client.query('ROLLBACK');
      return { success: false, error: 'Must specify reservationIds, tyreId, or bookingId', code: 'INVALID_INPUT' };
    }

    // Find and lock unreleased reservations
    const { rows: reservations } = await client.query(
      `SELECT id, tyre_id, quantity FROM inventory_reservations WHERE ${whereClause} FOR UPDATE`,
      whereParams,
    );

    if (reservations.length === 0) {
      await client.query('COMMIT');
      return { success: true, releasedCount: 0, restoredProducts: [] };
    }

    // Mark all as released
    const resIds = reservations.map((r: { id: string }) => r.id);
    await client.query(
      `UPDATE inventory_reservations SET released = true WHERE id = ANY($1)`,
      [resIds],
    );

    const restoredProducts: Array<{ productId: string; quantityRestored: number }> = [];

    if (restoreStock) {
      // Group by tyre_id to batch restores
      const restoreMap = new Map<string, number>();
      for (const r of reservations) {
        if (!r.tyre_id) continue; // skip if product was deleted
        restoreMap.set(r.tyre_id, (restoreMap.get(r.tyre_id) ?? 0) + r.quantity);
      }

      for (const [prodId, totalQty] of restoreMap) {
        // Restore stock — check product still exists
        const { rows: prodRows } = await client.query(
          `UPDATE tyre_products SET stock_new = stock_new + $1, updated_at = NOW() WHERE id = $2 RETURNING stock_new`,
          [totalQty, prodId],
        );

        if (prodRows.length > 0) {
          const stockAfter = prodRows[0].stock_new;
          restoredProducts.push({ productId: prodId, quantityRestored: totalQty });

          // Log movement
          await client.query(
            `INSERT INTO inventory_movements (id, tyre_id, booking_id, movement_type, quantity_delta, stock_after, actor_user_id, note)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)`,
            [prodId, bookingId ?? null, mapReasonToMovementType(reason, totalQty), totalQty, stockAfter, actorUserId ?? null, note ?? `${reason}: restored ${totalQty}`],
          );
        }
      }
    }

    await client.query('COMMIT');

    return {
      success: true,
      releasedCount: reservations.length,
      restoredProducts,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[releaseReservations] error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown DB error', code: 'DB_ERROR' };
  } finally {
    client.release();
    await pool.end();
  }
}

// ── Restore Booking Stock (refund/cancel) ──────────────

export async function restoreBookingStock(params: RestoreBookingStockParams): Promise<ReleaseResult> {
  const { bookingId, reason, actorUserId, note } = params;

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get booking tyres to know what to restore
    const { rows: bookingTyreRows } = await client.query(
      `SELECT bt.tyre_id, bt.quantity
       FROM booking_tyres bt
       WHERE bt.booking_id = $1 AND bt.tyre_id IS NOT NULL`,
      [bookingId],
    );

    if (bookingTyreRows.length === 0) {
      await client.query('COMMIT');
      return { success: true, releasedCount: 0, restoredProducts: [] };
    }

    // Check if reservations were already released for this booking
    const { rows: existingReleased } = await client.query(
      `SELECT id FROM inventory_reservations WHERE booking_id = $1 AND released = true LIMIT 1`,
      [bookingId],
    );

    // Release any unreleased reservations first
    const { rows: unreleased } = await client.query(
      `SELECT id, tyre_id, quantity FROM inventory_reservations WHERE booking_id = $1 AND released = false FOR UPDATE`,
      [bookingId],
    );

    if (unreleased.length > 0) {
      const unreleasedIds = unreleased.map((r: { id: string }) => r.id);
      await client.query(
        `UPDATE inventory_reservations SET released = true WHERE id = ANY($1)`,
        [unreleasedIds],
      );
    }

    // If reservations were already released, stock was already restored — skip
    if (existingReleased.length > 0 && unreleased.length === 0) {
      await client.query('COMMIT');
      return { success: true, releasedCount: 0, restoredProducts: [] };
    }

    // Restore stock for each booking tyre
    const restoredProducts: Array<{ productId: string; quantityRestored: number }> = [];

    for (const bt of bookingTyreRows) {
      const { rows: prodRows } = await client.query(
        `UPDATE tyre_products SET stock_new = stock_new + $1, updated_at = NOW() WHERE id = $2 RETURNING stock_new`,
        [bt.quantity, bt.tyre_id],
      );

      if (prodRows.length > 0) {
        restoredProducts.push({ productId: bt.tyre_id, quantityRestored: bt.quantity });

        await client.query(
          `INSERT INTO inventory_movements (id, tyre_id, booking_id, movement_type, quantity_delta, stock_after, actor_user_id, note)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)`,
          [bt.tyre_id, bookingId, mapReasonToMovementType(reason, bt.quantity), bt.quantity, prodRows[0].stock_new, actorUserId ?? null, note ?? `${reason}: restored ${bt.quantity}`],
        );
      }
    }

    await client.query('COMMIT');

    return {
      success: true,
      releasedCount: unreleased.length,
      restoredProducts,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[restoreBookingStock] error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown DB error', code: 'DB_ERROR' };
  } finally {
    client.release();
    await pool.end();
  }
}

// ── Log Inventory Movement (standalone) ────────────────

export async function logInventoryMovement(params: LogMovementParams): Promise<{ id: string } | null> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const { rows } = await client.query(
      `INSERT INTO inventory_movements (id, tyre_id, booking_id, movement_type, quantity_delta, stock_after, actor_user_id, note)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [params.tyreId, params.bookingId ?? null, params.movementType, params.quantityDelta, params.stockAfter, params.actorUserId ?? null, params.note ?? null],
    );
    return rows[0] ?? null;
  } catch (err) {
    console.error('[logInventoryMovement] error:', err);
    return null;
  } finally {
    client.release();
    await pool.end();
  }
}

// ── Helpers ────────────────────────────────────────────

function mapReasonToMovementType(reason: StockAdjustmentReason, delta: number): string {
  switch (reason) {
    case 'manual-edit': return delta > 0 ? 'restock' : 'adjustment';
    case 'import': return 'import';
    case 'quote-reserve': return 'reserve';
    case 'quote-release': return 'release';
    case 'sale': return 'sale';
    case 'refund': return 'refund-restore';
    case 'cancel': return 'cancel-restore';
    case 'activation': return 'activation';
    case 'deactivation': return 'deactivation';
    default: return delta > 0 ? 'restock' : 'adjustment';
  }
}
