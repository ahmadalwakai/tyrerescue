const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// The shared loadSource compiles as TSX, which misreads `<T>(` generics in a
// plain .ts module, so this file compiles api.ts as TypeScript.
function loadTs(relative, dependencies, globals) {
  const filename = path.join(__dirname, '..', 'src', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, globals, { filename })((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

function loadApi(fetchImpl) {
  return loadTs('lib/api.ts', {
    'expo-constants': { default: { expoConfig: null } },
    'react-native': { Platform: { OS: 'ios' } },
    './startup-logging': {
      logStartupModuleStarted() {},
      logStartupModuleCompleted() {},
      logStartupModuleFailed() {},
    },
  }, {
    __DEV__: false,
    process: { env: { NODE_ENV: 'production' } },
    fetch: fetchImpl,
    AbortController,
    setTimeout,
    clearTimeout,
    URL,
    console,
  });
}

/** A fetch that never settles until its signal aborts, like a stalled network. */
function hangingFetch(calls) {
  return (url, init) => new Promise((_, reject) => {
    calls.push(url);
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
}

test('a stalled request fails with a timeout error instead of hanging', async () => {
  const calls = [];
  const api = loadApi(hangingFetch(calls));
  await assert.rejects(api.api.get('/api/x', { timeoutMs: 30 }), (error) => {
    assert.equal(error.name, 'ApiError');
    assert.equal(error.status, 0);
    assert.equal(error.message, api.REQUEST_TIMEOUT_ERROR);
    return true;
  });
  assert.equal(calls.length, 1);
});

test("a caller's own abort keeps its original error, not a timeout", async () => {
  const api = loadApi(hangingFetch([]));
  const controller = new AbortController();
  const pending = api.api.get('/api/x', { signal: controller.signal, timeoutMs: 5_000 });
  controller.abort();
  await assert.rejects(pending, (error) => {
    assert.notEqual(error.message, api.REQUEST_TIMEOUT_ERROR);
    return true;
  });
});

test('a fast response is returned normally and its timer is cleared', async () => {
  const api = loadApi(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ ok: 1 }),
  }));
  assert.deepEqual(await api.api.get('/api/x', { timeoutMs: 50 }), { ok: 1 });
});

test('createRequestSignal forwards an already-aborted caller signal', () => {
  const api = loadApi(async () => { throw new Error('unused'); });
  const controller = new AbortController();
  controller.abort();
  const deadline = api.createRequestSignal(controller.signal, 1_000);
  assert.equal(deadline.signal.aborted, true);
  assert.equal(deadline.timedOut(), false);
  deadline.dispose();
});
