/**
 * Pure classification for the B2B reservation stock-leak repair.
 *
 * Before B2B reservations became soft holds, reserveStock() deducted
 * `stock_new` at reserve time and nothing ever added it back: expiry
 * released the hold with `restoreStock: false`. Every such legacy hold is
 * stock that is missing from `stock_new`. Restoring it turns the hold into
 * the soft hold it should have been — an active hold keeps reducing
 * availability until it expires, an expired one no longer does.
 *
 * Used by scripts/audit-b2b-reservation-leak.ts. No database access here.
 */

export const REPAIR_NOTE_PREFIX = 'b2b-leak-repair:';

export function repairNote(reservationId: string, quantity: number): string {
  return `${REPAIR_NOTE_PREFIX}${reservationId} restored ${quantity} deducted by legacy B2B hold`;
}

/** A `reserve_success` audit log written before the soft-hold fix. */
export interface LegacyReserveLog {
  createdAt: Date;
  metadata: unknown;
}

export interface ReservationRow {
  id: string;
  tyreId: string | null;
  quantity: number;
  released: boolean;
  expiresAt: Date;
}

/** A movement on a tyre that may have changed `stock_new` by hand. */
export interface StockEditMovement {
  tyreId: string;
  movementType: string;
  createdAt: Date;
}

/** A legacy `reserve` movement that deducted stock (quantity_delta < 0). */
export interface LegacyDeductMovement {
  tyreId: string;
  quantityDelta: number;
}

export type HoldStatus =
  | 'restore'           // safe to restore automatically
  | 'review_adjusted'   // stock was edited by hand after the hold — check first
  | 'already_repaired'
  | 'missing_reservation'
  | 'product_deleted';

export interface LegacyHold {
  reservationId: string;
  tyreId: string | null;
  quantity: number;
  reference: string | null;
  reservedAt: Date;
  expiresAt: Date | null;
  state: 'active' | 'expired' | 'released' | 'unknown';
  status: HoldStatus;
  /** Manual stock edits on this tyre after the hold was placed. */
  laterStockEdits: string[];
}

export interface TyreMismatch {
  tyreId: string;
  /** Units deducted according to legacy `reserve` movements. */
  deductedByMovements: number;
  /** Units covered by audit logs we could link to a reservation. */
  coveredByLogs: number;
}

export interface LeakReport {
  holds: LegacyHold[];
  /** Tyres where movements show more deducted stock than the audit logs explain. */
  mismatches: TyreMismatch[];
  totals: {
    restorableUnits: number;
    reviewUnits: number;
    alreadyRepairedUnits: number;
  };
}

/** Movement types that mean someone set `stock_new` directly. */
export const STOCK_EDIT_MOVEMENT_TYPES = ['adjustment', 'restock', 'import'] as const;

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function buildLeakReport(input: {
  logs: LegacyReserveLog[];
  reservations: ReservationRow[];
  repairedReservationIds: Set<string>;
  stockEdits: StockEditMovement[];
  legacyDeducts: LegacyDeductMovement[];
  now?: Date;
}): LeakReport {
  const now = input.now ?? new Date();
  const reservationsById = new Map(input.reservations.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const holds: LegacyHold[] = [];

  for (const log of input.logs) {
    if (!log.metadata || typeof log.metadata !== 'object') continue;
    const meta = log.metadata as Record<string, unknown>;
    if (meta.holdType !== undefined) continue; // written after the fix
    const reservationId = readString(meta, 'reservationId');
    if (!reservationId || seen.has(reservationId)) continue;
    seen.add(reservationId);

    const reservation = reservationsById.get(reservationId);
    const loggedQuantity = typeof meta.quantity === 'number' ? meta.quantity : 0;
    const tyreId = reservation ? reservation.tyreId : readString(meta, 'tyreId');
    const quantity = reservation ? reservation.quantity : loggedQuantity;

    const state: LegacyHold['state'] = !reservation
      ? 'unknown'
      : reservation.released
        ? 'released'
        : reservation.expiresAt <= now ? 'expired' : 'active';

    const laterStockEdits = tyreId
      ? input.stockEdits
          .filter((m) => m.tyreId === tyreId && m.createdAt > log.createdAt)
          .map((m) => `${m.movementType}@${m.createdAt.toISOString()}`)
      : [];

    let status: HoldStatus;
    if (input.repairedReservationIds.has(reservationId)) status = 'already_repaired';
    else if (!reservation) status = 'missing_reservation';
    else if (!reservation.tyreId) status = 'product_deleted';
    else if (laterStockEdits.length > 0) status = 'review_adjusted';
    else status = 'restore';

    holds.push({
      reservationId,
      tyreId,
      quantity,
      reference: readString(meta, 'reference'),
      reservedAt: log.createdAt,
      expiresAt: reservation?.expiresAt ?? null,
      state,
      status,
      laterStockEdits,
    });
  }

  const deductedByTyre = new Map<string, number>();
  for (const m of input.legacyDeducts) {
    if (m.quantityDelta >= 0) continue;
    deductedByTyre.set(m.tyreId, (deductedByTyre.get(m.tyreId) ?? 0) - m.quantityDelta);
  }
  const coveredByTyre = new Map<string, number>();
  for (const h of holds) {
    if (!h.tyreId) continue;
    coveredByTyre.set(h.tyreId, (coveredByTyre.get(h.tyreId) ?? 0) + h.quantity);
  }
  const mismatches: TyreMismatch[] = [];
  for (const [tyreId, deducted] of deductedByTyre) {
    const covered = coveredByTyre.get(tyreId) ?? 0;
    if (deducted !== covered) {
      mismatches.push({ tyreId, deductedByMovements: deducted, coveredByLogs: covered });
    }
  }

  const sum = (status: HoldStatus) =>
    holds.filter((h) => h.status === status).reduce((n, h) => n + h.quantity, 0);

  return {
    holds,
    mismatches,
    totals: {
      restorableUnits: sum('restore'),
      reviewUnits: sum('review_adjusted'),
      alreadyRepairedUnits: sum('already_repaired'),
    },
  };
}
