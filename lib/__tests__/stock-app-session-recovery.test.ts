import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

const cachedUser = { id: 'fixture-user', name: 'Stock worker', email: 'worker@example.test', role: 'driver' as const };
const source = fs.readFileSync(path.resolve(__dirname, '../../stock-app/src/auth/context.tsx'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

class FixtureApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

type AuthValue = {
  token: string | null; user: typeof cachedUser | null; isLoading: boolean; connectionError: string | null;
  retrySession(): Promise<void>; logout(): Promise<void>; login(role: string, email: string, password: string): Promise<void>;
};

// Runs the provider with deterministic hook state and native-free storage/API doubles.
// This lets delayed startup and credential-write races complete in a controlled order.
function harness(storedUser = JSON.stringify(cachedUser)) {
  const values = new Map([['stock_token_v1', 'stored-token'], ['stock_user_v1', storedUser]]);
  const storage = {
    getItemAsync: vi.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    deleteItemAsync: vi.fn(async (key: string) => { values.delete(key); }),
  };
  const api = {
    refreshUser: vi.fn(async () => cachedUser),
    login: vi.fn(async () => ({ token: 'new-token', user: { ...cachedUser, id: 'new-user' } })),
  };
  const setApiAuthToken = vi.fn();
  const hooks: unknown[] = [];
  let cursor = 0;
  const effects: (() => void | (() => void))[] = [];
  const cleanup: (() => void)[] = [];
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], (next: unknown) => { hooks[index] = next; }];
    },
    useRef: (initial: unknown) => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useCallback: (callback: unknown) => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = callback;
      return hooks[index];
    },
    useMemo: (factory: () => unknown) => factory(),
    useEffect: (effect: () => void | (() => void)) => {
      const index = cursor++;
      if (!(index in hooks)) { hooks[index] = true; effects.push(effect); }
    },
  };
  const fixtureModule = { exports: {} as { AuthProvider: (props: unknown) => { props: { value: AuthValue } } } };
  new vm.Script(compiled).runInNewContext({
    module: fixtureModule, exports: fixtureModule.exports, AbortController, Promise, Error,
    require: (id: string) => {
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx: (type: unknown, props: unknown) => ({ type, props }) };
      if (id === '@/api/client') return { ApiError: FixtureApiError, stockApi: api, setApiAuthToken };
      if (id === '@/services/secure-storage') return storage;
      throw new Error(`Unexpected isolated module ${id}`);
    },
  });
  const render = () => {
    cursor = 0;
    const result = fixtureModule.exports.AuthProvider({ children: null });
    for (const effect of effects.splice(0)) {
      const dispose = effect();
      if (dispose) cleanup.push(dispose);
    }
    return result.props.value;
  };
  return { render, api, storage, values, setApiAuthToken, unmount: () => cleanup.forEach(dispose => dispose()) };
}

const settle = () => new Promise<void>(resolve => setImmediate(resolve));

describe('stock session recovery without a native device', () => {
  it.each([0, 500, 503])('keeps stored session after transient status %s and recovers on retry', async (status) => {
    const h = harness();
    h.api.refreshUser.mockRejectedValueOnce(new FixtureApiError('Connection unavailable', status));
    h.render();
    await settle();
    expect(h.render()).toMatchObject({ token: 'stored-token', user: cachedUser, isLoading: false, connectionError: 'Connection unavailable' });
    expect(h.storage.deleteItemAsync).not.toHaveBeenCalled();
    await h.render().retrySession();
    expect(h.render()).toMatchObject({ token: 'stored-token', connectionError: null, isLoading: false });
    expect(h.values.get('stock_token_v1')).toBe('stored-token');
    h.unmount();
  });

  it.each([401, 403])('clears rejected session for status %s', async (status) => {
    const h = harness();
    h.api.refreshUser.mockRejectedValueOnce(new FixtureApiError('Session invalid', status));
    h.render();
    await settle();
    expect(h.render()).toMatchObject({ token: null, user: null, connectionError: null, isLoading: false });
    expect(h.values.size).toBe(0);
    h.unmount();
  });

  it('clears malformed stored identity without making an authenticated request', async () => {
    const h = harness('{malformed');
    h.render();
    await settle();
    expect(h.api.refreshUser).not.toHaveBeenCalled();
    expect(h.render().user).toBeNull();
    expect(h.values.size).toBe(0);
    h.unmount();
  });

  it('ignores late startup refresh after logout', async () => {
    const h = harness();
    let finish!: (user: typeof cachedUser) => void;
    h.api.refreshUser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    h.render();
    await settle();
    await h.render().logout();
    finish(cachedUser);
    await settle();
    expect(h.render()).toMatchObject({ token: null, user: null, isLoading: false });
    expect(h.values.size).toBe(0);
    expect(h.setApiAuthToken).toHaveBeenLastCalledWith(null);
    h.unmount();
  });

  it('ignores a stale unauthorized response after a new login', async () => {
    const h = harness();
    let rejectRefresh!: (error: Error) => void;
    h.api.refreshUser.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRefresh = reject; }));
    h.render();
    await settle();
    await h.render().login('driver', 'worker@example.test', 'fixture-password');
    rejectRefresh(new FixtureApiError('Old session expired', 401));
    await settle();
    expect(h.render()).toMatchObject({ token: 'new-token', user: { id: 'new-user' }, isLoading: false });
    expect(h.values.get('stock_token_v1')).toBe('new-token');
    expect(h.storage.deleteItemAsync).not.toHaveBeenCalled();
    h.unmount();
  });
});
