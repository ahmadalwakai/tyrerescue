const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const BASE = 'https://central.example.invalid';
const TOKEN = 'fixture-central-admin-token';
const SOURCES = [
  { sourceApp: 'source_a', sourceLabel: 'Workspace A', origin: 'https://workspace-a.example.invalid', description: 'First workspace', configured: true },
  { sourceApp: 'source_b', sourceLabel: 'Workspace B', origin: 'https://workspace-b.example.invalid', description: 'Second workspace', configured: true },
];
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle() { for (let i = 0; i < 8; i += 1) await tick(); }
function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(options = {}) {
  const state = {
    session: { status: 'logged-in', user: { id: 'admin-a', name: 'Admin A' } },
    token: TOKEN, baseUrl: BASE, sessionRevision: 1, apiRevision: 1, sourceApp: null, central: true,
    disk: options.disk ?? new Map(), writes: [], cacheWrites: [], requests: [], sourceChanges: [], preparations: [],
    writeGate: null, writeError: false, readError: false, handler: options.handler ?? (async () => ({ items: SOURCES })),
  };
  let rendering;
  const changed = (before, next) => !before || next.some((value, index) => value !== before[index]);
  const react = {
    useState(initial) {
      const host = rendering; const index = host.cursor++;
      if (!host.hooks[index]) host.hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [host.hooks[index].value, (value) => { host.hooks[index].value = typeof value === 'function' ? value(host.hooks[index].value) : value; }];
    },
    useRef(initial) {
      const host = rendering; const index = host.cursor++;
      if (!host.hooks[index]) host.hooks[index] = { current: initial };
      return host.hooks[index];
    },
    useMemo(create, deps) {
      const host = rendering; const index = host.cursor++;
      if (!host.hooks[index] || changed(host.hooks[index].deps, deps)) host.hooks[index] = { value: create(), deps };
      return host.hooks[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const host = rendering; const index = host.cursor++;
      if (!host.hooks[index] || changed(host.hooks[index].deps, deps)) host.effects.push(() => {
        host.hooks[index]?.cleanup?.(); host.hooks[index] = { deps, cleanup: effect() };
      });
    },
    useLayoutEffect(effect, deps) { react.useEffect(effect, deps); },
  };
  const storage = {
    getItem: async (key) => { if (state.readError) throw new Error('Fixture storage read failed'); return state.disk.get(key) ?? null; },
    setItem: async (key, value) => {
      (key.endsWith('.catalog') ? state.cacheWrites : state.writes).push({ key, value }); if (state.writeGate) await state.writeGate;
      if (state.writeError) throw new Error('Fixture storage write failed'); state.disk.set(key, value);
    },
    removeItem: async (key) => { state.disk.delete(key); },
  };
  const api = {
    get hasAdminToken() { return Boolean(state.token); },
    get: async (url, init) => {
      assert.equal(url, '/api/mobile/admin/project-sources', 'workspace discovery uses only the authenticated central registry');
      state.requests.push({ url, init, token: state.token, baseUrl: state.baseUrl }); return state.handler(url, init);
    },
    post: () => { throw new Error('Workspace switching must not authenticate, revoke or write to a remote workspace'); },
  };
  const dependencies = {
    react, '@react-native-async-storage/async-storage': { default: storage },
    '@/hooks/useAdminSession': { useAdminSession: () => state.session, getAdminSessionRevision: () => state.sessionRevision },
    './useAdminSession': { useAdminSession: () => state.session, getAdminSessionRevision: () => state.sessionRevision },
    '@/lib/api': {
      api, getAdminToken: () => state.token, getApiBaseUrl: () => state.baseUrl, getApiContextRevision: () => state.apiRevision,
      isCentralAdminApiBaseUrl: () => state.central,
      getWorkspaceSourceApp: () => state.sourceApp,
      setWorkspaceSourceApp: (sourceApp) => { if (state.sourceApp !== sourceApp) state.apiRevision += 1; state.sourceApp = sourceApp; state.sourceChanges.push(sourceApp); },
    },
    '@/lib/workspace-storage': { prepareWorkspaceStorage: async (...args) => { state.preparations.push(args); } },
  };
  const filename = path.resolve(__dirname, '../src/hooks/useAdminWorkspace.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { URL, AbortController, console }, { filename })((name) => {
    assert.ok(name in dependencies, `Unexpected isolated dependency: ${name}`); return dependencies[name];
  }, module, module.exports);
  function mount() {
    const host = { cursor: 0, hooks: [], effects: [] };
    function read() {
      host.cursor = 0; host.effects = []; rendering = host;
      const value = module.exports.useAdminWorkspace(); for (const effect of host.effects) effect(); return value;
    }
    read(); return { read, unmount: () => { for (const hook of host.hooks) hook?.cleanup?.(); } };
  }
  return { state, mount };
}

test('workspace selection keeps the same central user, bearer and API while broadcasting the selected source', async () => {
  const h = harness(); const first = h.mount(); await settle(); const second = h.mount(); await settle();
  const before = { token: h.state.token, baseUrl: h.state.baseUrl, user: h.state.session.user, sessionRevision: h.state.sessionRevision };
  assert.equal(first.read().items.length, 2);
  assert.equal(await first.read().selectWorkspace('source_a'), true);
  assert.equal(first.read().selectedWorkspace.sourceApp, 'source_a'); assert.equal(second.read().selectedWorkspace.sourceApp, 'source_a');
  assert.equal(h.state.sourceApp, 'source_a'); assert.equal(h.state.token, before.token); assert.equal(h.state.baseUrl, before.baseUrl);
  assert.equal(h.state.session.user, before.user); assert.equal(h.state.sessionRevision, before.sessionRevision);
  assert.ok(h.state.requests.every((request) => request.baseUrl === BASE && request.token === TOKEN));
  assert.equal(await first.read().selectWorkspace(null), true); assert.equal(second.read().selectedWorkspace, null); assert.equal(h.state.sourceApp, null);
});

test('unknown and unconfigured server sources cannot become an active workspace', async () => {
  const h = harness({ handler: async () => ({ items: [...SOURCES, { sourceApp: 'unknown', sourceLabel: 'Unregistered', configured: false }] }) });
  const hook = h.mount(); await settle();
  assert.equal(hook.read().items.length, 2);
  assert.equal(await hook.read().selectWorkspace('unknown'), false); assert.equal(await hook.read().selectWorkspace('invented'), false);
  assert.equal(h.state.sourceApp, null); assert.equal(h.state.writes.length, 0);
});

test('a saved workspace is restored only after validation by the current central registry', async () => {
  const first = harness(); const selected = first.mount(); await settle(); await selected.read().selectWorkspace('source_b');
  const gate = deferred(); const restored = harness({ disk: first.state.disk, handler: () => gate.promise });
  const hook = restored.mount(); await settle();
  assert.equal(restored.state.sourceApp, null); assert.equal(hook.read().selectedWorkspace, null);
  gate.resolve({ items: SOURCES }); await settle();
  assert.equal(hook.read().selectedWorkspace.sourceApp, 'source_b'); assert.equal(restored.state.sourceApp, 'source_b');
  const removed = harness({ disk: first.state.disk, handler: async () => ({ items: [SOURCES[0]] }) });
  const removedHook = removed.mount(); await settle();
  assert.equal(removedHook.read().selectedWorkspace, null); assert.equal(removed.state.sourceApp, null);
});

test('saved workspace preferences are isolated by central account and API', async () => {
  const first = harness(); const hook = first.mount(); await settle(); await hook.read().selectWorkspace('source_a');
  for (const change of [(state) => { state.session.user = { id: 'admin-b', name: 'Admin B' }; }, (state) => { state.baseUrl = 'https://other-central.example.invalid'; }]) {
    const other = harness({ disk: first.state.disk }); change(other.state); const otherHook = other.mount(); await settle();
    assert.equal(otherHook.read().selectedWorkspace, null); assert.equal(other.state.sourceApp, null);
  }
});

test('failed preference persistence preserves the current workspace and session', async () => {
  const h = harness(); const hook = h.mount(); await settle(); await hook.read().selectWorkspace('source_a');
  h.state.writeError = true;
  assert.equal(await hook.read().selectWorkspace('source_b'), false);
  assert.equal(hook.read().selectedWorkspace.sourceApp, 'source_a'); assert.equal(h.state.sourceApp, 'source_a');
  assert.equal(h.state.token, TOKEN); assert.equal(h.state.baseUrl, BASE); assert.ok(hook.read().error);
});

test('an obsolete registry response cannot apply a saved source after logout', async () => {
  const gate = deferred(); const h = harness({ handler: () => gate.promise }); const hook = h.mount(); await settle();
  h.state.token = null; h.state.session = { status: 'logged-out', user: null }; h.state.sessionRevision += 1; hook.read();
  gate.resolve({ items: SOURCES }); await settle();
  assert.equal(h.state.sourceApp, null); assert.equal(hook.read().selectedWorkspace, null); assert.equal(hook.read().items.length, 0);
});

test('workspace selection is single-flight and a late save cannot select into a different account', async () => {
  const h = harness(); const first = h.mount(); await settle(); const second = h.mount(); await settle();
  const gate = deferred(); h.state.writeGate = gate.promise;
  const selecting = first.read().selectWorkspace('source_a'); await settle();
  assert.equal(await second.read().selectWorkspace('source_b'), false); assert.equal(h.state.writes.length, 1);
  h.state.session.user = { id: 'admin-b', name: 'Admin B' }; h.state.sessionRevision += 1; first.read(); second.read();
  gate.resolve(); assert.equal(await selecting, false); await settle();
  assert.equal(h.state.sourceApp, null); assert.equal(first.read().selectedWorkspace, null); assert.equal(second.read().selectedWorkspace, null);
  assert.equal(h.state.disk.has(`assistedChat.workspaceSelection.v1.${encodeURIComponent(BASE)}.admin-a`), false, 'cancelled selection restores the old account preference');
});

test('callbacks retained from a previous account cannot select or refresh the later account scope', async () => {
  const h = harness(); const hook = h.mount(); await settle();
  const old = hook.read();
  h.state.session.user = { id: 'admin-b', name: 'Admin B' }; h.state.token = 'fixture-new-admin-token'; h.state.sessionRevision += 1;
  hook.read(); await settle(); const requests = h.state.requests.length;
  assert.equal(await old.selectWorkspace('source_b'), false); await old.refresh();
  assert.equal(h.state.requests.length, requests); assert.equal(h.state.writes.length, 0); assert.equal(h.state.sourceApp, null);
});

test('forced hide during persistence restores the previous saved choice and active source', async () => {
  const h = harness(); const hook = h.mount(); await settle(); await hook.read().selectWorkspace('source_a');
  const previous = new Map(h.state.disk); const gate = deferred(); h.state.writeGate = gate.promise;
  let visible = true; const selecting = hook.read().selectWorkspace('source_b', () => visible); await settle();
  visible = false; gate.resolve(); assert.equal(await selecting, false);
  assert.equal(h.state.sourceApp, 'source_a'); assert.equal(hook.read().selectedWorkspace.sourceApp, 'source_a');
  assert.deepEqual(h.state.disk, previous);
});

test('a new session for the same user waits for an obsolete selection rollback before restoring the saved source', async () => {
  const h = harness(); const hook = h.mount(); await settle(); await hook.read().selectWorkspace('source_a');
  const previous = new Map(h.state.disk); const gate = deferred(); h.state.writeGate = gate.promise;
  const selecting = hook.read().selectWorkspace('source_b'); await settle();
  h.state.token = 'fixture-renewed-same-user-token'; h.state.sessionRevision += 1; hook.read(); await settle();
  assert.equal(hook.read().hydrated, false, 'restoration must wait for the prior native write and rollback');
  assert.equal(h.state.sourceApp, null);
  gate.resolve(); assert.equal(await selecting, false); await settle();
  assert.equal(hook.read().hydrated, true); assert.equal(hook.read().selectedWorkspace.sourceApp, 'source_a');
  assert.equal(h.state.sourceApp, 'source_a'); assert.deepEqual(h.state.disk, previous);
});

test('initial registry outages allow an uncategorized offline session while unreadable saved preferences stay blocked', async () => {
  for (const failure of ['registry', 'storage', 'malformed']) {
    const h = harness({ handler: async () => {
      if (failure === 'registry') throw new Error('PRIVATE_PROVIDER_FAILURE');
      return failure === 'malformed' ? { items: [{ ...SOURCES[0], sourceApp: '../bad' }] } : { items: SOURCES };
    } });
    h.state.readError = failure === 'storage'; const hook = h.mount(); await settle();
    assert.equal(hook.read().hydrated, failure !== 'storage'); assert.ok(hook.read().error);
    assert.doesNotMatch(hook.read().error, /PRIVATE_PROVIDER_FAILURE/); assert.equal(h.state.sourceApp, null);
    h.state.readError = false; h.state.handler = async () => ({ items: SOURCES }); await hook.read().refresh();
    assert.equal(hook.read().hydrated, true); assert.equal(hook.read().items.length, 2);
  }
});

test('offline startup restores the last centrally validated selected source without another sign-in', async () => {
  const original = harness(); const originalHook = original.mount(); await settle(); await originalHook.read().selectWorkspace('source_b');
  const offline = harness({ disk: original.state.disk, handler: async () => { throw new Error('Fixture offline'); } });
  const hook = offline.mount(); await settle();
  assert.equal(hook.read().hydrated, true); assert.equal(hook.read().selectedWorkspace.sourceApp, 'source_b');
  assert.equal(offline.state.sourceApp, 'source_b'); assert.equal(offline.state.token, TOKEN); assert.ok(hook.read().error);
  assert.ok(offline.state.requests.every((request) => request.url === '/api/mobile/admin/project-sources' && request.baseUrl === BASE));
});

test('offline startup cannot expand an unverified persisted source to All workspaces', async () => {
  for (const cached of [null, { items: [{ ...SOURCES[0], configured: true }] }]) {
    const key = `assistedChat.workspaceSelection.v1.${encodeURIComponent(BASE)}.admin-a`;
    const disk = new Map([[key, JSON.stringify({ sourceApp: 'source_b' })]]);
    if (cached) disk.set(`${key}.catalog`, JSON.stringify(cached));
    const h = harness({ disk, handler: async () => { throw new Error('Fixture offline'); } }); const hook = h.mount(); await settle();
    assert.equal(hook.read().hydrated, false); assert.equal(hook.read().selectedWorkspace, null); assert.equal(h.state.sourceApp, null);
    assert.ok(hook.read().error); assert.equal(h.state.token, TOKEN);
  }
});

test('refresh failure preserves a validated source and foreign API contexts never request the registry', async () => {
  const h = harness(); const hook = h.mount(); await settle(); await hook.read().selectWorkspace('source_a');
  h.state.handler = async () => { throw new Error('Fixture offline'); }; await hook.read().refresh();
  assert.equal(hook.read().hydrated, true); assert.equal(hook.read().selectedWorkspace.sourceApp, 'source_a');
  const foreign = harness(); foreign.state.central = false; foreign.state.baseUrl = SOURCES[0].origin;
  const foreignHook = foreign.mount(); await settle();
  assert.equal(foreign.state.requests.length, 0); assert.equal(foreignHook.read().hydrated, false);
  assert.equal(await foreignHook.read().selectWorkspace('source_a'), false);
});
