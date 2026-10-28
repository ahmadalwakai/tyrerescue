const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const source = path.resolve(__dirname, '../src/lib/admin-app-lock.ts');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsObject, Map, Set, Promise, encodeURIComponent, Error });
const { AdminAppLockController, adminAppLockPreferenceKey, adminAppLockIdentity } = exportsObject;
const A = { apiBaseUrl: 'https://www.tyrerescue.uk', userId: 'isolated-admin-a', sessionRevision: 1 };
const B = { ...A, apiBaseUrl: 'https://other-project.invalid', sessionRevision: 2 };
const FACE = { available: true, label: 'Face ID', reason: null };
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle() { for (let index = 0; index < 5; index += 1) await tick(); }
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(options = {}) {
  const disk = options.disk ?? new Map();
  const calls = { reads: [], writes: [], prompts: [] };
  const handlers = {
    read: async (key) => disk.get(key) ?? null,
    write: async (key, value) => { disk.set(key, value); },
    capability: async () => FACE,
    auth: async () => ({ success: true }),
  };
  const controller = new AdminAppLockController({
    readPreference: async (key) => { calls.reads.push(key); return handlers.read(key); },
    writePreference: async (key, value) => { calls.writes.push({ key, value }); return handlers.write(key, value); },
    capability: () => handlers.capability(),
    authenticate: async (prompt) => { calls.prompts.push(prompt); return handlers.auth(); },
  });
  return { controller, disk, calls, handlers };
}

test('lock preferences are isolated per backend and admin, with a stable durable key', () => {
  assert.notEqual(adminAppLockPreferenceKey(A), adminAppLockPreferenceKey(B));
  assert.notEqual(adminAppLockPreferenceKey(A), adminAppLockPreferenceKey({ ...A, userId: 'isolated-admin-b' }));
  assert.equal(adminAppLockPreferenceKey(A), adminAppLockPreferenceKey({ ...A, apiBaseUrl: `${A.apiBaseUrl}/`, sessionRevision: 44 }));
  assert.notEqual(adminAppLockIdentity(A), adminAppLockIdentity({ ...A, sessionRevision: 2 }));
});

test('a new admin starts with optional app lock off and no biometric prompt', async () => {
  const h = harness();
  await h.controller.setScope(A);
  assert.equal(h.controller.getState().ready, true);
  assert.equal(h.controller.getState().enabled, false);
  assert.equal(h.calls.prompts.length, 0);
  assert.equal(h.calls.writes.length, 0);
});

test('successful enable authenticates first, persists only a nonsecret flag, then restores locked', async () => {
  const h = harness();
  await h.controller.setScope(A);
  assert.equal(await h.controller.setEnabled(true), true);
  assert.equal(h.controller.getState().enabled, true);
  assert.equal(h.controller.getState().locked, false);
  assert.deepEqual(h.calls.writes, [{ key: adminAppLockPreferenceKey(A), value: '1' }]);
  const restored = harness({ disk: h.disk });
  await restored.controller.setScope(A);
  assert.equal(restored.controller.getState().locked, true);
});

test('cancelled enable keeps the previous preference and session identity untouched', async () => {
  const h = harness();
  h.handlers.auth = async () => ({ success: false, message: 'Cancelled' });
  await h.controller.setScope(A);
  assert.equal(await h.controller.setEnabled(true), false);
  assert.equal(h.controller.getState().enabled, false);
  assert.equal(h.controller.getState().identity, adminAppLockIdentity(A));
  assert.equal(h.calls.writes.length, 0);
});

test('cancelled unlock stays locked without changing the stored preference', async () => {
  const h = harness({ disk: new Map([[adminAppLockPreferenceKey(A), '1']]) });
  await h.controller.setScope(A);
  h.handlers.auth = async () => ({ success: false, message: 'Cancelled' });
  assert.equal(await h.controller.unlock(), false);
  assert.equal(h.controller.getState().locked, true);
  assert.equal(h.controller.getState().error, 'Cancelled');
  assert.equal(h.calls.writes.length, 0);
  assert.equal(h.disk.get(adminAppLockPreferenceKey(A)), '1');
});

test('successful unlock changes only the UI gate; background locks again', async () => {
  const h = harness({ disk: new Map([[adminAppLockPreferenceKey(A), '1']]) });
  await h.controller.setScope(A);
  assert.equal(await h.controller.unlock(), true);
  assert.equal(h.controller.getState().locked, false);
  h.controller.setForeground(false);
  assert.equal(h.controller.getState().locked, true);
  h.controller.setForeground(true);
  assert.equal(h.controller.getState().locked, true);
  assert.equal(h.calls.writes.length, 0);
});

test('a biometric result after a real background transition cannot unlock', async () => {
  const gate = deferred();
  const h = harness({ disk: new Map([[adminAppLockPreferenceKey(A), '1']]) });
  h.handlers.auth = () => gate.promise;
  await h.controller.setScope(A);
  const pending = h.controller.unlock();
  await settle();
  h.controller.setForeground(false);
  h.controller.setForeground(true);
  gate.resolve({ success: true });
  assert.equal(await pending, false);
  assert.equal(h.controller.getState().locked, true);
});

test('duplicate unlock requests produce one biometric prompt', async () => {
  const gate = deferred();
  const h = harness({ disk: new Map([[adminAppLockPreferenceKey(A), '1']]) });
  await h.controller.setScope(A);
  h.handlers.auth = () => gate.promise;
  const pending = h.controller.unlock();
  await settle();
  assert.equal(await h.controller.unlock(), false);
  assert.equal(h.calls.prompts.length, 1);
  gate.resolve({ success: true });
  assert.equal(await pending, true);
});

test('a stale project preference cannot overwrite the current project', async () => {
  const gate = deferred();
  const h = harness();
  h.handlers.read = (key) => key === adminAppLockPreferenceKey(A) ? gate.promise : Promise.resolve(null);
  const pending = h.controller.setScope(A);
  await settle();
  await h.controller.setScope(B);
  gate.resolve('1');
  await pending;
  assert.equal(h.controller.getState().identity, adminAppLockIdentity(B));
  assert.equal(h.controller.getState().enabled, false);
});

test('a successful biometric result for a previous session cannot unlock the next admin', async () => {
  const gate = deferred();
  const h = harness({ disk: new Map([[adminAppLockPreferenceKey(A), '1'], [adminAppLockPreferenceKey(B), '1']]) });
  await h.controller.setScope(A);
  h.handlers.auth = () => gate.promise;
  const pending = h.controller.unlock();
  await settle();
  await h.controller.setScope(B);
  gate.resolve({ success: true });
  assert.equal(await pending, false);
  assert.equal(h.controller.getState().identity, adminAppLockIdentity(B));
  assert.equal(h.controller.getState().locked, true);
});

test('manual sign-out discards only runtime lock state and does not delete the preference', async () => {
  const h = harness({ disk: new Map([[adminAppLockPreferenceKey(A), '1']]) });
  await h.controller.setScope(A);
  await h.controller.setScope(null);
  assert.equal(h.controller.getState().identity, null);
  assert.equal(h.disk.get(adminAppLockPreferenceKey(A)), '1');
  assert.equal(h.calls.writes.length, 0);
});

test('read failure fails closed and can be retried without signing out', async () => {
  const h = harness();
  h.handlers.read = async () => { throw new Error('Isolated disk unavailable'); };
  await h.controller.setScope(A);
  assert.equal(h.controller.getState().ready, false);
  assert.equal(h.controller.getState().locked, true);
  assert.match(h.controller.getState().error, /could not be read/);
  h.handlers.read = async () => '1';
  await h.controller.retry();
  assert.equal(h.controller.getState().ready, true);
  assert.equal(h.controller.getState().locked, true);
});

test('an invalid stored flag cannot silently disable existing protection', async () => {
  const h = harness({ disk: new Map([[adminAppLockPreferenceKey(A), 'invalid']]) });
  await h.controller.setScope(A);
  assert.equal(h.controller.getState().ready, false);
  assert.equal(h.controller.getState().locked, true);
});

test('failed persistence leaves enablement off and exposes a retryable message', async () => {
  const h = harness();
  await h.controller.setScope(A);
  h.handlers.write = async () => { throw new Error('Isolated write unavailable'); };
  assert.equal(await h.controller.setEnabled(true), false);
  assert.equal(h.controller.getState().enabled, false);
  assert.match(h.controller.getState().error, /could not be saved/);
});

test('disable also requires authentication and cancellation keeps protection on', async () => {
  const h = harness({ disk: new Map([[adminAppLockPreferenceKey(A), '1']]) });
  await h.controller.setScope(A);
  await h.controller.unlock();
  h.handlers.auth = async () => ({ success: false });
  assert.equal(await h.controller.setEnabled(false), false);
  assert.equal(h.controller.getState().enabled, true);
  h.handlers.auth = async () => ({ success: true });
  assert.equal(await h.controller.setEnabled(false), true);
  assert.equal(h.disk.get(adminAppLockPreferenceKey(A)), '0');
  assert.equal(h.controller.getState().locked, false);
});

test('background while saving enabled flag still restores a locked gate', async () => {
  const gate = deferred();
  const h = harness();
  await h.controller.setScope(A);
  h.handlers.write = async (key, value) => { await gate.promise; h.disk.set(key, value); };
  const pending = h.controller.setEnabled(true);
  await settle();
  assert.equal(h.calls.writes.length, 1);
  h.controller.setForeground(false);
  gate.resolve();
  assert.equal(await pending, true);
  assert.equal(h.controller.getState().enabled, true);
  assert.equal(h.controller.getState().locked, true);
});

test('reopening the same account waits for its prior preference write', async () => {
  const gate = deferred();
  const h = harness();
  await h.controller.setScope(A);
  h.handlers.write = async (key, value) => { await gate.promise; h.disk.set(key, value); };
  const pending = h.controller.setEnabled(true);
  await settle();
  await h.controller.setScope(null);
  const restored = h.controller.setScope({ ...A, sessionRevision: 3 });
  await settle();
  assert.equal(h.controller.getState().ready, false);
  gate.resolve();
  await Promise.all([pending, restored]);
  assert.equal(h.controller.getState().enabled, true);
  assert.equal(h.controller.getState().locked, true);
});

test('missing native module or enrollment cannot be mistaken for a successful unlock', async () => {
  const h = harness({ disk: new Map([[adminAppLockPreferenceKey(A), '1']]) });
  h.handlers.capability = async () => ({ available: false, label: 'Biometrics', reason: 'Updated installed app build required.' });
  await h.controller.setScope(A);
  assert.equal(await h.controller.unlock(), false);
  assert.equal(h.controller.getState().locked, true);
  assert.match(h.controller.getState().error, /build required/);
  assert.equal(h.calls.prompts.length, 0);
  assert.equal(h.calls.writes.length, 0);
});

test('controller exceptions never expose raw native errors and cannot unlock', async () => {
  const h = harness({ disk: new Map([[adminAppLockPreferenceKey(A), '1']]) });
  await h.controller.setScope(A);
  h.handlers.auth = async () => { throw new Error('private native error details'); };
  assert.equal(await h.controller.unlock(), false);
  assert.equal(h.controller.getState().locked, true);
  assert.doesNotMatch(h.controller.getState().error, /private native/);
});

test('manual lock invalidates an already running unlock attempt', async () => {
  const gate = deferred();
  const h = harness({ disk: new Map([[adminAppLockPreferenceKey(A), '1']]) });
  await h.controller.setScope(A);
  h.handlers.auth = () => gate.promise;
  const pending = h.controller.unlock();
  await settle();
  h.controller.manualLock();
  gate.resolve({ success: true });
  assert.equal(await pending, false);
  assert.equal(h.controller.getState().locked, true);
});

test('Face ID configuration preserves the requested icon, build number and saved session policy', () => {
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../app.json'), 'utf8')).expo;
  assert.equal(config.ios.icon, './assets/administration-icon.jpg');
  assert.ok(Number(config.ios.buildNumber) >= 49, 'Face ID changes require the new native build or a later release');
  assert.match(config.ios.infoPlist.NSFaceIDUsageDescription, /signed in/);
  for (const plugin of config.plugins.filter((value) => Array.isArray(value) && ['expo-local-authentication', 'expo-secure-store'].includes(value[0]))) {
    assert.equal(plugin[1].faceIDPermission, config.ios.infoPlist.NSFaceIDUsageDescription);
  }
  const native = fs.readFileSync(path.resolve(__dirname, '../src/lib/admin-biometrics.ts'), 'utf8');
  assert.doesNotMatch(native, /^import \* as .*from 'expo-local-authentication'/m);
  assert.match(native, /disableDeviceFallback: true/);
  const provider = fs.readFileSync(path.resolve(__dirname, '../src/components/security/AdminAppLockProvider.tsx'), 'utf8');
  assert.match(provider, /next === 'inactive'\) return/);
  assert.match(provider, /\) : children\}/);
});

function nativeHarness({ platform = 'ios', hardware = true, enrolled = true, missing = false, result = { success: true } } = {}) {
  const exported = {};
  const calls = [];
  const nativeSource = path.resolve(__dirname, '../src/lib/admin-biometrics.ts');
  const native = {
    AuthenticationType: { FACIAL_RECOGNITION: 2, FINGERPRINT: 1 },
    hasHardwareAsync: async () => hardware,
    isEnrolledAsync: async () => enrolled,
    supportedAuthenticationTypesAsync: async () => [2],
    authenticateAsync: async (options) => { calls.push(options); return result; },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(nativeSource, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText, {
    exports: exported,
    Promise,
    require: (name) => {
      if (name === 'react-native') return { Platform: { OS: platform } };
      if (name === 'expo-local-authentication') {
        if (missing) throw new Error('Cannot find native module ExpoLocalAuthentication');
        return native;
      }
      throw new Error(`Unexpected isolated test import: ${name}`);
    },
  });
  return { exported, calls };
}

test('an installed old binary missing the native module does not crash evaluation or capability checks', async () => {
  const h = nativeHarness({ missing: true });
  const capability = await h.exported.readAdminBiometricCapability();
  assert.equal(capability.available, false);
  assert.match(capability.reason, /updated installed app build/);
  assert.equal((await h.exported.authenticateAdminBiometrics('Isolated prompt')).success, false);
});

test('native capabilities distinguish Face ID, missing enrollment, hardware and web support', async () => {
  assert.equal((await nativeHarness().exported.readAdminBiometricCapability()).label, 'Face ID');
  assert.equal((await nativeHarness({ enrolled: false }).exported.readAdminBiometricCapability()).available, false);
  assert.match((await nativeHarness({ enrolled: false }).exported.readAdminBiometricCapability()).reason, /Set up Face ID/);
  assert.equal((await nativeHarness({ hardware: false }).exported.readAdminBiometricCapability()).available, false);
  assert.equal((await nativeHarness({ platform: 'web' }).exported.readAdminBiometricCapability()).available, false);
});

test('the native unlock prompt disables passcode fallback and requests strong Android biometrics', async () => {
  const h = nativeHarness();
  assert.equal((await h.exported.authenticateAdminBiometrics('Isolated prompt')).success, true);
  assert.equal(h.calls[0].disableDeviceFallback, true);
  assert.equal(h.calls[0].fallbackLabel, '');
  assert.equal(h.calls[0].biometricsSecurityLevel, 'strong');
});

test('native cancellation and lockout return actionable messages without invalidating sign-in', async () => {
  const cancel = nativeHarness({ result: { success: false, error: 'user_cancel' } });
  assert.match((await cancel.exported.authenticateAdminBiometrics('Test')).message, /saved sign-in is unchanged/);
  const lockout = nativeHarness({ result: { success: false, error: 'lockout' } });
  assert.match((await lockout.exported.authenticateAdminBiometrics('Test')).message, /Unlock your iPhone with its passcode/);
});

function providerHarness(options = {}) {
  const state = { revision: 1, token: 'isolated-test-token', baseUrl: options.actualBaseUrl ?? A.apiBaseUrl, apiRevision: 1, logoutCalls: 0, cleanupCalls: 0, buttons: null, scope: null, scopeDependencies: null, effects: [], controller: null, appStateListener: null };
  const exported = {};
  const manualLogoutExports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/lib/manual-logout.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: manualLogoutExports, Promise, setTimeout, clearTimeout });
  const node = (type, props) => ({ type, props });
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useCallback: (value) => value,
    useEffect: (effect) => { state.effects.push(effect); },
    useMemo: (factory, dependencies) => {
      const value = factory();
      if (value?.apiBaseUrl && value?.userId && value?.sessionRevision !== undefined) {
        state.scope = value;
        state.scopeDependencies = dependencies;
      }
      return value;
    },
    useState: (factory) => { const value = factory(); if (typeof value?.setForeground === 'function') state.controller = value; return [value, () => {}]; },
    useSyncExternalStore: (_subscribe, getState) => getState(),
  };
  const fakeSession = {
    status: 'logged-in', user: { id: A.userId }, activeProject: { apiBaseUrl: A.apiBaseUrl },
    logout: async () => { state.logoutCalls += 1; state.revision += 1; },
  };
  const sourceText = fs.readFileSync(path.resolve(__dirname, '../src/components/security/AdminAppLockProvider.tsx'), 'utf8');
  vm.runInNewContext(ts.transpileModule(sourceText, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports: exported,
    Promise,
    require: (name) => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: node, jsxs: node };
      if (name === 'react-native') return {
        StyleSheet: { create: (styles) => styles }, ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Text: 'Text', View: 'View',
        Alert: { alert: (_title, _description, buttons) => { state.buttons = buttons; } },
        AppState: { currentState: 'active', addEventListener: (_name, listener) => { state.appStateListener = listener; return { remove() {} }; } },
      };
      if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (name === '@react-native-async-storage/async-storage') return { default: { getItem: async () => options.enabled ? '1' : null, setItem: async () => {} } };
      if (name === '@/components/theme') return { colors: {}, space: {} };
      if (name === '@/hooks/useAdminSession') return { useAdminSession: () => fakeSession, getAdminSessionRevision: () => state.revision };
      if (name === '@/lib/api') return { getApiBaseUrl: () => state.baseUrl, getAdminToken: () => state.token, getApiContextRevision: () => state.apiRevision };
      if (name === '@/lib/admin-app-lock') return exportsObject;
      if (name === '@/lib/admin-biometrics') return { readAdminBiometricCapability: async () => FACE, authenticateAdminBiometrics: async () => ({ success: true }) };
      if (name === '@/lib/manual-logout') return manualLogoutExports;
      if (name === '@/lib/notifications') return { unregisterAdminPushNotifications: async () => { state.cleanupCalls += 1; } };
      if (name === '@/lib/urgent-alerts') return { clearTopicSubscriptionFlag: async () => { state.cleanupCalls += 1; } };
      throw new Error(`Unexpected isolated provider import: ${name}`);
    },
  });
  const tree = exported.AdminAppLockProvider({ children: 'protected customer data' });
  function findSignOut(value) {
    if (!value || typeof value !== 'object') return null;
    if (value.type === 'Pressable' && value.props.children?.props?.children === 'Sign out manually') return value;
    const children = value.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = findSignOut(child);
      if (found) return found;
    }
    return null;
  }
  const signOutButton = findSignOut(tree);
  assert.ok(signOutButton);
  return { state, tree, openConfirmation: () => signOutButton.props.onPress() };
}

test('the central gate removes protected screens until their preference identity is ready', () => {
  const h = providerHarness();
  assert.doesNotMatch(JSON.stringify(h.tree), /protected customer data/);
});

test('a selected project with an API override scopes app lock to the actual backend and current session', () => {
  const override = 'http://192.168.1.17:3002';
  const h = providerHarness({ actualBaseUrl: override });
  assert.equal(h.state.scope.apiBaseUrl, override);
  assert.notEqual(adminAppLockPreferenceKey(h.state.scope), adminAppLockPreferenceKey(A));
  assert.ok(h.state.scopeDependencies.includes(override));
  assert.ok(h.state.scopeDependencies.includes(h.state.revision));
});

test('manual recovery confirmation cannot sign out a later session, token or backend', async () => {
  for (const change of [
    (state) => { state.revision += 1; },
    (state) => { state.token = 'new-isolated-token'; },
    (state) => { state.baseUrl = B.apiBaseUrl; },
    (state) => { state.apiRevision += 1; },
  ]) {
    const h = providerHarness();
    h.openConfirmation();
    change(h.state);
    h.state.buttons.find((button) => button.text === 'Sign out').onPress();
    await settle();
    assert.equal(h.state.logoutCalls, 0);
    assert.equal(h.state.cleanupCalls, 0);
  }
});

test('manual recovery sign-out cleans up only the current device before explicit logout', async () => {
  const h = providerHarness();
  h.openConfirmation();
  h.state.buttons.find((button) => button.text === 'Sign out').onPress();
  await settle();
  assert.equal(h.state.cleanupCalls, 2);
  assert.equal(h.state.logoutCalls, 1);
});

test('chat photo and permission sheets stay mounted on inactive, while real background still locks', async () => {
  const h = providerHarness({ enabled: true });
  for (const effect of h.state.effects) effect();
  await settle();
  assert.equal(h.state.controller.getState().enabled, true);
  assert.equal(await h.state.controller.unlock(), true);
  h.state.appStateListener('inactive');
  assert.equal(h.state.controller.getState().locked, false);
  h.state.appStateListener('active');
  assert.equal(h.state.controller.getState().locked, false);
  h.state.appStateListener('background');
  assert.equal(h.state.controller.getState().locked, true);
  h.state.appStateListener('active');
  assert.equal(h.state.controller.getState().locked, true);
  assert.equal(h.state.logoutCalls, 0);
});
