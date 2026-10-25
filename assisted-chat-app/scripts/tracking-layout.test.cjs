 
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { loadSource, theme, settle } = require('./chat-modals.test.cjs');

// Execute the actual screen with synthetic data and inert native dependencies.
// The fixture never calls a server, opens a map service, or changes a booking.
function createTrackingHarness(options = {}) {
  const driver = (id, coordinates = true) => ({
    id, name: `Example ${id}`, phone: null, status: 'available',
    activeJobRef: null, lat: coordinates ? 55.8642 : null,
    lng: coordinates ? -4.2518 : null, heading: null,
    lastSeenAt: '2026-10-22T12:00:00Z', locationFreshness: 'live',
    driverSituation: null,
  });
  const job = (id, status = 'awaiting_payment', coordinates = true) => ({
    id, ref: `EXAMPLE-${id}`, status, assignmentStatus: 'unassigned',
    assignedDriverId: null, customerName: 'Example customer', customerPhone: null,
    address: 'Example street', lat: coordinates ? 55.87 : null,
    lng: coordinates ? -4.26 : null, tyreSummary: null, vehicleSummary: null,
    paymentSummary: { state: 'pending', method: 'card', amountToCollectPence: 10000 },
    driverSituation: null, createdAt: '2026-10-22T12:00:00Z', scheduledFor: null,
  });
  const state = {
    visible: true, closes: 0, refreshes: 0, loading: false, error: null, dataRange: 'today',
    lastUpdated: Date.now(), activeRanges: [], injected: [], patches: [],
    alerts: [], foregroundListener: null,
    data: { drivers: [driver('driver-one'), driver('no-gps', false)],
      jobs: [job('job-one'), job('closed', 'completed', false)], generatedAt: '2026-10-22T12:00:00Z' },
  };
  const renderer = { hooks: [], cursor: 0, effects: [] };
  const changed = (before, after) => !before || after.some((value, index) => before[index] !== value);
  const react = {
    useState(initial) {
      const index = renderer.cursor++;
      if (!renderer.hooks[index]) renderer.hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [renderer.hooks[index].value, (next) => { renderer.hooks[index].value = typeof next === 'function' ? next(renderer.hooks[index].value) : next; }];
    },
    useRef(initial) {
      const index = renderer.cursor++;
      if (!renderer.hooks[index]) renderer.hooks[index] = { current: initial };
      return renderer.hooks[index];
    },
    useMemo(create, deps) {
      const index = renderer.cursor++;
      if (!renderer.hooks[index] || changed(renderer.hooks[index].deps, deps)) renderer.hooks[index] = { value: create(), deps };
      return renderer.hooks[index].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(effect, deps) {
      const index = renderer.cursor++;
      if (!renderer.hooks[index] || changed(renderer.hooks[index].deps, deps)) {
        renderer.effects.push(() => {
          renderer.hooks[index]?.cleanup?.();
          renderer.hooks[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const node = (type, props) => ({ type, props: props ?? {} });
  const mapBuilder = { buildTrackingMapHtml: () => '<!doctype html><html></html>' };
  const refresh = async () => { state.refreshes += 1; };
  const dependencies = {
    react, 'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', Alert: { alert: (...args) => state.alerts.push(args) },
      AppState: { addEventListener: (_event, callback) => { state.foregroundListener = callback; return { remove: () => { state.foregroundListener = null; } }; } },
      FlatList: 'FlatList', Linking: { openURL: async () => {} }, Modal: 'Modal',
      Platform: { OS: 'ios' }, Pressable: 'Pressable', ScrollView: 'ScrollView',
      StyleSheet: { create: (value) => value, absoluteFillObject: {} }, Text: 'Text', View: 'View',
    },
    'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }) },
    'react-native-webview': { WebView: 'WebView' }, './theme': theme,
    '@/lib/api': { api: { patch: async (url, body) => { state.patches.push({ url, body }); } } },
    '@/lib/geo': { isValidCoordinate: (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng), haversineMiles: () => 1, formatDistanceMiles: () => '1 mile' },
    './layout/AdminModalShell': { AdminHeaderButton: 'AdminHeaderButton', AdminModalHeader: 'AdminModalHeader', AdminModalShell: 'AdminModalShell' },
    './CopyAddressButton': { CopyAddressButton: 'CopyAddressButton' },
    '@/hooks/useTracking': { useTracking: (_visible, range) => { state.activeRanges.push(range); return { data: state.data, dataRange: state.dataRange, loading: state.loading, error: state.error, lastUpdated: state.lastUpdated, refresh }; } },
    '@/lib/newtracking-map-html': mapBuilder,
    '@/lib/tracking-map-html': mapBuilder,
    './tracking/newtracking-map-html': mapBuilder,
    './tracking/tracking-map-html': mapBuilder,
  };
  dependencies['./layout/ModalSafeAreaView'] = loadSource('components/layout/ModalSafeAreaView.tsx', dependencies);
  const { TrackingModal } = loadSource('components/TrackingModal.tsx', dependencies, { process: { env: { EXPO_PUBLIC_MAPBOX_TOKEN: options.token ?? 'pk.synthetic-map-fixture' } } });

  function read() {
    renderer.cursor = 0;
    renderer.effects = [];
    const tree = TrackingModal({ visible: state.visible, onClose: () => { state.closes += 1; } });
    for (const effect of renderer.effects) effect();
    return tree;
  }
  function nodes(predicate, tree, includeHidden = false) {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap((item) => nodes(predicate, item, includeHidden));
    if (!includeHidden && tree.type === 'Modal' && !tree.props.visible) return [];
    const matches = predicate(tree) ? [tree] : [];
    if (typeof tree.type === 'function') return matches.concat(nodes(predicate, tree.type(tree.props), includeHidden));
    if (tree.type === 'FlatList') return matches.concat(nodes(predicate, tree.props.data.map((item) => tree.props.renderItem({ item })), includeHidden));
    return matches.concat(nodes(predicate, tree.props.children, includeHidden));
  }
  const find = (predicate, tree = read()) => nodes(predicate, tree)[0];
  const byLabel = (label) => find((value) => value.props.accessibilityLabel === label);
  const press = (label) => {
    const target = byLabel(label);
    assert.ok(target, `Missing visible button: ${label}`);
    target.props.onPress();
    return target;
  };
  const unmount = () => { for (const hook of renderer.hooks) hook?.cleanup?.(); };
  return { state, read, nodes, find, byLabel, press, unmount };
}

if (require.main === module) {
  test('tracking measures safe areas inside its full-screen native presentation', () => {
    const h = createTrackingHarness();
    const tree = h.read();
    assert.equal(tree.type, 'Modal');
    assert.equal(tree.props.presentationStyle, 'fullScreen');
    const provider = h.find((value) => value.type === 'SafeAreaProvider', tree);
    assert.ok(provider, 'A root app provider is outside the native modal view hierarchy');
    assert.equal(provider.props.children.type, 'SafeAreaView');
    assert.deepEqual(Array.from(provider.props.children.props.edges), ['top', 'left', 'right', 'bottom']);
    assert.ok(h.find((value) => value.props.testID === 'tracking-single-header', provider));
    assert.ok(h.find((value) => value.type === 'WebView', provider));
    h.unmount();
  });

  test('tracking opens with one compact header and no always-visible filter or roster chrome', () => {
    const h = createTrackingHarness();
    const tree = h.read();
    const controls = h.byLabel('Open tracking controls');
    assert.ok(controls);
    assert.equal(controls.props.accessibilityState.expanded, false);
    assert.equal(h.find((value) => value.type === 'AdminModalHeader', tree), undefined);
    assert.equal(h.byLabel('Show Today jobs'), undefined);
    assert.equal(h.byLabel('Close driver list'), undefined);
    assert.equal(h.byLabel('Close job list'), undefined);
    assert.ok(h.find((value) => value.type === 'WebView', tree));
    h.unmount();
  });

  test('one controls button exposes all five ranges, lists, fit and refresh, then closes cleanly', () => {
    const h = createTrackingHarness();
    h.read();
    h.press('Open tracking controls');
    assert.equal(h.byLabel('Open tracking controls').props.accessibilityState.expanded, true);
    for (const range of ['Today', 'Yesterday', '7 days', 'Last month', 'Last year']) assert.ok(h.byLabel(`Show ${range} jobs`));
    for (const label of ['Show 2 drivers', 'Show 2 jobs', 'Fit all locations', 'Refresh tracking']) assert.ok(h.byLabel(label));
    h.press('Close tracking controls');
    assert.equal(h.byLabel('Show Today jobs'), undefined);
    assert.equal(h.byLabel('Open tracking controls').props.accessibilityState.expanded, false);
    h.unmount();
  });

  test('date range selection still drives the tracking query', () => {
    const h = createTrackingHarness();
    h.read();
    h.press('Open tracking controls');
    h.press('Show Last year jobs');
    h.read();
    assert.equal(h.state.activeRanges.at(-1), 'last_year');
    assert.equal(h.state.patches.length, 0);
    h.unmount();
  });

  test('changing dates reframes only after data from the requested range arrives', () => {
    const h = createTrackingHarness();
    h.read();
    const map = h.find((value) => value.type === 'WebView');
    map.props.ref.current = { injectJavaScript: (value) => h.state.injected.push(value) };
    const lastMapState = () => {
      let received;
      vm.runInNewContext(h.state.injected.at(-1), { window: { __applyState: (json) => { received = JSON.parse(json); } } });
      return received;
    };
    map.props.onLoadEnd();
    assert.equal(lastMapState().fitKey, 'today');
    h.press('Open tracking controls');
    h.press('Show Last year jobs');
    h.read();
    assert.equal(h.state.activeRanges.at(-1), 'last_year');
    assert.equal(lastMapState().fitKey, 'today', 'Pending date selection must not consume the next range camera fit with old points');
    h.state.dataRange = 'last_year';
    h.state.data = { ...h.state.data, jobs: [{ ...h.state.data.jobs[0], ref: 'EXAMPLE-NEXT-RANGE', lat: 54.0, lng: -3.0 }] };
    h.read();
    assert.equal(lastMapState().fitKey, 'last_year');
    assert.equal(lastMapState().jobs[0].ref, 'EXAMPLE-NEXT-RANGE');
    assert.equal(h.state.patches.length, 0);
    h.unmount();
  });

  test('driver and job list transitions dismiss controls while preserving selection and assignment', async () => {
    const h = createTrackingHarness();
    h.read();
    h.press('Open tracking controls');
    h.press('Show 2 drivers');
    assert.equal(h.byLabel('Close tracking controls'), undefined);
    h.press('Select driver Example driver-one');
    assert.equal(h.byLabel('Close driver list'), undefined);
    h.press('Open tracking controls');
    h.press('Show 2 jobs');
    assert.equal(h.byLabel('Close tracking controls'), undefined);
    const jobChoice = h.find((value) => value.type === 'Pressable' && value.props.accessibilityLabel?.includes('EXAMPLE-job-one'));
    assert.ok(jobChoice, 'Expected selectable synthetic job');
    jobChoice.props.onPress();
    assert.equal(h.byLabel('Close job list'), undefined);
    assert.ok(h.byLabel('Assign job to driver'));
    h.press('Assign job to driver');
    const confirm = h.find((value) => value.type === 'Pressable' && value.props.accessibilityLabel === 'Confirm assignment');
    assert.ok(confirm, 'Expected existing assignment confirmation');
    assert.equal(h.state.patches.length, 0, 'Opening the confirmation must not mutate a booking');
    h.unmount();
    await settle();
  });

  test('fit closes controls and reaches the map bridge while refresh and foreground resume still work', async () => {
    const h = createTrackingHarness();
    h.read();
    const map = h.find((value) => value.type === 'WebView');
    map.props.ref.current = { injectJavaScript: (value) => h.state.injected.push(value) };
    h.press('Open tracking controls');
    h.press('Fit all locations');
    assert.ok(h.state.injected.some((value) => value.includes('__fitAll')));
    assert.equal(h.byLabel('Close tracking controls'), undefined);
    h.press('Open tracking controls');
    h.press('Refresh tracking');
    assert.equal(h.state.refreshes, 1);
    h.state.foregroundListener('active');
    assert.equal(h.state.refreshes, 2);
    assert.equal(h.state.patches.length, 0);
    h.unmount();
    await settle();
  });

  test('closing and reopening tracking resets the controls and selections', () => {
    const h = createTrackingHarness();
    h.read();
    h.press('Open tracking controls');
    h.state.visible = false;
    h.read();
    h.state.visible = true;
    h.read();
    assert.equal(h.byLabel('Open tracking controls').props.accessibilityState.expanded, false);
    assert.equal(h.byLabel('Close tracking controls'), undefined);
    assert.equal(h.byLabel('Assign job to driver'), undefined);
    h.unmount();
  });

  test('controls are accessible as one modal region and system back dismisses them before tracking', () => {
    const h = createTrackingHarness();
    h.read();
    h.press('Open tracking controls');
    const overlay = h.find((value) => value.props.testID === 'tracking-controls-sheet');
    assert.equal(overlay.props.accessibilityViewIsModal, true);
    assert.ok(h.find((value) => value.props.accessibilityElementsHidden === true && value.props.importantForAccessibility === 'no-hide-descendants'));
    h.find((value) => value.type === 'Modal').props.onRequestClose();
    assert.equal(h.state.closes, 0);
    assert.equal(h.byLabel('Close tracking controls'), undefined);
    h.find((value) => value.type === 'Modal').props.onRequestClose();
    assert.equal(h.state.closes, 1);
    h.unmount();
  });

  test('native map readiness receives current markers even when data arrived before map load', () => {
    const h = createTrackingHarness();
    h.read();
    const map = h.find((value) => value.type === 'WebView');
    map.props.ref.current = { injectJavaScript: (value) => h.state.injected.push(value) };
    assert.equal(h.state.injected.length, 0);
    map.props.onLoadEnd();
    assert.equal(h.state.injected.length, 1);
    assert.match(h.state.injected[0], /__applyState/);
    assert.match(h.state.injected[0], /driver-one/);
    assert.match(h.state.injected[0], /EXAMPLE-job-one/);
    assert.doesNotMatch(h.state.injected[0], /no-gps/);
    map.props.onMessage({ nativeEvent: { data: JSON.stringify({ type: 'ready' }) } });
    assert.equal(h.state.injected.length, 2);
    map.props.onMessage({ nativeEvent: { data: '{bad-json' } });
    assert.equal(h.state.injected.length, 2);
    assert.equal(h.state.patches.length, 0);
    h.unmount();
  });

  test('map failure offers retry while controls and lists remain usable', () => {
    const h = createTrackingHarness();
    h.read();
    h.find((value) => value.type === 'WebView').props.onError();
    assert.ok(h.byLabel('Reload map'));
    h.press('Open tracking controls');
    h.press('Show 2 drivers');
    assert.ok(h.byLabel('Select driver Example driver-one'));
    h.press('Close driver list');
    h.press('Reload map');
    assert.equal(h.byLabel('Reload map'), undefined);
    assert.equal(h.state.patches.length, 0);
    h.unmount();
  });

  test('missing token keeps driver and job controls available and accurately counts valid locations', () => {
    const h = createTrackingHarness({ token: '' });
    h.read();
    assert.equal(h.find((value) => value.type === 'WebView'), undefined);
    h.press('Open tracking controls');
    const textContent = (value) => Array.isArray(value) ? value.map(textContent).join('') : (typeof value === 'string' || typeof value === 'number') ? String(value) : '';
    const text = h.nodes((value) => value.type === 'Text', h.read()).map((value) => textContent(value.props.children)).join('\n');
    assert.match(text, /1 with GPS/);
    assert.match(text, /1 on map/);
    h.press('Show 2 jobs');
    assert.ok(h.byLabel('Select job EXAMPLE-job-one'));
    assert.ok(h.byLabel('Select job EXAMPLE-closed'));
    h.unmount();
  });
}

module.exports = { createTrackingHarness };
