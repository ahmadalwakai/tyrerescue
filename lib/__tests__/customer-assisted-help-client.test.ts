import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ storage: new Map<string, string>(), calls: [] as { path: string; init: RequestInit; body: Record<string, unknown> | null }[],
  request: vi.fn(), failWrite: false, maxBytes: 0 }));
vi.mock('../../tyre-rescue/src/api', () => ({ API: { customerAssistedHelp: '/api/mobile/customer/assisted-help' }, requestJson: state.request }));
vi.mock('../../tyre-rescue/src/secure-storage', () => ({
  getSecureItem: async (key: string) => state.storage.get(key) ?? null,
  setSecureItem: async (key: string, value: string) => { if (state.failWrite) throw new Error('Isolated storage unavailable'); state.maxBytes = Math.max(state.maxBytes, Buffer.byteLength(value)); state.storage.set(key, value); },
  deleteSecureItem: async (key: string) => { state.storage.delete(key); },
}));
import { clearCustomerAssistedHelp, customerAssistedHelpSession, loadCustomerAssistedHelp, refreshCustomerAssistedHelp, submitCustomerAssistedHelp, validateAssistedHelpInput, type AssistedHelpInput } from '../../tyre-rescue/src/customer-assisted-help';

const requestId = '10000000-0000-4000-8000-000000000001';
const input: AssistedHelpInput = { name: 'Synthetic Customer', phone: '07700 900123', address: 'Synthetic vehicle location', lat: 55.86, lng: -4.25,
  vehicleReg: 'AB12 CDE', vehicleMake: 'Synthetic', vehicleModel: 'Fixture', photoUrl: 'https://isolated.invalid/tyre-photos/fixture.jpg', contactConsent: true };
const status = (value = 'pending') => ({ requestId, status: value, reference: `HELP-${requestId.toUpperCase()}` });
const callCount = (action: string) => state.calls.filter(call => call.body?.action === action).length;
const submissions = () => state.calls.filter(call => call.init.method === 'POST' && call.body?.action !== 'prepare');
beforeEach(async () => {
  state.failWrite = false; await clearCustomerAssistedHelp(); state.calls = []; state.maxBytes = 0; state.request.mockReset();
  state.request.mockImplementation(async (path: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : null; state.calls.push({ path, init, body });
    if (body?.action === 'prepare') return { requestId, accessToken: 'isolated-assistance-capability' };
    return status();
  });
});

describe('customer assistance saved receipt and retry behavior', () => {
  it('saves before sending and reuses the original contact details and capability after a lost response', async () => {
    let lost = true;
    state.request.mockImplementation(async (path: string, init: RequestInit = {}) => {
      const body = init.body ? JSON.parse(String(init.body)) : null; state.calls.push({ path, init, body });
      if (body?.action === 'prepare') return { requestId, accessToken: 'isolated-assistance-capability' };
      expect(state.storage.has('customer_assisted_help_v1')).toBe(true);
      if (lost) { lost = false; throw new Error('Isolated response lost after persistence'); }
      return status();
    });
    await expect(submitCustomerAssistedHelp('customer-a', input)).rejects.toThrow('response lost');
    expect((await loadCustomerAssistedHelp('customer-a'))?.status).toBe('prepared');
    const retry = await submitCustomerAssistedHelp('customer-a', { ...input, phone: '07700900999', address: 'Edited after timeout' });
    expect(retry.status).toBe('pending'); expect(callCount('prepare')).toBe(1); expect(submissions()).toHaveLength(2);
    expect(submissions()[1].body).toMatchObject({ requestId, phone: '07700900123', address: input.address, photoUrl: input.photoUrl, contactConsent: true });
    expect(submissions()[1].init.headers).toEqual({ 'X-Assistance-Access': 'isolated-assistance-capability' });
    expect(await loadCustomerAssistedHelp('customer-b')).toBeNull(); expect(await loadCustomerAssistedHelp('guest')).toBeNull();
  });

  it('refuses the callback insert if persisting any retry receipt chunk fails', async () => {
    state.failWrite = true;
    await expect(submitCustomerAssistedHelp('guest', input)).rejects.toThrow('storage unavailable');
    expect(callCount('prepare')).toBe(1); expect(submissions()).toHaveLength(0);
    expect(await loadCustomerAssistedHelp('guest')).toBeNull();
  });

  it('splits long Unicode details into small SecureStore items and restores the exact payload', async () => {
    const long = { ...input, address: '🚗'.repeat(230), photoUrl: `https://isolated.invalid/tyre-photos/${'x'.repeat(1900)}.jpg` };
    await submitCustomerAssistedHelp('guest', long);
    expect(state.maxBytes).toBeLessThanOrEqual(1600);
    expect(state.storage.size).toBeGreaterThan(3);
    expect((await loadCustomerAssistedHelp('guest'))?.input.address).toBe(long.address);
    expect((await loadCustomerAssistedHelp('guest'))?.input.photoUrl).toBe(long.photoUrl);
    await clearCustomerAssistedHelp(); expect(state.storage.size).toBe(0);
  });

  it('never recreates personal storage when a submit response arrives after logout', async () => {
    let resolve!: (value: unknown) => void;
    state.request.mockImplementation(async (path: string, init: RequestInit = {}) => {
      const body = JSON.parse(String(init.body)); state.calls.push({ path, init, body });
      if (body.action === 'prepare') return { requestId, accessToken: 'isolated-assistance-capability' };
      return new Promise(yes => { resolve = yes; });
    });
    const session = customerAssistedHelpSession();
    const sending = submitCustomerAssistedHelp('customer-a', input, session);
    const rejected = expect(sending).rejects.toThrow('account changed');
    await vi.waitFor(() => expect(submissions()).toHaveLength(1));
    const cleanup = clearCustomerAssistedHelp(); resolve(status());
    await rejected; await cleanup;
    expect(state.storage.size).toBe(0); expect(await loadCustomerAssistedHelp('customer-b')).toBeNull();
  });

  it('sends the access capability only in a header and restores the team status without exposing contact details in the URL', async () => {
    await submitCustomerAssistedHelp('guest', input);
    state.request.mockImplementation(async (path: string, init: RequestInit = {}) => { state.calls.push({ path, init, body: null }); return status('reviewed'); });
    expect((await refreshCustomerAssistedHelp('guest'))?.status).toBe('reviewed');
    const read = state.calls.at(-1)!;
    expect(read.path).toBe(`/api/mobile/customer/assisted-help?requestId=${requestId}`);
    expect(read.path).not.toMatch(/capability|07700|Synthetic|accessToken/);
    expect(read.init.headers).toEqual({ 'X-Assistance-Access': 'isolated-assistance-capability' });
  });

  it('requires contact consent, a reachable phone and vehicle identity before preparing anything', async () => {
    for (const change of [{ contactConsent: false }, { phone: '123' }, { vehicleReg: '', photoUrl: undefined }, { lat: NaN }]) {
      const bad = { ...input, ...change };
      expect(validateAssistedHelpInput(bad)).toBeTruthy();
      await expect(submitCustomerAssistedHelp('guest', bad as AssistedHelpInput)).rejects.toThrow();
    }
    expect(state.calls).toHaveLength(0);
  });
});
