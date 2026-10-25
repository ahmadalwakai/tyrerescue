const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const LIB = path.resolve(__dirname, '../src/lib');
const BASE = 'https://isolated-device-test.invalid';
const ID = '00000000-0000-4000-8000-000000000001';
const TOKEN = `acs_v1.${ID}.${'t'.repeat(43)}`;
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle() { for (let index = 0; index < 6; index += 1) await tick(); }
function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}
function response(status = 200, body = { ok: true }) {
  return { status, json: async () => body };
}

// Real metadata/coordinator modules, fake OS lifecycle, clock and network.
function harness(options = {}) {
  const state = {
    token: TOKEN, apiBaseUrl: BASE, revision: 1, appState: options.appState ?? 'active',
    platform: 'ios', platformVersion: '26.1', androidRelease: null, missingDeviceModule: false,
  };
  const device = { deviceName: 'Test iPhone', modelName: 'iPhone test', osVersion: '26.0' };
  const constants = { expoConfig: { version: '1.0.12' } };
  const calls = { requests: [], revoked: 0 };
  const timers = new Map();
  const appListeners = new Set();
  let timerId = 0;
  let handler = async () => response();
  const api = { getAdminToken: () => state.token, getApiBaseUrl: () => state.apiBaseUrl };
  const native = {
    AppState: {
      get currentState() { return state.appState; },
      addEventListener: (_, listener) => {
        appListeners.add(listener);
        return { remove: () => appListeners.delete(listener) };
      },
    },
    Platform: {
      get OS() { return state.platform; },
      get Version() { return state.platformVersion; },
      get constants() { return { Release: state.androidRelease }; },
    },
  };
  const cache = new Map();
  function load(name) {
    if (name === './api') return api;
    if (name === 'react-native') return native;
    if (name === 'expo-constants') return { default: constants };
    if (name === 'expo-device') {
      if (state.missingDeviceModule) throw new Error('Native module not present');
      return device;
    }
    assert.ok(['./admin-device-metadata', './admin-device-heartbeat'].includes(name), `Unmocked module: ${name}`);
    if (cache.has(name)) return cache.get(name).exports;
    const filename = path.join(LIB, name.slice(2) + '.ts');
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    cache.set(name, module);
    const execute = vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {
      AbortController,
      fetch: async (url, init) => {
        calls.requests.push({ url, init });
        return handler(url, init);
      },
      setInterval: (callback, milliseconds) => {
        assert.equal(milliseconds, 60_000);
        timers.set(++timerId, { callback, milliseconds, kind: 'interval' });
        return timerId;
      },
      clearInterval: (id) => timers.delete(id),
      setTimeout: (callback, milliseconds) => {
        assert.equal(milliseconds, 8_000);
        timers.set(++timerId, { callback, milliseconds, kind: 'timeout' });
        return timerId;
      },
      clearTimeout: (id) => timers.delete(id),
    }, { filename });
    execute(load, module, module.exports);
    return module.exports;
  }
  const heartbeat = load('./admin-device-heartbeat');
  const metadata = load('./admin-device-metadata');
  function setContext(options = {}) {
    const token = options.token ?? state.token;
    const apiBaseUrl = options.apiBaseUrl ?? state.apiBaseUrl;
    const revision = options.revision ?? state.revision;
    const context = {
      token, apiBaseUrl, revision,
      isCurrent: () => revision === state.revision,
      onRevoked: () => { calls.revoked += 1; },
      ...options,
    };
    heartbeat.setAdminDeviceHeartbeatContext(context);
    return context;
  }
  return {
    state, device, constants, calls, timers, appListeners, heartbeat, metadata, setContext,
    request: (callback) => { handler = callback; },
    appState: async (next) => {
      state.appState = next;
      for (const listener of [...appListeners]) listener(next);
      await settle();
    },
    clock: async (kind) => {
      for (const [id, timer] of [...timers]) {
        if (timer.kind !== kind) continue;
        if (kind === 'timeout') timers.delete(id);
        timer.callback();
      }
      await settle();
    },
  };
}

test('device metadata is display-only, fresh on each read and never accesses identifiers or permissions', () => {
  const h = harness();
  for (const property of ['modelId', 'osBuildFingerprint', 'getIosIdForVendorAsync', 'getAndroidId']) {
    Object.defineProperty(h.device, property, { get() { throw new Error('Identifier access prohibited'); } });
  }
  let value = h.metadata.readAdminDeviceMetadata();
  assert.equal(value.deviceName, 'Test iPhone');
  assert.equal(value.platform, 'ios');
  assert.equal(value.osVersion, '26.0');
  assert.equal(value.appVersion, '1.0.12');
  h.device.deviceName = 'Renamed iPhone';
  h.constants.expoConfig.version = '1.0.13';
  value = h.metadata.readAdminDeviceMetadata();
  assert.equal(value.deviceName, 'Renamed iPhone');
  assert.equal(value.appVersion, '1.0.13');
  assert.equal(Object.keys(value).sort().join(','), 'appVersion,deviceName,modelName,osVersion,platform');
});

test('metadata is bounded, strips control characters and has safe unknown fallbacks', () => {
  const h = harness();
  h.device.deviceName = '\u0000  Example\n  iPhone\u202e ' + 'x'.repeat(160);
  h.device.modelName = 'm'.repeat(160);
  h.device.osVersion = 'v'.repeat(100);
  h.constants.expoConfig.version = 'a'.repeat(80);
  let value = h.metadata.readAdminDeviceMetadata();
  assert.equal(value.deviceName.length, 120);
  assert.equal(value.modelName.length, 120);
  assert.equal(value.osVersion.length, 64);
  assert.equal(value.appVersion.length, 40);
  assert.doesNotMatch(value.deviceName, /[\u0000\n\u202e]/);
  h.state.missingDeviceModule = true;
  h.state.platform = 'unsupported';
  h.state.platformVersion = NaN;
  h.constants.expoConfig = null;
  value = h.metadata.readAdminDeviceMetadata();
  assert.equal(value.deviceName, 'Unknown');
  assert.equal(value.modelName, 'Unknown');
  assert.equal(value.platform, 'unknown');
  assert.equal(value.osVersion, 'Unknown');
  assert.equal(value.appVersion, 'Unknown');
});

test('Android OS fallback prefers the release string, then honestly labels its API level', () => {
  const h = harness();
  Object.defineProperty(h.device, 'deviceName', { get() { throw new Error('Unavailable'); } });
  h.device.osVersion = null;
  h.state.platform = 'android';
  h.state.platformVersion = 35;
  h.state.androidRelease = '15';
  let value = h.metadata.readAdminDeviceMetadata();
  assert.equal(value.deviceName, 'iPhone test');
  assert.equal(value.platform, 'android');
  assert.equal(value.osVersion, '15');
  h.state.androidRelease = null;
  value = h.metadata.readAdminDeviceMetadata();
  assert.equal(value.osVersion, 'Android API 35');
  h.state.platformVersion = NaN;
  assert.equal(h.metadata.readAdminDeviceMetadata().osVersion, 'Unknown');
});

test('opaque restore posts immediate foreground heartbeat with metadata and a single sixty-second lifecycle', async () => {
  const h = harness();
  const releaseFirst = h.heartbeat.retainAdminDeviceHeartbeat();
  h.setContext();
  await settle();
  const releaseSecond = h.heartbeat.retainAdminDeviceHeartbeat();
  await settle();
  assert.equal(h.calls.requests.length, 1);
  assert.equal(h.appListeners.size, 1);
  assert.equal([...h.timers.values()].filter((timer) => timer.kind === 'interval').length, 1);
  assert.equal(h.calls.requests[0].url, `${BASE}/api/mobile/admin/auth/devices/heartbeat`);
  assert.equal(h.calls.requests[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  const firstBody = JSON.parse(h.calls.requests[0].init.body);
  assert.equal(firstBody.state, 'active');
  assert.equal(firstBody.device.deviceName, 'Test iPhone');
  h.device.deviceName = 'Updated device name';
  await h.clock('interval');
  assert.equal(h.calls.requests.length, 2);
  assert.equal(JSON.parse(h.calls.requests[1].init.body).device.deviceName, 'Updated device name');
  releaseFirst();
  assert.equal(h.appListeners.size, 1);
  releaseSecond();
  assert.equal(h.appListeners.size, 0);
  assert.equal(h.timers.size, 0);
});

test('background/unknown state sends no heartbeat; entering foreground sends immediately and background stops it', async () => {
  const h = harness({ appState: 'background' });
  h.heartbeat.retainAdminDeviceHeartbeat();
  h.setContext();
  await settle();
  assert.equal(h.calls.requests.length, 0);
  assert.equal(h.timers.size, 0);
  await h.appState('active');
  assert.equal(h.calls.requests.length, 1);
  await h.appState('background');
  assert.equal(h.timers.size, 0);
  await h.clock('interval');
  assert.equal(h.calls.requests.length, 1);
  await h.appState('unknown');
  assert.equal(h.calls.requests.length, 1);
  await h.appState('active');
  assert.equal(h.calls.requests.length, 2);
});

test('legacy sessions do not report foreground activity until upgraded to opaque credentials', async () => {
  const h = harness();
  h.state.token = 'legacy.jwt.fixture';
  h.heartbeat.retainAdminDeviceHeartbeat();
  h.setContext();
  await settle();
  assert.equal(h.calls.requests.length, 0);
  assert.equal(h.timers.size, 0);
  h.state.token = TOKEN;
  h.setContext();
  await settle();
  assert.equal(h.calls.requests.length, 1);
});

test('generic authentication, network and server failures never revoke a cached client session', async () => {
  const h = harness();
  const release = h.heartbeat.retainAdminDeviceHeartbeat();
  h.request(async () => response(401, { error: 'Unauthorized' }));
  h.setContext();
  await settle();
  for (const status of [403, 404, 429, 500, 503]) {
    h.request(async () => response(status, { error: 'Unavailable' }));
    await h.clock('interval');
  }
  h.request(async () => { throw new Error('Offline'); });
  await h.clock('interval');
  assert.equal(h.calls.revoked, 0);
  assert.equal(h.state.token, TOKEN);
  assert.equal([...h.timers.values()].filter((timer) => timer.kind === 'interval').length, 1);
  release();
});

test('heartbeat timeout aborts a hung request and allows a later foreground retry without changing auth', async () => {
  const h = harness();
  h.request(() => new Promise(() => {}));
  h.heartbeat.retainAdminDeviceHeartbeat();
  h.setContext();
  await settle();
  assert.equal(h.calls.requests[0].init.signal.aborted, false);
  await h.clock('timeout');
  assert.equal(h.calls.requests[0].init.signal.aborted, true);
  assert.equal(h.calls.revoked, 0);
  assert.equal(h.state.token, TOKEN);
  h.request(async () => response());
  await h.clock('interval');
  assert.equal(h.calls.requests.length, 2);
});

test('multiple foreground/interval events do not create concurrent heartbeat requests', async () => {
  const h = harness();
  const gate = deferred();
  h.request(() => gate.promise);
  h.heartbeat.retainAdminDeviceHeartbeat();
  h.setContext();
  await h.clock('interval');
  await h.clock('interval');
  await h.appState('active');
  assert.equal(h.calls.requests.length, 1);
  gate.resolve(response());
  await settle();
  await h.clock('interval');
  assert.equal(h.calls.requests.length, 2);
});

test('backgrounding aborts the old request and its late revocation response is ignored', async () => {
  const h = harness();
  const gate = deferred();
  h.request(() => gate.promise);
  h.heartbeat.retainAdminDeviceHeartbeat();
  h.setContext();
  await settle();
  await h.appState('background');
  assert.equal(h.calls.requests[0].init.signal.aborted, true);
  gate.resolve(response(401, { code: 'DEVICE_SESSION_REVOKED', sessionId: ID }));
  await settle();
  assert.equal(h.calls.revoked, 0);
  assert.equal(h.timers.size, 0);
  h.request(async () => response());
  await h.appState('active');
  assert.equal(h.calls.requests.length, 2);
});

test('logout/last unmount abort requests and remove timers without any late callback', async () => {
  for (const action of ['logout', 'unmount']) {
    const h = harness();
    const gate = deferred();
    h.request(() => gate.promise);
    const release = h.heartbeat.retainAdminDeviceHeartbeat();
    h.setContext();
    await settle();
    if (action === 'logout') {
      h.state.token = null;
      h.heartbeat.setAdminDeviceHeartbeatContext(null);
    } else release();
    assert.equal(h.calls.requests[0].init.signal.aborted, true);
    assert.equal(h.timers.size, 0);
    assert.equal(h.appListeners.size, 0);
    gate.resolve(response(401, { code: 'DEVICE_SESSION_REVOKED', sessionId: ID }));
    await settle();
    assert.equal(h.calls.revoked, 0);
  }
});

test('only canonical401 removal for the matching current opaque UUID authorizes the explicit revoke callback', async () => {
  const invalid = [
    [401, { code: 'DEVICE_SESSION_REVOKED', sessionId: '00000000-0000-4000-8000-000000000002' }],
    [401, { code: 'DEVICE_SESSION_REVOKED', sessionId: 'not-a-uuid' }],
    [401, { code: 'DEVICE_SESSION_REVOKED', sessionId: ` ${ID}` }],
    [401, { code: 'SESSION_EXPIRED', sessionId: ID }],
    [401, { code: 'DEVICE_SESSION_REVOKED' }],
    [401, null],
    [200, { code: 'DEVICE_SESSION_REVOKED', sessionId: ID }],
    [403, { code: 'DEVICE_SESSION_REVOKED', sessionId: ID }],
  ];
  for (const [status, payload] of invalid) {
    const h = harness();
    h.request(async () => response(status, payload));
    const release = h.heartbeat.retainAdminDeviceHeartbeat();
    h.setContext();
    await settle();
    assert.equal(h.calls.revoked, 0);
    assert.equal(h.state.token, TOKEN);
    release();
  }
  const h = harness();
  h.request(async () => response(401, { code: 'DEVICE_SESSION_REVOKED', sessionId: ID }));
  h.heartbeat.retainAdminDeviceHeartbeat();
  h.setContext({ onRevoked: () => {
    h.calls.revoked += 1;
    h.state.token = null;
    h.heartbeat.setAdminDeviceHeartbeatContext(null);
  } });
  await settle();
  assert.equal(h.calls.revoked, 1);
  assert.equal(h.state.token, null);
  assert.equal(h.timers.size, 0);
});

test('token, session revision and backend guards reject delayed revocation of an earlier context', async () => {
  for (const change of ['token', 'revision', 'backend']) {
    const h = harness();
    const gate = deferred();
    h.request(() => gate.promise);
    h.heartbeat.retainAdminDeviceHeartbeat();
    h.setContext();
    await settle();
    if (change === 'token') h.state.token = TOKEN.replace(ID, '00000000-0000-4000-8000-000000000002');
    if (change === 'revision') h.state.revision += 1;
    if (change === 'backend') h.state.apiBaseUrl = 'https://another-device-test.invalid';
    gate.resolve(response(401, { code: 'DEVICE_SESSION_REVOKED', sessionId: ID }));
    await settle();
    assert.equal(h.calls.revoked, 0);
    await h.clock('interval');
    assert.equal(h.calls.requests.length, 1);
  }
});

test('switching context aborts the old token and posts only the new credential to its captured backend', async () => {
  const h = harness();
  const gate = deferred();
  h.request(() => gate.promise);
  h.heartbeat.retainAdminDeviceHeartbeat();
  h.setContext();
  await settle();
  h.state.token = TOKEN.replace(ID, '00000000-0000-4000-8000-000000000002');
  h.state.revision += 1;
  h.state.apiBaseUrl = 'https://another-device-test.invalid';
  h.request(async () => response());
  h.setContext();
  await settle();
  assert.equal(h.calls.requests[0].init.signal.aborted, true);
  assert.equal(h.calls.requests[1].url, `${h.state.apiBaseUrl}/api/mobile/admin/auth/devices/heartbeat`);
  assert.equal(h.calls.requests[1].init.headers.Authorization, `Bearer ${h.state.token}`);
  gate.resolve(response(401, { code: 'DEVICE_SESSION_REVOKED', sessionId: ID }));
  await settle();
  assert.equal(h.calls.revoked, 0);
});
