const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadSource(relative, dependencies = {}) {
  const filename = path.resolve(__dirname, '../src', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const execute = vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { URL, Date, Intl }, { filename });
  execute((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
const preferences = loadSource('lib/account-preferences.ts');
const support = loadSource('lib/account-support-report.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));
const BASE = 'https://www.tyrerescue.uk';
const defaults = { version: 1, language: 'en', timeFormat: '24h' };
const arabic = { version: 1, language: 'ar', timeFormat: '12h' };
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle() { for (let i = 0; i < 8; i += 1) await tick(); }
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('preference parser allowlists fields and does not retain credentials or arbitrary objects', () => {
  assert.deepEqual(plain(preferences.parseAccountPreferences({ ...arabic, token: 'fixture-not-a-real-token', rawSession: {} })), arabic);
  for (const value of [null, [], 1, 'ar', { version: 2, language: 'ar' }]) {
    assert.deepEqual(plain(preferences.parseAccountPreferences(value)), defaults);
  }
  assert.deepEqual(plain(preferences.parseAccountPreferences({ version: 1, language: {}, timeFormat: '25h' })), defaults);
});

test('storage key separates project origin and account and normalizes trailing slash', () => {
  const key = preferences.accountPreferencesStorageKey(BASE, 'admin-one');
  assert.equal(key, preferences.accountPreferencesStorageKey(`${BASE}/`, 'admin-one'));
  assert.notEqual(key, preferences.accountPreferencesStorageKey('https://another-project.invalid', 'admin-one'));
  assert.notEqual(key, preferences.accountPreferencesStorageKey(BASE, 'admin-two'));
});

test('storage rejects credentials, routed/query URLs and invalid account identifiers', () => {
  for (const url of ['file:///private', 'not a URL', `${BASE}/api`, `${BASE}?token=fixture`, `${BASE}#fixture`, 'https://fixture:password@www.tyrerescue.uk']) {
    assert.equal(preferences.accountPreferencesStorageKey(url, 'admin-one'), null);
  }
  for (const id of ['', 'admin@example.invalid', '../admin', 'a'.repeat(121)]) {
    assert.equal(preferences.accountPreferencesStorageKey(BASE, id), null);
  }
});

test('account timestamps follow selected 12/24-hour display with London summer/winter clock', () => {
  const summer = preferences.formatAccountTimestamp('2026-10-22T13:05:00.000Z', defaults);
  const winter = preferences.formatAccountTimestamp('2026-12-22T13:05:00.000Z', defaults);
  const twelve = preferences.formatAccountTimestamp('2026-10-22T13:05:00.000Z', { ...defaults, timeFormat: '12h' });
  assert.match(summer, /14:05/);
  assert.match(winter, /13:05/);
  assert.match(twelve.toLowerCase(), /02:05.*pm/);
  assert.notEqual(preferences.formatAccountTimestamp('2026-10-22T13:05:00.000Z', arabic), summer);
});

test('missing or invalid timestamps are explicit and localized', () => {
  for (const value of [null, undefined, '', 'invalid', Infinity]) {
    assert.equal(preferences.formatAccountTimestamp(value), 'Not recorded');
    assert.equal(preferences.formatAccountTimestamp(value, arabic), 'غير مسجل');
  }
});

const reportInput = {
  projectName: 'Tyre Rescue', apiBaseUrl: BASE,
  appVersion: '1.0.12', buildNumber: '48', platform: 'ios', modelName: 'iPhone 16 Pro', osVersion: '26.0',
  notificationPermission: 'granted', pushRegistration: 'registered', localLock: 'enabled',
};
test('support report contains selected metadata and status only, with no account or customer identity', () => {
  const report = JSON.parse(support.buildAccountSupportReport({
    ...reportInput, token: 'fixture-session-secret', email: 'admin@example.invalid', deviceName: 'Private name',
    rawError: { authorization: 'fixture-auth' }, customer: { address: 'Private address' },
  }, new Date('2026-10-22T12:00:00Z')));
  assert.deepEqual(Object.keys(report), ['report', 'version', 'generatedAt', 'project', 'app', 'device', 'notifications', 'localLock']);
  assert.equal(report.generatedAt, '2026-10-22T12:00:00.000Z');
  assert.deepEqual(report.project, { name: 'Tyre Rescue', origin: BASE });
  assert.deepEqual(report.app, { version: '1.0.12', build: '48' });
  assert.deepEqual(report.device, { platform: 'ios', model: 'iPhone 16 Pro', osVersion: '26.0' });
  assert.doesNotMatch(JSON.stringify(report), /fixture|Private|admin@example/);
});

test('support origin never includes URL credentials, request paths, query or fragments', () => {
  const report = JSON.parse(support.buildAccountSupportReport({
    ...reportInput, apiBaseUrl: 'https://fixture-login:fixture-password@www.tyrerescue.uk/private?secret=fixture#fixture',
  }));
  assert.equal(report.project.origin, BASE);
  assert.doesNotMatch(JSON.stringify(report), /fixture|private/);
  for (const origin of ['file:///private', 'javascript:fixture', 'malformed']) {
    assert.equal(JSON.parse(support.buildAccountSupportReport({ ...reportInput, apiBaseUrl: origin })).project.origin, 'Unknown');
  }
});

test('support display fields reject sensitive strings including hidden-control prefixes', () => {
  for (const value of [
    'Bearer fixture-token', 'sk_live_fixture_key_never_real', 'whsec_fixture_never_real',
    'acs_v1.fixture_session', 'ExpoPushToken[fixture]', 'ExponentPushToken[fixture]',
    'admin@example.invalid', 'A'.repeat(45), 'sk_\u202Alive_fixture',
  ]) {
    const report = JSON.parse(support.buildAccountSupportReport({ ...reportInput, projectName: value, modelName: value, osVersion: value }));
    assert.equal(report.project.name, 'Unknown');
    assert.equal(report.device.model, 'Unknown');
    assert.equal(report.device.osVersion, 'Unknown');
    assert.doesNotMatch(JSON.stringify(report), /fixture|admin@example|A{45}/);
  }
});

test('support unknown availability is honest and ignores arbitrary injected statuses/version', () => {
  const report = JSON.parse(support.buildAccountSupportReport({
    ...reportInput, notificationPermission: 'fixture-token', pushRegistration: 'fixture-token', localLock: 'fixture-token',
    appVersion: 'fixture-token', buildNumber: 'fixture-token', platform: 'fixture-token',
  }, new Date(NaN)));
  assert.equal(report.generatedAt, 'Unknown');
  assert.deepEqual(report.notifications, { permission: 'unknown', registration: 'unknown' });
  assert.equal(report.localLock, 'unknown');
  assert.deepEqual(report.app, { version: 'Unknown', build: 'Unknown' });
  assert.equal(report.device.platform, 'unknown');
  assert.doesNotMatch(JSON.stringify(report), /fixture/);
});

function hookHarness() {
  const state = { token: 'fixture-session', revision: 1, baseUrl: BASE, readError: false, writeError: false, readGate: null, writeGate: null };
  const disk = new Map();
  const calls = { reads: [], writes: [] };
  let rendering;
  const changed = (before, next) => !before || next.some((value, index) => value !== before[index]);
  const react = {
    useState(initial) {
      const renderer = rendering; const index = renderer.cursor++;
      if (!renderer.hooks[index]) renderer.hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [renderer.hooks[index].value, (value) => {
        renderer.hooks[index].value = typeof value === 'function' ? value(renderer.hooks[index].value) : value;
      }];
    },
    useRef(initial) {
      const renderer = rendering; const index = renderer.cursor++;
      if (!renderer.hooks[index]) renderer.hooks[index] = { current: initial };
      return renderer.hooks[index];
    },
    useMemo(create, deps) {
      const renderer = rendering; const index = renderer.cursor++;
      if (!renderer.hooks[index] || changed(renderer.hooks[index].deps, deps)) renderer.hooks[index] = { value: create(), deps };
      return renderer.hooks[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const renderer = rendering; const index = renderer.cursor++;
      if (!renderer.hooks[index] || changed(renderer.hooks[index].deps, deps)) renderer.effects.push(() => {
        renderer.hooks[index]?.cleanup?.(); renderer.hooks[index] = { deps, cleanup: effect() };
      });
    },
  };
  const storage = {
    async getItem(key) {
      calls.reads.push(key); if (state.readGate) await state.readGate;
      if (state.readError) throw new Error('Fixture read failure');
      return disk.get(key) ?? null;
    },
    async setItem(key, value) {
      calls.writes.push({ key, value }); if (state.writeGate) await state.writeGate;
      if (state.writeError) throw new Error('Fixture write failure');
      disk.set(key, value);
    },
  };
  const source = loadSource('hooks/useAccountPreferences.ts', {
    '@/hooks/useLatestRef': { useLatestRef: (value) => { const ref = react.useRef(value); ref.current = value; return ref; } },
    react, '@react-native-async-storage/async-storage': storage,
    '@/lib/account-preferences': preferences,
    '@/lib/api': { getAdminToken: () => state.token, getApiBaseUrl: () => state.baseUrl },
    './useAdminSession': { getAdminSessionRevision: () => state.revision },
  });
  const renderer = { hooks: [], effects: [], cursor: 0 };
  let options = { visible: true, userId: 'admin-one', apiBaseUrl: BASE };
  function read(next = {}) {
    options = { ...options, ...next }; renderer.cursor = 0; renderer.effects = []; rendering = renderer;
    const result = source.useAccountPreferences(options);
    for (const effect of renderer.effects) effect();
    return result;
  }
  const unmount = () => { for (const hook of renderer.hooks) hook?.cleanup?.(); };
  return { read, state, disk, calls, unmount };
}

test('account preferences persist across reopening and contain display fields only', async () => {
  const h = hookHarness(); h.read(); await settle();
  assert.equal(await h.read().setPreferences({ language: 'ar', timeFormat: '12h' }), true);
  assert.deepEqual(plain(h.read().preferences), arabic);
  assert.deepEqual(JSON.parse(h.calls.writes[0].value), arabic);
  assert.doesNotMatch(h.calls.writes[0].key + h.calls.writes[0].value, /fixture-session/);
  h.read({ visible: false }); h.read({ visible: true }); await settle();
  assert.deepEqual(plain(h.read().preferences), arabic); h.unmount();
});

test('account settings are isolated from other users and projects', async () => {
  const h = hookHarness(); h.read(); await settle(); await h.read().setPreferences({ language: 'ar' });
  h.read({ userId: 'admin-two' }); await settle();
  assert.equal(h.read().preferences.language, 'en');
  h.state.baseUrl = 'https://other-project.invalid'; h.state.revision += 1;
  h.read({ userId: 'admin-one', apiBaseUrl: h.state.baseUrl }); await settle();
  assert.equal(h.read().preferences.language, 'en'); h.unmount();
});

test('no storage access occurs while logged out, hidden or with invalid scope', async () => {
  for (const mode of ['logged-out', 'hidden', 'invalid-scope']) {
    const h = hookHarness(); if (mode === 'logged-out') h.state.token = null;
    h.read({ visible: mode !== 'hidden', userId: mode === 'invalid-scope' ? null : 'admin-one' }); await settle();
    assert.equal(await h.read().setPreferences({ language: 'ar' }), false);
    assert.equal(h.calls.reads.length, 0); assert.equal(h.calls.writes.length, 0); h.unmount();
  }
});

test('write failure keeps displayed preference and reports unsaved settings', async () => {
  const h = hookHarness(); h.read(); await settle(); h.state.writeError = true;
  assert.equal(await h.read().setPreferences({ language: 'ar' }), false);
  assert.equal(h.read().preferences.language, 'en'); assert.equal(h.read().error, 'write');
  h.state.writeError = false; assert.equal(await h.read().setPreferences({ language: 'ar' }), true);
  assert.equal(h.read().error, null); h.unmount();
});

test('read failure blocks overwrite until explicit refresh succeeds', async () => {
  const h = hookHarness(); h.state.readError = true; h.read(); await settle();
  assert.equal(h.read().error, 'read'); assert.equal(await h.read().setPreferences({ language: 'ar' }), false);
  h.state.readError = false; h.read().refresh(); h.read(); await settle();
  assert.equal(h.read().error, null); assert.equal(await h.read().setPreferences({ language: 'ar' }), true); h.unmount();
});

test('late read from a previous account cannot populate the current account screen', async () => {
  const h = hookHarness(); const gate = deferred(); h.state.readGate = gate.promise;
  h.disk.set(preferences.accountPreferencesStorageKey(BASE, 'admin-one'), JSON.stringify(arabic));
  h.read(); await settle(); h.state.readGate = null;
  h.read({ userId: 'admin-two' }); await settle();
  assert.equal(h.read().preferences.language, 'en'); gate.resolve(); await settle();
  assert.equal(h.read().preferences.language, 'en'); h.unmount();
});

test('session or backend transition prevents an old callback from writing or confirming saved state', async () => {
  const h = hookHarness(); h.read(); await settle(); const previous = h.read();
  h.state.revision += 1;
  assert.equal(await previous.setPreferences({ language: 'ar' }), false); assert.equal(h.calls.writes.length, 0);
  h.read(); await settle(); const gate = deferred(); h.state.writeGate = gate.promise;
  const pending = h.read().setPreferences({ language: 'ar' }); await settle();
  h.state.baseUrl = 'https://other-project.invalid'; h.state.revision += 1;
  h.read({ apiBaseUrl: h.state.baseUrl }); await settle(); gate.resolve(); await settle();
  assert.equal(await pending, false); assert.equal(h.read().preferences.language, 'en'); h.unmount();
});

test('reopening during an in-flight save waits for it and ignores its old UI callback', async () => {
  const h = hookHarness(); h.read(); await settle(); const gate = deferred(); h.state.writeGate = gate.promise;
  const pending = h.read().setPreferences({ language: 'ar' }); await settle();
  h.read({ visible: false }); h.read({ visible: true }); await settle();
  assert.equal(h.read().loading, true); gate.resolve(); await settle();
  assert.equal(await pending, false); assert.equal(h.read().preferences.language, 'ar'); h.unmount();
});

test('corrupted preferences are not silently overwritten; refresh can recover', async () => {
  const h = hookHarness(); const key = preferences.accountPreferencesStorageKey(BASE, 'admin-one');
  h.disk.set(key, '{broken'); h.read(); await settle(); assert.equal(h.read().error, 'read');
  assert.equal(await h.read().setPreferences({ language: 'ar' }), false);
  h.disk.delete(key); h.read().refresh(); h.read(); await settle();
  assert.equal(await h.read().setPreferences({ language: 'ar' }), true); h.unmount();
});
