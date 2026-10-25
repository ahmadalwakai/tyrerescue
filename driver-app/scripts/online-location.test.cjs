const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle() { for (let i = 0; i < 8; i += 1) await tick(); }
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function sample(timestamp = Date.parse('2026-10-21T12:00:00Z'), overrides = {}) {
  return {
    timestamp,
    coords: { latitude: 55.86, longitude: -4.25, accuracy: 8, heading: 90, speed: 0 },
    ...overrides,
  };
}

// Execute the actual TypeScript modules with native/storage/network dependencies
// replaced. No Expo runtime, HTTP request, device, push or customer data is used.
function harness(options = {}) {
  const storage = new Map(Object.entries(options.storage ?? { online_location_enabled: 'true' }));
  const calls = { posts: [], starts: [], stops: 0, prompts: 0, queued: [], diagnostics: [] };
  const state = { token: 'isolated-test-token', foreground: true, background: true, running: false };
  Object.assign(state, options.state);
  let backgroundTask;
  let apiHandler = async () => ({ accepted: true });
  let currentPosition = async () => sample();
  let startHandler = async () => {};
  let storageReader = async (key) => storage.get(key) ?? null;
  let tokenReader = async () => state.token;
  const appListeners = new Set();
  const intervals = new Map();
  let intervalId = 0;
  class ApiError extends Error {
    constructor(message, status, retryAfterSeconds = null, code = 'http') {
      super(message);
      Object.assign(this, { status, retryAfterSeconds, code });
    }
  }
  const apiModule = {
    ApiError,
    getToken: async () => options.nativeStorage
      ? load('@/services/secure-storage').getItemAsync('auth_token')
      : tokenReader(),
    getApiUrl: async () => 'https://isolated-driver.invalid',
    api: async (url, request) => {
      calls.posts.push({ url, body: request.body });
      return apiHandler(url, request);
    },
  };
  const mockQueue = {
    enqueue: (url, method, body) => calls.queued.push({ url, method, body }),
    getQueueLength: () => calls.queued.length,
    flushOfflineQueue: async () => {},
    discardQueuedLocations: async () => { calls.queued.length = 0; },
  };
  const location = {
    Accuracy: { High: 4, BestForNavigation: 6 },
    ActivityType: { AutomotiveNavigation: 1 },
    getForegroundPermissionsAsync: async () => ({ status: state.foreground ? 'granted' : 'denied' }),
    getBackgroundPermissionsAsync: async () => ({ status: state.background ? 'granted' : 'denied' }),
    requestForegroundPermissionsAsync: async () => { calls.prompts += 1; return { status: 'granted' }; },
    requestBackgroundPermissionsAsync: async () => { calls.prompts += 1; return { status: 'granted' }; },
    hasStartedLocationUpdatesAsync: async () => state.running,
    startLocationUpdatesAsync: async (name, config) => {
      calls.starts.push(config);
      await startHandler();
      state.running = true;
    },
    stopLocationUpdatesAsync: async () => { calls.stops += 1; state.running = false; },
    getCurrentPositionAsync: async () => currentPosition(),
    getLastKnownPositionAsync: async () => { throw new Error('Cached positions must not be relabelled fresh'); },
  };
  const appState = {
    currentState: 'active',
    addEventListener: (event, callback) => {
      appListeners.add(callback);
      return { remove: () => appListeners.delete(callback) };
    },
  };
  const hooks = [];
  let cursor = 0;
  let effects = [];
  const changed = (old, next) => !old || next.some((dep, index) => dep !== old[index]);
  const react = {
    useRef: (value) => {
      const index = cursor++;
      return hooks[index] ?? (hooks[index] = { current: value });
    },
    useState: (initial) => {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: initial };
      return [hooks[index].value, (value) => { hooks[index].value = value; }];
    },
    useCallback: (callback, deps) => {
      const index = cursor++;
      if (!hooks[index] || changed(hooks[index].deps, deps)) hooks[index] = { callback, deps };
      return hooks[index].callback;
    },
    useEffect: (effect, deps) => {
      const index = cursor++;
      if (!hooks[index] || changed(hooks[index].deps, deps)) {
        effects.push(() => {
          hooks[index]?.cleanup?.();
          hooks[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const mocks = {
    'expo-location': location,
    'expo-task-manager': {
      defineTask: (name, callback) => { backgroundTask = callback; },
      isTaskDefined: () => true,
    },
    'expo-router/entry': {},
    'react-native': { AppState: appState, Platform: { OS: 'ios' } },
    react,
    '@/api/client': apiModule,
    '@/services/secure-storage': {
      getItemAsync: async (key) => storageReader(key),
      setItemAsync: async (key, value) => { storage.set(key, value); },
      deleteItemAsync: async (key) => { storage.delete(key); },
    },
    '@/services/tracking-diagnostics': {
      endpointHostname: () => 'isolated-driver.invalid',
      logDriverTrackingDiagnostic: (event, details) => calls.diagnostics.push({ event, details }),
    },
  };
  if (options.nativeStorage) {
    delete mocks['@/services/secure-storage'];
    const keychain = new Map([...storage].map(([key, value]) => [`app:${key}`, { value, accessibility: 0 }]));
    calls.keychain = [];
    mocks['expo-secure-store'] = {
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 4,
      getItemAsync: async (key, settings) => {
        calls.keychain.push({ operation: 'read', key, settings });
        const item = keychain.get(`${settings?.keychainService ?? 'app'}:${key}`);
        if (item && appState.currentState !== 'active' && item.accessibility !== 4) {
          throw new Error('User interaction is not allowed');
        }
        return item?.value ?? null;
      },
      setItemAsync: async (key, value, settings) => {
        calls.keychain.push({ operation: 'write', key, settings });
        const identifier = `${settings?.keychainService ?? 'app'}:${key}`;
        const existing = keychain.get(identifier);
        keychain.set(identifier, { value, accessibility: existing?.accessibility ?? settings?.keychainAccessible ?? 0 });
      },
      deleteItemAsync: async (key, settings) => { keychain.delete(`${settings?.keychainService ?? 'app'}:${key}`); },
    };
  }
  if (!options.realQueue) mocks['@/services/offline-queue'] = mockQueue;
  const cache = new Map();
  function load(moduleName) {
    if (mocks[moduleName]) return mocks[moduleName];
    if (!moduleName.startsWith('@/')) throw new Error(`Unexpected dependency: ${moduleName}`);
    if (cache.has(moduleName)) return cache.get(moduleName).exports;
    const filename = path.join(root, 'src', moduleName.slice(2) + '.ts');
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    cache.set(moduleName, module);
    const evaluate = vm.runInNewContext(`(function(require, module, exports) {${compiled}\n})`, {
      console, Date, URL, setInterval: (callback, ms) => {
        intervals.set(++intervalId, { callback, ms });
        return intervalId;
      },
      clearInterval: (id) => intervals.delete(id),
    }, { filename });
    evaluate(load, module, module.exports);
    return module.exports;
  }
  const service = load('@/services/background-location');
  const onlineState = load('@/services/online-location-state');
  return {
    service, onlineState, storage, state, calls, intervals, ApiError,
    queue: options.realQueue ? load('@/services/offline-queue') : mockQueue,
    setApiHandler: (handler) => { apiHandler = handler; },
    setCurrentPosition: (handler) => { currentPosition = handler; },
    setNativeStart: (handler) => { startHandler = handler; },
    setStorageReader: (handler) => { storageReader = handler; },
    setTokenReader: (handler) => { tokenReader = handler; },
    task: (locations) => backgroundTask({ data: { locations } }),
    render: (...args) => {
      cursor = 0;
      effects = [];
      const result = load('@/hooks/useLocation').useLocationBroadcast(...args);
      for (const effect of effects) effect();
      return result;
    },
    unmount: () => { for (const hook of hooks) hook?.cleanup?.(); },
    appState: async (next) => {
      appState.currentState = next;
      for (const listener of appListeners) listener(next);
      await settle();
    },
  };
}

test('Online without an assignment starts periodic stationary native GPS and uploads real samples', async () => {
  const h = harness();
  assert.equal(await h.service.startBackgroundLocation(), true);
  assert.equal(h.calls.prompts, 0);
  assert.equal(h.calls.starts[0].timeInterval, 20_000);
  assert.equal(h.calls.starts[0].distanceInterval, 0);
  assert.equal(h.calls.starts[0].deferredUpdatesDistance, 0);
  assert.equal(h.calls.starts[0].pausesUpdatesAutomatically, false);
  const first = sample();
  const next = sample(first.timestamp + 20_000);
  await h.task([next, first]);
  assert.equal(h.calls.posts.length, 2);
  assert.equal(h.calls.posts[0].body.timestamp, new Date(first.timestamp).toISOString());
  assert.equal(h.calls.posts[1].body.timestamp, new Date(next.timestamp).toISOString());
  assert.equal(h.calls.posts[0].body.accuracy, 8);
  assert.equal(h.calls.posts[0].body.speed, 0);
  assert.equal('bookingRef' in h.calls.posts[0].body, false);
});

test('missing/disabled Online flag overrides a retained active booking', async () => {
  for (const onlineFlag of [undefined, 'false']) {
    const h = harness({ storage: { active_booking_ref: 'TEST-JOB', ...(onlineFlag ? { online_location_enabled: onlineFlag } : {}) } });
    assert.equal(await h.service.startBackgroundLocation(), false);
    assert.equal(await h.service.armBackgroundLocationForJob('TEST-JOB'), false);
    await h.task([sample()]);
    assert.equal(h.calls.posts.length, 0);
    assert.equal(h.calls.starts.length, 0);
  }
});

test('permission denial never prompts from automatic start or uploads a background fix', async () => {
  const h = harness({ state: { background: false, running: true } });
  assert.equal(await h.service.startBackgroundLocation(), false);
  await h.task([sample()]);
  assert.equal(h.calls.prompts, 0);
  assert.equal(h.state.running, false);
  assert.equal(h.calls.posts.length, 0);
});

test('job completion/rejection clears job context but retains voluntarily Online GPS', async () => {
  const h = harness({ storage: { online_location_enabled: 'true', active_booking_ref: 'TEST-JOB' } });
  await h.service.startBackgroundLocation();
  await h.service.clearActiveBookingTracking();
  assert.equal(h.storage.has('active_booking_ref'), false);
  assert.equal(h.state.running, true);
  await h.task([sample()]);
  assert.equal('bookingRef' in h.calls.posts[0].body, false);
});

test('job arming ignores undated map coordinates and preserves the actual native sample timestamp', async () => {
  const h = harness();
  const fresh = sample(Date.parse('2026-10-21T11:59:12Z'));
  h.setCurrentPosition(async () => fresh);
  assert.equal(await h.service.armBackgroundLocationForJob('TEST-JOB', { lat: 51, lng: 1 }), true);
  await settle();
  assert.equal(h.calls.posts.length, 1);
  assert.equal(h.calls.posts[0].body.lat, fresh.coords.latitude);
  assert.equal(h.calls.posts[0].body.timestamp, new Date(fresh.timestamp).toISOString());
  assert.equal(h.calls.posts[0].body.accuracy, fresh.coords.accuracy);
});

test('stale assignment 403 retries once without a booking and subsequent samples stay unassigned', async () => {
  const h = harness({ storage: { online_location_enabled: 'true', active_booking_ref: 'STALE-JOB' } });
  h.setApiHandler(async (url, { body }) => {
    if (body.bookingRef) throw new h.ApiError('Assignment changed', 403);
    return { accepted: true };
  });
  assert.equal(await h.service.sendDriverLocationSample(sample(), 'STALE-JOB'), true);
  assert.equal(h.calls.posts.length, 2);
  assert.equal(h.calls.posts[0].body.bookingRef, 'STALE-JOB');
  assert.equal('bookingRef' in h.calls.posts[1].body, false);
  await h.service.sendDriverLocationSample(sample(sample().timestamp + 20_000), 'STALE-JOB');
  assert.equal(h.calls.posts.length, 3);
  assert.equal('bookingRef' in h.calls.posts[2].body, false);
  assert.equal(await h.onlineState.isOnlineLocationEnabled(), true);
});

test('transient forbidden/auth failures retain Online native tracking and back off instead of looping', async () => {
  const h = harness({ storage: { online_location_enabled: 'true', active_booking_ref: 'TEST-JOB' }, state: { running: true } });
  h.setApiHandler(async () => { throw new h.ApiError('Forbidden', 403); });
  await h.service.sendDriverLocationSample(sample(), 'TEST-JOB');
  assert.equal(h.calls.posts.length, 2);
  assert.equal(await h.onlineState.isOnlineLocationEnabled(), true);
  assert.equal(h.state.running, true);
  await h.task([sample(sample().timestamp + 20_000)]);
  assert.equal(h.calls.posts.length, 2);
});

test('a transient 401 never erases Online consent or stops the native background task', async () => {
  const h = harness({ state: { running: true } });
  h.setApiHandler(async () => { throw new h.ApiError('Gateway authentication is unavailable', 401); });
  await h.task([sample()]);
  assert.equal(h.calls.posts.length, 1);
  assert.equal(h.state.running, true);
  assert.equal(h.calls.stops, 0);
  assert.equal(h.storage.get('online_location_enabled'), 'true');
  await h.task([sample(sample().timestamp + 20_000)]);
  assert.equal(h.calls.posts.length, 1, 'authentication failures are throttled');
});

test('cold launch with unresolved server status cannot turn an already Online driver Offline', async () => {
  const h = harness({ storage: { online_location_enabled: 'true', active_booking_ref: 'TEST-JOB' }, state: { running: true } });
  h.render(false, false, null, false);
  await settle();
  assert.equal(h.state.running, true);
  assert.equal(h.calls.stops, 0);
  assert.equal(h.storage.get('online_location_enabled'), 'true');
  assert.equal(h.storage.get('active_booking_ref'), 'TEST-JOB');
  await h.task([sample()]);
  assert.equal(h.calls.posts.length, 1);
  h.unmount();
  assert.equal(h.state.running, true);
});

test('switching to WhatsApp and back retains native GPS, then explicit Offline stops it', async () => {
  const h = harness();
  h.render(true, true, 'TEST-JOB', true);
  await settle();
  const starts = h.calls.starts.length;
  await h.appState('inactive');
  await h.appState('background');
  assert.equal(h.state.running, true);
  assert.equal(h.calls.stops, 0);
  assert.equal(h.calls.starts.length, starts);
  await h.task([sample(sample().timestamp + 20_000)]);
  assert.equal(h.calls.posts.at(-1).body.source, 'background');
  await h.appState('active');
  assert.equal(h.state.running, true);
  h.render(false, false, null, true);
  await settle();
  assert.equal(h.state.running, false);
  assert.equal(h.storage.get('online_location_enabled'), 'false');
  h.unmount();
});

test('missing auth never queues GPS for a later login', async () => {
  const h = harness({ state: { token: null, running: true } });
  await h.task([sample()]);
  assert.equal(h.calls.posts.length, 0);
  assert.equal(h.calls.queued.length, 0);
  assert.equal(h.state.running, true);
  assert.equal(await h.onlineState.isOnlineLocationEnabled(), true);
  h.state.token = 'recovered-isolated-token';
  await h.task([sample(sample().timestamp + 20_000)]);
  assert.equal(h.calls.posts.length, 1);
});

test('a locked Keychain on headless launch does not cache Offline or unregister native GPS', async () => {
  const h = harness({ state: { running: true } });
  h.setStorageReader(async () => { throw new Error('User interaction is not allowed'); });
  await h.task([sample()]);
  assert.equal(h.calls.posts.length, 0);
  assert.equal(h.calls.stops, 0);
  assert.equal(h.storage.get('online_location_enabled'), 'true');
  h.setStorageReader(async (key) => h.storage.get(key) ?? null);
  await h.task([sample(sample().timestamp + 20_000)]);
  assert.equal(h.calls.posts.length, 1, 'the next task retries the persisted Online flag');
  assert.equal(h.state.running, true);
});

test('a temporary credential read failure preserves consent and recovers on the next background sample', async () => {
  const h = harness({ state: { running: true } });
  h.setTokenReader(async () => { throw new Error('Keychain temporarily unavailable'); });
  await h.task([sample()]);
  assert.equal(h.calls.posts.length, 0);
  assert.equal(h.calls.queued.length, 0);
  assert.equal(h.calls.stops, 0);
  assert.equal(await h.onlineState.isOnlineLocationEnabled(), true);
  h.setTokenReader(async () => h.state.token);
  await h.task([sample(sample().timestamp + 20_000)]);
  assert.equal(h.calls.posts.length, 1);
});

test('real secure-storage migration plus real Online state continue headless uploads with the iPhone locked', async () => {
  const h = harness({ nativeStorage: true, storage: {
    online_location_enabled: 'true', active_booking_ref: 'TEST-JOB', auth_token: 'isolated-test-token',
  } });
  h.render(true, true, 'TEST-JOB', true);
  await settle();
  assert.equal(h.state.running, true);
  await h.appState('inactive');
  await h.appState('background');
  h.calls.keychain.length = 0;
  await h.task([sample(sample().timestamp + 20_000)]);
  assert.equal(h.calls.posts.at(-1).body.source, 'background');
  assert.equal(h.calls.posts.at(-1).body.bookingRef, 'TEST-JOB');
  assert.equal(h.calls.stops, 0);
  assert.ok(h.calls.keychain.every((call) => call.settings?.keychainService === 'uk.tyrerescue.driver.background.v2'),
    'no legacy Keychain lookup or biometric access happens in background');
  h.unmount();
});

test('duplicate, invalid and inaccurate samples cannot manufacture stationary evidence', async () => {
  const h = harness();
  await h.task([sample(), sample(), sample(0), sample(sample().timestamp + 10_000, {
    coords: { ...sample().coords, accuracy: 101 },
  }), sample(sample().timestamp + 20_000, { coords: { ...sample().coords, accuracy: null } })]);
  assert.equal(h.calls.posts.length, 1);
});

test('native unknown speed becomes null and a 360 degree heading becomes north, including offline replay bodies', async () => {
  const h = harness();
  const unknownMotion = sample(sample().timestamp, {
    coords: { ...sample().coords, speed: -1, heading: 360 },
  });
  await h.service.sendDriverLocationSample(unknownMotion, null, 'foreground');
  assert.equal(h.calls.posts[0].body.speed, null);
  assert.equal(h.calls.posts[0].body.heading, 0);
  h.setApiHandler(async () => { throw new h.ApiError('Network failed', 0, null, 'network'); });
  await h.service.sendDriverLocationSample(sample(sample().timestamp + 20_000, {
    coords: { ...sample().coords, speed: -1, heading: -1 },
  }), null, 'background');
  assert.equal(h.calls.queued.length, 1);
  assert.equal(h.calls.queued[0].body.speed, null);
  assert.equal(h.calls.queued[0].body.heading, null);
  assert.equal(h.calls.queued[0].body.accuracy, 8);
});

test('Offline while a native start is resolving stops it and cannot restart from an active job', async () => {
  const h = harness();
  const gate = deferred();
  h.setNativeStart(() => gate.promise);
  const starting = h.service.startBackgroundLocation();
  await settle();
  const stopping = h.service.setOnlineLocationTracking(false);
  gate.resolve();
  assert.equal(await starting, false);
  await stopping;
  assert.equal(h.state.running, false);
  assert.equal(h.storage.get('online_location_enabled'), 'false');
  assert.equal(await h.service.armBackgroundLocationForJob('TEST-JOB'), false);
});

test('Offline during an HTTP failure prevents its coordinates being queued', async () => {
  const h = harness();
  const gate = deferred();
  h.setApiHandler(() => gate.promise);
  const sending = h.service.sendDriverLocationSample(sample(), null);
  await settle();
  await h.service.setOnlineLocationTracking(false);
  gate.reject(new h.ApiError('Offline', 0, null, 'network'));
  await sending;
  assert.equal(h.calls.queued.length, 0);
});

test('logout invalidates an outstanding Online request even when GPS was already disabled', async () => {
  const h = harness({ storage: { online_location_enabled: 'false' } });
  await h.service.setOnlineLocationTracking(false);
  const pendingRequestRevision = h.onlineState.getOnlineLocationRevision();
  await h.service.setOnlineLocationTracking(false);
  assert.notEqual(h.onlineState.getOnlineLocationRevision(), pendingRequestRevision);
  assert.equal(await h.onlineState.isOnlineLocationEnabled(), false);
});

test('foreground idle polling uses 20s native samples and stops immediately on Offline even with a job', async () => {
  const h = harness({ storage: { online_location_enabled: 'false' } });
  h.render(true, false, null);
  await settle();
  assert.equal(h.calls.posts.length, 1);
  assert.equal([...h.intervals.values()][0].ms, 20_000);
  h.render(false, true, 'TEST-JOB');
  await settle();
  assert.equal(h.intervals.size, 0);
  assert.equal(h.state.running, false);
  const sent = h.calls.posts.length;
  await h.appState('background');
  await h.task([sample(sample().timestamp + 20_000)]);
  assert.equal(h.calls.posts.length, sent);
  h.unmount();
});

test('foreground GPS resolving after Offline is not posted or queued', async () => {
  const h = harness();
  const gate = deferred();
  h.setCurrentPosition(() => gate.promise);
  h.render(true, false, null);
  await settle();
  h.render(false, false, null);
  gate.resolve(sample());
  await settle();
  assert.equal(h.calls.posts.length, 0);
  assert.equal(h.calls.queued.length, 0);
  h.unmount();
});

test('Online without a job retains background GPS when the app leaves foreground', async () => {
  const h = harness();
  h.render(true, false, null);
  await settle();
  await h.appState('background');
  assert.equal(h.intervals.size, 0);
  assert.equal(h.state.running, true);
  await h.task([sample(sample().timestamp + 20_000)]);
  assert.equal(h.calls.posts.at(-1).body.source, 'background');
  h.unmount();
});

test('Offline/logout clears persisted GPS before initialization, preserving non-location retries', async () => {
  const requests = [
    { id: 'gps', path: '/api/driver/location', method: 'POST', body: { lat: 1, lng: 1 }, timestamp: Date.now() },
    { id: 'status', path: '/api/driver/jobs/TEST-JOB/status', method: 'POST', body: { status: 'arrived' }, timestamp: Date.now() },
  ];
  const h = harness({ realQueue: true, storage: {
    online_location_enabled: 'true', offline_request_queue: JSON.stringify(requests),
  } });
  await h.service.setOnlineLocationTracking(false);
  const persisted = JSON.parse(h.storage.get('offline_request_queue'));
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].id, 'status');
});

test('offline queue refuses GPS replay while Offline and preserves other critical actions', async () => {
  const h = harness({ realQueue: true, storage: { online_location_enabled: 'false' } });
  h.queue.enqueue('/api/driver/location', 'POST', { timestamp: new Date().toISOString() });
  h.queue.enqueue('/api/driver/jobs/TEST-JOB/status', 'POST', { status: 'arrived' });
  await h.queue.flushOfflineQueue();
  assert.equal(h.calls.posts.length, 1);
  assert.equal(h.calls.posts[0].url, '/api/driver/jobs/TEST-JOB/status');
});

test('offline queue does not resurrect an in-flight failed GPS retry after logout', async () => {
  const h = harness({ realQueue: true });
  await h.queue.initOfflineQueue();
  h.queue.enqueue('/api/driver/location', 'POST', { timestamp: new Date().toISOString() });
  const gate = deferred();
  h.setApiHandler(() => gate.promise);
  const flushing = h.queue.flushOfflineQueue();
  await settle();
  await h.service.setOnlineLocationTracking(false);
  gate.reject(new h.ApiError('Network failed', 0, null, 'network'));
  await flushing;
  assert.equal(h.queue.getQueueLength(), 0);
  assert.equal(JSON.parse(h.storage.get('offline_request_queue')).length, 0);
});

test('a headless enqueue waits for readable Keychain and preserves older persisted job actions on migration', async () => {
  const saved = [{ id: 'older-job-status', path: '/api/driver/jobs/TEST-JOB/status', method: 'POST',
    body: { status: 'arrived' }, timestamp: Date.now() - 1000 }];
  const h = harness({ realQueue: true, nativeStorage: true, storage: {
    online_location_enabled: 'true', auth_token: 'isolated-test-token', offline_request_queue: JSON.stringify(saved),
  } });
  await h.appState('background');
  h.queue.enqueue('/api/driver/location', 'POST', { timestamp: new Date().toISOString() });
  await settle();
  assert.equal(h.queue.getQueueLength(), 1, 'the new sample stays pending in memory');
  assert.equal(h.calls.keychain.filter((call) => call.operation === 'write').length, 0,
    'unread legacy storage must never be replaced by a partial queue');
  await h.appState('active');
  assert.equal(h.calls.posts.length, 2);
  assert.equal(h.calls.posts[0].url, '/api/driver/jobs/TEST-JOB/status');
  assert.equal(h.calls.posts[1].url, '/api/driver/location');
  assert.equal(h.queue.getQueueLength(), 0);
});

test('an unavailable queue read retries later and Offline still shuts native GPS down immediately', async () => {
  const saved = [
    { id: 'old-gps', path: '/api/driver/location', method: 'POST', body: {}, timestamp: Date.now() },
    { id: 'job-status', path: '/api/driver/jobs/TEST-JOB/status', method: 'POST', body: { status: 'arrived' }, timestamp: Date.now() },
  ];
  const h = harness({ realQueue: true, state: { running: true }, storage: {
    online_location_enabled: 'true', offline_request_queue: JSON.stringify(saved),
  } });
  h.setStorageReader(async (key) => {
    if (key === 'offline_request_queue') throw new Error('Keychain temporarily locked');
    return h.storage.get(key) ?? null;
  });
  await h.service.setOnlineLocationTracking(false);
  assert.equal(h.state.running, false);
  assert.equal(h.calls.posts.length, 0);
  h.setStorageReader(async (key) => h.storage.get(key) ?? null);
  await h.queue.flushOfflineQueue();
  assert.equal(h.calls.posts.length, 1);
  assert.equal(h.calls.posts[0].url, '/api/driver/jobs/TEST-JOB/status');
  assert.equal(h.queue.getQueueLength(), 0);
});
