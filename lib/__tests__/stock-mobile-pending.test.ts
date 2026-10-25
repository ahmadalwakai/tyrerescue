import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import type { InventoryItem, MovementDraft, MovementPayload } from '../../stock-app/src/types';

const source = fs.readFileSync(path.resolve(__dirname, '../../stock-app/src/pending-movement.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
type PendingMovement = { payload: MovementPayload; draft: MovementDraft; item: InventoryItem };
type PendingApi = {
  readPendingMovement(userId: string): Promise<PendingMovement | null>;
  savePendingMovement(userId: string, movement: PendingMovement): Promise<void>;
  clearPendingMovement(userId: string): Promise<void>;
};

function harness(values = new Map<string, string>()) {
  const storage = {
    getItemAsync: vi.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    deleteItemAsync: vi.fn(async (key: string) => { values.delete(key); }),
  };
  const fixtureModule = { exports: {} as PendingApi };
  new vm.Script(compiled).runInNewContext({
    module: fixtureModule, exports: fixtureModule.exports, Error,
    require: (id: string) => {
      if (id === '@/services/secure-storage') return storage;
      throw new Error(`Unexpected isolated module ${id}`);
    },
  });
  return { ...fixtureModule.exports, storage, values };
}

function fixture(): PendingMovement {
  return {
    payload: { cityId: 'city-1', tyreProductId: 'tyre-1', movementType: 'SALE', quantityDelta: -2, shiftId: 'shift-1', workerUserId: null, saleChannel: 'GARAGE', bookingId: null, note: null, reason: null, idempotencyKey: 'same-operation-after-restart' },
    draft: { movementType: 'SALE', quantity: 2, direction: 'reduce', saleChannel: 'GARAGE', bookingId: '', note: '' },
    item: {
      balanceId: 'balance-1', cityId: 'city-1', tyreProductId: 'tyre-1',
      product: { brand: 'Example', pattern: 'Touring', sizeDisplay: '225/45 R17', season: 'summer', priceNew: 70, availableNew: true },
      currentStock: 8, reservedStock: 5, availableStock: 3, orderedStock: 0, minStock: 1, targetStock: 10, suggestedBuy: 2, updatedAt: null,
    },
  };
}

describe('stock pending movement persistence and recovery', () => {
  it('returns null when no operation was saved and does not clear other storage', async () => {
    const h = harness(new Map([['unrelated', 'keep me']]));
    await expect(h.readPendingMovement('worker-1')).resolves.toBeNull();
    expect(h.storage.deleteItemAsync).not.toHaveBeenCalled();
    expect(h.values.get('unrelated')).toBe('keep me');
  });

  it('recovers the exact payload, operation reference, draft and item after a fresh module instance', async () => {
    const h = harness();
    const operation = fixture();
    await h.savePendingMovement('worker-1', operation);
    const restarted = harness(h.values);
    await expect(restarted.readPendingMovement('worker-1')).resolves.toEqual(operation);
    expect((await restarted.readPendingMovement('worker-1'))?.payload.idempotencyKey).toBe('same-operation-after-restart');
  });

  it('isolates users and clears only the completed user operation', async () => {
    const h = harness();
    await h.savePendingMovement('worker-1', fixture());
    const other = fixture();
    other.payload.idempotencyKey = 'other-worker-operation';
    await h.savePendingMovement('worker-2', other);
    await h.clearPendingMovement('worker-1');
    await expect(h.readPendingMovement('worker-1')).resolves.toBeNull();
    await expect(h.readPendingMovement('worker-2')).resolves.toEqual(other);
  });

  it('keeps the operation recoverable when deleting its journal fails', async () => {
    const h = harness();
    await h.savePendingMovement('worker-1', fixture());
    h.storage.deleteItemAsync.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(h.clearPendingMovement('worker-1')).rejects.toThrow('Storage unavailable');
    await expect(h.readPendingMovement('worker-1')).resolves.toEqual(fixture());
  });

  it('rejects storage-write failure so the caller can stop before sending the mutation', async () => {
    const h = harness();
    h.storage.setItemAsync.mockRejectedValueOnce(new Error('Storage full'));
    await expect(h.savePendingMovement('worker-1', fixture())).rejects.toThrow('Storage full');
    await expect(h.readPendingMovement('worker-1')).resolves.toBeNull();
  });

  it('allows recovery of an old committed receipt without requiring today’s available stock', async () => {
    const h = harness();
    const operation = fixture();
    operation.item.currentStock = 1;
    operation.item.availableStock = -4;
    await h.savePendingMovement('worker-1', operation);
    await expect(h.readPendingMovement('worker-1')).resolves.toEqual(operation);
  });

  it('preserves an emergency booking and correction reason through recovery', async () => {
    const h = harness();
    const emergency = fixture();
    const bookingId = '3ca76ce6-66ab-4f88-aa1a-f15a85dabed2';
    emergency.draft.saleChannel = 'EMERGENCY_CALL_OUT';
    emergency.draft.bookingId = ` ${bookingId} `;
    emergency.payload.saleChannel = 'EMERGENCY_CALL_OUT';
    emergency.payload.bookingId = bookingId;
    await h.savePendingMovement('worker-1', emergency);
    await expect(h.readPendingMovement('worker-1')).resolves.toEqual(emergency);
    const correction = fixture();
    correction.draft.movementType = 'CORRECTION'; correction.draft.note = ' Count correction ';
    correction.payload.movementType = 'CORRECTION'; correction.payload.saleChannel = null;
    correction.payload.note = 'Count correction'; correction.payload.reason = 'Count correction';
    await h.savePendingMovement('worker-1', correction);
    await expect(h.readPendingMovement('worker-1')).resolves.toEqual(correction);
  });

  it.each(['', '{truncated', 'null', '[]', '{"payload":{}}'])('rejects unreadable journal %j with actionable text and leaves it available for investigation', async (raw) => {
    const h = harness();
    await h.savePendingMovement('worker-1', fixture());
    const storageKey = [...h.values.keys()][0];
    h.values.set(storageKey, raw);
    await expect(h.readPendingMovement('worker-1')).rejects.toThrow(/saved stock operation could not be read.*Check movements/);
    expect(h.values.get(storageKey)).toBe(raw);
    expect(h.storage.deleteItemAsync).not.toHaveBeenCalled();
  });

  const malformed: [string, (operation: PendingMovement) => unknown][] = [
    ['different city', (o) => ({ ...o, item: { ...o.item, cityId: 'another-city' } })],
    ['different product', (o) => ({ ...o, item: { ...o.item, tyreProductId: 'another-tyre' } })],
    ['non-string operation reference', (o) => ({ ...o, payload: { ...o.payload, idempotencyKey: 123 } })],
    ['blank operation reference', (o) => ({ ...o, payload: { ...o.payload, idempotencyKey: ' ' } })],
    ['overlong operation reference', (o) => ({ ...o, payload: { ...o.payload, idempotencyKey: 'x'.repeat(201) } })],
    ['missing movement type', (o) => ({ ...o, payload: { ...o.payload, movementType: undefined } })],
    ['unknown movement type', (o) => ({ ...o, payload: { ...o.payload, movementType: 'UNKNOWN' }, draft: { ...o.draft, movementType: 'UNKNOWN' } })],
    ['different displayed movement type', (o) => ({ ...o, draft: { ...o.draft, movementType: 'RECEIVED' } })],
    ['zero draft quantity', (o) => ({ ...o, draft: { ...o.draft, quantity: 0 } })],
    ['fractional draft quantity', (o) => ({ ...o, draft: { ...o.draft, quantity: 1.5 } })],
    ['missing quantity delta', (o) => ({ ...o, payload: { ...o.payload, quantityDelta: undefined } })],
    ['zero quantity delta', (o) => ({ ...o, payload: { ...o.payload, quantityDelta: 0 } })],
    ['unsafe quantity delta', (o) => ({ ...o, payload: { ...o.payload, quantityDelta: Number.MAX_SAFE_INTEGER + 1 } })],
    ['different displayed quantity', (o) => ({ ...o, payload: { ...o.payload, quantityDelta: -3 } })],
    ['wrong stock direction', (o) => ({ ...o, payload: { ...o.payload, quantityDelta: 2 } })],
    ['unknown draft direction', (o) => ({ ...o, draft: { ...o.draft, direction: 'sideways' } })],
    ['missing sale shift', (o) => ({ ...o, payload: { ...o.payload, shiftId: null } })],
    ['different sale channel', (o) => ({ ...o, payload: { ...o.payload, saleChannel: 'EMERGENCY_CALL_OUT' } })],
    ['unknown sale channel', (o) => ({ ...o, payload: { ...o.payload, saleChannel: 'SHOP' }, draft: { ...o.draft, saleChannel: 'SHOP' } })],
    ['garage sale with booking', (o) => ({ ...o, payload: { ...o.payload, bookingId: '3ca76ce6-66ab-4f88-aa1a-f15a85dabed2' } })],
    ['emergency without booking', (o) => ({ ...o, payload: { ...o.payload, saleChannel: 'EMERGENCY_CALL_OUT' }, draft: { ...o.draft, saleChannel: 'EMERGENCY_CALL_OUT' } })],
    ['different saved note', (o) => ({ ...o, payload: { ...o.payload, note: 'Unexpected note' } })],
    ['missing product description', (o) => ({ ...o, item: { ...o.item, product: null } })],
    ['non-numeric stock snapshot', (o) => ({ ...o, item: { ...o.item, currentStock: 'eight' } })],
    ['inconsistent reserved snapshot', (o) => ({ ...o, item: { ...o.item, availableStock: 8 } })],
  ];
  it.each(malformed)('does not replay a malformed record: %s', async (_description, mutate) => {
    const h = harness();
    await h.savePendingMovement('worker-1', fixture());
    h.values.set([...h.values.keys()][0], JSON.stringify(mutate(fixture())));
    await expect(h.readPendingMovement('worker-1')).rejects.toThrow(/saved stock operation could not be read/);
    expect(h.storage.deleteItemAsync).not.toHaveBeenCalled();
  });
});
