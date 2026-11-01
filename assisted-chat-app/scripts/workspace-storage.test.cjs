const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const A = 'https://workspace-a.invalid';
const B = 'https://workspace-b.invalid';
const KEYS = ['assistedChat.draft.v6', 'assistedChat.todayBookings.v1', 'assistedChat.recentCustomers.v3'];

function harness() {
  const disk = new Map();
  const state = { backend: A, source: null, failWrite: false, failRemove: false };
  const storage = {
    getItem: async (key) => disk.get(key) ?? null,
    setItem: async (key, value) => { if (state.failWrite) throw new Error('Storage unavailable'); disk.set(key, value); },
    removeItem: async (key) => { if (state.failRemove) throw new Error('Cleanup unavailable'); disk.delete(key); },
  };
  const filename = path.resolve(__dirname, '../src/lib/workspace-storage.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {}, { filename })((name) => {
    if (name === '@react-native-async-storage/async-storage') return storage;
    if (name === './api') return { getApiBaseUrl: () => state.backend, getWorkspaceSourceApp: () => state.source };
    throw new Error(`Unexpected dependency: ${name}`);
  }, module, module.exports);
  return { ...module.exports, state, disk };
}

test('legacy draft, booking history and customers migrate only to the source workspace', async () => {
  const h = harness();
  for (const key of KEYS) h.disk.set(key, `source data: ${key}`);
  const a = h.createWorkspaceStorage();
  for (const key of KEYS) assert.equal(await a.getItem(key), `source data: ${key}`);
  h.state.backend = B;
  const b = h.createWorkspaceStorage();
  for (const key of KEYS) {
    assert.equal(await b.getItem(key), null);
    await b.setItem(key, `target data: ${key}`);
    assert.equal(await a.getItem(key), `source data: ${key}`);
    assert.equal(await b.getItem(key), `target data: ${key}`);
  }
});

test('switch preparation binds legacy data before target opens, even without source hydration', async () => {
  const h = harness();
  h.disk.set(KEYS[0], 'existing booking with payment link');
  await h.prepareWorkspaceStorage(A);
  h.state.backend = B;
  assert.equal(await h.createWorkspaceStorage().getItem(KEYS[0]), null);
  assert.equal(await h.createWorkspaceStorage(A).getItem(KEYS[0]), 'existing booking with payment link');
});

test('delayed source write after switching stays in its original workspace', async () => {
  const h = harness();
  const source = h.createWorkspaceStorage();
  await h.prepareWorkspaceStorage(A);
  h.state.backend = B;
  const target = h.createWorkspaceStorage();
  await Promise.all([source.setItem(KEYS[0], 'late source edit'), target.setItem(KEYS[0], 'target edit')]);
  assert.equal(await h.createWorkspaceStorage(A).getItem(KEYS[0]), 'late source edit');
  assert.equal(await target.getItem(KEYS[0]), 'target edit');
});

test('clearing one workspace cannot clear another or restore a legacy copy', async () => {
  const h = harness();
  h.disk.set(KEYS[0], 'legacy draft');
  await h.prepareWorkspaceStorage(A);
  const a = h.createWorkspaceStorage(A);
  const b = h.createWorkspaceStorage(B);
  await b.setItem(KEYS[0], 'target draft');
  h.state.failRemove = true;
  assert.equal(await a.getItem(KEYS[0]), 'legacy draft');
  h.state.failRemove = false;
  await a.removeItem(KEYS[0]);
  assert.equal(await a.getItem(KEYS[0]), null);
  assert.equal(await b.getItem(KEYS[0]), 'target draft');
});

test('failed migration write preserves the original data for a successful retry', async () => {
  const h = harness();
  h.disk.set(KEYS[0], 'retained booking draft');
  await h.prepareWorkspaceStorage(A);
  h.state.failWrite = true;
  await assert.rejects(h.createWorkspaceStorage(A).getItem(KEYS[0]), /Storage unavailable/);
  assert.equal(h.disk.get(KEYS[0]), 'retained booking draft');
  h.state.failWrite = false;
  assert.equal(await h.createWorkspaceStorage(A).getItem(KEYS[0]), 'retained booking draft');
});

test('reopening a workspace retains its local data and normalizes a trailing slash', async () => {
  const h = harness();
  await h.createWorkspaceStorage(A).setItem(KEYS[0], 'saved source');
  await h.createWorkspaceStorage(B).setItem(KEYS[0], 'saved target');
  assert.equal(await h.createWorkspaceStorage(`${A}/`).getItem(KEYS[0]), 'saved source');
  assert.equal(await h.createWorkspaceStorage(B).getItem(KEYS[0]), 'saved target');
});

test('sources on the same central backend never mix drafts, history or customers', async () => {
  const h = harness();
  for (const key of KEYS) h.disk.set(key, 'old all-workspaces data');
  const all = h.createWorkspaceStorage();
  h.state.source = 'duke_street_tyres';
  const duke = h.createWorkspaceStorage();
  h.state.source = '247_mo_glasgow';
  const glasgow = h.createWorkspaceStorage();
  for (const key of KEYS) {
    assert.equal(await duke.getItem(key), null);
    assert.equal(await glasgow.getItem(key), null);
    await duke.setItem(key, 'Duke data');
    await glasgow.setItem(key, 'Glasgow data');
    assert.equal(await all.getItem(key), 'old all-workspaces data');
    assert.equal(await duke.getItem(key), 'Duke data');
    assert.equal(await glasgow.getItem(key), 'Glasgow data');
    await duke.removeItem(key);
    assert.equal(await all.getItem(key), 'old all-workspaces data');
    assert.equal(await glasgow.getItem(key), 'Glasgow data');
  }
});

test('a delayed write uses its captured source even though the central API never changes', async () => {
  const h = harness();
  h.state.source = 'fitmytyre';
  const earlier = h.createWorkspaceStorage();
  h.state.source = 'tyrerepair_uk';
  const later = h.createWorkspaceStorage();
  await earlier.setItem(KEYS[0], 'earlier source draft');
  await later.setItem(KEYS[0], 'later source draft');
  assert.equal(await earlier.getItem(KEYS[0]), 'earlier source draft');
  assert.equal(await later.getItem(KEYS[0]), 'later source draft');
  assert.equal(h.state.backend, A);
});
