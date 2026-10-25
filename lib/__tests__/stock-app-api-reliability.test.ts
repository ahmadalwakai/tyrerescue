import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Client = {
  ApiError: new (...args: unknown[]) => Error;
  setApiAuthToken(token: string | null): void;
  stockApi: {
    cities(): Promise<unknown>;
    inventory(cityId: string, search: string, season: string, sort: string, options?: { page?: number; signal?: AbortSignal; tyreProductId?: string }): Promise<unknown>;
    movementReceipt(cityId: string, idempotencyKey: string): Promise<{ movement: unknown }>;
    recordMovement(payload: Record<string, unknown>): Promise<unknown>;
  };
};
const source = fs.readFileSync(path.resolve(__dirname, '../../stock-app/src/api/client.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
let stockApi: Client['stockApi'];
let ApiError: Client['ApiError'];
let setApiAuthToken: Client['setApiAuthToken'];

beforeEach(() => {
  const fixtureModule = { exports: {} as Client };
  new vm.Script(compiled).runInNewContext({
    module: fixtureModule, exports: fixtureModule.exports, Error, AbortController, Promise, process, __DEV__: false,
    fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
    setTimeout: (handler: () => void, delay: number) => setTimeout(handler, delay),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    require: (id: string) => {
      if (id === 'react-native') return { Platform: { OS: 'ios' } };
      if (id === 'expo-constants') return { __esModule: true, default: {} };
      throw new Error(`Unexpected isolated module ${id}`);
    },
  });
  ({ stockApi, ApiError, setApiAuthToken } = fixtureModule.exports);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setApiAuthToken(null);
});

describe('stock app API reliability', () => {
  it('sends a real sale and reuses the caller idempotency key on retry', async () => {
    const fetchMock = vi.fn(async () => Response.json({ movement: { id: 'movement-1' } }));
    vi.stubGlobal('fetch', fetchMock);
    setApiAuthToken('fixture-token');
    const payload = {
      cityId: 'city', tyreProductId: 'tyre', shiftId: 'shift', movementType: 'SALE' as const,
      saleChannel: 'GARAGE' as const, quantityDelta: -3, note: '3 tyres', idempotencyKey: 'same-sale-attempt',
    };
    await stockApi.recordMovement(payload);
    await stockApi.recordMovement(payload);
    for (const [, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(JSON.parse(String(init.body))).toEqual(payload);
      expect(init.headers).toMatchObject({ Authorization: 'Bearer fixture-token' });
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('passes paging/filter parameters and cancellation through to inventory', async () => {
    const response = { items: [], page: 2, totalPages: 3, totalCount: 105, summary: { current: 105, available: 100, reserved: 5, toBuy: 20, totalProducts: 105 } };
    const fetchMock = vi.fn(async () => Response.json(response));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    await expect(stockApi.inventory('city / 1', '205/55', 'winter', 'brand', { page: 2, signal: controller.signal, tyreProductId: 'exact-product' })).resolves.toEqual(response);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/cities/city%20%2F%201/inventory?');
    expect(new URL(url).searchParams.get('page')).toBe('2');
    expect(new URL(url).searchParams.get('search')).toBe('205/55');
    expect(new URL(url).searchParams.get('season')).toBe('winter');
    expect(new URL(url).searchParams.get('tyreProductId')).toBe('exact-product');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('looks up the exact receipt key and represents a missing receipt as null', async () => {
    const movement = { id: 'saved-movement', movementType: 'SALE', quantityDelta: -2, idempotencyKey: 'saved:key/1' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ items: [movement] }))
      .mockResolvedValueOnce(Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(stockApi.movementReceipt('city / 1', 'saved:key/1')).resolves.toEqual({ movement });
    await expect(stockApi.movementReceipt('city / 1', 'missing')).resolves.toEqual({ movement: null });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/cities/city%20%2F%201/movements?');
    expect(new URL(url).searchParams.get('idempotencyKey')).toBe('saved:key/1');
    expect(new URL(url).searchParams.get('perPage')).toBe('1');
  });

  it.each([undefined, 'different-key'])('rejects an unverifiable receipt key from an old or inconsistent server', async (idempotencyKey) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items: [{ id: 'saved-movement', movementType: 'SALE', quantityDelta: -2, idempotencyKey }] })));
    await expect(stockApi.movementReceipt('city', 'requested-key')).rejects.toMatchObject({ status: 502, message: expect.stringContaining('could not verify') });
  });

  it('enforces the 20 second deadline even when the transport never settles', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const result = stockApi.cities().catch(error => error);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toMatchObject({ name: 'ApiError', status: 0, message: expect.stringContaining('timed out') });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('applies the deadline through body download and rejects caller cancellation', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: () => new Promise(() => {}),
    })));
    const result = stockApi.cities().catch(error => error);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toMatchObject({ status: 0, message: expect.stringContaining('timed out') });

    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const controller = new AbortController();
    const cancelled = stockApi.inventory('city', '', 'all', 'size', { signal: controller.signal }).catch(error => error);
    controller.abort();
    expect(await cancelled).toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not send an already cancelled request and preserves HTTP error status', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: 'Session expired' }, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(stockApi.inventory('city', '', 'all', 'size', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(stockApi.cities()).rejects.toMatchObject({ status: 401, message: 'Session expired' });
  });

  it('reports offline failure without leaking transport internals', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Network secret fixture'); }));
    const error = await stockApi.cities().catch(error => error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.message).toContain('internet connection');
    expect(error.message).not.toContain('secret');
  });
});
