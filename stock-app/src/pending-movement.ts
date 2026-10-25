import * as storage from '@/services/secure-storage';
import type { InventoryItem, MovementDraft, MovementPayload } from '@/types';

export interface PendingMovement {
  payload: MovementPayload;
  draft: MovementDraft;
  item: InventoryItem;
}

function key(userId: string) { return `stock_pending_v1_${userId.replace(/[^a-zA-Z0-9_-]/g, '_')}`; }

const INVALID_OPERATION = 'The saved stock operation could not be read. Check movements before making another change.';
const MOVEMENT_TYPES = new Set(['SALE', 'RECEIVED', 'DAMAGED', 'CORRECTION', 'RETURN']);
const BOOKING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
}

function quantity(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

// Recovery checks the saved operation itself, without depending on a still-active
// shift or today's stock balance. A committed operation can outlive both.
function isPendingMovement(value: unknown): value is PendingMovement {
  const saved = record(value);
  const payload = record(saved?.payload);
  const draft = record(saved?.draft);
  const item = record(saved?.item);
  const product = record(item?.product);
  if (!payload || !draft || !item || !product) return false;
  if (!identifier(payload.idempotencyKey) || !identifier(payload.cityId) || !identifier(payload.tyreProductId)
    || !identifier(item.balanceId) || item.cityId !== payload.cityId || item.tyreProductId !== payload.tyreProductId) return false;
  if (typeof draft.movementType !== 'string' || !MOVEMENT_TYPES.has(draft.movementType) || payload.movementType !== draft.movementType
    || !quantity(draft.quantity, 1) || typeof payload.quantityDelta !== 'number' || !Number.isSafeInteger(payload.quantityDelta) || payload.quantityDelta === 0
    || (draft.direction !== 'add' && draft.direction !== 'reduce')
    || (draft.saleChannel !== 'GARAGE' && draft.saleChannel !== 'EMERGENCY_CALL_OUT')
    || typeof draft.note !== 'string' || draft.note.length > 500 || typeof draft.bookingId !== 'string' || draft.bookingId.length > 200) return false;
  const negative = draft.movementType === 'SALE' || draft.movementType === 'DAMAGED'
    || (draft.movementType === 'CORRECTION' && draft.direction === 'reduce');
  if (payload.quantityDelta !== (negative ? -draft.quantity : draft.quantity)) return false;
  if (payload.shiftId != null && !identifier(payload.shiftId) || payload.workerUserId != null && !identifier(payload.workerUserId)) return false;
  if ((draft.movementType === 'SALE' || payload.workerUserId != null) && !identifier(payload.shiftId)) return false;
  const sale = draft.movementType === 'SALE';
  const emergency = sale && draft.saleChannel === 'EMERGENCY_CALL_OUT';
  if ((payload.saleChannel ?? null) !== (sale ? draft.saleChannel : null)) return false;
  const bookingId = emergency ? draft.bookingId.trim() : null;
  if (emergency && !BOOKING_ID.test(bookingId!) || (payload.bookingId ?? null) !== bookingId) return false;
  const note = draft.note.trim();
  if ((payload.note ?? null) !== (note || null) || (payload.reason ?? null) !== (draft.movementType === 'CORRECTION' ? note : null)
    || draft.movementType === 'CORRECTION' && !note) return false;
  if (!identifier(product.sizeDisplay) || typeof product.brand !== 'string' || typeof product.pattern !== 'string'
    || ![null, 'summer', 'winter', 'allseason'].includes(product.season as string | null)
    || product.priceNew !== null && (typeof product.priceNew !== 'number' || !Number.isFinite(product.priceNew))
    || typeof product.availableNew !== 'boolean') return false;
  for (const field of ['currentStock', 'reservedStock', 'orderedStock', 'minStock', 'targetStock', 'suggestedBuy']) {
    if (!quantity(item[field], 0)) return false;
  }
  if (typeof item.availableStock !== 'number' || !Number.isSafeInteger(item.availableStock)
    || item.availableStock !== Number(item.currentStock) - Number(item.reservedStock)
    || item.updatedAt !== null && typeof item.updatedAt !== 'string') return false;
  return true;
}

export async function readPendingMovement(userId: string): Promise<PendingMovement | null> {
  const raw = await storage.getItemAsync(key(userId));
  if (raw === null) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error(INVALID_OPERATION); }
  if (!isPendingMovement(parsed)) throw new Error(INVALID_OPERATION);
  return parsed;
}

export async function savePendingMovement(userId: string, movement: PendingMovement): Promise<void> {
  if (!isPendingMovement(movement)) throw new Error(INVALID_OPERATION);
  await storage.setItemAsync(key(userId), JSON.stringify(movement));
}

export function clearPendingMovement(userId: string): Promise<void> {
  return storage.deleteItemAsync(key(userId));
}
