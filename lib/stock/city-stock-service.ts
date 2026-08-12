import { Pool } from '@neondatabase/serverless';
import {
  validateCityStockMovementDelta,
  type CityStockMovementType,
  type CityStockSaleChannel,
} from './city-stock-domain';

type QueryResultRow = Record<string, unknown>;
type QueryResult = { rows: QueryResultRow[]; rowCount?: number | null };
type QueryClient = {
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  release(): void;
};

const MIN_DRIVER_SHIFT_END_AGE_MS = 60_000;

export type CityStockErrorCode =
  | 'ACTIVE_SHIFT_EXISTS'
  | 'DB_ERROR'
  | 'FORBIDDEN'
  | 'INSUFFICIENT_STOCK'
  | 'INVALID_INPUT'
  | 'INVALID_MOVEMENT'
  | 'NOT_FOUND'
  | 'NO_ACTIVE_SHIFT'
  | 'SHIFT_CITY_MISMATCH';

export interface StockShiftSummary {
  id: string;
  userId: string;
  cityId: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
}

export interface StockMovementSummary {
  movementId: string;
  cityId: string;
  tyreProductId: string;
  movementType: CityStockMovementType;
  quantityDelta: number;
  balanceBefore: number;
  balanceAfter: number;
  alreadyApplied: boolean;
}

export type StartStockShiftResult = {
  success: true;
  shift: StockShiftSummary;
  alreadyStarted: boolean;
} | {
  success: false;
  code: CityStockErrorCode;
  error: string;
};

export type EndStockShiftResult = {
  success: true;
  shift: StockShiftSummary;
  alreadyEnded: boolean;
} | {
  success: false;
  code: CityStockErrorCode;
  error: string;
};

export type StockMovementResult = {
  success: true;
  movement: StockMovementSummary;
} | {
  success: false;
  code: CityStockErrorCode;
  error: string;
};

export interface StartStockShiftParams {
  userId: string;
  cityId: string;
  idempotencyKey?: string | null;
}

export interface EndStockShiftParams {
  shiftId: string;
  requesterUserId: string;
  adminOverrideReason?: string | null;
}

export interface RecordCityStockMovementParams {
  cityId: string;
  tyreProductId: string;
  movementType: CityStockMovementType;
  quantityDelta: number;
  actorUserId?: string | null;
  shiftId?: string | null;
  bookingId?: string | null;
  saleChannel?: CityStockSaleChannel | null;
  reversesMovementId?: string | null;
  idempotencyKey?: string | null;
  reason?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
  requireActiveShift?: boolean;
}

export interface ReverseCityStockSaleParams {
  movementId: string;
  actorUserId?: string | null;
  shiftId?: string | null;
  idempotencyKey?: string | null;
  reason?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
}

function getPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8_000,
  });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : `${value ?? ''}`;
}

function nullableText(value: unknown): string | null {
  return value == null ? null : text(value);
}

function integer(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return text(value);
}

function toTimeMs(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(text(value)).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function shiftFromRow(row: QueryResultRow): StockShiftSummary {
  return {
    id: text(row.id),
    userId: text(row.user_id),
    cityId: text(row.city_id),
    startedAt: toIso(row.started_at),
    endedAt: nullableText(row.ended_at),
    status: text(row.status),
  };
}

function movementFromRow(row: QueryResultRow): StockMovementSummary {
  return {
    movementId: text(row.id),
    cityId: text(row.city_id),
    tyreProductId: text(row.tyre_product_id),
    movementType: text(row.movement_type) as CityStockMovementType,
    quantityDelta: integer(row.quantity_delta),
    balanceBefore: integer(row.previous_balance),
    balanceAfter: integer(row.resulting_balance),
    alreadyApplied: true,
  };
}

async function ensureCityAccess(
  client: QueryClient,
  userId: string,
  cityId: string,
  allowedRoles: string[] = ['operator', 'manager'],
): Promise<boolean> {
  const result = await client.query(
    `SELECT a.id
       FROM stock_cities c
       JOIN stock_user_city_access a ON a.city_id = c.id
      WHERE c.id = $1
        AND a.user_id = $2
        AND c.is_active = true
        AND a.is_active = true
        AND a.role_in_city::text = ANY($3)
      LIMIT 1`,
    [cityId, userId, allowedRoles],
  );
  return result.rows.length > 0;
}

async function getExistingMovementByIdempotencyKey(
  client: QueryClient,
  idempotencyKey?: string | null,
): Promise<StockMovementSummary | null> {
  if (!idempotencyKey) return null;
  const existing = await client.query(
    `SELECT id, city_id, tyre_product_id, movement_type, quantity_delta, previous_balance, resulting_balance
       FROM stock_movements
      WHERE idempotency_key = $1
      LIMIT 1`,
    [idempotencyKey],
  );
  return existing.rows[0] ? movementFromRow(existing.rows[0]) : null;
}

async function verifyShiftForCity(
  client: QueryClient,
  shiftId: string,
  cityId: string,
): Promise<{ ok: true } | { ok: false; code: CityStockErrorCode; error: string }> {
  const shift = await client.query(
    `SELECT id, city_id, ended_at, status
       FROM stock_shifts
      WHERE id = $1
      FOR UPDATE`,
    [shiftId],
  );
  const row = shift.rows[0];
  if (!row || row.status !== 'active' || row.ended_at) {
    return { ok: false, code: 'NO_ACTIVE_SHIFT', error: 'An active stock shift is required' };
  }
  if (row.city_id !== cityId) {
    return { ok: false, code: 'SHIFT_CITY_MISMATCH', error: 'Shift city does not match stock city' };
  }
  return { ok: true };
}

async function applyMovementInTransaction(
  client: QueryClient,
  params: RecordCityStockMovementParams,
): Promise<StockMovementResult> {
  const deltaCheck = validateCityStockMovementDelta(params.movementType, params.quantityDelta);
  if (!deltaCheck.valid) {
    return { success: false, code: 'INVALID_INPUT', error: deltaCheck.error };
  }
  if (params.movementType === 'SALE' && !params.saleChannel) {
    return { success: false, code: 'INVALID_INPUT', error: 'Sale channel is required for SALE movements' };
  }
  if ((params.requireActiveShift || (params.movementType === 'SALE' && !params.bookingId)) && !params.shiftId) {
    return { success: false, code: 'NO_ACTIVE_SHIFT', error: 'An active stock shift is required' };
  }
  if (params.shiftId) {
    const shiftCheck = await verifyShiftForCity(client, params.shiftId, params.cityId);
    if (!shiftCheck.ok) return { success: false, code: shiftCheck.code, error: shiftCheck.error };
  }

  const existing = await getExistingMovementByIdempotencyKey(client, params.idempotencyKey);
  if (existing) return { success: true, movement: existing };

  const balanceResult = await client.query(
    `SELECT id, current_stock
       FROM stock_inventory_balances
      WHERE city_id = $1 AND tyre_product_id = $2
      FOR UPDATE`,
    [params.cityId, params.tyreProductId],
  );

  let balanceId = text(balanceResult.rows[0]?.id);
  const previousBalance = integer(balanceResult.rows[0]?.current_stock);

  if (!balanceResult.rows[0]) {
    if (params.quantityDelta < 0) {
      return {
        success: false,
        code: 'INSUFFICIENT_STOCK',
        error: 'City has no stock balance for this tyre product',
      };
    }
    const created = await client.query(
      `INSERT INTO stock_inventory_balances
         (id, city_id, tyre_product_id, current_stock, reserved_stock, ordered_stock, min_stock, target_stock, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 0, 0, 0, 0, 0, NOW(), NOW())
       RETURNING id`,
      [params.cityId, params.tyreProductId],
    );
    balanceId = text(created.rows[0]?.id);
  }

  const resultingBalance = previousBalance + params.quantityDelta;
  if (resultingBalance < 0) {
    return {
      success: false,
      code: 'INSUFFICIENT_STOCK',
      error: `Insufficient city stock: ${previousBalance} available, ${Math.abs(params.quantityDelta)} requested`,
    };
  }

  await client.query(
    `UPDATE stock_inventory_balances
        SET current_stock = $1,
            updated_at = NOW()
      WHERE id = $2`,
    [resultingBalance, balanceId],
  );

  const inserted = await client.query(
    `INSERT INTO stock_movements
       (id, city_id, tyre_product_id, movement_type, quantity_delta, previous_balance, resulting_balance,
        actor_user_id, shift_id, booking_id, sale_channel, reverses_movement_id, idempotency_key,
        reason, note, metadata, occurred_at, created_at)
     VALUES
       (gen_random_uuid(), $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15::jsonb, NOW(), NOW())
     RETURNING id, city_id, tyre_product_id, movement_type, quantity_delta, previous_balance, resulting_balance`,
    [
      params.cityId,
      params.tyreProductId,
      params.movementType,
      params.quantityDelta,
      previousBalance,
      resultingBalance,
      params.actorUserId ?? null,
      params.shiftId ?? null,
      params.bookingId ?? null,
      params.saleChannel ?? null,
      params.reversesMovementId ?? null,
      params.idempotencyKey ?? null,
      params.reason ?? null,
      params.note ?? null,
      JSON.stringify(params.metadata ?? {}),
    ],
  );

  const movement = movementFromRow(inserted.rows[0]);
  return { success: true, movement: { ...movement, alreadyApplied: false } };
}

export async function startStockShift(params: StartStockShiftParams): Promise<StartStockShiftResult> {
  const pool = getPool();
  const client = await pool.connect() as QueryClient;

  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '8s'");

    if (params.idempotencyKey) {
      const existingByKey = await client.query(
        `SELECT id, user_id, city_id, started_at, ended_at, status
           FROM stock_shifts
          WHERE idempotency_key = $1
          LIMIT 1`,
        [params.idempotencyKey],
      );
      const existing = existingByKey.rows[0];
      if (existing) {
        if (existing.user_id !== params.userId || existing.city_id !== params.cityId) {
          await client.query('ROLLBACK');
          return { success: false, code: 'ACTIVE_SHIFT_EXISTS', error: 'Idempotency key belongs to another shift request' };
        }
        await client.query('COMMIT');
        return { success: true, shift: shiftFromRow(existing), alreadyStarted: true };
      }
    }

    const hasAccess = await ensureCityAccess(client, params.userId, params.cityId);
    if (!hasAccess) {
      await client.query('ROLLBACK');
      return { success: false, code: 'FORBIDDEN', error: 'User does not have active access to this stock city' };
    }

    const active = await client.query(
      `SELECT id, user_id, city_id, started_at, ended_at, status
         FROM stock_shifts
        WHERE user_id = $1 AND ended_at IS NULL
        FOR UPDATE`,
      [params.userId],
    );

    const activeShift = active.rows[0];
    if (activeShift) {
      await client.query('COMMIT');
      if (activeShift.city_id === params.cityId) {
        return { success: true, shift: shiftFromRow(activeShift), alreadyStarted: true };
      }
      return { success: false, code: 'ACTIVE_SHIFT_EXISTS', error: 'User already has an active shift in another city' };
    }

    const inserted = await client.query(
      `INSERT INTO stock_shifts
         (id, user_id, city_id, status, idempotency_key, metadata, started_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'active', $3, '{}'::jsonb, NOW(), NOW(), NOW())
       RETURNING id, user_id, city_id, started_at, ended_at, status`,
      [params.userId, params.cityId, params.idempotencyKey ?? null],
    );

    await client.query('COMMIT');
    return { success: true, shift: shiftFromRow(inserted.rows[0]), alreadyStarted: false };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[startStockShift] error:', err);
    return { success: false, code: 'DB_ERROR', error: err instanceof Error ? err.message : 'Unknown DB error' };
  } finally {
    client.release();
    await pool.end();
  }
}

export async function endStockShift(params: EndStockShiftParams): Promise<EndStockShiftResult> {
  const pool = getPool();
  const client = await pool.connect() as QueryClient;

  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '8s'");

    const result = await client.query(
      `SELECT id, user_id, city_id, started_at, ended_at, status
         FROM stock_shifts
        WHERE id = $1
        FOR UPDATE`,
      [params.shiftId],
    );
    const row = result.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return { success: false, code: 'NOT_FOUND', error: 'Stock shift not found' };
    }
    if (row.user_id !== params.requesterUserId && !params.adminOverrideReason) {
      await client.query('ROLLBACK');
      return { success: false, code: 'FORBIDDEN', error: 'Only the shift user or an admin override can end this shift' };
    }
    if (row.ended_at || row.status === 'ended') {
      await client.query('COMMIT');
      return { success: true, shift: shiftFromRow(row), alreadyEnded: true };
    }
    const startedAtMs = toTimeMs(row.started_at);
    if (!params.adminOverrideReason && startedAtMs != null && Date.now() - startedAtMs < MIN_DRIVER_SHIFT_END_AGE_MS) {
      await client.query('ROLLBACK');
      return {
        success: false,
        code: 'INVALID_INPUT',
        error: 'Shift was just started. Wait before ending it.',
      };
    }

    const updated = await client.query(
      `UPDATE stock_shifts
          SET ended_at = NOW(),
              status = 'ended',
              ended_by_user_id = $2,
              admin_override_reason = $3,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, user_id, city_id, started_at, ended_at, status`,
      [params.shiftId, params.requesterUserId, params.adminOverrideReason ?? null],
    );

    await client.query('COMMIT');
    return { success: true, shift: shiftFromRow(updated.rows[0]), alreadyEnded: false };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[endStockShift] error:', err);
    return { success: false, code: 'DB_ERROR', error: err instanceof Error ? err.message : 'Unknown DB error' };
  } finally {
    client.release();
    await pool.end();
  }
}

export async function recordCityStockMovement(
  params: RecordCityStockMovementParams,
): Promise<StockMovementResult> {
  const pool = getPool();
  const client = await pool.connect() as QueryClient;

  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '8s'");
    const result = await applyMovementInTransaction(client, params);
    if (!result.success) {
      await client.query('ROLLBACK');
      return result;
    }
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[recordCityStockMovement] error:', err);
    return { success: false, code: 'DB_ERROR', error: err instanceof Error ? err.message : 'Unknown DB error' };
  } finally {
    client.release();
    await pool.end();
  }
}

export async function reverseCityStockSale(params: ReverseCityStockSaleParams): Promise<StockMovementResult> {
  const pool = getPool();
  const client = await pool.connect() as QueryClient;

  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '8s'");

    const existing = await getExistingMovementByIdempotencyKey(client, params.idempotencyKey);
    if (existing) {
      await client.query('COMMIT');
      return { success: true, movement: existing };
    }

    const originalResult = await client.query(
      `SELECT id, city_id, tyre_product_id, movement_type, quantity_delta, booking_id, sale_channel
         FROM stock_movements
        WHERE id = $1
        FOR UPDATE`,
      [params.movementId],
    );
    const original = originalResult.rows[0];
    if (!original) {
      await client.query('ROLLBACK');
      return { success: false, code: 'NOT_FOUND', error: 'Original stock movement not found' };
    }
    if (original.movement_type !== 'SALE') {
      await client.query('ROLLBACK');
      return { success: false, code: 'INVALID_MOVEMENT', error: 'Only SALE movements can be reversed by undo' };
    }

    const existingReversal = await client.query(
      `SELECT id, city_id, tyre_product_id, movement_type, quantity_delta, previous_balance, resulting_balance
         FROM stock_movements
        WHERE reverses_movement_id = $1
        LIMIT 1`,
      [params.movementId],
    );
    if (existingReversal.rows[0]) {
      await client.query('COMMIT');
      return { success: true, movement: movementFromRow(existingReversal.rows[0]) };
    }

    const result = await applyMovementInTransaction(client, {
      cityId: text(original.city_id),
      tyreProductId: text(original.tyre_product_id),
      movementType: 'SALE_REVERSAL',
      quantityDelta: Math.abs(integer(original.quantity_delta)),
      actorUserId: params.actorUserId ?? null,
      shiftId: params.shiftId ?? null,
      bookingId: nullableText(original.booking_id),
      saleChannel: nullableText(original.sale_channel) as CityStockSaleChannel | null,
      reversesMovementId: params.movementId,
      idempotencyKey: params.idempotencyKey ?? null,
      reason: params.reason ?? 'undo_sale',
      note: params.note ?? null,
      metadata: params.metadata ?? null,
      requireActiveShift: Boolean(params.shiftId),
    });
    if (!result.success) {
      await client.query('ROLLBACK');
      return result;
    }

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[reverseCityStockSale] error:', err);
    return { success: false, code: 'DB_ERROR', error: err instanceof Error ? err.message : 'Unknown DB error' };
  } finally {
    client.release();
    await pool.end();
  }
}
