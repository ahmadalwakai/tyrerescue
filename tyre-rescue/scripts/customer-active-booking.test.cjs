const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadSource(name, dependencies = {}) {
  const filename = path.join(__dirname, '../src', name);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { Date }, { filename })(
    (name) => { if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`); return dependencies[name]; },
    module, module.exports,
  );
  return module.exports;
}

const state = loadSource('customer-active-booking-state.ts');
const now = Date.parse('2026-10-23T12:00:00Z');
const booking = (refNumber, fields = {}) => ({
  bookingId: `booking-${refNumber}`, refNumber, status: 'paid', bookingType: 'emergency', serviceType: 'fit',
  addressLine: 'Synthetic service address', totalAmount: 100, tyreSizeDisplay: null,
  vehicleReg: null, vehicleMake: null, vehicleModel: null, scheduledAt: null,
  createdAt: '2026-10-23T11:00:00Z', invoiceDownloadToken: null, ...fields,
});

function render(fields = {}, options = {}) {
  const routes = [];
  let refreshes = 0;
  let focused = options.focused || false;
  let callbackMemo;
  let focusEffect;
  let cleanup;
  let appState = options.appState || 'active';
  const appListeners = new Set();
  const account = {
    token: 'isolated-session', profile: { id: 'isolated-customer' }, loading: false,
    bookings: [booking('ACTIVE')], offline: false, connectionError: null, refreshing: false,
    refresh: async () => { refreshes += 1; }, ...fields,
  };
  const jsx = (type, props) => ({ type, props });
  const component = loadSource('customer-active-booking.tsx', {
    'expo-router': {
      router: { push: (route) => routes.push(JSON.parse(JSON.stringify(route))) },
      useFocusEffect: (effect) => {
        if (effect === focusEffect) return;
        cleanup?.();
        cleanup = undefined;
        focusEffect = effect;
        if (focused) cleanup = effect();
      },
    },
    react: {
      useCallback: (callback, dependencies) => {
        if (!callbackMemo || dependencies.some((value, index) => value !== callbackMemo.dependencies[index])) {
          callbackMemo = { callback, dependencies };
        }
        return callbackMemo.callback;
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      StyleSheet: { create: (styles) => styles }, Text: 'Text', View: 'View',
      AppState: {
        get currentState() { return appState; },
        addEventListener: (event, listener) => {
          assert.equal(event, 'change');
          appListeners.add(listener);
          return { remove: () => appListeners.delete(listener) };
        },
      },
    },
    './customer-account': { useCustomerAccount: () => account },
    './customer-active-booking-state': state,
    './theme': { colors: {}, spacing: {}, typography: {} },
    './ui': { Card: 'Card', Pill: 'Pill', PrimaryButton: 'PrimaryButton' },
  });
  let tree;
  let nodes;
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    const children = node.props?.children;
    (Array.isArray(children) ? children : [children]).forEach(visit);
  };
  const rerender = (next = {}) => {
    Object.assign(account, next);
    tree = component.CustomerActiveBookingCard();
    nodes = [];
    visit(tree);
  };
  rerender();
  return {
    get tree() { return tree; }, get nodes() { return nodes; }, routes, refreshes: () => refreshes,
    rerender, subscriptions: () => appListeners.size,
    focus: () => { if (!focused) { focused = true; cleanup = focusEffect?.(); } },
    blur: () => { focused = false; cleanup?.(); cleanup = undefined; },
    appState: (next) => { appState = next; [...appListeners].forEach(listener => listener(next)); },
  };
}

test('finished bookings and unpaid drafts never become an active service card', () => {
  const statuses = ['completed', 'cancelled', 'cancelled_refund_pending', 'refunded', 'refunded_partial', 'draft', 'pending', 'pricing_ready', 'awaiting_payment', 'payment_failed', 'unexpected', '__proto__'];
  assert.equal(state.selectCustomerActiveBooking(statuses.map((status) => booking(status, { status })), now), null);
  assert.equal(state.selectCustomerActiveBooking([booking('NO-ID', { bookingId: '' })], now), null);
  assert.equal(render({ bookings: statuses.map((status) => booking(status, { status })) }).tree, null);
});

test('a service already under way takes priority over newer or upcoming bookings', () => {
  const working = booking('WORKING', { status: 'in_progress', createdAt: '2026-10-22T12:00:00Z' });
  const bookings = Object.freeze([
    booking('RECENT'), booking('DRIVER-ON-WAY', { status: 'en_route' }), working,
    booking('TOMORROW', { bookingType: 'scheduled', scheduledAt: '2026-10-24T09:00:00Z' }),
  ]);
  assert.equal(state.selectCustomerActiveBooking(bookings, now), working);
  assert.equal(bookings[0].refNumber, 'RECENT');
});

test('an emergency takes priority over an upcoming appointment; upcoming appointments use the nearest date', () => {
  const near = booking('NEAR', { bookingType: 'scheduled', scheduledAt: '2026-10-24T09:00:00Z' });
  const far = booking('FAR', { bookingType: 'scheduled', scheduledAt: '2026-10-28T09:00:00Z' });
  const urgent = booking('URGENT');
  assert.equal(state.selectCustomerActiveBooking([far, near], now), near);
  assert.equal(state.selectCustomerActiveBooking([far, near, urgent], now), urgent);
});

test('selection handles invalid dates and picks the latest current booking independently of API order', () => {
  const old = booking('OLDER', { createdAt: '2026-10-21T09:00:00Z' });
  const recent = booking('RECENT');
  const missingDate = booking('MISSING', { createdAt: 'invalid' });
  assert.equal(state.selectCustomerActiveBooking([missingDate, old, recent], now), recent);
  assert.equal(state.selectCustomerActiveBooking([recent, old, missingDate], now), recent);
  assert.equal(state.customerActiveBookingDate('invalid'), null);
  assert.match(state.customerActiveBookingDate('2026-07-01T09:00:00Z'), /10:00/);
  assert.match(state.customerActiveBookingDate('2026-12-01T09:00:00Z'), /09:00/);
});

test('the card requires a loaded signed-in owner before offering booking routes', () => {
  for (const account of [{ token: null }, { profile: null }, { loading: true }]) {
    const result = render(account);
    assert.equal(result.tree, null);
    assert.equal(result.routes.length, 0);
  }
});

test('track and chat open the selected own booking without copying session credentials into routes', () => {
  const result = render({ bookings: [booking('CLOSED', { status: 'completed' }), booking('ACTIVE')] });
  const buttons = result.nodes.filter((node) => node.type === 'PrimaryButton');
  assert.equal(buttons.length, 2);
  assert.match(buttons[0].props.accessibilityLabel, /ACTIVE/);
  buttons.forEach((button) => button.props.onPress());
  assert.deepEqual(result.routes, [
    { pathname: '/track', params: { ref: 'ACTIVE' } },
    { pathname: '/chat', params: { bookingId: 'booking-ACTIVE', ref: 'ACTIVE' } },
  ]);
});

test('saved booking details disclose stale status and offer a refresh', async () => {
  for (const fields of [{ offline: true }, { connectionError: 'Service temporarily unavailable' }]) {
    const result = render(fields);
    assert.ok(result.nodes.some((node) => node.type === 'Text' && /status may have changed/.test(node.props.children)));
    const refresh = result.nodes.find((node) => node.type === 'PrimaryButton' && node.props.children === 'Refresh booking');
    await refresh.props.onPress();
    assert.equal(result.refreshes(), 1);
  }
  assert.equal(render().nodes.some((node) => node.type === 'Text' && /status may have changed/.test(node.props.children)), false);
});

test('focusing Book refreshes the authenticated owner even before an active booking has loaded', () => {
  const result = render({ bookings: [] }, { focused: true });
  assert.equal(result.tree, null);
  assert.equal(result.refreshes(), 1);
  result.rerender({ refreshing: true, profile: { id: 'isolated-customer' }, bookings: [booking('NEW')] });
  assert.ok(result.tree);
  result.rerender({ refreshing: false, offline: true, connectionError: 'Offline' });
  assert.equal(result.refreshes(), 1, 'account updates must not restart the focus effect');
  assert.equal(result.subscriptions(), 1);
  result.focus();
  assert.equal(result.refreshes(), 1);
  result.blur();
  assert.equal(result.subscriptions(), 0);
  result.focus();
  assert.equal(result.refreshes(), 2);
  assert.equal(result.subscriptions(), 1);
});

test('guests and incomplete sessions never request bookings, and sign-out removes the focus listener', () => {
  for (const fields of [{ token: null }, { profile: null }, { loading: true }]) {
    const result = render(fields, { focused: true });
    result.appState('background');
    result.appState('active');
    assert.equal(result.refreshes(), 0);
    assert.equal(result.subscriptions(), 0);
  }
  const result = render({ loading: true }, { focused: true });
  result.rerender({ loading: false });
  assert.equal(result.refreshes(), 1);
  result.rerender({ token: null, profile: null });
  assert.equal(result.subscriptions(), 0);
  result.appState('background');
  result.appState('active');
  assert.equal(result.refreshes(), 1);
});

test('returning from the background refreshes only while Book is focused', () => {
  const result = render({}, { focused: true });
  result.appState('inactive');
  result.appState('background');
  result.appState('active');
  result.appState('active');
  assert.equal(result.refreshes(), 2);
  result.blur();
  result.appState('background');
  result.appState('active');
  assert.equal(result.refreshes(), 2);
  result.focus();
  assert.equal(result.refreshes(), 3);

  const background = render({}, { focused: true, appState: 'background' });
  assert.equal(background.refreshes(), 0);
  background.appState('active');
  assert.equal(background.refreshes(), 1);
});
