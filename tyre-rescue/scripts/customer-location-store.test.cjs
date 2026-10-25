const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const settle = async () => { for (let index = 0; index < 40; index++) await Promise.resolve(); };

function harness(platform = 'ios') {
  let now = 1000000;
  let timerId = 0;
  const timers = new Map();
  const state = {
    permission: { status: 'granted', canAskAgain: true },
    requestedPermission: { status: 'granted', canAskAgain: true },
    permissionChecks: 0, prompts: 0, gpsCalls: 0, addressCalls: 0,
    position: async () => ({ coords: { latitude: 55.86, longitude: -4.25, accuracy: 12 } }),
    address: async () => '10 Example Street, Glasgow',
  };
  state.prompt = async () => state.requestedPermission;
  const appStateListeners = new Set();
  const appState = { currentState: 'active', addEventListener: (_event, listener) => { appStateListeners.add(listener); return { remove: () => appStateListeners.delete(listener) }; } };
  const location = {
    Accuracy: { High: 4 },
    getForegroundPermissionsAsync: async () => { state.permissionChecks++; return state.permission; },
    requestForegroundPermissionsAsync: async () => { state.prompts++; return state.prompt(); },
    getCurrentPositionAsync: async () => { state.gpsCalls++; return state.position(); },
  };
  const dependencies = {
    react: { useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() },
    'react-native': { Platform: { OS: platform }, AppState: appState },
    'expo-location': location,
    './mapbox': { reverseGeocode: async (...args) => { state.addressCalls++; return state.address(...args); } },
  };
  const filename = path.join(__dirname, '../src/customer-location.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  class TestDate extends Date { static now() { return now; } }
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {
    Error, Date: TestDate,
    setTimeout: (callback, ms) => { const id = ++timerId; timers.set(id, { callback, expires: now + ms }); return id; },
    clearTimeout: id => timers.delete(id),
  }, { filename })(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return {
    ...module.exports, state, appState,
    transition(value) { appState.currentState = value; appStateListeners.forEach(listener => listener(value)); },
    bootRootLayout() {
      const effects = []; const node = (type, props) => ({ type, props });
      const rootDependencies = {
        '@react-navigation/native': { ThemeProvider: 'ThemeProvider' },
        'expo-router': { Stack: Object.assign(() => {}, { Screen: 'Screen' }) },
        'expo-splash-screen': { preventAutoHideAsync: async () => {}, hideAsync: async () => {} },
        'expo-status-bar': { StatusBar: 'StatusBar' },
        react: { useEffect: effect => effects.push(effect) },
        'react/jsx-runtime': { jsx: node, jsxs: node },
        'react-native': { AppState: appState, Platform: { OS: platform } },
        'react-native-reanimated': {},
        '@expo-google-fonts/bebas-neue': { useFonts: () => [true] },
        '@expo-google-fonts/inter': { useFonts: () => [true] },
        '@/src/theme': { colors: {} },
        '../src/stripe-provider': { CustomerStripeProvider: 'CustomerStripeProvider' },
        '@/src/customer-account': { CustomerAccountProvider: 'CustomerAccountProvider' },
        '@/src/customer-notifications': { CustomerNotificationBootstrap: 'CustomerNotificationBootstrap' },
        '@/src/customer-location': module.exports,
      };
      const rootFilename = path.join(__dirname, '../app/_layout.tsx');
      const rootCompiled = ts.transpileModule(fs.readFileSync(rootFilename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      }).outputText;
      const rootModule = { exports: {} };
      vm.runInNewContext(`(function(require,module,exports){${rootCompiled}\n})`, {}, { filename: rootFilename })(name => {
        if (!(name in rootDependencies)) throw new Error(`Unexpected root dependency: ${name}`);
        return rootDependencies[name];
      }, rootModule, rootModule.exports);
      rootModule.exports.default(); const cleanups = effects.map(effect => effect());
      return () => cleanups.forEach(cleanup => cleanup?.());
    },
    advance(ms) { now += ms; for (const [id, timer] of timers) { if (timer.expires <= now) { timers.delete(id); timer.callback(); } } },
    now: () => now,
  };
}

test('fresh GPS result is shared, subscribers receive updates, and no second prompt or position request is made', async () => {
  const h = harness(); const statuses = [];
  const unsubscribe = h.subscribeCustomerLocation(() => statuses.push(h.getCustomerLocationSnapshot().status));
  const first = await h.prepareCustomerLocation({ requestPermission: true });
  assert.equal(first.status, 'ready'); assert.equal(first.place.address, '10 Example Street, Glasgow');
  assert.equal(first.place.capturedAt, h.now()); assert.equal(first.place.accuracy, 12);
  assert.equal(await h.prepareCustomerLocation(), first); assert.equal(h.useCustomerLocation(), first);
  assert.equal(h.state.gpsCalls, 1); assert.equal(h.state.prompts, 0);
  assert.deepEqual(statuses, ['loading', 'ready']);
  unsubscribe(); await h.prepareCustomerLocation({ force: true }); assert.deepEqual(statuses, ['loading', 'ready']);
});

test('entry and address-step requests join a single GPS lookup', async () => {
  const h = harness(); const position = deferred(); h.state.position = () => position.promise;
  const first = h.prepareCustomerLocation({ requestPermission: true }); const second = h.prepareCustomerLocation({ force: true });
  assert.equal(first, second); await settle(); assert.equal(h.state.gpsCalls, 1);
  position.resolve({ coords: { latitude: 0, longitude: 0, accuracy: null } });
  assert.equal((await second).place.lat, 0); assert.equal(h.state.addressCalls, 1);
});

test('automatic lookup never asks again after denial; explicit retry can request permission', async () => {
  const h = harness(); h.state.permission = { status: 'denied', canAskAgain: true };
  assert.equal((await h.prepareCustomerLocation()).status, 'denied'); assert.equal(h.state.prompts, 0); assert.equal(h.state.gpsCalls, 0);
  assert.equal((await h.prepareCustomerLocation({ requestPermission: true })).status, 'ready'); assert.equal(h.state.prompts, 1);
});

test('an explicit permission request joins an automatic check without losing the user action', async () => {
  const h = harness(); h.state.permission = { status: 'undetermined', canAskAgain: true };
  const automatic = h.prepareCustomerLocation(); const explicit = h.prepareCustomerLocation({ requestPermission: true });
  assert.equal(automatic, explicit); assert.equal((await explicit).status, 'ready'); assert.equal(h.state.prompts, 1);
});

test('a permanently denied permission directs to Settings and does not prompt', async () => {
  const h = harness(); h.state.permission = { status: 'denied', canAskAgain: false };
  const result = await h.prepareCustomerLocation({ requestPermission: true });
  assert.equal(result.status, 'denied'); assert.equal(result.settingsNeeded, true); assert.equal(result.place, null); assert.equal(h.state.prompts, 0);
});

test('GPS timeout clears the shared request and ignores a late result', async () => {
  const h = harness(); const position = deferred(); h.state.position = () => position.promise;
  const pending = h.prepareCustomerLocation(); await settle(); h.advance(20001); await settle();
  assert.equal((await pending).status, 'error'); assert.match(h.getCustomerLocationSnapshot().message, /GPS is taking too long/);
  position.resolve({ coords: { latitude: 55, longitude: -4, accuracy: 1 } }); await settle();
  assert.equal(h.getCustomerLocationSnapshot().status, 'error'); assert.equal(h.state.addressCalls, 0);
  h.state.position = async () => ({ coords: { latitude: 56, longitude: -4, accuracy: 2 } }); assert.equal((await h.prepareCustomerLocation()).status, 'ready');
});

test('reverse-geocode timeout does not expose an address-less suggestion', async () => {
  const h = harness(); const address = deferred(); h.state.address = () => address.promise;
  const pending = h.prepareCustomerLocation(); await settle(); h.advance(15001); await settle();
  const result = await pending; assert.equal(result.status, 'error'); assert.equal(result.place, null);
  address.resolve('Late address'); await settle(); assert.equal(h.getCustomerLocationSnapshot(), result);
});

test('an expired location is cleared during refresh and stays cleared when refresh fails', async () => {
  const h = harness(); await h.prepareCustomerLocation(); h.advance(120001);
  h.state.position = async () => { throw new Error('Synthetic GPS unavailable'); };
  const pending = h.prepareCustomerLocation(); assert.equal(h.getCustomerLocationSnapshot().status, 'loading'); assert.equal(h.getCustomerLocationSnapshot().place, null);
  const result = await pending; assert.equal(result.status, 'error'); assert.equal(result.place, null); assert.equal(h.state.gpsCalls, 2);
});

test('capturedAt is the GPS capture time rather than reverse-geocode completion time', async () => {
  const h = harness(); const address = deferred(); h.state.address = () => address.promise;
  const pending = h.prepareCustomerLocation(); await settle(); const capturedAt = h.now(); h.advance(5000); address.resolve('10 Example Street');
  assert.equal((await pending).place.capturedAt, capturedAt);
});

test('web does not ask automatically, while explicit location selection is supported', async () => {
  const h = harness('web'); assert.equal((await h.prepareCustomerLocation()).status, 'idle'); assert.equal(h.state.permissionChecks, 0);
  h.state.permission = { status: 'undetermined', canAskAgain: true };
  assert.equal((await h.prepareCustomerLocation({ requestPermission: true })).status, 'ready'); assert.equal(h.state.prompts, 1);
});

test('background native app does not request permission or GPS until foreground', async () => {
  const h = harness(); h.appState.currentState = 'background';
  assert.equal((await h.prepareCustomerLocation({ requestPermission: true })).status, 'idle'); assert.equal(h.state.permissionChecks, 0); assert.equal(h.state.gpsCalls, 0);
  h.appState.currentState = 'active'; assert.equal((await h.prepareCustomerLocation({ requestPermission: true })).status, 'ready');
});

test('invalid coordinates cannot become a confirmation suggestion', async () => {
  const h = harness(); h.state.position = async () => ({ coords: { latitude: 95, longitude: -4, accuracy: 1 } });
  const result = await h.prepareCustomerLocation(); assert.equal(result.status, 'error'); assert.equal(result.place, null); assert.equal(h.state.addressCalls, 0);
});

test('native app launch and foreground transitions leave location permission until an explicit action', async () => {
  const h = harness(); h.state.permission = { status: 'undetermined', canAskAgain: true };
  const cleanup = h.bootRootLayout(); await settle();
  h.transition('background'); h.transition('active'); await settle();
  assert.equal(h.state.permissionChecks, 0);
  assert.equal(h.state.prompts, 0);
  assert.equal(h.state.gpsCalls, 0);
  assert.equal(h.getCustomerLocationSnapshot().status, 'idle');
  assert.equal((await h.prepareCustomerLocation({ requestPermission: true, force: true })).status, 'ready');
  assert.equal(h.state.prompts, 1);
  assert.equal(h.state.gpsCalls, 1);
  cleanup();
});
