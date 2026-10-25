import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerApiError, isCustomerConnectionError, requestJson } from '../../tyre-rescue/src/api';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('customer connection recovery', () => {
  it('times out a stalled request, aborts it and does not retry a mutation', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const result = requestJson('/booking', { method: 'POST', body: '{"requestId":"same-attempt"}' }).catch(error => error);
    await vi.advanceTimersByTimeAsync(20_000);
    const error = await result;
    expect(error).toBeInstanceOf(CustomerApiError);
    expect(error).toMatchObject({ kind: 'timeout', status: null });
    expect(isCustomerConnectionError(error)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0][1];
    expect(init.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('applies the deadline while downloading the JSON body as well', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: () => new Promise(() => {}) })));
    const result = requestJson('/account', undefined, 500).catch(error => error);
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toMatchObject({ kind: 'timeout' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('forwards caller cancellation without treating it as offline', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const result = requestJson('/account', { signal: controller.signal }).catch(error => error);
    controller.abort();
    const error = await result;
    expect(error).toMatchObject({ name: 'AbortError', kind: 'aborted' });
    expect(isCustomerConnectionError(error)).toBe(false);
    const init = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0][1];
    expect(init.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never sends an already cancelled mutation', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(requestJson('/account', { method: 'DELETE', signal: controller.signal })).rejects.toMatchObject({ kind: 'aborted' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('distinguishes an offline launch from an invalid account session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Network request failed'); }));
    const offline = await requestJson('/account').catch(error => error);
    expect(offline).toMatchObject({ kind: 'network', status: null });
    expect(isCustomerConnectionError(offline)).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"Session expired"}', { status: 401 })));
    const expired = await requestJson('/account').catch(error => error);
    expect(expired).toMatchObject({ kind: 'http', status: 401, message: 'Session expired' });
    expect(isCustomerConnectionError(expired)).toBe(false);
  });

  it('reports a connection lost during the response body instead of returning an empty account', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, json: async () => { throw new TypeError('Connection lost during download'); },
    })));
    await expect(requestJson('/account')).rejects.toMatchObject({ kind: 'network', status: null });
  });

  it('keeps server validation messages and cleans up a successful deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"profile":{"name":"Test"}}', { status: 200 })));
    expect(await requestJson('/account')).toEqual({ profile: { name: 'Test' } });
    expect(vi.getTimerCount()).toBe(0);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"Choose another appointment"}', { status: 409 })));
    await expect(requestJson('/booking')).rejects.toMatchObject({ kind: 'http', status: 409, message: 'Choose another appointment' });
    expect(vi.getTimerCount()).toBe(0);
  });
});
