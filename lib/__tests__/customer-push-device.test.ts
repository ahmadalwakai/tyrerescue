import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ storage: new Map<string, string>(), request: vi.fn() }));
vi.mock('../../tyre-rescue/src/secure-storage', () => ({
  getSecureItem: async (key: string) => state.storage.get(key) ?? null,
  setSecureItem: async (key: string, value: string) => { state.storage.set(key, value); },
  deleteSecureItem: async (key: string) => { state.storage.delete(key); },
}));
vi.mock('../../tyre-rescue/src/api', () => ({ API: { customerPushToken: '/device' }, requestJson: (...args: unknown[]) => state.request(...args) }));

beforeEach(() => { vi.resetModules(); state.storage.clear(); state.request.mockReset(); state.request.mockResolvedValue({ ok: true }); });
describe('customer device account lifecycle', () => {
  it('serializes logout after an in-flight registration and deletes only the current device token', async () => {
    const module = await import('../../tyre-rescue/src/customer-push-device');
    let finish!: () => void;
    const posted = new Promise<void>((resolve) => { finish = resolve; });
    state.request.mockImplementationOnce(() => posted);
    const registration = module.registerCustomerPushDevice({ token: 'device-a', platform: 'ios', authToken: 'account-a', scope: module.customerPushScope() });
    await vi.waitFor(() => expect(state.request).toHaveBeenCalledTimes(1));
    const detach = module.detachCustomerPushDevice('account-a');
    finish();
    await registration;
    await detach;
    expect(state.request.mock.calls[1][1]).toMatchObject({ method: 'DELETE', headers: { Authorization: 'Bearer account-a' }, body: JSON.stringify({ token: 'device-a' }) });
    expect(state.storage.has('customer_push_cleanup_v1')).toBe(false);
  });
  it('retains offline cleanup and retries it before another account is registered', async () => {
    const module = await import('../../tyre-rescue/src/customer-push-device');
    await module.registerCustomerPushDevice({ token: 'device-a', platform: 'ios', authToken: 'account-a', scope: module.customerPushScope() });
    state.request.mockRejectedValueOnce(new Error('Network request failed'));
    await module.detachCustomerPushDevice('account-a');
    expect(state.storage.has('customer_push_cleanup_v1')).toBe(true);
    await module.registerCustomerPushDevice({ token: 'device-a', platform: 'ios', authToken: 'account-b', scope: module.customerPushScope() });
    expect(state.request.mock.calls.slice(-2).map((call) => call[1].method)).toEqual(['DELETE', 'POST']);
    expect(state.request.mock.calls.at(-1)?.[1].headers.Authorization).toBe('Bearer account-b');
  });
  it('ignores a queued registration captured before logout', async () => {
    const module = await import('../../tyre-rescue/src/customer-push-device');
    const oldScope = module.customerPushScope();
    await module.detachCustomerPushDevice(null);
    expect(await module.registerCustomerPushDevice({ token: 'device-a', platform: 'ios', authToken: 'account-a', scope: oldScope })).toBe(false);
    expect(state.request).not.toHaveBeenCalled();
  });
});
