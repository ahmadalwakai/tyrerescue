const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const node = (type, props) => ({ type, props });
const jsx = { jsx: node, jsxs: node, Fragment: 'Fragment' };
const settle = async () => { for (let index = 0; index < 16; index++) await Promise.resolve(); };
function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (Array.isArray(tree)) return tree.map((child) => find(child, predicate)).find(Boolean);
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}
function load(relative, dependencies = {}, globals = {}, exported = []) {
  const filename = path.join(__dirname, '../src', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\nObject.assign(exports,{${exported.join(',')}});})`, {
    Error, Date, Intl, AbortController, setTimeout, clearTimeout, ...globals,
  }, { filename })((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
function hooks() {
  let rendering;
  const changed = (before, next) => !before || !next || next.some((value, index) => value !== before[index]);
  const react = {
    useState(initial) {
      const r = rendering; const index = r.cursor++;
      if (!r.hooks[index]) r.hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [r.hooks[index].value, (value) => {
        r.hooks[index].value = typeof value === 'function' ? value(r.hooks[index].value) : value;
      }];
    },
    useRef(initial) { const r = rendering; const index = r.cursor++; return r.hooks[index] ?? (r.hooks[index] = { current: initial }); },
    useMemo(create, deps) {
      const r = rendering; const index = r.cursor++;
      if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.hooks[index] = { deps, value: create() };
      return r.hooks[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const r = rendering; const index = r.cursor++;
      if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.effects.push(() => {
        r.hooks[index]?.cleanup?.(); r.hooks[index] = { deps, cleanup: effect() };
      });
    },
  };
  function renderer(component) {
    const r = { cursor: 0, hooks: [], effects: [] };
    return {
      read(props) {
        rendering = r; r.cursor = 0; r.effects = [];
        const tree = component(props); r.effects.forEach((effect) => effect()); return tree;
      },
      unmount() { r.hooks.forEach((hook) => hook?.cleanup?.()); },
    };
  }
  return { react, renderer };
}

function harness(overrides = {}) {
  const h = hooks();
  const types = load('types.ts');
  let now = Date.parse('2026-10-23T10:00:00Z');
  class ClockDate extends Date {
    constructor(value) { super(arguments.length ? value : now); }
    static now() { return now; }
  }
  const timers = new Map(); let timerId = 0;
  const safety = load('booking-safety.ts', { './types': types }, { Date: ClockDate });
  const breakdown = { subtotal: 100, vatAmount: 20, total: 120, lineItems: [{ type: 'repair', label: 'Puncture repair', amount: 100 }] };
  const initial = {
    ...types.initialBookingState,
    bookingType: 'emergency', serviceType: 'repair', fittingLocation: 'mobile',
    lat: 55.86, lng: -4.25, address: 'Synthetic booking address', vehicleReg: 'TEST123',
    tyreSize: { width: '205', aspect: '55', rim: '16' },
    customerName: 'Synthetic Customer', customerEmail: 'customer@example.invalid', customerPhone: '07123 456789',
    quoteId: 'quote-original', quoteExpiresAt: new Date(now + 60_000).toISOString(), breakdown,
    ...overrides,
  };
  const state = {
    requests: [], savedAccess: [],
    quote: async () => ({ quoteId: 'quote-refreshed', expiresAt: new Date(now + 60_000).toISOString(), breakdown }),
    create: async () => ({ bookingId: 'booking-isolated', refNumber: 'TYR-ISOLATED', stripeClientSecret: 'pi_isolated_secret_existing', bookingAccessToken: 'isolated-private-access' }),
  };
  const account = { profile: null, token: null, bookings: [], sessionRevision: 0 };
  const api = { quote: '/isolated/quote', createBooking: '/isolated/create' };
  const components = load('booking-screen.tsx', {
    react: h.react, 'react/jsx-runtime': jsx,
    '@expo/vector-icons': { Feather: 'Feather' },
    'expo-clipboard': {}, 'expo-haptics': { selectionAsync: async () => {} }, 'expo-image-picker': {},
    'expo-router': { useLocalSearchParams: () => ({}), router: { setParams() {} } },
    'react-native': {
      View: 'View', Text: 'Text', Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView',
      KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' }, Linking: {},
      StyleSheet: { create: (value) => value, hairlineWidth: 1 },
    },
    'react-native-reanimated': { default: { View: 'AnimatedView' }, FadeIn: { duration: (value) => value } },
    './api': {
      API: api,
      requestJson: async (url, options) => {
        state.requests.push({ url, body: JSON.parse(options.body), headers: options.headers });
        if (url === api.quote) return state.quote();
        if (url === api.createBooking) return state.create();
        throw new Error(`Unexpected isolated endpoint: ${url}`);
      },
    },
    './booking-helpers': {},
    './booking-safety': { ...safety, restoreBookingDraft: () => ({ state: initial, step: 'quote' }) },
    './booking-draft-storage': { bookingDraftSession: () => 0, saveBookingDraft: async () => {}, clearBookingDraft: async () => {} },
    './secure-storage': { getSecureItem: async () => 'isolated-draft' },
    './customer-location-step': {}, './customer-callback': { CustomerCallbackRequest: 'CustomerCallbackRequest' },
    './customer-assisted-help-request': {}, './customer-fitting-choice': {},
    './booking-footer': { BookingContinueButton: 'BookingContinueButton', BookingFooter: 'BookingFooter', BookingFooterProvider: 'BookingFooterProvider' },
    './use-customer-reduced-motion': { useCustomerReducedMotion: () => true },
    './customer-booking-access': {
      bookingAccessScope: () => 0,
      saveBookingAccess: async (...args) => { state.savedAccess.push(args); },
    },
    './config': {}, './customer-account': { useCustomerAccount: () => account },
    './customer-active-booking': {}, './customer-notifications': {}, './customer-payment-control': {},
    './customer-payment-recovery': load('customer-payment-recovery.ts'),
    './mapbox': {}, './pulsing-map': {}, './theme': { colors: {}, radii: {}, spacing: {}, typography: {} },
    './ui': {
      ScreenHeader: 'ScreenHeader', Card: 'Card', Row: 'Row', TextField: 'TextField', InlineNotice: 'InlineNotice',
      LoadingState: 'LoadingState', PrimaryButton: 'PrimaryButton', Logo: 'Logo', useScreenContentInsets: () => ({}),
    },
    './types': types,
  }, {
    Date: ClockDate,
    setInterval: (callback) => { const id = ++timerId; timers.set(id, callback); return id; },
    clearInterval: (id) => timers.delete(id),
  }, ['CustomerBookingSession', 'QuoteStep', 'CustomerStep', 'PaymentStep', 'DetailsStep', 'ScheduleStep']);

  const session = h.renderer(components.CustomerBookingSession);
  let quote; let customer;
  const read = () => {
    const root = session.read();
    const quoteNode = find(root, (item) => item.type === components.QuoteStep);
    if (!quoteNode) {
      quote?.unmount(); customer?.unmount(); quote = undefined; customer = undefined;
      return { root };
    }
    quote ??= h.renderer(components.QuoteStep);
    const quoteTree = quote.read(quoteNode.props);
    const customerNode = find(quoteTree, (item) => item.type === components.CustomerStep);
    let customerTree;
    if (customerNode) {
      customer ??= h.renderer(components.CustomerStep);
      customerTree = customer.read(customerNode.props);
    } else { customer?.unmount(); customer = undefined; }
    return { root, quote: quoteTree, customer: customerTree, quoteProps: quoteNode.props };
  };
  return {
    state, types, components, read,
    ready: async () => { read(); await settle(); return read(); },
    advance: (milliseconds) => { now += milliseconds; timers.forEach((callback) => callback()); },
    action: () => find(read().customer, (item) => item.type === 'BookingContinueButton'),
    refresh: () => find(read().quote, (item) => item.type === 'PrimaryButton' && item.props.children.trim() === 'Refresh quote'),
    field: (label) => find(read().customer, (item) => item.type === 'TextField' && item.props.label === label),
    requests: (url) => state.requests.filter((item) => item.url === `/isolated/${url}`),
    unmount: () => { customer?.unmount(); quote?.unmount(); session.unmount(); },
  };
}

test('a quote failure cannot create a booking; retry restores the combined price and contact form', async () => {
  const h = harness({ quoteId: null, quoteExpiresAt: null, breakdown: null });
  h.state.quote = async () => { throw new Error('Synthetic quote unavailable'); };
  assert.equal((await h.ready()).quote.type, 'LoadingState');
  await settle();
  let tree = h.read();
  assert.match(JSON.stringify(tree.quote), /Synthetic quote unavailable/);
  assert.equal(tree.customer, undefined);
  assert.equal(h.requests('create').length, 0);
  h.state.quote = async () => ({ quoteId: 'quote-retry', expiresAt: '2026-10-23T10:10:00Z', breakdown: { subtotal: 100, vatAmount: 20, total: 120 } });
  await find(tree.quote, (item) => item.type === 'PrimaryButton' && item.props.children === 'Retry').props.onPress();
  tree = h.read();
  assert.ok(tree.customer);
  assert.equal(h.action().props.disabled, false);
  assert.equal(find(tree.customer, (item) => item.type === 'Row' && item.props.label === 'Total to pay').props.value, '£120.00');
  assert.equal(h.requests('quote').length, 2);
  h.unmount();
});

test('expiry disables confirmation and refresh preserves typed details while obtaining a new price', async () => {
  const h = harness(); await h.ready();
  h.field('Full name').props.onChangeText('Updated Customer');
  h.field('Email').props.onChangeText('new@example.invalid');
  h.advance(60_001);
  assert.equal(h.action().props.disabled, true);
  await h.action().props.onPress();
  assert.equal(h.requests('create').length, 0);
  assert.match(JSON.stringify(h.read().quote), /quote has expired/);
  await h.refresh().props.onPress();
  assert.equal(h.action().props.disabled, false);
  assert.equal(h.field('Full name').props.value, 'Updated Customer');
  assert.equal(h.field('Email').props.value, 'new@example.invalid');
  assert.equal(h.requests('quote').length, 1);
  h.unmount();
});

test('an expired quote is rejected even by a confirmation handler captured before the expiry timer updates', async () => {
  const h = harness(); await h.ready();
  const staleConfirm = h.action().props.onPress;
  h.advance(60_001);
  await staleConfirm();
  assert.equal(h.requests('create').length, 0);
  assert.match(JSON.stringify(h.read().customer), /Quote has expired/);
  h.unmount();
});

test('double confirmation creates one booking, locks navigation and advances directly to secure payment', async () => {
  const h = harness(); await h.ready();
  h.field('Full name').props.onChangeText(' Synthetic Customer ');
  h.field('Email').props.onChangeText(' CUSTOMER@EXAMPLE.INVALID ');
  const create = deferred(); h.state.create = () => create.promise;
  const confirm = h.action().props.onPress;
  const first = confirm(); const duplicate = confirm();
  assert.equal(h.requests('create').length, 1);
  let tree = h.read();
  assert.equal(find(tree.root, (item) => item.props?.backLabel === 'Previous booking step').props.backDisabled, true);
  assert.equal(h.action().props.loading, true);
  create.resolve({ bookingId: 'booking-one', refNumber: 'TYR-ONE', stripeClientSecret: 'pi_one_secret_existing', bookingAccessToken: 'private-one' });
  await first; await duplicate;
  tree = h.read();
  const payment = find(tree.root, (item) => item.type === h.components.PaymentStep);
  assert.ok(payment);
  assert.equal(payment.props.state.refNumber, 'TYR-ONE');
  assert.equal(payment.props.state.stripeClientSecret, 'pi_one_secret_existing');
  assert.equal(payment.props.state.customerName, 'Synthetic Customer');
  assert.equal(payment.props.state.customerEmail, 'customer@example.invalid');
  assert.equal(h.requests('create')[0].body.quoteId, 'quote-original');
  assert.equal(h.state.savedAccess.length, 1);
  h.unmount();
});

test('editing a previous step unmounts the review and keeps contact details when the customer returns', async () => {
  const h = harness(); await h.ready();
  h.field('Full name').props.onChangeText('Kept Customer');
  h.field('Email').props.onChangeText('kept@example.invalid');
  h.field('Phone').props.onChangeText('07999 123456');
  const goTo = h.read().quoteProps.goTo;
  find(h.read().customer, (item) => item.props?.editLabel === 'Edit vehicle or tyres').props.onEdit();
  assert.ok(find(h.read().root, (item) => item.type === h.components.DetailsStep));
  goTo('quote'); h.read();
  assert.equal(h.field('Full name').props.value, 'Kept Customer');
  assert.equal(h.field('Email').props.value, 'kept@example.invalid');
  assert.equal(h.field('Phone').props.value, '07999 123456');
  assert.equal(h.requests('create').length, 0);
  h.unmount();
});

test('a refresh failure prevents using the previous price until retry succeeds', async () => {
  const h = harness(); await h.ready();
  h.state.quote = async () => { throw new Error('Synthetic refresh failed'); };
  await h.refresh().props.onPress();
  assert.equal(h.action().props.disabled, true);
  await h.action().props.onPress();
  assert.equal(h.requests('create').length, 0);
  assert.match(JSON.stringify(h.read().quote), /Synthetic refresh failed/);
  h.state.quote = async () => ({ quoteId: 'quote-second', expiresAt: '2026-10-23T10:10:00Z', breakdown: { subtotal: 150, vatAmount: 30, total: 180 } });
  await find(h.read().quote, (item) => item.type === 'PrimaryButton' && item.props.children === 'Retry').props.onPress();
  assert.equal(h.action().props.disabled, false);
  assert.equal(find(h.read().customer, (item) => item.type === 'Row' && item.props.label === 'Total to pay').props.value, '£180.00');
  h.unmount();
});

test('booking creation blocks both the visible refresh action and a stale refresh handler', async () => {
  const h = harness(); await h.ready();
  const refresh = h.refresh().props.onPress;
  const create = deferred(); h.state.create = () => create.promise;
  const pending = h.action().props.onPress();
  await refresh();
  assert.equal(h.requests('quote').length, 0);
  assert.equal(h.refresh().props.disabled, true);
  create.resolve({ bookingId: 'booking-one', refNumber: 'TYR-ONE', stripeClientSecret: 'pi_one_secret_existing', bookingAccessToken: 'private-one' });
  await pending;
  const payment = find(h.read().root, (item) => item.type === h.components.PaymentStep);
  assert.equal(payment.props.state.quoteId, 'quote-original');
  assert.equal(payment.props.state.breakdown.total, 120);
  h.unmount();
});

test('an in-flight refresh blocks stale confirmation and repeated refresh taps synchronously', async () => {
  const h = harness(); await h.ready();
  const confirm = h.action().props.onPress;
  const refresh = h.refresh().props.onPress;
  const quote = deferred(); h.state.quote = () => quote.promise;
  const pending = refresh(); const duplicate = refresh();
  await confirm();
  assert.equal(h.requests('quote').length, 1);
  assert.equal(h.requests('create').length, 0);
  assert.equal(h.action().props.disabled, true);
  quote.resolve({ quoteId: 'quote-newer', expiresAt: '2026-10-23T10:10:00Z', breakdown: { subtotal: 150, vatAmount: 30, total: 180 } });
  await pending; await duplicate;
  await h.action().props.onPress();
  assert.equal(h.requests('create')[0].body.quoteId, 'quote-newer');
  const payment = find(h.read().root, (item) => item.type === h.components.PaymentStep);
  assert.equal(payment.props.state.breakdown.total, 180);
  h.unmount();
});

test('server slot rejection returns to scheduling and server quote rejection keeps details for a new quote', async () => {
  const slot = harness({ bookingType: 'scheduled', scheduledDate: '2026-10-24', scheduledTime: '11:00' }); await slot.ready();
  slot.state.create = async () => { throw new Error('This appointment slot is no longer available'); };
  await slot.action().props.onPress();
  assert.ok(find(slot.read().root, (item) => item.type === slot.components.ScheduleStep));
  slot.unmount();

  const h = harness(); await h.ready();
  h.field('Full name').props.onChangeText('Kept After Expiry');
  h.state.create = async () => { throw new Error('Quote has expired'); };
  await h.action().props.onPress();
  assert.equal(h.action().props.children, 'Refresh price and keep my details');
  h.action().props.onPress();
  h.read(); await settle(); h.read();
  assert.equal(h.field('Full name').props.value, 'Kept After Expiry');
  assert.equal(h.requests('quote').length, 1);
  assert.match(h.action().props.children, /^Continue to payment · £\d+\.\d{2}$/);
  h.unmount();
});
