import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

type ApiModule = {
  api: { get<T>(path: string): Promise<T>; post<T>(path: string, body: unknown): Promise<T> };
  setAdminToken(token: string | null): void;
  getAdminToken(): string | null;
  setApiBaseUrl(base: string): void;
  getApiBaseUrl(): string;
  setOnUnauthorized(callback: (() => void) | null): void;
};
const source = fs.readFileSync(path.resolve(__dirname, '../../assisted-chat-app/src/lib/api.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;

function harness() {
  const fetch = vi.fn(async () => Response.json({ ok: true }));
  const fixtureModule = { exports: {} };
  new vm.Script(compiled).runInNewContext({
    module: fixtureModule, exports: fixtureModule.exports, URL, fetch, AbortController, setTimeout, clearTimeout, __DEV__: false, process: { env: { NODE_ENV: 'production' } },
    require: (id: string) => {
      if (id === 'expo-constants') return { __esModule: true, default: { expoConfig: {} } };
      if (id === 'react-native') return { Platform: { OS: 'ios' } };
      if (id === './startup-logging') return { logStartupModuleStarted: vi.fn(), logStartupModuleCompleted: vi.fn(), logStartupModuleFailed: vi.fn() };
      throw new Error(`Unexpected isolated module: ${id}`);
    },
  });
  return { client: fixtureModule.exports as ApiModule, fetch };
}

describe('API authorization failures preserve persistent admin sign-in', () => {
  it('reports a retryable verification failure without clearing the token or notifying logout', async () => {
    const { client, fetch } = harness();
    const unauthorized = vi.fn();
    client.setAdminToken('isolated-saved-token');
    client.setOnUnauthorized(unauthorized);
    fetch.mockResolvedValue(Response.json({ error: 'Session expired. Please log in again.' }, { status: 401 }));
    await expect(client.api.get('/isolated')).rejects.toMatchObject({ name: 'ApiError', status: 401, message: 'Unable to verify this session. Please retry.' });
    expect(client.getAdminToken()).toBe('isolated-saved-token');
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it.each([401, 200])('does not let an older response (%s) revert the selected backend or newer token', async (status) => {
    const { client, fetch } = harness();
    let finish!: (response: Response) => void;
    fetch.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    client.setAdminToken('isolated-old-token');
    const request = client.api.get('/isolated').catch((error: unknown) => error);
    client.setApiBaseUrl('https://www.dukestreettyres.com');
    client.setAdminToken('isolated-new-token');
    finish(Response.json({ ok: status === 200 }, { status }));
    await request;
    expect(client.getApiBaseUrl()).toBe('https://www.dukestreettyres.com');
    expect(client.getAdminToken()).toBe('isolated-new-token');
  });

  it('preserves an existing session during network failure and allows a later retry', async () => {
    const { client, fetch } = harness();
    client.setAdminToken('isolated-saved-token');
    fetch.mockRejectedValueOnce(new Error('Isolated offline'));
    await expect(client.api.get('/isolated')).rejects.toThrow('Isolated offline');
    expect(client.getAdminToken()).toBe('isolated-saved-token');
    await expect(client.api.get('/isolated')).resolves.toEqual({ ok: true });
  });

  it('uses the retryable 401 message even when an intermediary returns malformed JSON', async () => {
    const { client, fetch } = harness();
    client.setAdminToken('isolated-saved-token');
    fetch.mockResolvedValue(new Response('{invalid', { status: 401, headers: { 'Content-Type': 'application/json' } }));
    await expect(client.api.get('/isolated')).rejects.toMatchObject({ name: 'ApiError', status: 401, message: 'Unable to verify this session. Please retry.' });
    expect(client.getAdminToken()).toBe('isolated-saved-token');
  });

  it('captures the request credential and uses the new one on a subsequent request', async () => {
    const { client, fetch } = harness();
    client.setAdminToken('isolated-old-token');
    await client.api.get('/isolated');
    client.setAdminToken('isolated-new-token');
    await client.api.get('/isolated');
    const calls = fetch.mock.calls as unknown as Array<[string, { headers: Record<string, string> }]>;
    expect(calls[0][1].headers.Authorization).toBe('Bearer isolated-old-token');
    expect(calls[1][1].headers.Authorization).toBe('Bearer isolated-new-token');
  });
});
