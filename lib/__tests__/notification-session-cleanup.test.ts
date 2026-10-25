import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeManualLogout } from '../../assisted-chat-app/src/lib/manual-logout';
import { removeAdminDeviceWithConfirmation } from '../../assisted-chat-app/src/types/admin-devices';

interface AlertModule {
  clearTopicSubscriptionFlag(isCurrent?: () => boolean): Promise<void>;
  registerDirectUrgentBookingToken(): Promise<boolean>;
  ensureUrgentAlertsArmed(): Promise<{ armed: boolean }>;
}
const source = fs.readFileSync(path.resolve(__dirname, '../../assisted-chat-app/src/lib/urgent-alerts.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function harness(platform = 'android') {
  const state = { token: 'isolated-session-a' as string | null, baseUrl: 'https://fixture.invalid', revision: 1 };
  const values = new Map<string, string>();
  const asyncStore = {
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { values.delete(key); }),
  };
  const post = vi.fn(async (endpoint: string, body: unknown) => { void endpoint; void body; return { ok: true, registered: true }; });
  const notifications = {
    registerAdminPushNotifications: vi.fn(async () => `ExpoPushToken[${state.token}]`),
    getDeviceFcmToken: vi.fn(async () => 'isolated-shared-fcm-device-token'),
    getUrgentAlertsPermissionStatus: vi.fn(async () => 'granted'),
    presentLocalUrgentBookingNotification: vi.fn(async () => undefined),
  };
  const watcher = {
    clearUrgentWatcherAuth: vi.fn(async () => undefined),
    stopUrgentWatcher: vi.fn(async () => undefined),
    setUrgentWatcherAuth: vi.fn(async (token: string, baseUrl: string) => { void token; void baseUrl; return true; }),
    startUrgentWatcher: vi.fn(async () => true),
    canUseFullScreenIntent: vi.fn(async () => true),
  };
  const fixtureModule = { exports: {} };
  new vm.Script(compiled).runInNewContext({
    module: fixtureModule, exports: fixtureModule.exports,
    console: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
    require: (id: string) => {
      if (id === 'react-native') return { Platform: { OS: platform } };
      if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: asyncStore };
      if (id === './api') return { api: { post }, getAdminToken: () => state.token, getApiBaseUrl: () => state.baseUrl };
      if (id === './notification-startup-config') return { isNotificationStartupDisabled: () => false };
      if (id === './notification-safety') return { isOkResponse: (value: { ok?: boolean }) => value?.ok === true };
      if (id === './startup-logging') return { logStartupCheckpoint: vi.fn(), logStartupModuleFailed: vi.fn() };
      if (id === './notifications') return notifications;
      if (id === './urgent-watcher') return watcher;
      throw new Error(`Unexpected isolated module: ${id}`);
    },
  });
  return { alerts: fixtureModule.exports as AlertModule, state, values, asyncStore, notifications, watcher, post };
}

afterEach(() => { vi.useRealTimers(); });

describe('notification cleanup respects the owning admin session', () => {
  it('skips every native and storage cleanup stage when the captured context is already stale', async () => {
    const h = harness();
    await h.alerts.clearTopicSubscriptionFlag(() => false);
    expect(h.watcher.clearUrgentWatcherAuth).not.toHaveBeenCalled();
    expect(h.watcher.stopUrgentWatcher).not.toHaveBeenCalled();
    expect(h.asyncStore.removeItem).not.toHaveBeenCalled();
  });

  it('cannot stop a rapid new login or delete its registration flags after cleanup outlives the logout timeout', async () => {
    vi.useFakeTimers();
    const h = harness();
    await h.alerts.registerDirectUrgentBookingToken();
    const gate = deferred<void>();
    h.watcher.clearUrgentWatcherAuth.mockReturnValue(gate.promise);
    const revision = h.state.revision;
    const token = h.state.token;
    const baseUrl = h.state.baseUrl;
    const isCurrent = () => h.state.revision === revision && h.state.token === token && h.state.baseUrl === baseUrl;
    let cleanup!: Promise<void>;
    const logout = completeManualLogout(() => {
      cleanup = h.alerts.clearTopicSubscriptionFlag(isCurrent);
      return cleanup;
    }, async () => { h.state.token = null; h.state.revision += 1; }, 8_000, isCurrent);
    await vi.advanceTimersByTimeAsync(8_000);
    await logout;
    expect(h.state.token).toBeNull();
    h.state.token = 'isolated-session-b'; h.state.revision += 1;
    await expect(h.alerts.ensureUrgentAlertsArmed()).resolves.toMatchObject({ armed: true });
    const registeredState = [...h.values.entries()];
    expect(h.post.mock.calls.filter(([endpoint]) => endpoint === '/api/mobile/admin/native-alert-token')).toHaveLength(2);
    expect(h.watcher.setUrgentWatcherAuth).toHaveBeenLastCalledWith('isolated-session-b', baseUrl);
    gate.resolve();
    await cleanup;
    expect(h.watcher.stopUrgentWatcher).not.toHaveBeenCalled();
    expect(h.asyncStore.removeItem).not.toHaveBeenCalled();
    expect([...h.values.entries()]).toEqual(registeredState);
    expect(h.state.token).toBe('isolated-session-b');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps immediate canonical current-device sign-out safe when its cleanup resumes after a fresh login', async () => {
    const h = harness();
    await h.alerts.registerDirectUrgentBookingToken();
    const gate = deferred<void>();
    h.watcher.clearUrgentWatcherAuth.mockReturnValue(gate.promise);
    const id = '11111111-1111-4111-8111-111111111111';
    const item = { id, isCurrent: true, createdAt: '2026-10-21T12:00:00.000Z',
      deviceName: null, modelName: null, platform: 'android', osVersion: null, appVersion: null,
      lastLoginAt: null, lastSeenAt: null, lastActiveAt: null, firstIp: null, lastIp: null, revokedAt: null };
    const client = { get: vi.fn(async () => ({ ok: true, currentSessionId: id, items: [item] })), del: vi.fn(async () => ({ ok: true, removedCurrent: true })) };
    const revision = h.state.revision; const token = h.state.token; const baseUrl = h.state.baseUrl;
    const isCurrent = () => h.state.revision === revision && h.state.token === token && h.state.baseUrl === baseUrl;
    let cleanup!: Promise<void>;
    await removeAdminDeviceWithConfirmation(client, id, isCurrent, async () => true, async () => {
      cleanup = h.alerts.clearTopicSubscriptionFlag(isCurrent);
      // The canonical DELETE already revoked API access; local logout is immediate.
      h.state.token = null; h.state.revision += 1;
    });
    expect(h.state.token).toBeNull();
    expect(client.del).toHaveBeenCalledOnce();
    h.state.token = 'isolated-session-b'; h.state.revision += 1;
    await expect(h.alerts.ensureUrgentAlertsArmed()).resolves.toMatchObject({ armed: true });
    const registeredState = [...h.values.entries()];
    gate.resolve(); await cleanup;
    expect(h.watcher.stopUrgentWatcher).not.toHaveBeenCalled();
    expect(h.asyncStore.removeItem).not.toHaveBeenCalled();
    expect([...h.values.entries()]).toEqual(registeredState);
    expect(h.state.token).toBe('isolated-session-b');
  });

  it('does not clear new flags when context changes while a native stop promise is completing', async () => {
    const h = harness();
    await h.alerts.registerDirectUrgentBookingToken();
    const gate = deferred<void>();
    h.watcher.stopUrgentWatcher.mockReturnValue(gate.promise);
    const token = h.state.token;
    const cleanup = h.alerts.clearTopicSubscriptionFlag(() => h.state.token === token);
    await vi.waitFor(() => expect(h.watcher.stopUrgentWatcher).toHaveBeenCalledOnce());
    h.state.token = 'isolated-session-b'; h.state.revision += 1;
    await h.alerts.registerDirectUrgentBookingToken();
    const registeredState = [...h.values.entries()];
    gate.resolve(); await cleanup;
    expect(h.asyncStore.removeItem).not.toHaveBeenCalled();
    expect([...h.values.entries()]).toEqual(registeredState);
  });

  it('clears flags normally for the same session and forces its next direct registration', async () => {
    const h = harness();
    await h.alerts.registerDirectUrgentBookingToken();
    await h.alerts.clearTopicSubscriptionFlag(() => true);
    expect(h.watcher.clearUrgentWatcherAuth).toHaveBeenCalledOnce();
    expect(h.watcher.stopUrgentWatcher).toHaveBeenCalledOnce();
    expect(h.asyncStore.removeItem).toHaveBeenCalledTimes(6);
    await h.alerts.registerDirectUrgentBookingToken();
    expect(h.post.mock.calls.filter(([endpoint]) => endpoint === '/api/mobile/admin/native-alert-token')).toHaveLength(2);
  });

  it('reuses direct registration only within the confirmed token/backend scope and persists no admin credential', async () => {
    const h = harness();
    await h.alerts.registerDirectUrgentBookingToken();
    await h.alerts.registerDirectUrgentBookingToken();
    expect(h.post).toHaveBeenCalledTimes(1);
    h.state.token = 'isolated-session-b';
    await h.alerts.registerDirectUrgentBookingToken();
    expect(h.post).toHaveBeenCalledTimes(2);
    h.state.baseUrl = 'https://another-fixture.invalid';
    await h.alerts.registerDirectUrgentBookingToken();
    expect(h.post).toHaveBeenCalledTimes(3);
    const persisted = JSON.stringify([...h.values.entries()]);
    expect(persisted).not.toContain('isolated-session-a'); expect(persisted).not.toContain('isolated-session-b');
  });

  it('does not join an old registration or erase a new registration after a late old failure', async () => {
    const h = harness();
    const gate = deferred<{ ok: boolean; registered: boolean }>();
    h.post.mockReturnValueOnce(gate.promise);
    const old = h.alerts.registerDirectUrgentBookingToken();
    await vi.waitFor(() => expect(h.post).toHaveBeenCalledOnce());
    h.state.token = 'isolated-session-b';
    await expect(h.alerts.registerDirectUrgentBookingToken()).resolves.toBe(true);
    const registeredState = [...h.values.entries()];
    gate.reject(new Error('Isolated old registration failure'));
    await expect(old).resolves.toBe(false);
    expect(h.asyncStore.removeItem).not.toHaveBeenCalled();
    expect([...h.values.entries()]).toEqual(registeredState);
    await expect(h.alerts.registerDirectUrgentBookingToken()).resolves.toBe(true);
    expect(h.post).toHaveBeenCalledTimes(2);
  });

  it('re-registers iOS Expo/APNs after a new login instead of accepting old readiness', async () => {
    const h = harness('ios');
    await expect(h.alerts.ensureUrgentAlertsArmed()).resolves.toMatchObject({ armed: true });
    h.state.token = 'isolated-session-b'; h.state.revision += 1;
    await expect(h.alerts.ensureUrgentAlertsArmed()).resolves.toMatchObject({ armed: true });
    expect(h.notifications.registerAdminPushNotifications).toHaveBeenCalledTimes(2);
    expect(h.watcher.startUrgentWatcher).not.toHaveBeenCalled();
  });
});
