const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, settle } = require('../../assisted-chat-app/scripts/chat-modals.test.cjs');

const trackingState = loadSource('../../tyre-rescue/src/tracking-state.ts', {});
const presentation = loadSource('../../tyre-rescue/src/tracking-presentation.ts', { './tracking-state': trackingState });
const mapbox = loadSource('../../tyre-rescue/src/mapbox.ts', { './config': { MAPBOX_TOKEN: '' } });

function harness(status = 'en_route') {
  const state = {
    response: {
      bookingId: 'isolated-booking', status, bookingType: 'emergency', canChat: true,
      customerLat: 55.86, customerLng: -4.25, driverLat: 55.87, driverLng: -4.24,
      driverLocationAt: new Date().toISOString(), driverName: 'Test driver',
      etaMinutes: 2, distanceMiles: 0.2, routeCoordinates: [[-4.24, 55.87], [-4.25, 55.86]],
      estimatedArrivalAt: new Date(Date.now() + 2 * 60_000).toISOString(),
      addressLine: 'Isolated test address', scheduledAt: null, completedAt: '2026-10-23T12:00:00Z',
      statusHistory: [{ status: 'en_route', timestamp: '2026-10-23T12:10:00Z' }, { status: 'paid', timestamp: '2026-10-23T12:00:00Z' }],
    },
    notifications: [], requests: [], timers: new Map(), listeners: new Set(), failRequests: false,
  };
  const hooks = [];
  let cursor = 0;
  let effects = [];
  let nextTimer = 0;
  const changed = (previous, next) => !previous || next.some((value, index) => value !== previous[index]);
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[index].value, value => { hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value; }];
    },
    useRef(initial) { const index = cursor++; if (!hooks[index]) hooks[index] = { current: initial }; return hooks[index]; },
    useMemo(create, deps) {
      const index = cursor++;
      if (!hooks[index] || changed(hooks[index].deps, deps)) hooks[index] = { value: create(), deps };
      return hooks[index].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!hooks[index] || changed(hooks[index].deps, deps)) effects.push(() => {
        hooks[index]?.cleanup?.();
        hooks[index] = { deps, cleanup: effect() };
      });
    },
  };
  const node = (type, props) => ({ type, props });
  const ui = Object.fromEntries(['Card', 'InlineNotice', 'Logo', 'PrimaryButton', 'Row', 'ScreenHeader', 'TextField'].map(name => [name, name]));
  const { default: TrackScreen } = loadSource('../../tyre-rescue/app/(tabs)/track.tsx', {
    react,
    'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    '@expo/vector-icons': { Feather: 'Feather' },
    'expo-router': { router: { push() {}, setParams() {} }, useLocalSearchParams: () => ({ ref: 'TR-ISOLATED' }) },
    'react-native': {
      AppState: { addEventListener: (_event, fn) => { state.listeners.add(fn); return { remove: () => state.listeners.delete(fn) }; } },
      Linking: { openURL() {} }, Share: { share: async () => {} },
      Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: value => value }, Text: 'Text', View: 'View',
    },
    '@/src/api': { API: { tracking: '/api/tracking' }, requestJson: async path => { state.requests.push(path); if (state.failRequests) throw new Error('Isolated offline response'); return { ...state.response }; } },
    '@/src/config': { PHONE_DISPLAY: 'Test support', PHONE_TEL: '000' },
    '@/src/customer-account': { useCustomerAccount: () => ({ token: 'isolated-session', loading: false, sessionRevision: 0 }) },
    '@/src/customer-booking-access': { loadBookingAccess: async () => null, saveBookingAccess: async () => {} },
    '@/src/customer-notifications': { notifyCustomerDriverNearbyAsync: async input => { state.notifications.push(input); } },
    '@/src/mapbox': mapbox,
    '@/src/pulsing-map': { PulsingMap: 'PulsingMap' },
    '@/src/tracking-state': trackingState,
    '@/src/tracking-presentation': presentation,
    '@/src/use-booking-param-access': { useBookingParamAccess: value => ({ value, invalidated: false }) },
    '@/src/theme': { colors: {}, spacing: {}, typography: {} },
    '@/src/ui': { ...ui, useScreenContentInsets: () => ({}) },
  }, {
    setInterval: (callback, ms) => { const id = ++nextTimer; state.timers.set(id, { callback, ms }); return id; },
    clearInterval: id => state.timers.delete(id),
  });
  function read() {
    cursor = 0; effects = [];
    const tree = TrackScreen();
    for (const effect of effects) effect();
    return tree;
  }
  function nodes(tree, predicate) {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
    return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
  }
  const find = predicate => nodes(read(), predicate)[0];
  return { state, read, find, unmount: () => hooks.forEach(hook => hook.cleanup?.()) };
}

for (const [status, title] of [
  ['completed', 'Service completed'], ['cancelled', 'Booking cancelled'], ['cancelled_refund_pending', 'Booking cancelled'],
  ['refunded', 'Booking refunded'], ['refunded_partial', 'Booking partially refunded'],
]) {
  test(`${status}: hides even fresh driver data from an older server and displays the finished summary`, async () => {
    const h = harness(status);
    h.read(); await settle();
    assert.ok(h.find(node => node.type === 'Text' && node.props.children === title));
    assert.equal(h.find(node => node.type === 'PulsingMap'), undefined);
    assert.equal(h.find(node => node.props?.testID === 'tracking-eta-value'), undefined);
    for (const label of ['Estimated arrival', 'Distance', 'Driver location updated']) {
      assert.equal(h.find(node => node.type === 'Row' && node.props.label === label), undefined);
    }
    assert.equal(h.find(node => node.type === 'PrimaryButton' && node.props.children === 'Share journey with family'), undefined);
    assert.ok(h.find(node => node.type === 'PrimaryButton' && node.props.children === 'Chat with us'));
    assert.ok(h.find(node => node.type === 'PrimaryButton' && node.props.children === 'Revoke shared links'));
    assert.equal(Boolean(h.find(node => node.type === 'Row' && node.props.label === 'Completed')), status === 'completed');
    if (status === 'cancelled_refund_pending') assert.ok(h.find(node => node.type === 'Text' && /refund is being processed/.test(node.props.children)));
    assert.equal(h.state.notifications.length, 0);
    assert.equal([...h.state.timers.values()].some(timer => timer.ms === 30_000), false);
    assert.equal(h.state.listeners.size, 0);
    h.find(node => node.props?.testID === 'booking-details-toggle').props.onPress();
    assert.ok(h.find(node => node.type === 'Row' && node.props.label === 'Address'));
    assert.equal(h.find(node => node.type === 'Row' && node.props.label === 'Driver location updated'), undefined);
    assert.equal(h.find(node => node.type === 'Row' && node.props.label === 'Distance'), undefined);
    h.unmount();
  });
}

test('active booking retains route and ETA, then a completion update stops polling and hides driver data', async () => {
  const h = harness();
  h.read(); await settle();
  assert.ok(h.find(node => node.type === 'PulsingMap'));
  assert.equal(h.find(node => node.props?.testID === 'tracking-eta-value').props.children, 2);
  assert.equal(h.state.notifications.length, 1);
  const poll = [...h.state.timers.values()].find(timer => timer.ms === 30_000);
  assert.ok(poll);
  h.state.response.status = 'completed';
  poll.callback(); await settle(); h.read();
  assert.equal(h.find(node => node.type === 'PulsingMap'), undefined);
  assert.ok(h.find(node => node.type === 'Text' && node.props.children === 'Service completed'));
  assert.equal([...h.state.timers.values()].some(timer => timer.ms === 30_000), false);
  assert.equal(h.state.listeners.size, 0);
  assert.equal(h.state.notifications.length, 1);
  const beforeRefresh = h.state.requests.length;
  h.find(node => node.type === 'PrimaryButton' && node.props.children === 'Refresh tracking').props.onPress();
  await settle();
  assert.equal(h.state.requests.length, beforeRefresh + 1);
  assert.equal(h.find(node => node.type === 'PulsingMap'), undefined);
  h.unmount();
});

test('arrival hero uses the server arrival clock, journey timestamps and one primary contact action', async () => {
  const h = harness();
  h.read(); await settle();
  assert.equal(h.find(node => node.props?.testID === 'tracking-arrival-time').props.children.join(''), `Arriving around ${presentation.trackingClock(h.state.response.estimatedArrivalAt)}`);
  assert.ok(h.find(node => node.props?.accessibilityLabel === 'On way, current, 13:10'));
  assert.ok(h.find(node => node.props?.accessibilityLabel === 'Booked, complete, 13:00'));
  assert.equal(h.find(node => node.type === 'PrimaryButton' && node.props.children === 'Call us').props.variant, 'secondary');
  assert.equal(h.find(node => node.type === 'PrimaryButton' && node.props.children === 'Share journey with family').props.variant, 'secondary');
  assert.ok(h.find(node => node.type === 'PrimaryButton' && node.props.children === 'Refresh tracking'));
  assert.ok(h.find(node => node.type === 'PrimaryButton' && node.props.children === 'Revoke shared links'));
  h.unmount();
});

test('booking details start folded, expose the service address on demand and can be folded again', async () => {
  const h = harness();
  h.read(); await settle();
  assert.equal(h.find(node => node.type === 'Row' && node.props.label === 'Address'), undefined);
  const toggle = () => h.find(node => node.props?.testID === 'booking-details-toggle');
  assert.equal(toggle().props.accessibilityState.expanded, false);
  toggle().props.onPress();
  assert.equal(toggle().props.accessibilityState.expanded, true);
  assert.equal(h.find(node => node.type === 'Row' && node.props.label === 'Address').props.value, 'Isolated test address');
  assert.ok(h.find(node => node.type === 'Row' && node.props.label === 'Driver location updated'));
  toggle().props.onPress();
  assert.equal(h.find(node => node.type === 'Row' && node.props.label === 'Address'), undefined);
  h.unmount();
});

for (const [status, title] of [['paid', 'Finding your fitter'], ['driver_assigned', 'Your fitter is getting ready'], ['arrived', 'Your fitter has arrived'], ['in_progress', 'Getting you moving']]) {
  test(`${status}: shows the relevant service state without a driving arrival estimate`, async () => {
    const h = harness(status);
    h.read(); await settle();
    assert.ok(h.find(node => node.type === 'Text' && node.props.children === title));
    assert.equal(h.find(node => node.props?.testID === 'tracking-eta-value'), undefined);
    if (status === 'paid') {
      const map = h.find(node => node.type === 'PulsingMap');
      assert.equal(map.props.markers.length, 1);
      assert.equal(map.props.markers[0].id, 'location');
      assert.equal(map.props.routeCoordinates.length, 0);
    }
    h.unmount();
  });
}

test('stale location hides the fitter pin, route and arrival estimate while retaining the service location', async () => {
  const h = harness();
  h.state.response.driverLocationAt = new Date(Date.now() - 4 * 60_000).toISOString();
  h.read(); await settle();
  assert.ok(h.find(node => node.type === 'Text' && node.props.children === 'Updating your arrival'));
  assert.equal(h.find(node => node.props?.testID === 'tracking-eta-value'), undefined);
  const map = h.find(node => node.type === 'PulsingMap');
  assert.equal(map.props.markers.length, 1);
  assert.equal(map.props.routeCoordinates.length, 0);
  h.unmount();
});

test('failed refresh pauses ETA and driver location immediately, then restores them on a successful manual retry', async () => {
  const h = harness();
  h.read(); await settle(); h.read();
  h.state.failRequests = true;
  [...h.state.timers.values()].find(timer => timer.ms === 30_000).callback();
  await settle();
  assert.ok(h.find(node => node.type === 'Text' && node.props.children === 'Reconnecting to your rescue'));
  assert.equal(h.find(node => node.props?.testID === 'tracking-eta-value'), undefined);
  const map = h.find(node => node.type === 'PulsingMap');
  assert.equal(map.props.markers.length, 1);
  assert.equal(map.props.routeCoordinates.length, 0);
  h.state.failRequests = false;
  h.find(node => node.type === 'PrimaryButton' && node.props.children === 'Refresh tracking').props.onPress();
  await settle();
  assert.ok(h.find(node => node.props?.testID === 'tracking-eta-value'));
  assert.equal(h.state.notifications.length, 1);
  h.unmount();
});

test('a tracking-only link keeps chat and sharing protected while making the support call primary', async () => {
  const h = harness();
  h.state.response.canChat = false;
  h.read(); await settle();
  assert.equal(h.find(node => node.type === 'PrimaryButton' && node.props.children === 'Chat with us'), undefined);
  assert.equal(h.find(node => node.type === 'PrimaryButton' && node.props.children === 'Share journey with family'), undefined);
  assert.equal(h.find(node => node.type === 'PrimaryButton' && node.props.children === 'Revoke shared links'), undefined);
  assert.equal(h.find(node => node.type === 'PrimaryButton' && node.props.children === 'Call us').props.variant, 'primary');
  h.unmount();
});
