import type { InventoryItem, MovementDraft, MovementPayload, StockCity, StockShift } from './types';

export function stockError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function movementDelta(draft: MovementDraft): number {
  const negative = draft.movementType === 'SALE' || draft.movementType === 'DAMAGED'
    || (draft.movementType === 'CORRECTION' && draft.direction === 'reduce');
  return negative ? -draft.quantity : draft.quantity;
}

export function createMovementPayload(
  draft: MovementDraft,
  item: InventoryItem,
  context: { city: StockCity; shift: StockShift | null; sharedWorkerMode: boolean; workerUserId: string | null },
  idempotencyKey: string,
): MovementPayload {
  const { city, shift, sharedWorkerMode, workerUserId } = context;
  if (item.cityId !== city.id) throw new Error('Reload this city stock before recording a movement.');
  if (city.roleInCity === 'viewer') throw new Error('This city is read only for your account.');
  if (draft.movementType !== 'SALE' && city.roleInCity !== 'manager') {
    throw new Error('Manager access is required for stock adjustments.');
  }
  if (!Number.isSafeInteger(draft.quantity) || draft.quantity < 1) {
    throw new Error('Enter a whole quantity of at least 1.');
  }
  const needsShift = draft.movementType === 'SALE' || sharedWorkerMode;
  if (needsShift && (!shift || shift.status !== 'active' || shift.endedAt || shift.cityId !== city.id)) {
    throw new Error('Start an active shift for this city before recording this operation.');
  }
  if (sharedWorkerMode && (!workerUserId || shift?.userId !== workerUserId)) {
    throw new Error('Select a worker with an active shift in this city.');
  }
  const quantityDelta = movementDelta(draft);
  if (quantityDelta < 0 && -quantityDelta > Math.max(0, item.availableStock)) {
    throw new Error('The quantity exceeds the available stock. Reserved tyres cannot be removed.');
  }
  if (draft.movementType === 'CORRECTION' && !draft.note.trim()) {
    throw new Error('Enter a reason for the stock correction.');
  }
  const emergency = draft.movementType === 'SALE' && draft.saleChannel === 'EMERGENCY_CALL_OUT';
  if (emergency && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.bookingId.trim())) {
    throw new Error('Enter the booking ID for this emergency sale.');
  }
  if (draft.note.length > 500) throw new Error('Keep the note within 500 characters.');
  return {
    cityId: city.id, tyreProductId: item.tyreProductId, movementType: draft.movementType,
    quantityDelta, shiftId: shift?.cityId === city.id ? shift.id : null,
    workerUserId: sharedWorkerMode ? workerUserId : null,
    saleChannel: draft.movementType === 'SALE' ? draft.saleChannel : null,
    bookingId: emergency ? draft.bookingId.trim() : null,
    note: draft.note.trim() || null,
    reason: draft.movementType === 'CORRECTION' ? draft.note.trim() : null,
    idempotencyKey,
  };
}

export function operationKey(): string {
  return `stock-app:${Date.now()}:${Math.random().toString(36).slice(2)}:${Math.random().toString(36).slice(2)}`;
}
