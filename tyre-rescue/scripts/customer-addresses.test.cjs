/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/customer-addresses.ts');
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const idA = '11111111-1111-4111-8111-111111111111';
const idB = '22222222-2222-4222-8222-222222222222';
const input = () => ({ label: 'Home', addressLine: '12 Example Road, Glasgow', lat: 55.86, lng: -4.25 });
const row = (id = idA, fields = {}) => ({ id, ...input(), createdAt: '2026-11-01T12:00:00.000Z', updatedAt: '2026-11-01T12:00:00.000Z', ...fields });
const plain = value => JSON.parse(JSON.stringify(value));
const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

function harness({ guest = false, initial = [] } = {}) {
  const state = {
    account: guest ? { profile: null, token: null, sessionRevision: 0, loading: false }
      : { profile: { id: 'owner-a' }, token: 'session-a', sessionRevision: 0, loading: false },
    calls: [], writes: 0, handler: null, stored: new Map(initial.map(item => [item.id, item])),
  };
  const hooks = []; let cursor = 0; let effects = []; let dirty = false;
  const changed = (previous, next) => !previous || next.some((value, i) => !Object.is(value, previous[i]));
  const react = {
    useState(initialValue) {
      const index = cursor++;
      if (!hooks[index]) {
        hooks[index] = { value: typeof initialValue === 'function' ? initialValue() : initialValue };
        hooks[index].set = value => { state.writes++; const next = typeof value === 'function' ? value(hooks[index].value) : value; if (!Object.is(next, hooks[index].value)) { hooks[index].value = next; dirty = true; } };
      }
      return [hooks[index].value, hooks[index].set];
    },
    useRef(initialValue) { return hooks[cursor++] ??= { current: initialValue }; },
    useCallback(callback, dependencies) {
      const index = cursor++;
      if (!hooks[index] || changed(hooks[index].dependencies, dependencies)) hooks[index] = { value: callback, dependencies };
      return hooks[index].value;
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      if (!hooks[index] || changed(hooks[index].dependencies, dependencies)) effects.push(() => {
        hooks[index]?.cleanup?.(); hooks[index] = { dependencies, cleanup: effect() };
      });
    },
  };
  async function defaultResponse(call) {
    if (call.method === 'GET') return { addresses: [...state.stored.values()] };
    const id = call.body?.id || call.url.split('/').at(-1);
    if (call.method === 'DELETE') { state.stored.delete(id); return { success: true }; }
    const address = row(id, call.body); state.stored.set(id, address); return { address };
  }
  const dependencies = {
    react, './customer-account': { useCustomerAccount: () => state.account },
    './api': { requestJson: async (url, init) => {
      const call = { url, method: init.method || 'GET', headers: init.headers, signal: init.signal, body: init.body ? JSON.parse(init.body) : null };
      state.calls.push(call); return state.handler ? state.handler(call, defaultResponse) : defaultResponse(call);
    } },
  };
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, { AbortController, Date, Error }, { filename })(
    name => { if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`); return dependencies[name]; }, module, module.exports,
  );
  function read(commit = true) {
    for (let pass = 0; pass < 8; pass++) {
      cursor = 0; effects = []; dirty = false;
      const value = module.exports.useCustomerAddresses();
      if (!commit) return value;
      effects.forEach(effect => effect());
      if (!dirty) return value;
    }
    throw new Error('Hook did not settle');
  }
  return { state, api: module.exports, read, unmount: () => hooks.forEach(hook => hook.cleanup?.()) };
}

test('address validation checks complete names, address and finite coordinate bounds', () => {
  const { api } = harness();
  assert.equal(api.validateCustomerAddress(input()), null);
  assert.equal(api.validateCustomerAddress({ ...input(), lat: -90, lng: 180 }), null);
  for (const invalid of [null, {}, { ...input(), label: '' }, { ...input(), label: 'x'.repeat(41) },
    { ...input(), addressLine: 'tiny' }, { ...input(), addressLine: 'x'.repeat(501) },
    { ...input(), lat: NaN }, { ...input(), lat: 91 }, { ...input(), lng: Infinity }, { ...input(), lng: -181 }]) {
    assert.equal(typeof api.validateCustomerAddress(invalid), 'string');
  }
});

test('new address IDs are independent UUIDs for retry deduplication', () => {
  const { api } = harness(); const values = Array.from({ length: 100 }, () => api.newCustomerAddressId());
  assert.equal(new Set(values).size, values.length);
  assert.ok(values.every(value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)));
});

test('guests and loading accounts do not request addresses or mutate them', async () => {
  const h = harness({ guest: true }); let value = h.read(); await value.refresh();
  assert.equal(h.state.calls.length, 0); assert.equal(value.addresses.length, 0);
  await assert.rejects(value.create(idA, input()), { name: 'AbortError' });
  h.state.account = { profile: { id: 'owner-a' }, token: 'session-a', sessionRevision: 0, loading: true };
  value = h.read(); await value.refresh(); assert.equal(value.loading, true); assert.equal(h.state.calls.length, 0);
});

test('authenticated list loads with the bearer and refresh function remains stable within the session', async () => {
  const h = harness({ initial: [row()] }); const initial = h.read(); await settle(); const loaded = h.read();
  assert.equal(initial.refresh, loaded.refresh); assert.deepEqual(plain(loaded.addresses), [row()]);
  assert.equal(loaded.loading, false); assert.equal(loaded.error, null);
  assert.deepEqual(plain(h.state.calls[0].headers), { Authorization: 'Bearer session-a' });
  assert.equal(h.state.calls[0].body, null);
});

test('create and update trim text, use separate methods and remove only the acknowledged row', async () => {
  const h = harness(); h.read(); await settle();
  const created = await h.read().create(idA, { ...input(), label: ' Home ', addressLine: ' 12 Example Road, Glasgow ' }); await settle();
  assert.equal(created.label, 'Home'); assert.equal(created.addressLine, input().addressLine);
  await h.read().create(idB, { ...input(), label: 'Work' }); await settle();
  await h.read().update(idA, { ...input(), label: 'New home' }); await settle();
  const post = h.state.calls.find(call => call.method === 'POST');
  assert.deepEqual(post.body, { id: idA, ...input() });
  const put = h.state.calls.find(call => call.method === 'PUT'); assert.equal(put.body.id, undefined);
  assert.equal(put.url, `/api/mobile/customer/addresses/${idA}`);
  await h.read().remove(idA); await settle(); assert.deepEqual(h.read().addresses.map(item => item.id).join(), idB);
});

test('failed create keeps the retry ID controlled by the caller and does not retry itself', async () => {
  const h = harness(); h.read(); await settle(); let fail = true;
  h.state.handler = (call, next) => { if (call.method === 'POST' && fail) throw new Error('Connection unavailable'); return next(call); };
  await assert.rejects(h.read().create(idA, input()), /Connection unavailable/);
  assert.equal(h.state.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(h.read().addresses.length, 0); assert.match(h.read().error, /Connection unavailable/); assert.equal(h.read().busy, false);
  fail = false; await h.read().create(idA, input()); await settle();
  assert.deepEqual(h.state.calls.filter(call => call.method === 'POST').map(call => call.body.id), [idA, idA]);
  assert.equal(h.read().addresses.length, 1);
});

test('rapid mutation taps are rejected synchronously and cannot create a second write', async () => {
  const h = harness(); h.read(); await settle(); const pending = deferred();
  h.state.handler = call => call.method === 'POST' ? pending.promise : { addresses: [row()] };
  const value = h.read(); const first = value.create(idA, input());
  await assert.rejects(value.create(idB, input()), /Please wait/);
  assert.equal(h.state.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(h.read().busy, true); await h.read().refresh(); assert.equal(h.state.calls.length, 2);
  pending.resolve({ address: row() }); await first; await settle(); assert.equal(h.read().busy, false);
});

test('a list response started before a mutation cannot overwrite the saved change', async () => {
  const h = harness(); const oldList = deferred(); let gets = 0;
  h.state.handler = (call, next) => call.method === 'GET' && ++gets === 1 ? oldList.promise : next(call);
  h.read(); const firstGet = h.state.calls[0]; await h.read().create(idA, input()); await settle();
  assert.equal(firstGet.signal.aborted, true); oldList.resolve({ addresses: [] }); await settle();
  assert.equal(h.read().addresses[0].id, idA);
});

test('switching accounts hides old data during render before effects run and rejects old handlers', async () => {
  const h = harness({ initial: [row()] }); h.read(); await settle(); const old = h.read();
  h.state.account = { profile: { id: 'owner-b' }, token: 'session-b', sessionRevision: 1, loading: false };
  h.state.stored.clear();
  assert.equal(h.read(false).addresses.length, 0);
  await assert.rejects(old.update(idA, input()), { name: 'AbortError' });
  h.read(); await settle(); assert.equal(h.read().addresses.length, 0);
  assert.equal(h.state.calls.at(-1).headers.Authorization, 'Bearer session-b');
});

test('logout aborts pending mutation and its late response cannot report success or write state', async () => {
  const h = harness(); h.read(); await settle(); const pending = deferred();
  h.state.handler = call => call.method === 'POST' ? pending.promise : { addresses: [] };
  const save = h.read().create(idA, input()); const rejected = assert.rejects(save, { name: 'AbortError' });
  const call = h.state.calls.at(-1);
  h.state.account = { token: null, profile: null, sessionRevision: 1, loading: false }; h.read();
  assert.equal(call.signal.aborted, true); const writes = h.state.writes;
  pending.resolve({ address: row() }); await rejected; await settle();
  assert.equal(h.state.writes, writes); assert.equal(h.read().addresses.length, 0);
});

test('unmount aborts GET and mutation and suppresses all late state writes', async () => {
  const h = harness(); const pendingGet = deferred(); h.state.handler = () => pendingGet.promise;
  h.read(); h.unmount(); const writes = h.state.writes;
  assert.equal(h.state.calls[0].signal.aborted, true); pendingGet.resolve({ addresses: [row()] }); await settle();
  assert.equal(h.state.writes, writes);
  const second = harness(); second.read(); await settle(); const pendingSave = deferred(); second.state.handler = () => pendingSave.promise;
  const save = second.read().create(idA, input()); const rejected = assert.rejects(save, { name: 'AbortError' }); second.unmount();
  const afterUnmount = second.state.writes; pendingSave.resolve({ address: row() }); await rejected;
  assert.equal(second.state.writes, afterUnmount); assert.equal(second.state.calls.at(-1).signal.aborted, true);
});

test('failed refresh preserves same-owner saved data and retry clears the error', async () => {
  const h = harness({ initial: [row()] }); h.read(); await settle();
  h.state.handler = () => { throw new Error('Offline'); }; await h.read().refresh();
  assert.equal(h.read().addresses[0].id, idA); assert.match(h.read().error, /Offline/);
  h.state.handler = null; await h.read().refresh(); assert.equal(h.read().error, null);
});

test('malformed list and unacknowledged deletes never become a successful state change', async () => {
  const h = harness({ initial: [row()] }); h.read(); await settle();
  h.state.handler = () => ({ addresses: [row(), row()] }); await h.read().refresh();
  assert.match(h.read().error, /Unable to read/); assert.equal(h.read().addresses.length, 1);
  h.state.handler = () => ({ success: false }); await assert.rejects(h.read().remove(idA), /not confirmed/);
  assert.equal(h.read().addresses.length, 1);
});
