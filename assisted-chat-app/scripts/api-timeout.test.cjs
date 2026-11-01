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

function loadApi(fetchImpl, options = {}) {
  return loadTs('lib/api.ts', {
    'expo-constants': { default: { expoConfig: null } },
    'react-native': { Platform: { OS: 'ios' } },
    './startup-logging': {
      logStartupModuleStarted() {},
      logStartupModuleCompleted() {},
      logStartupModuleFailed() {},
    },
  }, {
    __DEV__: options.dev ?? false,
    process: { env: { NODE_ENV: 'production', ...options.env } },
    fetch: fetchImpl,
    AbortController,
    setTimeout,
    clearTimeout,
    URL,
    console: { log() {}, warn() {}, error() {} },
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

test('workspace selection changes the request source while retaining the application API and administrator token', async () => {
  const calls = [];
  const api = loadApi(async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true }) };
  }, { env: { EXPO_PUBLIC_API_BASE_URL: 'https://www.tyrerescue.uk' } });
  assert.equal(api.getApiBaseUrl(), 'https://www.tyrerescue.uk');
  api.setAdminToken('fixture-central-token');
  const revision = api.getApiContextRevision();
  api.setWorkspaceSourceApp('fixture_workspace');
  assert.equal(api.getApiBaseUrl(), 'https://www.tyrerescue.uk');
  assert.equal(api.getAdminToken(), 'fixture-central-token');
  assert.equal(api.getWorkspaceSourceApp(), 'fixture_workspace');
  assert.ok(api.getApiContextRevision() > revision);
  await api.api.get('/api/isolated');
  assert.equal(calls[0].url, 'https://www.tyrerescue.uk/api/isolated');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer fixture-central-token');
  assert.equal(calls[0].init.headers['x-workspace-source-app'], 'fixture_workspace');
  api.setWorkspaceSourceApp(null); await api.api.get('/api/isolated');
  assert.equal(calls[1].init.headers['x-workspace-source-app'], undefined);
  assert.equal(api.getAdminToken(), 'fixture-central-token');
});

test('development builds retain their explicit local API override', () => {
  const api = loadApi(async () => { throw new Error('No network allowed'); }, {
    dev: true, env: { NODE_ENV: 'development', EXPO_PUBLIC_API_BASE_URL: 'http://127.0.0.1:8999' },
  });
  const revision = api.getApiContextRevision(); api.setApiBaseUrl('https://target.example.invalid');
  assert.equal(api.getApiBaseUrl(), 'http://127.0.0.1:8999'); assert.equal(api.getApiContextRevision(), revision);
});

test('workspace request scope cannot survive a token change or attach to a foreign backend', () => {
  const api = loadApi(async () => { throw new Error('No network allowed'); });
  api.setAdminToken('fixture-account-a'); api.setWorkspaceSourceApp('source_a');
  assert.equal(api.getWorkspaceSourceApp(), 'source_a');
  api.setAdminToken('fixture-account-b'); assert.equal(api.getWorkspaceSourceApp(), null);
  api.setWorkspaceSourceApp('source_b'); api.setApiBaseUrl('https://foreign.example.invalid');
  assert.equal(api.getWorkspaceSourceApp(), null);
  api.setWorkspaceSourceApp('source_a'); assert.equal(api.getWorkspaceSourceApp(), null);
  assert.throws(() => api.setWorkspaceSourceApp('../invalid'), /Invalid workspace/);
});
