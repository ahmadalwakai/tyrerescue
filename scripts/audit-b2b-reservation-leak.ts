/**
 * Audit (and optionally repair) stock lost to legacy B2B reservations.
 *
 * Before the soft-hold fix, POST /api/b2b/stock/reserve deducted stock_new
 * and the expiry cron never added it back. This script finds those holds
 * from their `reserve_success` audit logs and restores the deducted units.
 *
 * Usage:
 *   npm run audit:b2b-leak                        # dry run, report only
 *   npm run audit:b2b-leak -- --json              # report as JSON
 *   npm run audit:b2b-leak -- --apply             # restore 'restore' holds
 *   npm run audit:b2b-leak -- --apply --include-adjusted
 *                                                 # also restore holds on tyres
 *                                                 # edited by hand afterwards
 *
 * Re-running is safe: each restore writes a movement whose note starts with
 * `b2b-leak-repair:<reservationId>`, checked under the product row lock.
 * Deploy the soft-hold fix before running --apply, or new holds would keep
 * deducting stock.
 */

import { Pool } from '@neondatabase/serverless';
import {
  buildLeakReport,
  repairNote,
  REPAIR_NOTE_PREFIX,
  STOCK_EDIT_MOVEMENT_TYPES,
  type LegacyHold,
} from '../lib/inventory/b2b-reservation-leak';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const includeAdjusted = args.has('--include-adjusted');
const asJson = args.has('--json');

async function loadReport(pool: Pool) {
  const { rows: logRows } = await pool.query(
    `SELECT created_at, metadata
       FROM b2b_api_key_audit_logs
      WHERE action = 'reserve_success'
      ORDER BY created_at`,
  );
  const logs = logRows.map((r) => ({ createdAt: new Date(r.created_at), metadata: r.metadata }));

  const reservationIds = logs
    .map((l) => (l.metadata as Record<string, unknown> | null)?.reservationId)
    .filter((id): id is string => typeof id === 'string');

  const { rows: reservationRows } = await pool.query(
    `SELECT id, tyre_id, quantity, released, expires_at
       FROM inventory_reservations
      WHERE id = ANY($1::uuid[])`,
    [reservationIds],
  );

  const { rows: repairRows } = await pool.query(
    `SELECT note FROM inventory_movements WHERE note LIKE $1`,
    [`${REPAIR_NOTE_PREFIX}%`],
  );
  const repairedReservationIds = new Set(
    repairRows.map((r) => String(r.note).slice(REPAIR_NOTE_PREFIX.length).split(' ')[0]),
  );

  const { rows: editRows } = await pool.query(
    `SELECT tyre_id, movement_type, created_at
       FROM inventory_movements
      WHERE movement_type = ANY($1::text[])
        AND tyre_id IS NOT NULL
        AND (note IS NULL OR note NOT LIKE $2)`,
    [STOCK_EDIT_MOVEMENT_TYPES, `${REPAIR_NOTE_PREFIX}%`],
  );

  const { rows: deductRows } = await pool.query(
    `SELECT tyre_id, quantity_delta
       FROM inventory_movements
      WHERE movement_type = 'reserve'
        AND booking_id IS NULL
        AND quantity_delta < 0
        AND note LIKE 'B2B reserve:%'
        AND tyre_id IS NOT NULL`,
  );

  return buildLeakReport({
    logs,
    reservations: reservationRows.map((r) => ({
      id: r.id,
      tyreId: r.tyre_id,
      quantity: Number(r.quantity),
      released: Boolean(r.released),
      expiresAt: new Date(r.expires_at),
    })),
    repairedReservationIds,
    stockEdits: editRows.map((r) => ({
      tyreId: r.tyre_id,
      movementType: r.movement_type,
      createdAt: new Date(r.created_at),
    })),
    legacyDeducts: deductRows.map((r) => ({ tyreId: r.tyre_id, quantityDelta: Number(r.quantity_delta) })),
  });
}

/** Restore one hold's units. Returns false if it was already repaired. */
async function restoreHold(pool: Pool, hold: LegacyHold): Promise<{ restored: boolean; stockAfter?: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '8s'");

    const { rows: product } = await client.query(
      `SELECT id FROM tyre_products WHERE id = $1 FOR UPDATE`,
      [hold.tyreId],
    );
    if (product.length === 0) {
      await client.query('ROLLBACK');
      return { restored: false };
    }

    // Checked under the row lock so two concurrent runs cannot both restore.
    const { rows: marker } = await client.query(
      `SELECT id FROM inventory_movements WHERE tyre_id = $1 AND note LIKE $2 LIMIT 1`,
      [hold.tyreId, `${REPAIR_NOTE_PREFIX}${hold.reservationId}%`],
    );
    if (marker.length > 0) {
      await client.query('ROLLBACK');
      return { restored: false };
    }

    const { rows: updated } = await client.query(
      `UPDATE tyre_products SET stock_new = stock_new + $1, updated_at = NOW() WHERE id = $2 RETURNING stock_new`,
      [hold.quantity, hold.tyreId],
    );
    const stockAfter = Number(updated[0].stock_new);

    await client.query(
      `INSERT INTO inventory_movements (id, tyre_id, booking_id, movement_type, quantity_delta, stock_after, actor_user_id, note)
       VALUES (gen_random_uuid(), $1, NULL, 'restock', $2, $3, NULL, $4)`,
      [hold.tyreId, hold.quantity, stockAfter, repairNote(hold.reservationId, hold.quantity)],
    );

    await client.query('COMMIT');
    return { restored: true, stockAfter };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function printReport(report: Awaited<ReturnType<typeof loadReport>>) {
  console.log(`Legacy B2B holds found: ${report.holds.length}`);
  console.table(
    report.holds.map((h) => ({
      reservation: h.reservationId,
      tyre: h.tyreId,
      qty: h.quantity,
      reference: h.reference,
      reservedAt: h.reservedAt.toISOString(),
      state: h.state,
      status: h.status,
      laterEdits: h.laterStockEdits.length,
    })),
  );
  console.log(`Units to restore automatically: ${report.totals.restorableUnits}`);
  console.log(`Units needing review (tyre edited by hand since the hold): ${report.totals.reviewUnits}`);
  console.log(`Units already restored by an earlier run: ${report.totals.alreadyRepairedUnits}`);

  const other = report.holds.filter((h) => h.status === 'missing_reservation' || h.status === 'product_deleted');
  if (other.length > 0) {
    console.log(`Holds skipped (reservation row or product missing): ${other.length}`);
  }
  if (report.mismatches.length > 0) {
    console.warn('\nTyres where legacy deductions are not fully explained by audit logs');
    console.warn('(an audit log write may have failed — check these by hand):');
    console.table(report.mismatches);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8_000 });

  try {
    const report = await loadReport(pool);
    if (asJson) console.log(JSON.stringify(report, null, 2));
    else printReport(report);

    if (!apply) {
      if (!asJson) console.log('\nDry run — nothing changed. Re-run with --apply to restore stock.');
      return;
    }

    const targets = report.holds.filter(
      (h) => h.status === 'restore' || (includeAdjusted && h.status === 'review_adjusted'),
    );
    let restoredUnits = 0;
    for (const hold of targets) {
      const result = await restoreHold(pool, hold);
      if (result.restored) {
        restoredUnits += hold.quantity;
        console.log(`Restored ${hold.quantity} to tyre ${hold.tyreId} (reservation ${hold.reservationId}) → stock ${result.stockAfter}`);
      } else {
        console.log(`Skipped reservation ${hold.reservationId} (already repaired or product missing)`);
      }
    }
    console.log(`\nDone. Restored ${restoredUnits} units across ${targets.length} holds.`);
    if (!includeAdjusted && report.totals.reviewUnits > 0) {
      console.log(`${report.totals.reviewUnits} units on hand-edited tyres were left for review (--include-adjusted).`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[audit-b2b-reservation-leak] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
