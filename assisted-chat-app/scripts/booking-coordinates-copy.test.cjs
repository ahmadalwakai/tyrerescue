const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadSource(relative, dependencies = {}) {
  const filename = path.join(__dirname, '../src', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { URL, URLSearchParams }, { filename })((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

const coordinates = loadSource('lib/booking-coordinates.ts');
const settle = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (Array.isArray(tree)) return tree.map((child) => find(child, predicate)).find(Boolean);
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}
function text(tree) {
  if (tree == null) return '';
  if (typeof tree !== 'object') return String(tree);
  return Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children);
}

function harness() {
  let rendering;
  const state = { revision: 1, clipboard: [], write: async () => {}, detail: null };
  const changed = (before, next) => !before || next.some((value, index) => value !== before[index]);
  const react = {
    useState(initial) { const r = rendering; const index = r.cursor++; if (!r.hooks[index]) r.hooks[index] = { value: typeof initial === 'function' ? initial() : initial }; return [r.hooks[index].value, (next) => { r.writes += 1; r.hooks[index].value = typeof next === 'function' ? next(r.hooks[index].value) : next; }]; },
    useRef(initial) { const r = rendering; const index = r.cursor++; if (!r.hooks[index]) r.hooks[index] = { current: initial }; return r.hooks[index]; },
    useCallback(fn, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.hooks[index] = { value: fn, deps }; return r.hooks[index].value; },
    useMemo(fn, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.hooks[index] = { value: fn(), deps }; return r.hooks[index].value; },
    useEffect(effect, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.effects.push(() => { r.hooks[index]?.cleanup?.(); r.hooks[index] = { deps, cleanup: effect() }; }); },
  };
  const native = Object.fromEntries(['View', 'Text', 'TextInput', 'Modal', 'Pressable', 'ScrollView', 'ActivityIndicator', 'KeyboardAvoidingView'].map((name) => [name, name]));
  native.StyleSheet = { create: (styles) => styles };
  native.Platform = { OS: 'ios' };
  const api = { getApiContextRevision: () => state.revision, api: { get: async (url) => url.includes('/bookings?') ? { items: [], page: 1, totalPages: 1, totalCount: 0 } : state.detail } };
  const common = {
    react,
    'react/jsx-runtime': { Fragment: 'Fragment', jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) },
    'react-native': native, '@/lib/api': api,
    '@/lib/booking-coordinates': coordinates,
    '@/lib/clipboard': loadSource('lib/clipboard.ts', { 'expo-clipboard': { setStringAsync: (value) => { state.clipboard.push(value); return state.write(value); } } }),
    './ui': { AppButton: 'AppButton', StatusBanner: 'StatusBanner' },
    './theme': loadSource('components/theme.ts'),
  };
  const copy = loadSource('components/CopyCoordinatesButton.tsx', common);
  const address = loadSource('components/CopyAddressButton.tsx', { ...common, '@/lib/booking-address': loadSource('lib/booking-address.ts') });
  const admin = loadSource('components/AdminBookingsModal.tsx', {
    ...common, './CopyCoordinatesButton': copy, './CopyAddressButton': address,
    '@/lib/invoice-download': {}, '@/components/tracking/DriverLocationShareActions': { DriverLocationShareActions: 'DriverLocationShareActions' },
    './invoices/InvoicePresentationEditor': { InvoicePresentationEditor: 'InvoicePresentationEditor' },
  });
  function renderer(component) {
    const r = { hooks: [], effects: [], cursor: 0, writes: 0 };
    return {
      read(props) { r.cursor = 0; r.effects = []; rendering = r; const tree = component(props); for (const effect of r.effects) effect(); return tree; },
      unmount() { for (const hook of r.hooks) hook?.cleanup?.(); },
      get writes() { return r.writes; },
    };
  }
  return { state, renderer, copy: () => renderer(copy.CopyCoordinatesButton), admin: () => renderer(admin.AdminBookingsModal) };
}

const props = { lat: '55.8642370001', lng: '-4.2518060002', contextKey: 'tyre_rescue:booking-a' };
const button = (tree) => find(tree, (node) => node.type === 'AppButton' && node.props.label === 'Copy coordinates');
const banner = (tree) => find(tree, (node) => node.type === 'StatusBanner');

test('saved coordinates preserve precision and signs, including zero and geographic boundaries', () => {
  for (const [lat, lng, expected] of [
    [props.lat, props.lng, '55.8642370001, -4.2518060002'],
    [0, 0, '0, 0'], ['0', '-4.25', '0, -4.25'], ['  +55.86 ', ' -.25 ', '+55.86, -.25'],
    [-90, 180, '-90, 180'], [90, -180, '90, -180'],
  ]) assert.equal(coordinates.formatBookingCoordinatesForCopy(lat, lng), expected);
});

test('missing, malformed, nonfinite and out of range coordinates cannot reach the clipboard', async () => {
  const h = harness();
  const invalid = [null, undefined, '', ' ', 'NaN', NaN, Infinity, '-Infinity', '55.4 north', '0x20', {}, true];
  for (const invalidValue of invalid) {
    for (const pair of [{ lat: invalidValue, lng: -4 }, { lat: 55, lng: invalidValue }]) {
      const control = h.copy(); const tree = control.read({ ...props, ...pair });
      assert.equal(button(tree).props.disabled, true);
      assert.match(text(tree), /No valid coordinates/);
      button(tree).props.onPress();
      control.unmount();
    }
  }
  for (const pair of [{ lat: 90.0001, lng: 0 }, { lat: -90.1, lng: 0 }, { lat: 0, lng: 180.1 }, { lat: 0, lng: -180.1 }]) {
    assert.equal(coordinates.formatBookingCoordinatesForCopy(pair.lat, pair.lng), '');
  }
  await settle();
  assert.deepEqual(h.state.clipboard, []);
});

test('pressing Copy coordinates writes latitude, longitude via native clipboard and announces success', async () => {
  const h = harness(); const control = h.copy();
  const tree = control.read(props);
  assert.equal(button(tree).props.accessibilityLabel, 'Copy coordinates');
  button(tree).props.onPress(); button(tree).props.onPress();
  assert.deepEqual(h.state.clipboard, ['55.8642370001, -4.2518060002']);
  assert.equal(button(control.read(props)).props.loading, true);
  await settle();
  assert.equal(banner(control.read(props)).props.message, 'Coordinates copied.');
  control.unmount();
});

test('native clipboard rejection displays failure and allows retry', async () => {
  const h = harness(); const control = h.copy();
  h.state.write = async () => { throw new Error('Clipboard denied'); };
  button(control.read(props)).props.onPress(); await settle();
  let tree = control.read(props);
  assert.equal(banner(tree).props.kind, 'err');
  assert.equal(banner(tree).props.message, 'Could not copy coordinates. Please try again.');
  h.state.write = async () => {};
  button(tree).props.onPress(); await settle();
  tree = control.read(props);
  assert.equal(banner(tree).props.message, 'Coordinates copied.');
  control.unmount();
});

test('copy feedback never follows a changed booking, saved location or project, even when IDs match', async () => {
  for (const change of ['booking', 'coordinates', 'project']) {
    const h = harness(); const control = h.copy(); let resolve;
    h.state.write = () => new Promise((done) => { resolve = done; });
    button(control.read(props)).props.onPress();
    const next = change === 'booking' ? { ...props, contextKey: 'tyre_rescue:booking-b' } : change === 'coordinates' ? { ...props, lat: '56.2' } : props;
    if (change === 'project') h.state.revision += 1;
    assert.equal(banner(control.read(next)), undefined);
    resolve(); await settle();
    assert.equal(banner(control.read(next)), undefined);
    control.unmount();
  }
});

test('pending old copy does not block a new booking or announce success after returning to the old one', async () => {
  const h = harness(); const control = h.copy(); const requests = [];
  h.state.write = () => new Promise((done) => { requests.push(done); });
  button(control.read(props)).props.onPress();
  const next = { ...props, contextKey: 'tyre_rescue:booking-b', lat: '56' };
  button(control.read(next)).props.onPress();
  assert.equal(h.state.clipboard.length, 2);
  control.read(props); requests[0](); await settle();
  assert.equal(banner(control.read(props)), undefined);
  requests[1](); await settle();
  assert.equal(banner(control.read(props)), undefined);
  control.unmount();
});

test('project switch before rerender prevents stale copy; unmount prevents asynchronous feedback', async () => {
  const h = harness(); const control = h.copy(); let resolve;
  const stale = button(control.read(props));
  h.state.revision += 1;
  stale.props.onPress();
  assert.equal(h.state.clipboard.length, 0);
  h.state.write = () => new Promise((done) => { resolve = done; });
  button(control.read(props)).props.onPress();
  control.unmount(); const writes = control.writes;
  resolve(); await settle();
  assert.equal(control.writes, writes);
});

test('All bookings detail and Edit expose copy of saved coordinates alongside address copy', async () => {
  const h = harness(); const modal = h.admin();
  h.state.detail = {
    booking: { id: 'booking-a', sourceApp: 'tyre_rescue', refNumber: 'TYR-2026-12345', status: 'confirmed', bookingType: 'emergency', serviceType: 'tyre_replacement', lat: '0', lng: '-4.2518', addressLine: '10 Test Street', quantity: 1, subtotal: '100', vatAmount: '20', totalAmount: '120', customerName: 'Customer', customerEmail: '', customerPhone: '' },
    bookingInformation: {}, tyres: [], statusHistory: [], availableDrivers: [], validNextStatuses: [], assignedDriver: null, invoice: null,
  };
  const modalProps = { visible: true, onClose() {}, initialRefNumber: 'TYR-2026-12345' };
  modal.read(modalProps); await settle();
  const detailElement = find(modal.read(modalProps), (node) => node.type?.name === 'BookingDetailView');
  assert.ok(detailElement);
  const detail = h.renderer(detailElement.type);
  detail.read(detailElement.props); await settle();
  let tree = detail.read(detailElement.props);
  const coordinateElement = find(tree, (node) => node.type?.name === 'CopyCoordinatesButton');
  assert.equal(coordinateElement.props.lat, '0');
  assert.equal(coordinateElement.props.lng, '-4.2518');
  assert.ok(find(tree, (node) => node.type?.name === 'CopyAddressButton'));
  const row = find(tree, (node) => node.props?.label === 'Coordinates');
  assert.equal(row.props.value, '0, -4.2518');
  assert.equal(find(row.type(row.props), (node) => node.type === 'Text' && node.props.selectable).props.children, '0, -4.2518');
  const copy = h.renderer(coordinateElement.type);
  button(copy.read(coordinateElement.props)).props.onPress(); await settle();
  assert.deepEqual(h.state.clipboard, ['0, -4.2518']);
  find(tree, (node) => node.type === 'Pressable' && text(node) === 'Edit').props.onPress();
  tree = detail.read(detailElement.props);
  assert.match(text(tree), /Saved coordinates/);
  find(tree, (node) => node.type === 'TextInput' && node.props.value === '10 Test Street').props.onChangeText('New unsaved address');
  tree = detail.read(detailElement.props);
  assert.match(text(tree), /These coordinates belong to the saved booking location/);
  const saved = find(tree, (node) => node.type?.name === 'CopyCoordinatesButton');
  assert.equal(saved.props.lat, '0');
  assert.equal(saved.props.lng, '-4.2518');
  assert.equal(find(tree, (node) => node.type?.name === 'CopyAddressButton').props.address, 'New unsaved address');
  copy.unmount(); detail.unmount(); modal.unmount();
});
