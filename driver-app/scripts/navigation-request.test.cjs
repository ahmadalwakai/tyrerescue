const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

// Run the production transport and protected-directions modules with native
// storage and the network isolated. No copied request implementation is tested.
const sourceRoot = path.resolve(__dirname, '..', 'src');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const origin = { lat: 55, lng: -4 };
const destination = { lat: 55, lng: -3.998 };
const fixture = () => ({
  bookingRef: 'TEST-ROUTE', source: 'mapbox', customerLocation: destination,
  navigation: { version: 1, routes: [{
    geometry: [[-4, 55], [-3.999, 55], [-3.998, 55]], distanceMeters: 130, durationSeconds: 40,
    steps: [{ instruction: 'Head east', location: [-4, 55] }],
  }] },
});

function abortableRequest(_url, request) {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(new Error('Synthetic network request aborted'));
    if (request.signal.aborted) abort();
    else request.signal.addEventListener('abort', abort, { once: true });
  });
}

function harness() {
  const calls = [];
  const timers = new Map();
  let timerId = 0;
  let fetchHandler = abortableRequest;
  const cache = new Map();
  const mocks = {
    'react-native': { Platform: { OS: 'ios' } },
    '@/services/secure-storage': {
      getItemAsync: async (key) => key === 'auth_token' ? 'isolated-test-token' : null,
      setItemAsync: async () => {}, deleteItemAsync: async () => {},
    },
  };
  function load(name, from = sourceRoot) {
    if (mocks[name]) return mocks[name];
    const base = name.startsWith('@/') ? path.join(sourceRoot, name.slice(2)) : path.resolve(from, name);
    const filename = base.endsWith('.ts') ? base : `${base}.ts`;
    if (!filename.startsWith(sourceRoot + path.sep) || !fs.existsSync(filename)) {
      throw new Error(`Unexpected isolated dependency: ${name}`);
    }
    if (cache.has(filename)) return cache.get(filename).exports;
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    cache.set(filename, module);
    const evaluate = vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
      process: { env: {} }, __DEV__: false, URL, URLSearchParams, Date, Response, AbortController,
      setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
      clearTimeout: (id) => timers.delete(id),
      fetch: (url, request) => { calls.push({ url, request }); return fetchHandler(url, request); },
    }, { filename });
    evaluate((dependency) => load(dependency, path.dirname(filename)), module, module.exports);
    return module.exports;
  }
  return {
    api: load('@/api/client').api,
    protectedDirections: load('@/services/protected-directions').fetchProtectedJobDirections,
    calls, timers,
    setFetch: (handler) => { fetchHandler = handler; },
    expireTimeouts: () => { for (const { callback } of [...timers.values()]) callback(); },
  };
}

test('API forwards caller cancellation to the real fetch signal and releases its timeout', async () => {
  const h = harness();
  const controller = new AbortController();
  const pending = h.api('/isolated-route', { signal: controller.signal });
  const rejected = assert.rejects(pending, (error) => error.code === 'network');
  await tick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].request.signal.aborted, false);
  assert.equal(h.timers.size, 1);
  controller.abort();
  assert.equal(h.calls[0].request.signal.aborted, true);
  await rejected;
  assert.equal(h.timers.size, 0);
});

test('an already canceled API request reaches fetch with an already canceled signal', async () => {
  const h = harness();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(h.api('/isolated-route', { signal: controller.signal }), (error) => error.code === 'network');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].request.signal.aborted, true);
  assert.equal(h.timers.size, 0);
});

test('request timeout aborts only its own fetch, and the next request remains usable', async () => {
  const h = harness();
  const controller = new AbortController();
  const pending = h.api('/isolated-timeout', { signal: controller.signal });
  const rejected = assert.rejects(pending, (error) => error.code === 'network');
  await tick();
  assert.deepEqual([...h.timers.values()].map((timer) => timer.delay), [15_000]);
  h.expireTimeouts();
  await rejected;
  assert.equal(h.calls[0].request.signal.aborted, true);
  assert.equal(controller.signal.aborted, false);
  assert.equal(h.timers.size, 0);
  h.setFetch(async () => Response.json({ available: true }));
  assert.equal((await h.api('/isolated-next', { signal: controller.signal })).available, true);
  assert.equal(h.calls[1].request.signal.aborted, false);
  assert.equal(h.timers.size, 0);
});

test('finishing a request detaches its caller listener without canceling another request', async () => {
  const h = harness();
  const controller = new AbortController();
  h.setFetch(async () => Response.json({ available: true }));
  await h.api('/isolated-complete', { signal: controller.signal });
  const completedSignal = h.calls[0].request.signal;
  h.setFetch(abortableRequest);
  const nextController = new AbortController();
  const pending = h.api('/isolated-pending', { signal: nextController.signal });
  const rejected = assert.rejects(pending, (error) => error.code === 'network');
  await tick();
  controller.abort();
  assert.equal(completedSignal.aborted, false);
  assert.equal(h.calls[1].request.signal.aborted, false);
  nextController.abort();
  await rejected;
  assert.equal(h.timers.size, 0);
});

test('caller cancellation remains attached while the response body is pending', async () => {
  const h = harness();
  const controller = new AbortController();
  let parsingBody = false;
  h.setFetch(async (_url, request) => ({
    status: 200, ok: true,
    json: () => { parsingBody = true; return abortableRequest(_url, request); },
  }));
  const pending = h.api('/isolated-pending-body', { signal: controller.signal });
  const rejected = assert.rejects(pending);
  await tick();
  assert.equal(parsingBody, true);
  assert.equal(h.timers.size, 1);
  controller.abort();
  assert.equal(h.calls[0].request.signal.aborted, true);
  await rejected;
  assert.equal(h.timers.size, 0);
});

test('request timeout includes response-body parsing without aborting its caller', async () => {
  const h = harness();
  const controller = new AbortController();
  let parsingBody = false;
  h.setFetch(async (_url, request) => ({
    status: 200, ok: true,
    json: () => { parsingBody = true; return abortableRequest(_url, request); },
  }));
  const pending = h.api('/isolated-body-timeout', { signal: controller.signal });
  const rejected = assert.rejects(pending);
  await tick();
  assert.equal(parsingBody, true);
  assert.equal(h.timers.size, 1);
  h.expireTimeouts();
  await rejected;
  assert.equal(h.calls[0].request.signal.aborted, true);
  assert.equal(controller.signal.aborted, false);
  assert.equal(h.timers.size, 0);
});

test('protected directions short circuits a canceled request before touching the transport', async () => {
  const h = harness();
  const controller = new AbortController();
  controller.abort();
  const result = await h.protectedDirections('TEST-ROUTE', origin, destination, controller.signal);
  assert.equal(result.error.kind, 'aborted');
  assert.equal(h.calls.length, 0);
  assert.equal(h.timers.size, 0);
});

test('protected directions forwards cancellation through the actual API transport', async () => {
  const h = harness();
  const controller = new AbortController();
  const pending = h.protectedDirections('TEST-ROUTE', origin, destination, controller.signal);
  await tick();
  assert.equal(h.calls.length, 1);
  const requestUrl = new URL(h.calls[0].url);
  assert.equal(requestUrl.searchParams.get('lat'), '55.000000');
  assert.equal(requestUrl.searchParams.get('lng'), '-4.000000');
  controller.abort();
  const result = await pending;
  assert.equal(h.calls[0].request.signal.aborted, true);
  assert.equal(result.error.kind, 'aborted');
  assert.equal(h.timers.size, 0);
});

test('protected directions returns aborted when cancellation interrupts its response body', async () => {
  const h = harness();
  const controller = new AbortController();
  h.setFetch(async (_url, request) => ({
    status: 200, ok: true, json: () => abortableRequest(_url, request),
  }));
  const pending = h.protectedDirections('TEST-ROUTE', origin, destination, controller.signal);
  await tick();
  controller.abort();
  assert.equal((await pending).error.kind, 'aborted');
  assert.equal(h.calls[0].request.signal.aborted, true);
  assert.equal(h.timers.size, 0);
});

test('protected directions uses the real response validator after an earlier cancellation', async () => {
  const h = harness();
  const controller = new AbortController();
  const pending = h.protectedDirections('TEST-ROUTE', origin, destination, controller.signal);
  await tick();
  controller.abort();
  assert.equal((await pending).error.kind, 'aborted');
  h.setFetch(async () => Response.json(fixture()));
  const result = await h.protectedDirections('TEST-ROUTE', origin, destination, undefined, {
    language: 'ar', avoid: { tolls: true },
  });
  assert.equal(result.routes.length, 1);
  assert.equal(result.routes[0].steps[0].instruction, 'Head east');
  const url = new URL(h.calls[1].url);
  assert.equal(url.searchParams.get('language'), 'ar');
  assert.equal(url.searchParams.get('tolls'), 'avoid');
  assert.equal(h.calls[1].request.signal.aborted, false);
  assert.equal(h.timers.size, 0);
});
