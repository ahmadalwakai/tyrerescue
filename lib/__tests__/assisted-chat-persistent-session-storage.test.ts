import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

type Session = { token: string; user: { id: string; name: string; email: string; role: 'admin' }; apiBaseUrl?: string };
type StorageApi = {
  ADMIN_SESSION_STORAGE_KEY: string;
  readStoredAdminSession(): Promise<Session | null>;
  readStoredAdminProjectId(): Promise<string | null>;
  writeStoredAdminSession(session: Session): Promise<void>;
  clearInvalidAdminSessionStorage(reason: string): Promise<boolean>;
  getAdminSessionStorageRevision(): number;
  subscribeAdminSessionStorage(listener: (event: unknown) => void): () => void;
};
const base = 'https://www.tyrerescue.uk';
const otherBase = 'https://www.dukestreettyres.com';
const projectKey = 'assistedChat.activeProject.v1';
const token = `acs_v1.11111111-1111-4111-8111-111111111111.${'a'.repeat(43)}`;
const session: Session = { token, apiBaseUrl: base, user: { id: 'isolated-admin', name: 'Fixture admin', email: 'fixture@example.test', role: 'admin' } };
const source = fs.readFileSync(path.resolve(__dirname, '../../assisted-chat-app/src/lib/admin-session-storage.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;

function harness(options: { platform?: string; asyncValues?: Map<string, string>; secureValues?: Map<string, string> } = {}) {
  const asyncValues = options.asyncValues ?? new Map<string, string>();
  const secureValues = options.secureValues ?? new Map<string, string>();
  const asyncStore = {
    getItem: vi.fn(async (key: string) => asyncValues.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { asyncValues.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { asyncValues.delete(key); }),
  };
  const secure = {
    isAvailableAsync: vi.fn(async () => true),
    getItemAsync: vi.fn(async (key: string) => secureValues.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => { secureValues.set(key, value); }),
    deleteItemAsync: vi.fn(async (key: string) => { secureValues.delete(key); }),
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 4,
  };
  const log = vi.fn();
  let currentBase = base;
  const fixtureModule = { exports: {} };
  new vm.Script(compiled).runInNewContext({
    module: fixtureModule, exports: fixtureModule.exports, URL,
    require: (id: string) => {
      if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: asyncStore };
      if (id === 'react-native') return { Platform: { OS: options.platform ?? 'ios' } };
      if (id === 'expo-secure-store') return secure;
      if (id === './api') return { getApiBaseUrl: () => currentBase };
      if (id === './startup-logging') return { logStartupModuleFailed: log };
      if (id === './project-config') return {
        isValidProjectId: (id: string) => ['tyrerescue', 'dukestreettyres'].includes(id),
        getProjectById: (id: string) => ({ apiBaseUrl: id === 'tyrerescue' ? base : otherBase }),
      };
      throw new Error(`Unexpected isolated module: ${id}`);
    },
  });
  return { storage: fixtureModule.exports as StorageApi, asyncStore, secure, asyncValues, secureValues, log, setBase: (value: string) => { currentBase = value; } };
}

describe('persistent admin credential storage without native devices or network', () => {
  it('stores the complete bounded native envelope only in SecureStore and restores after restart', async () => {
    const h = harness();
    await h.storage.writeStoredAdminSession({ ...session, apiBaseUrl: `${base}/` });
    expect(h.secure.setItemAsync).toHaveBeenCalledWith(expect.stringMatching(/^[A-Za-z0-9._-]+$/), expect.any(String), { keychainAccessible: 4 });
    expect(JSON.parse(h.secure.setItemAsync.mock.calls[0][1])).toEqual(session);
    expect(JSON.stringify([...h.asyncValues.values()])).not.toContain(token);
    const restarted = harness({ asyncValues: h.asyncValues, secureValues: h.secureValues });
    await expect(restarted.storage.readStoredAdminSession()).resolves.toEqual(session);
  });

  it('uses scoped AsyncStorage on web without loading native storage', async () => {
    const h = harness({ platform: 'web' });
    await h.storage.writeStoredAdminSession(session);
    await expect(h.storage.readStoredAdminSession()).resolves.toEqual(session);
    expect(h.secure.isAvailableAsync).not.toHaveBeenCalled();
  });

  it('isolates credentials by normalized backend, including explicit project changes', async () => {
    const h = harness();
    await h.storage.writeStoredAdminSession(session);
    h.setBase(otherBase);
    await expect(h.storage.readStoredAdminSession()).resolves.toBeNull();
    await h.storage.writeStoredAdminSession({ ...session, apiBaseUrl: otherBase, token: 'isolated-other-token' });
    await expect(h.storage.readStoredAdminSession()).resolves.toMatchObject({ token: 'isolated-other-token' });
    await h.storage.clearInvalidAdminSessionStorage('project-switch');
    h.setBase(base);
    await expect(h.storage.readStoredAdminSession()).resolves.toEqual(session);
  });

  it('captures the backend before queued asynchronous operations start', async () => {
    const h = harness();
    await h.storage.writeStoredAdminSession(session);
    const pendingRead = h.storage.readStoredAdminSession();
    h.setBase(otherBase);
    await expect(pendingRead).resolves.toEqual(session);
  });

  it('migrates an unscoped legacy envelope only with its matching saved known project', async () => {
    const h = harness();
    const legacy = { token: 'legacy.header.signature', user: session.user };
    h.asyncValues.set(h.storage.ADMIN_SESSION_STORAGE_KEY, JSON.stringify(legacy));
    h.asyncValues.set(projectKey, 'tyrerescue');
    await expect(h.storage.readStoredAdminSession()).resolves.toEqual({ ...legacy, apiBaseUrl: base });
    expect(h.asyncValues.has(h.storage.ADMIN_SESSION_STORAGE_KEY)).toBe(false);
    const deletionIndex = h.asyncStore.removeItem.mock.calls.findIndex(([key]) => key === h.storage.ADMIN_SESSION_STORAGE_KEY);
    expect(h.secure.setItemAsync.mock.invocationCallOrder[0]).toBeLessThan(h.asyncStore.removeItem.mock.invocationCallOrder[deletionIndex]);
  });

  it('migrates an already scoped legacy envelope without guessing a project', async () => {
    const h = harness();
    h.asyncValues.set(h.storage.ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
    await expect(h.storage.readStoredAdminSession()).resolves.toEqual(session);
    expect(h.secure.setItemAsync).toHaveBeenCalledOnce();
  });

  it('preserves an unbound legacy credential and enters recovery instead of presenting a fresh login', async () => {
    const h = harness();
    const legacy = JSON.stringify({ token, user: session.user });
    h.asyncValues.set(h.storage.ADMIN_SESSION_STORAGE_KEY, legacy);
    await expect(h.storage.readStoredAdminSession()).rejects.toThrow('Unable to access saved sign-in');
    expect(h.asyncValues.get(h.storage.ADMIN_SESSION_STORAGE_KEY)).toBe(legacy);
    expect(h.secure.setItemAsync).not.toHaveBeenCalled();
    expect(h.asyncStore.removeItem).not.toHaveBeenCalled();
  });

  it('preserves a legacy credential known to belong to another selected backend', async () => {
    const h = harness();
    const legacy = JSON.stringify({ token, user: session.user });
    h.asyncValues.set(h.storage.ADMIN_SESSION_STORAGE_KEY, legacy);
    h.asyncValues.set(projectKey, 'dukestreettyres');
    await expect(h.storage.readStoredAdminSession()).resolves.toBeNull();
    expect(h.asyncValues.get(h.storage.ADMIN_SESSION_STORAGE_KEY)).toBe(legacy);
    expect(h.secure.setItemAsync).not.toHaveBeenCalled();
    expect(h.asyncStore.removeItem).not.toHaveBeenCalled();
  });

  it('preserves a secure envelope stored under the wrong backend key and enters recovery', async () => {
    const h = harness();
    await h.storage.writeStoredAdminSession(session);
    const key = [...h.secureValues.keys()][0];
    const mismatched = JSON.stringify({ ...session, apiBaseUrl: otherBase });
    h.secureValues.set(key, mismatched);
    await expect(h.storage.readStoredAdminSession()).rejects.toThrow('Unable to access saved sign-in');
    expect(h.secureValues.get(key)).toBe(mismatched);
    expect(h.secure.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('distinguishes a project read failure from a missing project', async () => {
    const h = harness();
    h.asyncStore.getItem.mockRejectedValue(new Error(`isolated failure ${token}`));
    await expect(h.storage.readStoredAdminProjectId()).rejects.toThrow('Unable to access saved sign-in');
    expect(h.asyncStore.removeItem).not.toHaveBeenCalled();
    expect(JSON.stringify(h.log.mock.calls)).not.toContain(token);
  });

  it('preserves credentials on transient secure read failures and does not fall back to plaintext', async () => {
    const h = harness();
    await h.storage.writeStoredAdminSession(session);
    h.secure.getItemAsync.mockRejectedValue(new Error(`isolated device locked ${token}`));
    await expect(h.storage.readStoredAdminSession()).rejects.toThrow('Unable to access saved sign-in');
    expect(h.secure.deleteItemAsync).not.toHaveBeenCalled();
    expect(h.secureValues.size).toBe(1);
    expect(JSON.stringify(h.log.mock.calls)).not.toContain(token);
  });

  it('preserves legacy storage if secure migration cannot finish', async () => {
    const h = harness();
    h.asyncValues.set(h.storage.ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
    h.secure.setItemAsync.mockRejectedValue(new Error('isolated keychain unavailable'));
    await expect(h.storage.readStoredAdminSession()).rejects.toThrow('Unable to access saved sign-in');
    expect(h.asyncValues.get(h.storage.ADMIN_SESSION_STORAGE_KEY)).toBe(JSON.stringify(session));
    expect(h.asyncStore.removeItem).not.toHaveBeenCalled();
  });

  it('keeps the secure migrated session when deletion of its old plaintext copy fails', async () => {
    const h = harness();
    h.asyncValues.set(h.storage.ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
    h.asyncStore.removeItem.mockImplementation(async (key) => { if (key === h.storage.ADMIN_SESSION_STORAGE_KEY) throw new Error('isolated cleanup error'); h.asyncValues.delete(key); });
    await expect(h.storage.readStoredAdminSession()).resolves.toEqual(session);
    expect(h.secureValues.size).toBe(1);
  });

  it('preserves malformed legacy data for explicit recovery and never clears for network or authorization errors', async () => {
    const h = harness();
    h.asyncValues.set(h.storage.ADMIN_SESSION_STORAGE_KEY, '{invalid');
    await expect(h.storage.readStoredAdminSession()).rejects.toThrow('Unable to access saved sign-in');
    expect(h.asyncValues.get(h.storage.ADMIN_SESSION_STORAGE_KEY)).toBe('{invalid');
    expect(h.asyncStore.removeItem).not.toHaveBeenCalled();
    await expect(h.storage.clearInvalidAdminSessionStorage('diagnostics-recovery-action')).resolves.toBe(true);
    await h.storage.writeStoredAdminSession(session);
    for (const reason of ['unauthorized', 'hydrate-failed', 'network-error']) {
      await expect(h.storage.clearInvalidAdminSessionStorage(reason)).resolves.toBe(false);
    }
    await expect(h.storage.readStoredAdminSession()).resolves.toEqual(session);
  });

  it('preserves malformed secure data and does not write a logout barrier automatically', async () => {
    const h = harness();
    await h.storage.writeStoredAdminSession(session);
    const key = [...h.secureValues.keys()][0];
    h.secureValues.set(key, '{invalid');
    await expect(h.storage.readStoredAdminSession()).rejects.toThrow('Unable to access saved sign-in');
    expect(h.secureValues.get(key)).toBe('{invalid');
    expect(h.asyncStore.setItem).not.toHaveBeenCalled();
    expect(h.secure.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('writes a durable logout barrier before cleanup and never restores after cleanup fails', async () => {
    const h = harness();
    await h.storage.writeStoredAdminSession(session);
    h.secure.deleteItemAsync.mockRejectedValue(new Error('isolated deletion failure'));
    await expect(h.storage.clearInvalidAdminSessionStorage('manual_logout')).resolves.toBe(true);
    expect(h.asyncStore.setItem.mock.invocationCallOrder[0]).toBeLessThan(h.secure.deleteItemAsync.mock.invocationCallOrder[0]);
    expect(h.secureValues.size).toBe(1);
    const restarted = harness({ asyncValues: h.asyncValues, secureValues: h.secureValues });
    restarted.secure.isAvailableAsync.mockResolvedValue(false);
    await expect(restarted.storage.readStoredAdminSession()).resolves.toBeNull();
    expect(restarted.secure.getItemAsync).not.toHaveBeenCalled();
  });

  it('reports failed logout if no durable barrier can be written and preserves saved credentials', async () => {
    const h = harness();
    await h.storage.writeStoredAdminSession(session);
    h.asyncStore.setItem.mockRejectedValue(new Error('isolated disk unavailable'));
    await expect(h.storage.clearInvalidAdminSessionStorage('manual_logout')).resolves.toBe(false);
    expect(h.secure.deleteItemAsync).not.toHaveBeenCalled();
    await expect(h.storage.readStoredAdminSession()).resolves.toEqual(session);
  });

  it('serializes logout and a subsequent explicit login without restoring the older token', async () => {
    const h = harness();
    await h.storage.writeStoredAdminSession(session);
    const clear = h.storage.clearInvalidAdminSessionStorage('manual_logout');
    const write = h.storage.writeStoredAdminSession({ ...session, token: 'isolated-new-token' });
    await expect(clear).resolves.toBe(true);
    await write;
    await expect(h.storage.readStoredAdminSession()).resolves.toMatchObject({ token: 'isolated-new-token' });
  });

  it('does not remove a logout barrier if a new secure write fails', async () => {
    const h = harness();
    await h.storage.writeStoredAdminSession(session);
    await h.storage.clearInvalidAdminSessionStorage('manual_logout');
    h.secure.setItemAsync.mockRejectedValue(new Error('isolated write failure'));
    await expect(h.storage.writeStoredAdminSession(session)).rejects.toThrow('Unable to access saved sign-in');
    await expect(h.storage.readStoredAdminSession()).resolves.toBeNull();
  });

  it('rolls back the previous secure envelope when a new login cannot remove the logout barrier', async () => {
    const h = harness();
    await h.storage.writeStoredAdminSession(session);
    h.secure.deleteItemAsync.mockRejectedValue(new Error('isolated cleanup unavailable'));
    await h.storage.clearInvalidAdminSessionStorage('manual_logout');
    h.asyncStore.removeItem.mockImplementation(async (key) => {
      if (key.endsWith('.loggedOut')) throw new Error('isolated commit failure');
      h.asyncValues.delete(key);
    });
    await expect(h.storage.writeStoredAdminSession({ ...session, token: 'isolated-uncommitted-token' })).rejects.toThrow('Unable to access saved sign-in');
    expect([...h.secureValues.values()].map((value) => JSON.parse(value))).toEqual([session]);
    await expect(h.storage.readStoredAdminSession()).resolves.toBeNull();
  });

  it('rejects unscoped writes and oversized UTF-8 envelopes without changing saved credentials', async () => {
    const h = harness();
    await h.storage.writeStoredAdminSession(session);
    await expect(h.storage.writeStoredAdminSession({ token, user: session.user })).rejects.toThrow('requires its backend');
    await expect(h.storage.writeStoredAdminSession({ ...session, token: 'a'.repeat(1_700), user: { ...session.user, name: 'س'.repeat(200) } })).rejects.toThrow('Unable to access saved sign-in');
    await expect(h.storage.readStoredAdminSession()).resolves.toEqual(session);
  });

  it('publishes safe shared revisions for multiple mounted session hooks', async () => {
    const h = harness();
    const listener = vi.fn();
    const unsubscribe = h.storage.subscribeAdminSessionStorage(listener);
    const write = h.storage.writeStoredAdminSession(session);
    expect(h.storage.getAdminSessionStorageRevision()).toBe(1);
    await write;
    await h.storage.clearInvalidAdminSessionStorage('manual_logout');
    expect(listener.mock.calls.map(([event]) => event)).toEqual([
      { kind: 'write', apiBaseUrl: base, revision: 1 },
      { kind: 'clear-intent', apiBaseUrl: base, revision: 2 },
      { kind: 'clear', apiBaseUrl: base, revision: 2 },
    ]);
    expect(JSON.stringify(listener.mock.calls)).not.toContain(token);
    unsubscribe();
    await h.storage.writeStoredAdminSession(session);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('announces clear intent synchronously while the durable logout barrier is still pending', async () => {
    const h = harness();
    await h.storage.writeStoredAdminSession(session);
    let finish!: () => void;
    h.asyncStore.setItem.mockImplementation((key, value) => new Promise<void>((resolve) => {
      finish = () => { h.asyncValues.set(key, value); resolve(); };
    }));
    const listener = vi.fn();
    h.storage.subscribeAdminSessionStorage(listener);
    const clearing = h.storage.clearInvalidAdminSessionStorage('diagnostics-recovery-action');
    expect(listener).toHaveBeenCalledExactlyOnceWith({ kind: 'clear-intent', apiBaseUrl: base, revision: 2 });
    await vi.waitFor(() => expect(h.asyncStore.setItem).toHaveBeenCalledOnce());
    expect(h.secure.deleteItemAsync).not.toHaveBeenCalled();
    finish();
    await expect(clearing).resolves.toBe(true);
    await expect(h.storage.readStoredAdminSession()).resolves.toBeNull();
  });

  it('rejects an older queued write when a clear has started since it was captured', async () => {
    const h = harness();
    await h.storage.writeStoredAdminSession(session);
    let finishRead!: (value: string | null) => void;
    h.secure.getItemAsync.mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve; }));
    const reading = h.storage.readStoredAdminSession();
    await vi.waitFor(() => expect(finishRead).toBeTypeOf('function'));
    const staleWrite = h.storage.writeStoredAdminSession({ ...session, token: 'isolated-stale-upgrade' });
    const failure = expect(staleWrite).rejects.toThrow('Unable to access saved sign-in');
    const clearing = h.storage.clearInvalidAdminSessionStorage('diagnostics-recovery-action');
    finishRead(JSON.stringify(session));
    await reading;
    await failure;
    await clearing;
    await expect(h.storage.readStoredAdminSession()).resolves.toBeNull();
    expect([...h.secureValues.values()].join('')).not.toContain('isolated-stale-upgrade');
  });
});
