import { describe, expect, it } from 'vitest';
import { createMovementPayload } from '../../stock-app/src/stock-domain';
import type { InventoryItem, MovementDraft, StockCity, StockShift } from '../../stock-app/src/types';

const city: StockCity = { id: 'city-glasgow', slug: 'glasgow', name: 'Glasgow', isActive: true, roleInCity: 'manager' };
const shift: StockShift = { id: 'shift-1', cityId: city.id, userId: 'worker-1', status: 'active', startedAt: '2026-10-24T08:00:00Z', endedAt: null };
const stock: InventoryItem = {
  balanceId: 'balance-1', cityId: city.id, tyreProductId: 'tyre-1',
  product: { brand: 'Example', pattern: 'Touring', sizeDisplay: '225/45 R17', season: 'summer', priceNew: 70, availableNew: true },
  currentStock: 8, reservedStock: 5, availableStock: 3, orderedStock: 0, minStock: 1, targetStock: 10, suggestedBuy: 2, updatedAt: null,
};
const sale: MovementDraft = { movementType: 'SALE', quantity: 2, direction: 'reduce', saleChannel: 'GARAGE', bookingId: '', note: '' };
const context = { city, shift, sharedWorkerMode: false, workerUserId: null };

describe('stock mobile movement permissions and quantities', () => {
  it('allows an operator to sell unreserved tyres in an active city shift', () => {
    const result = createMovementPayload(sale, stock, { ...context, city: { ...city, roleInCity: 'operator' } }, 'sale-request-1');
    expect(result).toMatchObject({ cityId: city.id, tyreProductId: stock.tyreProductId, movementType: 'SALE', quantityDelta: -2, shiftId: shift.id, saleChannel: 'GARAGE', idempotencyKey: 'sale-request-1' });
    expect(result.workerUserId).toBeNull();
  });

  it.each(['RECEIVED', 'RETURN', 'DAMAGED', 'CORRECTION'] as const)('keeps %s restricted to managers', (movementType) => {
    expect(() => createMovementPayload({ ...sale, movementType, quantity: 1, note: 'Stock count check' }, stock, { ...context, city: { ...city, roleInCity: 'operator' } }, 'request-1')).toThrow(/Manager access/);
  });

  it('keeps viewer accounts read only even when they have an active shift', () => {
    expect(() => createMovementPayload(sale, stock, { ...context, city: { ...city, roleInCity: 'viewer' } }, 'request-1')).toThrow(/read only/);
  });

  it('rejects a tyre retained from another city after changing selection', () => {
    expect(() => createMovementPayload(sale, { ...stock, cityId: 'city-edinburgh' }, context, 'request-1')).toThrow(/Reload this city/);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid quantity %s before submission', (quantity) => {
    expect(() => createMovementPayload({ ...sale, quantity }, stock, context, 'request-1')).toThrow(/whole quantity/);
  });

  it.each(['SALE', 'DAMAGED', 'CORRECTION'] as const)('protects reserved tyres during %s', (movementType) => {
    expect(() => createMovementPayload({ ...sale, movementType, quantity: 4, note: 'Count correction' }, stock, context, 'request-1')).toThrow(/Reserved tyres cannot be removed/);
    expect(createMovementPayload({ ...sale, movementType, quantity: 3, note: 'Count correction' }, stock, context, 'request-2').quantityDelta).toBe(-3);
  });

  it('permits receiving stock when reservations already exceed physical stock', () => {
    const result = createMovementPayload({ ...sale, movementType: 'RECEIVED', quantity: 6 }, { ...stock, currentStock: 2, reservedStock: 5, availableStock: -3 }, { ...context, shift: null }, 'receipt-1');
    expect(result.quantityDelta).toBe(6);
    expect(result.shiftId).toBeNull();
    expect(result.saleChannel).toBeNull();
  });
});

describe('stock mobile shift and booking attribution', () => {
  it.each([
    null,
    { ...shift, status: 'ended' as const },
    { ...shift, endedAt: '2026-10-24T09:00:00Z' },
    { ...shift, cityId: 'city-edinburgh' },
  ])('rejects sales without a current active shift for the selected city', (invalidShift) => {
    expect(() => createMovementPayload(sale, stock, { ...context, shift: invalidShift }, 'request-1')).toThrow(/active shift for this city/);
  });

  it('requires a matching worker shift for adjustments made from a shared device', () => {
    const received: MovementDraft = { ...sale, movementType: 'RECEIVED' };
    expect(() => createMovementPayload(received, stock, { ...context, sharedWorkerMode: true, shift: null, workerUserId: 'worker-1' }, 'request-1')).toThrow(/active shift/);
    expect(() => createMovementPayload(received, stock, { ...context, sharedWorkerMode: true, workerUserId: 'worker-2' }, 'request-1')).toThrow(/Select a worker/);
    const result = createMovementPayload(received, stock, { ...context, sharedWorkerMode: true, workerUserId: 'worker-1' }, 'request-2');
    expect(result).toMatchObject({ workerUserId: 'worker-1', shiftId: shift.id, quantityDelta: 2 });
  });

  it('requires the emergency booking ID and carries it only on emergency sales', () => {
    const emergency: MovementDraft = { ...sale, saleChannel: 'EMERGENCY_CALL_OUT' };
    expect(() => createMovementPayload(emergency, stock, context, 'request-1')).toThrow(/booking ID/);
    const bookingId = '3ca76ce6-66ab-4f88-aa1a-f15a85dabed2';
    const result = createMovementPayload({ ...emergency, bookingId: ` ${bookingId} ` }, stock, context, 'request-2');
    expect(result).toMatchObject({ bookingId, saleChannel: 'EMERGENCY_CALL_OUT' });
    expect(createMovementPayload({ ...sale, bookingId }, stock, context, 'request-3').bookingId).toBeNull();
    expect(createMovementPayload({ ...emergency, movementType: 'RETURN', bookingId }, stock, context, 'request-4')).toMatchObject({ bookingId: null, saleChannel: null, quantityDelta: 2 });
  });

  it('requires an explanation for a manual correction and preserves its direction', () => {
    const correction: MovementDraft = { ...sale, movementType: 'CORRECTION', direction: 'add' };
    expect(() => createMovementPayload({ ...correction, note: '   ' }, stock, context, 'request-1')).toThrow(/reason for the stock correction/);
    expect(createMovementPayload({ ...correction, note: ' Found during count ' }, stock, context, 'request-2')).toMatchObject({ quantityDelta: 2, note: 'Found during count', reason: 'Found during count' });
    expect(() => createMovementPayload({ ...correction, note: 'x'.repeat(501) }, stock, context, 'request-3')).toThrow(/500 characters/);
  });
});
