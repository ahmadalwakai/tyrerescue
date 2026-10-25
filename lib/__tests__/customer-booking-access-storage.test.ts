import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ storage: new Map<string, string>() }));
vi.mock('../../tyre-rescue/src/secure-storage', () => ({
  getSecureItem: async (key: string) => state.storage.get(key) ?? null,
  setSecureItem: async (key: string, value: string) => { state.storage.set(key, value); },
  deleteSecureItem: async (key: string) => { state.storage.delete(key); },
}));
beforeEach(() => { vi.resetModules(); state.storage.clear(); });
describe('saved booking capability lifecycle', () => {
  it('invalidates old async booking saves synchronously when signing out', async () => {
    const storage = await import('../../tyre-rescue/src/customer-booking-access');
    const oldScope = storage.bookingAccessScope();
    await storage.saveBookingAccess('TR-A', 'old-private-proof', oldScope);
    const clear = storage.clearBookingAccess();
    await storage.saveBookingAccess('TR-A', 'late-old-private-proof', oldScope);
    await clear;
    expect(await storage.loadBookingAccess('TR-A')).toBe(null);
    await storage.saveBookingAccess('TR-B', 'new-guest-proof', storage.bookingAccessScope());
    expect(await storage.loadBookingAccess('TR-B')).toBe('new-guest-proof');
  });
  it('retains multiple guest receipts without replacing their coordinate or booking identity', async () => {
    const storage = await import('../../tyre-rescue/src/customer-booking-access');
    await Promise.all([storage.saveBookingAccess('tr-a', 'proof-a'), storage.saveBookingAccess('TR-B', 'proof-b')]);
    expect(await storage.loadBookingAccess('TR-A')).toBe('proof-a');
    expect(await storage.loadBookingAccess('tr-b')).toBe('proof-b');
  });
});
