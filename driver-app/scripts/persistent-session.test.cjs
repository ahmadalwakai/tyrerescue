const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const user = { id: 'synthetic-driver', driverId: 'synthetic-driver-profile', role: 'driver', name: 'Synthetic driver', email: 'driver@isolated.invalid' };
const savedToken = 'dcs_v1.synthetic-device.synthetic-secret-for-isolated-tests';
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; }
function harness(options = {}) {
  const storage = new Map(Object.entries(options.storage ?? {}));
  const calls = { fetch: [], tracking: [], biometric: [], logout: 0, clear: [], watcher: [], unregister: [] };
  const listeners = new Set();
  const appState = { currentState: 'active', addEventListener: (_, callback) => {
    listeners.add(callback); return { remove: () => listeners.delete(callback) };
  } };
  let fetchHandler = async () => Response.json({ token: savedToken, user });
  let biometricHandler = async () => ({ success: true });
  let unregisterHandler = async () => {};
  let authValue = { user, sessionIssue: null, login: async () => {}, retrySession: async () => {}, logout: async () => { calls.logout += 1; } };
  const hooks = [];
  let cursor = 0;
  let effects = [];
  let dirty = false;
  let tree;
  let component;
  const changed = (old, next) => !old || !next || next.some((dep, index) => dep !== old[index]);
  const react = {
    createContext: (value) => ({ Provider: 'Provider', value }),
    useContext: (context) => context.value,
    useRef: (initial) => { const index = cursor++; return hooks[index] ?? (hooks[index] = { current: initial }); },
    useState: (initial) => {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: initial };
      return [hooks[index].value, (next) => {
        const value = typeof next === 'function' ? next(hooks[index].value) : next;
        if (hooks[index].value !== value) { hooks[index].value = value; dirty = true; }
      }];
    },
    useCallback: (callback, deps) => {
      const index = cursor++;
      if (!hooks[index] || changed(hooks[index].deps, deps)) hooks[index] = { callback, deps };
      return hooks[index].callback;
    },
    useEffect: (effect, deps) => {
      const index = cursor++;
      if (!hooks[index] || changed(hooks[index].deps, deps)) effects.push(() => {
        hooks[index]?.cleanup?.(); hooks[index] = { deps, cleanup: effect() };
      });
    },
  };
  const t = (key) => key;
  const mocks = {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native': { Platform: { OS: options.os ?? 'ios' }, AppState: appState, StyleSheet: { create: (value) => value },
      Linking: { openSettings: async () => {} }, ...Object.fromEntries(['ActivityIndicator', 'Modal', 'Pressable', 'Text', 'TextInput', 'View'].map((name) => [name, name])) },
    'expo-application': { nativeApplicationVersion: 'isolated-test' },
    'expo-device': { deviceName: 'Synthetic iPhone', modelName: 'iPhone', osVersion: '26' },
    'expo-local-authentication': {
      AuthenticationType: { FACIAL_RECOGNITION: 2 },
      hasHardwareAsync: async () => options.hardware !== false,
      isEnrolledAsync: async () => options.enrolled !== false,
      supportedAuthenticationTypesAsync: async () => options.types ?? [2],
      authenticateAsync: async (settings) => { calls.biometric.push(settings); return biometricHandler(); },
    },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/i18n': { useI18n: () => ({ t }) },
    '@/constants/theme': { colors: {}, radius: {}, spacing: {} },
    '@/services/secure-storage': {
      getItemAsync: async (key) => storage.get(key) ?? null,
      setItemAsync: async (key, value) => {
        if (options.storageWriteFails) throw new Error('Keychain unavailable');
        await options.beforeStorageWrite?.(key, value);
        storage.set(key, value);
      },
      deleteItemAsync: async (key) => { calls.clear.push(key); storage.delete(key); },
    },
    '@/services/background-location': { setOnlineLocationTracking: async (value) => { calls.tracking.push(value); } },
    '@/services/notifications': { unregisterPushToken: async (token) => {
      calls.unregister.push(token); await unregisterHandler(token);
    } },
    '@/services/job-alert': { clearAlertedRefs: () => {} },
    '@/services/sound': { stopAlertSound: async () => {} },
    '@/services/driver-watcher': { DriverAlertWatcher: {
      startWatcher: async () => { calls.watcher.push('start'); }, stopWatcher: async () => { calls.watcher.push('stop'); },
    } },
  };
  if (options.gate) mocks['@/auth/context'] = { useAuth: () => authValue };
  if (options.nativeStorage) {
    delete mocks['@/services/secure-storage'];
    calls.keychain = [];
    const items = new Map((options.nativeItems ?? []).map((item) => [`${item.service ?? 'app'}:${item.key}`, { ...item }]));
    calls.nativeItems = items;
    mocks['expo-secure-store'] = {
      AFTER_FIRST_UNLOCK: 3, AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 4,
      getItemAsync: async (key, settings) => {
        calls.keychain.push({ operation: 'read', key, settings });
        if (options.nativeRead) return options.nativeRead(key, settings);
        const item = items.get(`${settings?.keychainService ?? 'app'}:${key}`);
        if (item && appState.currentState !== 'active' && ![3, 4].includes(item.accessibility)) {
          throw new Error('User interaction is not allowed');
        }
        return item?.value ?? null;
      },
      setItemAsync: async (key, value, settings) => {
        calls.keychain.push({ operation: 'write', key, settings });
        await options.beforeStorageWrite?.(key, value);
        const identifier = `${settings?.keychainService ?? 'app'}:${key}`;
        // Match Expo's iOS implementation: updating an item changes its value,
        // while its original Keychain accessibility remains unchanged.
        const existing = items.get(identifier);
        items.set(identifier, { ...existing, key, value, accessibility: existing?.accessibility ?? settings?.keychainAccessible ?? 0 });
        storage.set(key, value);
      },
      deleteItemAsync: async (key, settings) => {
        calls.keychain.push({ operation: 'delete', key, settings });
        if (options.nativeDeleteFails) throw new Error('Keychain delete unavailable');
        items.delete(`${settings?.keychainService ?? 'app'}:${key}`);
        storage.delete(key);
      },
    };
  }
  const modules = new Map();
  function load(name) {
    if (mocks[name]) return mocks[name];
    if (modules.has(name)) return modules.get(name).exports;
    const base = path.join(root, 'src', name.replace(/^@\//, ''));
    const file = ['.ts', '.tsx'].map((ext) => base + ext).find((name) => fs.existsSync(name));
    if (!file) throw new Error(`Unexpected isolated dependency ${name}`);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const module = { exports: {} }; modules.set(name, module);
    vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
      process: { env: {} }, __DEV__: options.development !== false, URL, Date, JSON, Promise, Response, AbortController, setTimeout, clearTimeout,
      fetch: async (url, request) => { calls.fetch.push({ url, request }); return fetchHandler(url, request); },
    }, { filename: file })(load, module, module.exports);
    return module.exports;
  }
  function render() {
    cursor = 0; effects = []; dirty = false;
    tree = component(); for (const effect of effects) effect(); return tree;
  }
  async function settle() { for (let i = 0; i < 20; i += 1) { await tick(); if (dirty) render(); } }
  return {
    storage, calls, load, render, settle,
    mount: () => {
      component = options.gate ? load('@/components/DriverSessionGate').DriverSessionGate : () => load('@/auth/context').AuthProvider({ children: 'children' });
      return render();
    },
    get value() { return tree?.props?.value; },
    get tree() { return tree; },
    setFetch: (callback) => { fetchHandler = callback; },
    setBiometric: (callback) => { biometricHandler = callback; },
    setUnregister: (callback) => { unregisterHandler = callback; },
    setAuth: (value) => { authValue = { ...authValue, ...value }; render(); },
    appState: async (state) => { appState.currentState = state; for (const listener of listeners) listener(state); await settle(); },
  };
}
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  const children = Array.isArray(tree.props?.children) ? tree.props.children.flat(Infinity) : [tree.props?.children];
  for (const child of children) { const found = find(child, predicate); if (found) return found; }
  return null;
}

test('cold launch with a network outage restores protected identity and preserves Online and token', async () => {
  const h = harness({ storage: { auth_token: savedToken, driver_session_user_v1: JSON.stringify(user) } });
  h.setFetch(async () => { throw new Error('isolated offline'); });
  h.mount(); await h.settle();
  assert.equal(h.value.user.id, user.id); assert.equal(h.value.token, savedToken);
  assert.equal(h.value.isLoading, false); assert.equal(h.storage.get('auth_token'), savedToken);
  assert.deepEqual(h.calls.tracking, []); assert.equal(h.calls.clear.length, 0);
});
test('JSON 401 rejects the operation without deleting Keychain', async () => {
  const h = harness({ storage: { auth_token: savedToken } });
  h.setFetch(async () => Response.json({ error: 'Temporary verification error' }, { status: 401 }));
  await assert.rejects(h.load('@/api/client').api('/api/driver/profile'), /Temporary verification/);
  assert.equal(await h.load('@/api/client').getToken(), savedToken);
  assert.equal(h.storage.get('auth_token'), savedToken); assert.equal(h.calls.clear.length, 0);
});
test('a temporary 401 during restore retains user/session and does not turn Online off', async () => {
  const h = harness({ storage: { auth_token: savedToken, driver_session_user_v1: JSON.stringify(user) } });
  h.setFetch(async () => Response.json({ error: 'Retry verification' }, { status: 401 }));
  h.mount(); await h.settle();
  assert.equal(h.value.user.id, user.id); assert.equal(h.value.sessionIssue, 'verification_required');
  assert.equal(h.storage.get('auth_token'), savedToken); assert.deepEqual(h.calls.tracking, []);
});
test('confirmed secret-authenticated server revocation blocks access and stops GPS without silently signing out', async () => {
  const h = harness({ storage: { auth_token: savedToken, driver_session_user_v1: JSON.stringify(user) } });
  h.setFetch(async () => Response.json({ error: 'Removed', code: 'SESSION_REVOKED' }, { status: 401 }));
  h.mount(); await h.settle();
  assert.equal(h.value.sessionIssue, 'removed'); assert.equal(h.value.user.id, user.id);
  assert.deepEqual(h.calls.tracking, [false]); assert.equal(h.storage.get('auth_token'), savedToken);
});
test('new password login requests persistent driver session and only succeeds after Keychain persistence', async () => {
  const h = harness(); h.mount(); await h.settle();
  await h.value.login(user.email, 'isolated-password'); await h.settle();
  const payload = JSON.parse(h.calls.fetch.find((call) => call.url.endsWith('/login')).request.body);
  assert.equal(payload.persistentSession, true); assert.equal(payload.device.platform, 'ios');
  assert.equal(h.storage.get('auth_token'), savedToken); assert.equal(h.value.user.id, user.id);
  const broken = harness({ storageWriteFails: true }); broken.mount(); await broken.settle();
  await assert.rejects(broken.value.login(user.email, 'isolated-password'), /Keychain unavailable/);
  assert.equal(broken.value.user, null);
});
test('explicit offline logout clears active credentials/GPS and preserves only a secure revocation retry', async () => {
  const h = harness({ storage: { auth_token: savedToken, driver_session_user_v1: JSON.stringify(user) } });
  h.mount(); await h.settle();
  h.setFetch(async () => { throw new Error('isolated offline'); });
  await h.value.logout(); await h.settle();
  assert.equal(h.value.user, null); assert.equal(h.value.token, null);
  assert.equal(h.storage.has('auth_token'), false); assert.equal(h.storage.has('driver_session_user_v1'), false);
  assert.deepEqual(JSON.parse(h.storage.get('driver_pending_logout_v1')), [savedToken]); assert.equal(h.calls.tracking.at(-1), false);
  h.setFetch(async () => Response.json({ ok: true }));
  await h.appState('background'); await h.appState('active');
  assert.equal(h.storage.has('driver_pending_logout_v1'), false);
  assert.equal(h.value.user, null);
});
test('logout invalidates an outstanding session restore and its late credentials cannot reappear', async () => {
  const h = harness({ storage: { auth_token: savedToken, driver_session_user_v1: JSON.stringify(user) } });
  const delayed = deferred(); h.setFetch(() => delayed.promise);
  h.mount(); await h.settle();
  await h.value.logout(); await h.settle();
  delayed.resolve(Response.json({ token: 'late-session', user })); await h.settle();
  assert.equal(h.value.user, null); assert.equal(h.storage.has('auth_token'), false);
});

test('new login waits for old logout cleanup and foreground restore cannot resurrect the old session', async () => {
  const h = harness({ storage: { auth_token: savedToken, driver_session_user_v1: JSON.stringify(user) } });
  h.mount(); await h.settle();
  const oldCleanup = deferred(); h.setUnregister(() => oldCleanup.promise);
  const nextUser = { ...user, id: 'next-driver', driverId: 'next-driver-profile', email: 'next@isolated.invalid' };
  const nextToken = 'dcs_v1.next-device.next-isolated-secret';
  h.setFetch(async (url) => url.endsWith('/login')
    ? Response.json({ token: nextToken, user: nextUser })
    : url.endsWith('/logout') ? Response.json({ ok: true })
      : Response.json({ token: savedToken, user }));
  const logout = h.value.logout(); await h.settle();
  assert.equal(h.value.user, null);
  const restoreCountBefore = h.calls.fetch.filter((call) => call.url.endsWith('/session')).length;
  const login = h.value.login(nextUser.email, 'isolated-password'); await h.settle();
  const loginsBeforeCleanup = h.calls.fetch.filter((call) => call.url.endsWith('/login')).length;
  await h.appState('background'); await h.appState('active');
  const restoresDuringCleanup = h.calls.fetch.filter((call) => call.url.endsWith('/session')).length - restoreCountBefore;
  oldCleanup.resolve(); await Promise.all([logout, login]); await h.settle();

  assert.equal(loginsBeforeCleanup, 0);
  assert.equal(restoresDuringCleanup, 0);
  assert.deepEqual(h.calls.unregister, [savedToken]);
  assert.equal(h.storage.get('auth_token'), nextToken);
  assert.equal(await h.load('@/api/client').getToken(), nextToken);
  assert.equal(JSON.parse(h.storage.get('driver_session_user_v1')).id, nextUser.id);
  assert.equal(h.value.user.id, nextUser.id); assert.equal(h.value.token, nextToken);
  const revocations = h.calls.fetch.filter((call) => call.url.endsWith('/logout'));
  assert.ok(revocations.every((call) => call.request.headers.Authorization === `Bearer ${savedToken}`));
});

for (const blockedKey of ['auth_token', 'driver_session_user_v1']) {
  test(`logout waits for an earlier restore ${blockedKey} write before persisting the next driver`, async () => {
    const oldWrite = deferred();
    const upgradedToken = 'dcs_v1.upgraded-device.upgraded-isolated-secret';
    const restoredUser = { ...user, name: 'Restored older driver' };
    let blocked = false;
    const h = harness({ storage: { auth_token: savedToken, driver_session_user_v1: JSON.stringify(user) },
      beforeStorageWrite: async (key, value) => {
        if (key === blockedKey && (value === upgradedToken || value.includes('Restored older driver'))) {
          blocked = true; await oldWrite.promise;
        }
      } });
    h.setFetch(async () => Response.json({ token: upgradedToken, user: restoredUser }));
    h.mount(); await h.settle(); assert.equal(blocked, true);
    const nextUser = { ...user, id: 'next-driver', driverId: 'next-driver-profile', email: 'next@isolated.invalid' };
    const nextToken = 'dcs_v1.next-device.next-isolated-secret';
    h.setFetch(async (url) => url.endsWith('/login')
      ? Response.json({ token: nextToken, user: nextUser }) : Response.json({ ok: true }));
    const logout = h.value.logout();
    const login = h.value.login(nextUser.email, 'isolated-password'); await h.settle();
    const cleanupsBeforeWriteFinished = h.calls.unregister.length;
    oldWrite.resolve(); await Promise.all([logout, login]); await h.settle();

    assert.equal(cleanupsBeforeWriteFinished, 0);
    assert.deepEqual(h.calls.unregister, [upgradedToken]);
    assert.equal(h.storage.get('auth_token'), nextToken);
    assert.equal(JSON.parse(h.storage.get('driver_session_user_v1')).id, nextUser.id);
    assert.equal(h.value.user.id, nextUser.id); assert.equal(h.value.token, nextToken);
  });
}
test('iPhone unlock requires actual enrolled Face ID and disables device-passcode fallback', async () => {
  const h = harness();
  assert.equal((await h.load('@/auth/biometric-unlock').unlockDriverSession('Prompt', 'Cancel')).success, true);
  assert.equal(h.calls.biometric[0].disableDeviceFallback, true); assert.equal(h.calls.biometric[0].fallbackLabel, '');
  const noFace = harness({ types: [1] });
  assert.equal((await noFace.load('@/auth/biometric-unlock').unlockDriverSession('Prompt', 'Cancel')).reason, 'setup');
  assert.equal(noFace.calls.biometric.length, 0);
});
test('Face ID cancellation leaves the local screen locked and keeps the server session intact', async () => {
  const h = harness({ gate: true });
  h.setBiometric(async () => ({ success: false, error: 'user_cancel' }));
  h.mount(); await h.settle();
  assert.equal(h.tree.props.visible, true); assert.equal(h.calls.logout, 0); assert.deepEqual(h.calls.tracking, []);
  h.setBiometric(async () => ({ success: true }));
  const button = find(h.tree, (node) => node.type === 'Pressable' && find(node, (text) => text.props?.children === 'security.unlock'));
  button.props.onPress(); await h.settle();
  assert.equal(h.tree.props.visible, false); assert.equal(h.calls.logout, 0);
});
test('Face ID system inactive transition does not loop, but an actual app switch re-locks on resume', async () => {
  const h = harness({ gate: true }); h.mount(); await h.settle();
  assert.equal(h.tree.props.visible, false); assert.equal(h.calls.biometric.length, 1);
  await h.appState('inactive'); assert.equal(h.tree.props.visible, true);
  await h.appState('active'); assert.equal(h.tree.props.visible, false);
  assert.equal(h.calls.biometric.length, 1);
  await h.appState('background'); assert.equal(h.tree.props.visible, true);
  await h.appState('active'); assert.equal(h.calls.biometric.length, 2);
  assert.equal(h.tree.props.visible, false); assert.deepEqual(h.calls.tracking, []);
});
test('a biometric reply after backgrounding cannot unlock stale identity or clear the local lock', async () => {
  const h = harness({ gate: true }); const delayed = deferred(); h.setBiometric(() => delayed.promise);
  h.mount(); await h.settle(); await h.appState('background');
  delayed.resolve({ success: true }); await h.settle();
  assert.equal(h.tree.props.visible, true); assert.equal(h.calls.logout, 0);
});

test('returning before an old Face ID reply settles starts one fresh prompt and leaves GPS/session intact', async () => {
  const h = harness({ gate: true });
  const delayed = deferred();
  h.setBiometric(() => delayed.promise);
  h.mount(); await h.settle();
  await h.appState('background');
  await h.appState('active');
  assert.equal(h.calls.biometric.length, 1);
  h.setBiometric(async () => ({ success: true }));
  delayed.resolve({ success: true });
  await h.settle();
  assert.equal(h.calls.biometric.length, 2);
  assert.equal(h.tree.props.visible, false);
  assert.deepEqual(h.calls.tracking, []);
  assert.equal(h.calls.logout, 0);
});

test('production ignores a foreign stored API URL before adding the persistent Bearer credential', async () => {
  const h = harness({ development: false, storage: { auth_token: savedToken, api_url: 'https://foreign-project.invalid' } });
  await h.load('@/api/client').api('/api/driver/profile');
  assert.equal(h.calls.fetch[0].url, 'https://www.tyrerescue.uk/api/driver/profile');
  assert.equal(h.storage.get('api_url'), 'https://www.tyrerescue.uk');
});

test('an earlier logout retry cannot delete a newer queued logout credential', async () => {
  const h = harness(); const sessions = h.load('@/auth/session');
  const first = `${savedToken}-first`; const second = `${savedToken}-second`;
  await sessions.queueDriverSessionRevocation(first);
  const delayed = deferred(); h.setFetch(() => delayed.promise);
  const flush = sessions.flushDriverSessionRevocation(); await h.settle();
  await sessions.queueDriverSessionRevocation(second);
  delayed.resolve(Response.json({ ok: true })); await flush;
  assert.deepEqual(JSON.parse(h.storage.get('driver_pending_logout_v1')), [second]);
});

test('legacy WHEN_UNLOCKED credentials move to a fresh device-only service and remain readable after the phone locks', async () => {
  const h = harness({ nativeStorage: true, nativeItems: [{ key: 'auth_token', value: 'legacy-credential', accessibility: 0 }] });
  const secure = h.load('@/services/secure-storage');
  assert.equal(await secure.getItemAsync('auth_token'), 'legacy-credential');
  const migrated = h.calls.keychain.find((call) => call.operation === 'write');
  assert.equal(migrated.settings.keychainAccessible, 4);
  assert.equal(migrated.settings.keychainService, 'uk.tyrerescue.driver.background.v2');
  assert.equal(h.calls.nativeItems.get('app:auth_token').accessibility, 0);
  await h.appState('background');
  assert.equal(await secure.getItemAsync('auth_token'), 'legacy-credential');
  await secure.setItemAsync('online_location_enabled', 'true');
  assert.equal(await secure.getItemAsync('online_location_enabled'), 'true');
  for (const call of h.calls.keychain) assert.notEqual(call.settings?.requireAuthentication, true);
  assert.equal(h.calls.biometric.length, 0);
});

test('headless secure storage never searches legacy authenticated items and retries migration in foreground', async () => {
  const h = harness({ nativeStorage: true, nativeItems: [{ key: 'auth_token', value: savedToken, accessibility: 0 }] });
  const secure = h.load('@/services/secure-storage');
  await h.appState('background');
  await assert.rejects(secure.getItemAsync('auth_token'), /foreground migration/);
  assert.ok(h.calls.keychain.every((call) => call.settings?.keychainService === 'uk.tyrerescue.driver.background.v2'));
  assert.equal(h.calls.biometric.length, 0);
  await h.appState('active');
  assert.equal(await secure.getItemAsync('auth_token'), savedToken);
});

test('secure deletion tombstones prevent a failed legacy delete from resurrecting session or tracking keys', async () => {
  const h = harness({ nativeStorage: true, nativeDeleteFails: true, nativeItems: [
    { key: 'auth_token', value: savedToken, accessibility: 0 },
    { key: 'online_location_enabled', value: 'true', accessibility: 0 },
  ] });
  const secure = h.load('@/services/secure-storage');
  await secure.deleteItemAsync('auth_token');
  await secure.deleteItemAsync('online_location_enabled');
  assert.equal(await secure.getItemAsync('auth_token'), null);
  assert.equal(await secure.getItemAsync('online_location_enabled'), null);
  await h.appState('background');
  assert.equal(await secure.getItemAsync('auth_token'), null);
  assert.equal(h.calls.nativeItems.get('app:auth_token').value, savedToken);
});

test('an explicit secure write waits for older migration and cannot be overwritten by it', async () => {
  const delayed = deferred();
  let migrationBlocked = false;
  const h = harness({ nativeStorage: true, nativeItems: [{ key: 'auth_token', value: 'old-token', accessibility: 0 }],
    beforeStorageWrite: async (_, value) => { if (value === 'old-token') { migrationBlocked = true; await delayed.promise; } } });
  const secure = h.load('@/services/secure-storage');
  const reading = secure.getItemAsync('auth_token');
  await h.settle();
  assert.equal(migrationBlocked, true);
  const writing = secure.setItemAsync('auth_token', 'next-token');
  delayed.resolve();
  await Promise.all([reading, writing]);
  assert.equal(await secure.getItemAsync('auth_token'), 'next-token');
});

test('password verification preserves this driver Online consent but never transfers it to another driver account', async () => {
  const h = harness({ storage: { auth_token: savedToken, driver_session_user_v1: JSON.stringify(user) } });
  h.mount(); await h.settle();
  await h.value.login(user.email, 'isolated-password'); await h.settle();
  assert.deepEqual(h.calls.tracking, []);
  h.setFetch(async () => Response.json({ token: 'different-driver-token', user: { ...user, id: 'other-driver', driverId: 'other-profile' } }));
  await h.value.login('other@isolated.invalid', 'isolated-password'); await h.settle();
  assert.equal(h.value.user.id, 'other-driver');
  assert.deepEqual(h.calls.tracking, [false]);
});
