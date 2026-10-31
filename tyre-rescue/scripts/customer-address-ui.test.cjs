/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies, globals = {}, exports = []) {
  const filename = path.join(__dirname, '../src', file);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\nObject.assign(exports,{${exports.join(',')}});})`, { Error, Date, ...globals }, { filename })(
    name => { if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`); return dependencies[name]; }, module, module.exports,
  );
  return module.exports;
}

const plain = value => JSON.parse(JSON.stringify(value));
const settle = () => new Promise(resolve => setImmediate(resolve));
const input = () => ({ label: 'Home', addressLine: '12 Example Road, Glasgow', lat: 55.86, lng: -4.25 });
const address = () => ({ id: '11111111-1111-4111-8111-111111111111', ...input(), createdAt: '2026-11-01T12:00:00Z', updatedAt: '2026-11-01T12:00:00Z' });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (tree === null || tree === undefined || typeof tree === 'boolean') return '';
  if (Array.isArray(tree)) return tree.map(text).join('');
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
function runtime() {
  const hooks = []; let cursor = 0; let effects = []; let dirty = false; let writes = 0;
  const changed = (previous, next) => !previous || next.some((value, index) => !Object.is(value, previous[index]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) {
        hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
        hooks[index].set = value => { writes++; const next = typeof value === 'function' ? value(hooks[index].value) : value; if (!Object.is(next, hooks[index].value)) { hooks[index].value = next; dirty = true; } };
      }
      return [hooks[index].value, hooks[index].set];
    },
    useRef(value) { return hooks[cursor++] ??= { current: value }; },
    useCallback(callback, dependencies) { const index = cursor++; if (!hooks[index] || changed(hooks[index].dependencies, dependencies)) hooks[index] = { value: callback, dependencies }; return hooks[index].value; },
    useEffect(effect, dependencies) { const index = cursor++; if (!hooks[index] || changed(hooks[index].dependencies, dependencies)) effects.push(() => { hooks[index]?.cleanup?.(); hooks[index] = { dependencies, cleanup: effect() }; }); },
  };
  function render(component, props) {
    for (let pass = 0; pass < 8; pass++) {
      cursor = 0; effects = []; dirty = false; const tree = component(props); effects.forEach(effect => effect()); if (!dirty) return tree;
    }
    throw new Error('Render failed to settle');
  }
  return { react, render, unmount: () => hooks.forEach(hook => hook.cleanup?.()), get writes() { return writes; } };
}
const jsx = (type, props, key) => ({ type, props, key });
const shared = {
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', StyleSheet: { create: styles => styles } },
  './theme': { colors: {}, typography: {}, spacing: {} },
  './ui': Object.fromEntries(['AppHeader', 'Card', 'Chip', 'Disclosure', 'InlineNotice', 'LoadingState', 'PrimaryButton', 'Row', 'ScreenHeader', 'TextField'].map(name => [name, name])),
};
shared['./ui'].useScreenContentInsets = () => ({});
const validation = load('customer-addresses.ts', { react: {}, './api': {}, './customer-account': {} });

function editor(initial) {
  const r = runtime(); const state = { saved: [], cancelled: 0, searchCalls: [], gpsCalls: [], reverseCalls: [], search: null, gps: null, reverse: null, save: null, timers: [] };
  const props = { initial, busy: false, onSave: async data => { state.saved.push(plain(data)); if (state.save) return state.save(data); }, onCancel: () => { state.cancelled++; } };
  const { CustomerAddressEditor } = load('customer-address-editor.tsx', {
    ...shared, react: r.react, './customer-addresses': validation, './booking-safety': { withDeadline: promise => promise },
    './customer-location': { prepareCustomerLocation: async options => { state.gpsCalls.push(options); return state.gps ? state.gps() : { status: 'ready', place: { address: input().addressLine, lat: input().lat, lng: input().lng } }; } },
    './mapbox': {
      liveLocationMarkers: (lat, lng) => [{ coordinate: [lng, lat] }],
      searchAddress: async query => { state.searchCalls.push(query); return state.search ? state.search(query) : [{ id: 'match', place_name: input().addressLine, center: [input().lng, input().lat] }]; },
      reverseGeocode: async (lat, lng) => { state.reverseCalls.push({ lat, lng }); return state.reverse ? state.reverse(lat, lng) : '24 Another Road, Glasgow'; },
    }, './pulsing-map': { PulsingMap: 'PulsingMap' },
  }, { setTimeout: callback => { const timer = { callback, active: true }; state.timers.push(timer); return timer; }, clearTimeout: timer => { if (timer) timer.active = false; } });
  const read = () => r.render(CustomerAddressEditor, props);
  const button = label => nodes(read()).find(node => node.type === 'PrimaryButton' && text(node) === label);
  const field = label => nodes(read()).find(node => node.type === 'TextField' && node.props.label === label);
  const press = label => { const found = button(label); assert.ok(found, `Button ${label} missing`); found.props.onPress(); };
  const runSearch = async () => { state.timers.filter(timer => timer.active).forEach(timer => { timer.active = false; timer.callback(); }); await settle(); };
  return { state, props, r, read, button, field, press, runSearch };
}

function book() {
  const r = runtime(); const state = { calls: [], nextId: 0, create: null, update: null, remove: null, routes: [], account: { profile: { id: 'owner-a' }, token: 'token-a', sessionRevision: 0, loading: false } };
  const data = { addresses: [address()], loading: false, busy: false, error: null, refresh: async () => { state.calls.push(['refresh']); },
    create: async (id, fields) => { state.calls.push(['create', id, plain(fields)]); if (state.create) return state.create(id, fields); return { id, ...fields }; },
    update: async (id, fields) => { state.calls.push(['update', id, plain(fields)]); if (state.update) return state.update(id, fields); return { id, ...fields }; },
    remove: async id => { state.calls.push(['remove', id]); if (state.remove) return state.remove(id); },
  };
  const router = { canGoBack: () => true, back: () => {}, replace: route => state.routes.push(route), push: route => state.routes.push(route) };
  const account = { useCustomerAccount: () => state.account };
  const addresses = { useCustomerAddresses: () => data, newCustomerAddressId: () => `retry-id-${++state.nextId}` };
  const components = load('customer-address-book.tsx', { ...shared, react: r.react, 'expo-router': { router }, './customer-account': account, './customer-addresses': addresses,
    './customer-address-editor': { CustomerAddressEditor: 'CustomerAddressEditor' } }, {}, ['AddressList']);
  const picker = load('customer-saved-address-picker.tsx', { ...shared, react: r.react, 'expo-router': { router, useFocusEffect: callback => r.react.useEffect(callback, [callback]) },
    './customer-account': account, './customer-addresses': addresses }, {}, ['SavedAddressChoices']);
  const read = () => r.render(components.AddressList, {});
  const button = label => nodes(read()).find(node => node.type === 'PrimaryButton' && text(node) === label);
  return { state, data, r, components, picker, read, button };
}

test('typed unresolved addresses cannot save and selecting a search result still needs explicit confirmation', async () => {
  const h = editor(); h.read(); h.field('Address or postcode').props.onChangeText('Glasgow'); await h.runSearch();
  assert.equal(h.button('Save address').props.disabled, true); h.press('Save address'); assert.equal(h.state.saved.length, 0);
  h.press(input().addressLine); assert.equal(h.button('Save address').props.disabled, false); assert.equal(h.state.saved.length, 0);
  h.press('Save address'); await settle(); assert.deepEqual(h.state.saved, [input()]);
});

test('GPS and map movement update the selected location but never save automatically', async () => {
  const h = editor(); h.read(); h.press('Use current location'); await settle();
  assert.deepEqual(plain(h.state.gpsCalls), [{ requestPermission: true, force: true }]); assert.equal(h.state.saved.length, 0);
  const map = nodes(h.read()).find(node => node.type === 'PulsingMap'); map.props.onCoordinateSelected([-3, 56]); await settle();
  assert.deepEqual(h.state.reverseCalls, [{ lat: 56, lng: -3 }]); assert.equal(h.state.saved.length, 0);
  h.press('Save address'); await settle(); assert.deepEqual(h.state.saved[0], { label: 'Home', addressLine: '24 Another Road, Glasgow', lat: 56, lng: -3 });
});

test('invalid label or coordinates are rejected without a save and failed save retains fields for retry', async () => {
  const h = editor(input()); h.read(); h.field('Address name').props.onChangeText('x'.repeat(41)); h.press('Save address'); await settle();
  assert.equal(h.state.saved.length, 0); assert.match(text(h.read()), /1 to 40/);
  h.field('Address name').props.onChangeText('Work'); h.state.save = async () => { throw new Error('Network unavailable'); }; h.press('Save address'); await settle();
  assert.match(text(h.read()), /Network unavailable/); assert.equal(h.field('Address name').props.value, 'Work'); assert.equal(h.field('Address or postcode').props.value, input().addressLine);
  h.state.save = null; h.press('Save address'); await settle(); assert.equal(h.state.saved.length, 2); assert.deepEqual(h.state.saved[0], h.state.saved[1]);
  const invalid = editor({ ...input(), lat: 91 }); invalid.read(); invalid.press('Save address'); await settle(); assert.equal(invalid.state.saved.length, 0); assert.match(text(invalid.read()), /map before saving/);
});

test('editing search invalidates stale geocoding and a stale search cannot replace newer suggestions', async () => {
  const h = editor(input()); const pendingPin = deferred(); h.state.reverse = () => pendingPin.promise; h.read();
  nodes(h.read()).find(node => node.type === 'PulsingMap').props.onCoordinateSelected([-3, 56]);
  h.field('Address or postcode').props.onChangeText('New address'); pendingPin.resolve('Stale address'); await settle();
  assert.equal(h.button('Save address').props.disabled, true); assert.equal(h.field('Address or postcode').props.value, 'New address');
  const firstSearch = deferred(); h.state.search = value => value === 'New address' ? firstSearch.promise : [{ id: 'new', place_name: 'Latest address', center: [-4, 55] }];
  await h.runSearch(); h.field('Address or postcode').props.onChangeText('Latest'); await h.runSearch();
  firstSearch.resolve([{ id: 'old', place_name: 'Stale address', center: [-3, 56] }]); await settle();
  assert.ok(h.button('Latest address')); assert.equal(h.button('Stale address'), undefined);
});

test('unmounting discards pending GPS and search results without late state writes', async () => {
  const h = editor(); const pending = deferred(); h.state.gps = () => pending.promise; h.read(); h.press('Use current location'); h.r.unmount();
  const writes = h.r.writes; pending.resolve({ status: 'ready', place: { address: 'Stale location', lat: 55, lng: -4 } }); await settle();
  assert.equal(h.r.writes, writes); assert.equal(h.state.saved.length, 0);
  const search = editor(); const result = deferred(); search.state.search = () => result.promise; search.read(); search.field('Address or postcode').props.onChangeText('Glasgow'); await search.runSearch();
  search.r.unmount(); const searchWrites = search.r.writes; result.resolve([{ id: 'late', place_name: 'Late location', center: [-4, 55] }]); await settle(); assert.equal(search.r.writes, searchWrites);
});

test('rapid save taps write once and disable editing until the save finishes', async () => {
  const h = editor(input()); const pending = deferred(); h.state.save = () => pending.promise; h.read(); const save = h.button('Save address').props.onPress; save(); save();
  assert.equal(h.state.saved.length, 1); assert.equal(h.field('Address name').props.editable, false); assert.equal(h.button('Cancel').props.disabled, true);
  pending.resolve(); await settle(); assert.equal(h.field('Address name').props.editable, true);
});

test('failed create retries preserve the same ID and input and successful completion closes the editor', async () => {
  const h = book(); h.read(); h.button('Add address').props.onPress(); let editorNode = h.read();
  assert.equal(editorNode.type, 'CustomerAddressEditor'); const id = editorNode.key;
  h.state.create = async () => { throw new Error('Temporary failure'); };
  await assert.rejects(editorNode.props.onSave(input()), /Temporary failure/); editorNode = h.read();
  assert.equal(editorNode.key, id); h.state.create = null; await editorNode.props.onSave(input());
  assert.deepEqual(h.state.calls.filter(call => call[0] === 'create'), [['create', id, input()], ['create', id, input()]]);
  assert.match(text(h.read()), /Address saved/); assert.equal(h.state.nextId, 1);
});

test('delete requires an explicit second action and keeping an address never sends a delete', async () => {
  const h = book(); h.read(); h.button('Remove').props.onPress(); assert.equal(h.state.calls.length, 0);
  h.button('Keep address').props.onPress(); assert.equal(h.state.calls.length, 0);
  h.button('Remove').props.onPress(); h.button('Delete address').props.onPress(); await settle();
  assert.deepEqual(h.state.calls, [['remove', address().id]]); assert.match(text(h.read()), /Address removed/);
});

test('edit sends an update of the existing ID while capacity blocks additional addresses', async () => {
  const h = book(); h.read(); h.button('Edit').props.onPress(); const editorNode = h.read();
  assert.equal(editorNode.props.initial.id, address().id); await editorNode.props.onSave({ ...input(), label: 'Work' });
  assert.deepEqual(h.state.calls, [['update', address().id, { ...input(), label: 'Work' }]]);
  h.data.addresses = Array.from({ length: 20 }, (_, i) => ({ ...address(), id: String(i) })); assert.equal(h.button('Add address').props.disabled, true);
});

test('account boundary hides address list when signed out and remounts it for another session', () => {
  const h = book(); const outer = () => h.components.CustomerAddressBook();
  let tree = outer(); const first = nodes(tree).find(node => node.type === h.components.AddressList); assert.ok(first);
  h.state.account.token = null; tree = outer(); assert.equal(nodes(tree).some(node => node.type === h.components.AddressList), false); assert.match(text(tree), /Sign in/);
  h.state.account = { profile: { id: 'owner-b' }, token: 'token-b', sessionRevision: 1, loading: false };
  const second = nodes(outer()).find(node => node.type === h.components.AddressList); assert.notEqual(second.key, first.key);
  h.state.account.loading = true; assert.equal(nodes(outer()).some(node => node.type === h.components.AddressList), false);
});

test('picker selection proposes an address only and refreshes on focus without changing a booking', () => {
  const h = book(); const selected = []; const props = { onSelect: value => selected.push(value) };
  const read = () => h.r.render(h.picker.SavedAddressChoices, props); let tree = read();
  assert.deepEqual(h.state.calls, [['refresh']]); assert.equal(selected.length, 0);
  nodes(tree).find(node => node.type === 'PrimaryButton' && text(node) === 'Use Home').props.onPress();
  assert.deepEqual(selected, [address()]); assert.deepEqual(h.state.calls, [['refresh']]);
  tree = read(); nodes(tree).find(node => node.type === 'PrimaryButton' && text(node) === 'Manage saved addresses').props.onPress();
  assert.deepEqual(h.state.routes, ['/addresses']);
  h.state.account.token = null; assert.equal(h.picker.CustomerSavedAddressPicker(props), null);
});
