const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadSource(relative, dependencies, globals = {}) {
  const filename = path.join(__dirname, '../src', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { URLSearchParams, Date, ...globals }, { filename })(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function settle() { for (let index = 0; index < 6; index++) await new Promise(resolve => setImmediate(resolve)); }

const gpsPlace = { lat: 55.8642, lng: -4.2518, address: 'Demo Glasgow address', accuracy: 8, capturedAt: Date.now() };
const ready = (place = gpsPlace) => ({ status: 'ready', place, message: null, settingsNeeded: false });
const plain = (value) => JSON.parse(JSON.stringify(value));

function harness(initial = {}, platform = 'ios') {
  const state = {
    writes: 0, updates: [], advances: 0, locations: [], validations: [], geocodes: [], searches: [], timers: [],
    prepare: async () => ready(), validate: async () => ({ valid: true, distanceMiles: 3, message: '' }),
    reverse: async (lat, lng) => `Manual pin ${lat}, ${lng}`,
    search: async () => [{ id: 'manual-address', place_name: 'Chosen manual address', center: [-4.2, 55.9] }],
  };
  let rendering;
  const changed = (before, next) => !before || next.some((item, index) => item !== before[index]);
  const react = {
    useState(initial) { const r = rendering; const index = r.cursor++; if (!r.hooks[index]) r.hooks[index] = { value: typeof initial === 'function' ? initial() : initial }; return [r.hooks[index].value, (value) => { state.writes++; r.hooks[index].value = typeof value === 'function' ? value(r.hooks[index].value) : value; }]; },
    useRef(initial) { const r = rendering; const index = r.cursor++; return r.hooks[index] ?? (r.hooks[index] = { current: initial }); },
    useMemo(create, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.hooks[index] = { value: create(), deps }; return r.hooks[index].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.effects.push(() => { r.hooks[index]?.cleanup?.(); r.hooks[index] = { deps, cleanup: effect() }; }); },
  };
  const node = (type, props) => ({ type, props });
  const component = loadSource('customer-location-step.tsx', {
    react, 'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' }, '@expo/vector-icons': { Feather: 'Feather' },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Platform: { OS: platform }, Linking: { openSettings: async () => {} }, StyleSheet: { create: (value) => value } },
    './api': { API: { validateLocation: '/isolated/location' }, requestJson: async (url, init) => { const body = JSON.parse(init.body); state.validations.push(body); return state.validate(body); } },
    './booking-safety': { resetBookingQuote: { quoteId: null }, withDeadline: (value) => value },
    './customer-location': { prepareCustomerLocation: async (options) => { state.locations.push(options); return state.prepare(options); } },
    './mapbox': { liveLocationMarkers: (lat, lng) => [{ id: 'pin', coordinate: [lng, lat] }], reverseGeocode: async (lat, lng) => { state.geocodes.push({ lat, lng }); return state.reverse(lat, lng); }, searchAddress: async (value) => { state.searches.push(value); return state.search(value); } },
    './pulsing-map': { PulsingMap: 'PulsingMap' },
    './theme': { colors: {}, radii: {}, typography: {} },
    './ui': { Card: 'Card', InlineNotice: 'InlineNotice', LoadingState: 'LoadingState', PrimaryButton: 'PrimaryButton', Row: 'Row', ScreenHeader: 'ScreenHeader', TextField: 'TextField' },
  }, { setTimeout: (callback) => { const timer = { callback, active: true }; state.timers.push(timer); return timer; }, clearTimeout: (timer) => { if (timer) timer.active = false; } });
  const props = { state: { address: '', lat: null, lng: null, ...initial }, updateState: (value) => state.updates.push(value), goNext: () => { state.advances++; } };
  const renderer = { hooks: [], effects: [], cursor: 0 };
  const read = () => { renderer.cursor = 0; renderer.effects = []; rendering = renderer; const tree = component.CustomerLocationStep(props); renderer.effects.forEach((effect) => effect()); return tree; };
  function nodes(tree, predicate) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap((value) => nodes(value, predicate)); return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)]; }
  const find = (predicate) => nodes(read(), predicate)[0];
  const button = (text) => find((value) => value.type === 'PrimaryButton' && value.props.children === text);
  const input = () => find((value) => value.type === 'TextField');
  const map = () => find((value) => value.type === 'PulsingMap');
  const press = (text) => { const target = button(text); assert.ok(target, `Missing button ${text}`); assert.ok(!target.props.disabled, `Disabled button ${text}`); return target.props.onPress(); };
  const runSearch = async () => { state.timers.filter((timer) => timer.active).forEach((timer) => { timer.active = false; timer.callback(); }); await settle(); };
  const unmount = () => { renderer.hooks.forEach((hook) => hook?.cleanup?.()); };
  return { state, read, find, button, input, map, press, runSearch, unmount };
}

test('a fresh native location step waits for an explicit location choice without denied notices', async () => {
  for (const platform of ['ios', 'android']) {
    const h = harness({}, platform);
    h.state.prepare = async () => ({ status: 'denied', place: null, message: 'Location access is off.', settingsNeeded: true });
    h.read(); await settle();
    assert.equal(h.state.locations.length, 0);
    assert.equal(h.state.validations.length, 0);
    assert.ok(h.button('Use current location'));
    assert.ok(h.button('Search for an address'));
    assert.equal(h.button('Open location settings'), undefined);
    assert.equal(h.find((value) => value.type === 'LoadingState'), undefined);
    assert.equal(h.find((value) => value.type === 'InlineNotice'), undefined);
    assert.equal(h.state.advances, 0);
    h.unmount();
  }
});

test('explicit GPS proposes an address and only an explicit confirmation advances once', async () => {
  const h = harness(); h.read(); await settle();
  h.press('Use current location'); await settle();
  assert.deepEqual(plain(h.state.locations), [{ requestPermission: true, force: true }]);
  assert.match(JSON.stringify(h.read()), /Is this where you need us\?/);
  assert.match(JSON.stringify(h.read()), /Demo Glasgow address/);
  assert.equal(h.input(), undefined);
  assert.equal(h.state.updates.length, 0);
  assert.equal(h.state.advances, 0);
  assert.deepEqual(h.state.validations, [{ lat: gpsPlace.lat, lng: gpsPlace.lng, address: gpsPlace.address }]);
  const confirm = h.button('Yes, use this location');
  assert.equal(confirm.props.disabled, false);
  confirm.props.onPress(); confirm.props.onPress();
  assert.equal(h.state.updates.length, 1);
  assert.equal(h.state.updates[0].address, gpsPlace.address);
  assert.equal(h.state.advances, 1);
  h.unmount();
});

test('a fresh customer can choose an address and adjust the map pin without requesting GPS', async () => {
  const h = harness(); h.read(); h.press('Search for an address');
  h.input().props.onChangeText('Manual postcode'); await h.runSearch();
  h.find((value) => value.type === 'Pressable' && value.props.accessibilityLabel === 'Chosen manual address').props.onPress();
  await settle();
  h.map().props.onCoordinateSelected([-4.3, 55.8]); await settle();
  assert.equal(h.state.locations.length, 0);
  assert.equal(h.state.geocodes.length, 1);
  assert.deepEqual(plain(h.map().props.centerCoordinate), [-4.3, 55.8]);
  h.press('Yes, use this location');
  assert.equal(h.state.updates[0].address, 'Manual pin 55.8, -4.3');
  assert.equal(h.state.updates[0].lat, 55.8);
  assert.equal(h.state.updates[0].lng, -4.3);
  assert.equal(h.state.advances, 1);
  h.unmount();
});

test('pending explicit GPS fills the confirmation card after arrival and service-area validation', async () => {
  const h = harness(); const gps = deferred(); const validation = deferred();
  h.state.prepare = () => gps.promise; h.state.validate = () => validation.promise;
  h.read(); h.press('Use current location'); await settle();
  assert.equal(h.state.advances, 0);
  gps.resolve(ready()); await settle();
  assert.equal(h.button('Yes, use this location').props.disabled, true);
  validation.resolve({ valid: true, distanceMiles: 4, message: '' }); await settle();
  assert.equal(h.button('Yes, use this location').props.disabled, false);
  assert.equal(h.state.advances, 0);
  h.unmount();
});

test('changing the address suppresses a late explicit GPS result and confirms the manual choice', async () => {
  const h = harness(); const gps = deferred(); h.state.prepare = () => gps.promise;
  h.read(); h.press('Use current location'); await settle(); h.press('Search for an address');
  h.input().props.onChangeText('New manual address'); await h.runSearch();
  const suggestion = h.find((value) => value.type === 'Pressable' && value.props.accessibilityLabel === 'Chosen manual address');
  assert.ok(suggestion); suggestion.props.onPress(); await settle();
  gps.resolve(ready()); await settle();
  assert.equal(h.input().props.value, 'Chosen manual address');
  assert.deepEqual(plain(h.map().props.centerCoordinate), [-4.2, 55.9]);
  assert.equal(h.state.validations.length, 1);
  h.press('Yes, use this location');
  assert.equal(h.state.updates[0].address, 'Chosen manual address');
  h.unmount();
});

test('saved draft coordinates are revalidated without requesting GPS', async () => {
  const h = harness({ address: 'Saved booking address', lat: 0, lng: 0 }); h.read(); await settle();
  assert.equal(h.state.locations.length, 0);
  assert.deepEqual(h.state.validations, [{ address: 'Saved booking address', lat: 0, lng: 0 }]);
  assert.match(JSON.stringify(h.read()), /Saved booking address/);
  assert.deepEqual(plain(h.map().props.centerCoordinate), [0, 0]);
  assert.equal(h.state.advances, 0);
  h.press('Yes, use this location');
  assert.equal(h.state.updates[0].lat, 0);
  assert.equal(h.state.updates[0].lng, 0);
  h.unmount();
});

test('an unavailable service area blocks confirmation while address correction stays available', async () => {
  const h = harness(); h.state.validate = async () => ({ valid: false, distanceMiles: 200, message: 'Outside our service area' });
  h.read(); h.press('Use current location'); await settle();
  assert.equal(h.button('Yes, use this location').props.disabled, true);
  assert.match(JSON.stringify(h.read()), /Outside our service area/);
  h.press('Change address');
  assert.ok(h.input());
  assert.equal(h.state.advances, 0);
  h.unmount();
});

test('denied GPS falls back to address entry and an explicit retry requests a fresh location', async () => {
  const h = harness(); h.state.prepare = async () => ({ status: 'denied', place: null, message: 'Location access is off.', settingsNeeded: true });
  h.read(); await settle();
  assert.equal(h.state.locations.length, 0);
  assert.equal(h.find((value) => value.type === 'InlineNotice'), undefined);
  h.press('Use current location'); await settle();
  assert.ok(h.input());
  assert.match(JSON.stringify(h.read()), /Location access is off/);
  assert.ok(h.button('Open location settings'));
  h.state.prepare = async () => ready();
  h.press('Use current location'); await settle();
  assert.deepEqual(plain(h.state.locations.at(-1)), { requestPermission: true, force: true });
  assert.equal(h.input(), undefined);
  assert.match(JSON.stringify(h.read()), /Demo Glasgow address/);
  h.unmount();
});

test('late validation cannot re-enable a choice after the user edits its address', async () => {
  const h = harness(); const validation = deferred(); h.state.validate = () => validation.promise;
  h.read(); h.press('Use current location'); await settle(); h.press('Change address');
  h.input().props.onChangeText('Different location');
  validation.resolve({ valid: true, distanceMiles: 1, message: '' }); await settle();
  assert.equal(h.input().props.value, 'Different location');
  assert.equal(h.map(), undefined);
  assert.equal(h.button('Yes, use this location')?.props.disabled ?? true, true);
  assert.equal(h.state.advances, 0);
  h.unmount();
});

test('late address suggestions and map lookups cannot replace a newer confirmed candidate', async () => {
  const h = harness(); h.read(); h.press('Use current location'); await settle();
  const pin = deferred(); h.state.reverse = () => pin.promise;
  h.map().props.onCoordinateSelected([-4, 56]); await settle();
  h.press('Change address');
  const search = deferred(); h.state.search = () => search.promise;
  h.input().props.onChangeText('Old search'); await h.runSearch();
  h.state.search = async () => [{ id: 'new-address', place_name: 'Newer manual address', center: [-4.4, 55.8] }];
  h.input().props.onChangeText('New search'); await h.runSearch();
  h.find((value) => value.type === 'Pressable' && value.props.accessibilityLabel === 'Newer manual address').props.onPress();
  await settle();
  search.resolve([{ id: 'old-address', place_name: 'Old stale result', center: [-1, 51] }]);
  pin.resolve('Old stale map pin'); await settle();
  assert.equal(h.input().props.value, 'Newer manual address');
  assert.deepEqual(plain(h.map().props.centerCoordinate), [-4.4, 55.8]);
  assert.doesNotMatch(JSON.stringify(h.read()), /Old stale/);
  h.press('Yes, use this location');
  assert.equal(h.state.updates[0].address, 'Newer manual address');
  h.unmount();
});

test('an unfinished saved address opens editing without replacing it with current GPS', async () => {
  const h = harness({ address: 'Saved partial postcode G31', lat: null, lng: null });
  h.read(); await settle();
  assert.equal(h.state.locations.length, 0);
  assert.equal(h.input().props.value, 'Saved partial postcode G31');
  assert.equal(h.state.advances, 0);
  h.unmount();
});

test('late GPS, reverse-geocode and validation responses do not write after unmount', async () => {
  for (const stage of ['gps', 'reverse', 'validate']) {
    const h = harness(); const pending = deferred();
    if (stage === 'gps') h.state.prepare = () => pending.promise;
    if (stage === 'validate') h.state.validate = () => pending.promise;
    h.read(); h.press('Use current location'); await settle();
    if (stage === 'reverse') { h.state.reverse = () => pending.promise; h.map().props.onCoordinateSelected([-4, 56]); await settle(); }
    h.unmount(); const writes = h.state.writes;
    pending.resolve(stage === 'gps' ? ready() : stage === 'reverse' ? 'Late pin address' : { valid: true, distanceMiles: 1, message: '' });
    await settle();
    assert.equal(h.state.writes, writes, `${stage} should not set state after unmount`);
    assert.equal(h.state.updates.length, 0);
    assert.equal(h.state.advances, 0);
  }
});

test('web does not prompt automatically and retains the manual address path', async () => {
  const h = harness({}, 'web'); h.read(); await settle();
  assert.equal(h.state.locations.length, 0);
  assert.ok(h.input());
  h.press('Use current location'); await settle();
  assert.deepEqual(plain(h.state.locations), [{ requestPermission: true, force: true }]);
  h.unmount();
});
