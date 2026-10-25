import { describe, it, expect } from 'vitest';
import { buildLeakReport, repairNote, REPAIR_NOTE_PREFIX } from '@/lib/inventory/b2b-reservation-leak';

const now = new Date('2026-10-25T12:00:00Z');
const reservedAt = new Date('2026-10-20T10:00:00Z');

function log(reservationId: string, extra: Record<string, unknown> = {}) {
  return {
    createdAt: reservedAt,
    metadata: { tyreId: 'tyre-1', quantity: 2, reference: `REF-${reservationId}`, reservationId, ...extra },
  };
}

function reservation(id: string, overrides: Partial<{ released: boolean; expiresAt: Date; tyreId: string | null }> = {}) {
  return {
    id,
    tyreId: 'tyre-1',
    quantity: 2,
    released: false,
    expiresAt: new Date('2026-10-20T11:00:00Z'),
    ...overrides,
  };
}

const empty = { repairedReservationIds: new Set<string>(), stockEdits: [], legacyDeducts: [], now };

describe('buildLeakReport', () => {
  it('marks released and expired legacy holds for restore', () => {
    const report = buildLeakReport({
      ...empty,
      logs: [log('a'), log('b')],
      reservations: [reservation('a', { released: true }), reservation('b')],
    });

    expect(report.holds.map((h) => [h.reservationId, h.state, h.status])).toEqual([
      ['a', 'released', 'restore'],
      ['b', 'expired', 'restore'],
    ]);
    expect(report.totals.restorableUnits).toBe(4);
  });

  it('also restores active legacy holds, which are counted twice today', () => {
    const report = buildLeakReport({
      ...empty,
      logs: [log('a')],
      reservations: [reservation('a', { expiresAt: new Date('2026-10-30T00:00:00Z') })],
    });

    expect(report.holds[0]).toMatchObject({ state: 'active', status: 'restore' });
  });

  it('ignores holds written after the soft-hold fix', () => {
    const report = buildLeakReport({
      ...empty,
      logs: [log('a', { holdType: 'soft' })],
      reservations: [reservation('a')],
    });

    expect(report.holds).toEqual([]);
  });

  it('skips holds that an earlier run already repaired', () => {
    const report = buildLeakReport({
      ...empty,
      repairedReservationIds: new Set(['a']),
      logs: [log('a')],
      reservations: [reservation('a', { released: true })],
    });

    expect(report.holds[0].status).toBe('already_repaired');
    expect(report.totals).toEqual({ restorableUnits: 0, reviewUnits: 0, alreadyRepairedUnits: 2 });
  });

  it('sends holds on tyres edited by hand afterwards to review', () => {
    const report = buildLeakReport({
      ...empty,
      stockEdits: [
        { tyreId: 'tyre-1', movementType: 'adjustment', createdAt: new Date('2026-10-22T09:00:00Z') },
        { tyreId: 'tyre-1', movementType: 'import', createdAt: new Date('2026-10-01T09:00:00Z') },
      ],
      logs: [log('a')],
      reservations: [reservation('a', { released: true })],
    });

    expect(report.holds[0].status).toBe('review_adjusted');
    expect(report.holds[0].laterStockEdits).toEqual(['adjustment@2026-10-22T09:00:00.000Z']);
    expect(report.totals.reviewUnits).toBe(2);
  });

  it('reports holds whose reservation row or product is gone', () => {
    const report = buildLeakReport({
      ...empty,
      logs: [log('missing'), log('deleted')],
      reservations: [reservation('deleted', { tyreId: null })],
    });

    expect(report.holds.map((h) => h.status)).toEqual(['missing_reservation', 'product_deleted']);
    expect(report.totals.restorableUnits).toBe(0);
  });

  it('counts each reservation once even if logged twice', () => {
    const report = buildLeakReport({
      ...empty,
      logs: [log('a'), log('a')],
      reservations: [reservation('a', { released: true })],
    });

    expect(report.holds).toHaveLength(1);
  });

  it('flags tyres whose legacy deductions exceed what the logs explain', () => {
    const report = buildLeakReport({
      ...empty,
      logs: [log('a')],
      reservations: [reservation('a', { released: true })],
      legacyDeducts: [
        { tyreId: 'tyre-1', quantityDelta: -2 },
        { tyreId: 'tyre-1', quantityDelta: -3 },
        { tyreId: 'tyre-2', quantityDelta: -1 },
      ],
    });

    expect(report.mismatches).toEqual([
      { tyreId: 'tyre-1', deductedByMovements: 5, coveredByLogs: 2 },
      { tyreId: 'tyre-2', deductedByMovements: 1, coveredByLogs: 0 },
    ]);
  });

  it('builds repair notes the marker lookup can parse back', () => {
    const note = repairNote('res-123', 2);
    expect(note.startsWith(`${REPAIR_NOTE_PREFIX}res-123 `)).toBe(true);
    expect(note.slice(REPAIR_NOTE_PREFIX.length).split(' ')[0]).toBe('res-123');
  });
});
