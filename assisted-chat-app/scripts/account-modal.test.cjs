const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function loadSource(relative, dependencies = {}) {
  const filename = path.resolve(__dirname, '../src', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { URL, Date, Intl }, { filename })((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected isolated component dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
const preferences = loadSource('lib/account-preferences.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle() { for (let i = 0; i < 6; i += 1) await tick(); }

function harness() {
  const state = {
    visible: true,
    token: 'fixture-private-session-never-real', revision: 1, apiRevision: 1, baseUrl: 'https://www.tyrerescue.uk',
    session: { status: 'logged-in', user: { id: 'fixture-admin-id', name: 'Authoritative Admin', email: 'admin@example.invalid' }, activeProject: { name: 'Tyre Rescue' } },
    preferences: { version: 1, language: 'en', timeFormat: '24h' }, preferenceError: null, preferenceLoading: false,
    alert: null, closes: 0, logouts: 0, notificationChanges: 0, preferenceChanges: [],
  };
  const appLock = {
    busy: false, ready: true, enabled: false, capability: { available: true, label: 'Face ID' }, error: null,
    setEnabled: async () => true, manualLock: () => {}, refreshCapability: async () => {},
  };
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
    useLayoutEffect(effect, deps) {
      const renderer = rendering; const index = renderer.cursor++;
      if (!renderer.hooks[index] || changed(renderer.hooks[index].deps, deps)) renderer.layoutEffects.push(() => {
        renderer.hooks[index]?.cleanup?.(); renderer.hooks[index] = { deps, cleanup: effect() };
      });
    },
  };
  const node = (type, props) => ({ type, props });
  const onLogout = async () => { state.logouts += 1; };
  const component = loadSource('components/AdminAccountModal.tsx', {
    '@/hooks/useLatestRef': { useLatestRef: (value) => { const ref = react.useRef(value); ref.current = value; return ref; } },
    react, 'react/jsx-runtime': { jsx: node, jsxs: node },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Switch: 'Switch', Text: 'Text', View: 'View',
      StyleSheet: { create: (value) => value }, Platform: { OS: 'ios' }, Linking: { openSettings: async () => {} },
      Alert: { alert: (title, message, buttons) => { state.alert = { title, message, buttons }; } },
    },
    'expo-constants': { platform: { ios: { buildNumber: '99' } }, expoConfig: { version: '1.0.12', ios: { buildNumber: '48' } } },
    '@/hooks/useAdminSession': { useAdminSession: () => state.session, getAdminSessionRevision: () => state.revision },
    '@/hooks/useAccountPreferences': { useAccountPreferences: () => ({
      preferences: state.preferences, loading: state.preferenceLoading, saving: false, error: state.preferenceError, refresh: () => {},
      setPreferences: async (next) => { state.preferenceChanges.push(next); state.preferences = { ...state.preferences, ...next }; return true; },
    }) },
    '@/lib/api': { getAdminToken: () => state.token, getApiBaseUrl: () => state.baseUrl, getApiContextRevision: () => state.apiRevision },
    '@/lib/account-preferences': preferences,
    '@/lib/admin-device-metadata': { readAdminDeviceMetadata: () => ({ platform: 'ios', modelName: 'iPhone 16 Pro', osVersion: '26.0', appVersion: '1.0.12', deviceName: 'PRIVATE DEVICE NAME' }) },
    './AdminDevicesModal': { AdminDevicesPanel: 'AdminDevicesPanel' },
    './layout/AdminModalShell': { AdminModalHeader: 'AdminModalHeader', AdminModalShell: 'AdminModalShell' },
    './alerts/NotificationReliabilityCard': { NotificationReliabilityCard: 'NotificationReliabilityCard' },
    './security/AdminAppLockProvider': { useAdminAppLock: () => appLock },
    './ui': { AppButton: 'AppButton', StatusBanner: 'StatusBanner' },
    './theme': { colors: {}, radius: {}, space: {} },
  });
  const renderer = { hooks: [], effects: [], layoutEffects: [], cursor: 0 };
  function read() {
    renderer.cursor = 0; renderer.effects = []; renderer.layoutEffects = []; rendering = renderer;
    const tree = component.AdminAccountModal({ visible: state.visible, onDismiss: () => {}, onClose: () => { state.closes += 1; }, onLogout, onNotificationsChanged: () => { state.notificationChanges += 1; } });
    for (const effect of renderer.layoutEffects) effect();
    for (const effect of renderer.effects) effect();
    return tree;
  }
  function findNode(predicate, tree) {
    if (!tree || typeof tree !== 'object') return null;
    if (predicate(tree)) return tree;
    const children = tree.props?.children;
    for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) {
      const match = findNode(predicate, child); if (match) return match;
    }
    return null;
  }
  const find = (predicate) => findNode(predicate, read());
  function press(label) {
    const target = find((value) => value.props?.accessibilityLabel === label || value.type === 'AppButton' && value.props?.label === label);
    assert.ok(target, `Missing actionable control: ${label}`); target.props.onPress();
  }
  return { state, appLock, read, find, press, onLogout, unmount: () => { for (const hook of renderer.hooks) hook?.cleanup?.(); } };
}

test('profile shows authoritative signed-in administrator and actual installed build before manifest fallback', () => {
  const h = harness(); const tree = h.read();
  assert.match(JSON.stringify(tree), /Authoritative Admin/); assert.match(JSON.stringify(tree), /admin@example.invalid/);
  h.press('App information'); const aboutView = JSON.stringify(h.read());
  assert.match(aboutView, /Installed build/); assert.match(aboutView, /99/);
  assert.doesNotMatch(aboutView, /PRIVATE DEVICE NAME/); h.unmount();
});

test('devices view forwards selected locale/time formatter and the guarded removal completion callback', async () => {
  const h = harness(); h.state.preferences = { version: 1, language: 'ar', timeFormat: '12h' }; h.read();
  h.press('الأجهزة والجلسات'); const panel = h.find((value) => value.type === 'AdminDevicesPanel'); assert.ok(panel);
  assert.equal(panel.props.enabled, true); assert.equal(panel.props.language, 'ar');
  assert.equal(panel.props.onCurrentDeviceRemoved, h.onLogout);
  assert.equal(panel.props.formatTimestamp('2026-10-22T13:05:00Z'), preferences.formatAccountTimestamp('2026-10-22T13:05:00Z', h.state.preferences));
  panel.props.onBusyChange(true); assert.equal(h.find((value) => value.type === 'AdminModalHeader').props.onClose, undefined);
  panel.props.onBusyChange(false); await panel.props.onCurrentDeviceRemoved(); assert.equal(h.state.logouts, 1); h.unmount();
});

test('account and app information expose no diagnostic report or copy controls in either language', () => {
  for (const language of ['en', 'ar']) {
    const h = harness(); h.state.preferences.language = language;
    assert.doesNotMatch(JSON.stringify(h.read()), /diagnostic|support report|copy report|تقرير الدعم|نسخ التقرير/i);
    h.press(language === 'ar' ? 'معلومات التطبيق' : 'App information');
    const about = JSON.stringify(h.read());
    assert.doesNotMatch(about, /diagnostic|support report|copy report|تقرير الدعم|نسخ التقرير|generatedAt|pushRegistration/i);
    assert.equal(h.find((value) => value.type === 'AppButton'), null);
    h.unmount();
  }
});

test('account project origin strips credentials, paths, query and fragment', () => {
  const h = harness(); h.state.baseUrl = 'https://fixture-user:fixture-password@www.tyrerescue.uk/private?secret=fixture#fixture';
  const account = JSON.stringify(h.read());
  assert.match(account, /https:\/\/www.tyrerescue.uk/);
  assert.doesNotMatch(account, /fixture-user|fixture-password|private\?|secret=fixture|#fixture/);
  h.unmount();
});

test('closing profile never signs out and native cancel confirmation has no logout effect', () => {
  const h = harness(); h.read(); h.find((value) => value.type === 'AdminModalHeader').props.onClose();
  assert.equal(h.state.closes, 1); assert.equal(h.state.logouts, 0);
  h.press('Sign out of this device'); assert.ok(h.state.alert.buttons.find((value) => value.style === 'cancel'));
  assert.equal(h.state.logouts, 0); h.unmount();
});

test('manual sign-out executes only after explicit destructive confirmation', async () => {
  const h = harness(); h.read(); h.press('Sign out of this device');
  assert.equal(h.state.logouts, 0); h.state.alert.buttons.find((value) => value.style === 'destructive').onPress();
  await settle(); assert.equal(h.state.logouts, 1); h.unmount();
});

test('old sign-out confirmation cannot log out a later session, token, API context or project', async () => {
  for (const change of [
    (state) => { state.revision += 1; }, (state) => { state.apiRevision += 1; },
    (state) => { state.token = 'fixture-new-session'; }, (state) => { state.baseUrl = 'https://other-project.invalid'; },
  ]) {
    const h = harness(); h.read(); h.press('Sign out of this device'); change(h.state);
    h.state.alert.buttons.find((value) => value.style === 'destructive').onPress(); await settle();
    assert.equal(h.state.logouts, 0); h.unmount();
  }
});

test('a confirmation from a closed profile cannot log out after unmount', async () => {
  const h = harness(); h.read(); h.press('Sign out of this device'); h.unmount();
  h.state.alert.buttons.find((value) => value.style === 'destructive').onPress(); await settle(); assert.equal(h.state.logouts, 0);
});

test('retaining a hidden profile host invalidates an already-open sign-out confirmation', async () => {
  const h = harness(); h.read(); h.press('Sign out of this device');
  const confirm = h.state.alert.buttons.find((button) => button.style === 'destructive');
  h.state.visible = false; h.read();
  const modal = h.find((value) => value.type === 'Modal');
  assert.equal(modal.props.visible, false);
  confirm.onPress(); await settle();
  assert.equal(h.state.logouts, 0); h.unmount();
});

test('notification settings retain their setup callback without exporting diagnostic status', () => {
  const h = harness(); h.read(); h.press('iPhone notifications'); const card = h.find((value) => value.type === 'NotificationReliabilityCard');
  assert.ok(card); assert.equal(card.props.language, 'en');
  assert.equal(card.props.onStatusChanged, undefined);
  card.props.onSetupChanged(); assert.equal(h.state.notificationChanges, 1);
  h.find((value) => value.type === 'AdminModalHeader').props.onClose();
  assert.ok(h.find((value) => value.props.accessibilityLabel === 'iPhone notifications'));
  h.unmount();
});

test('profile preference read errors disable language/time changes until retry', () => {
  const h = harness(); h.state.preferenceError = 'read'; h.read(); h.press('Display preferences');
  const english = h.find((value) => value.type === 'AppButton' && value.props.label === 'English');
  assert.equal(english.props.disabled, true); assert.ok(h.find((value) => value.type === 'AppButton' && value.props.label === 'Retry preferences'));
  assert.equal(h.state.preferenceChanges.length, 0); h.unmount();
});
