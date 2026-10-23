const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, dependencies = {}, exported = []) {
  const filename = path.join(__dirname, '../src', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\nObject.assign(exports,{${exported.join(',')}});})`, {
    Error, Date, Intl, URL, AbortController, setTimeout, clearTimeout, setInterval, clearInterval,
  }, { filename })(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function settle() { for (let index = 0; index < 48; index++) await Promise.resolve(); }
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (Array.isArray(tree)) return tree.map(child => find(child, predicate)).find(Boolean);
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}
const paymentId = 'pi_StepIsolated123';
const clientSecret = `${paymentId}_secret_neverNetwork`;
const resumable = (fields = {}) => ({ paymentIntentId: paymentId, status: 'requires_payment_method', canResume: true, clientSecret, amountPence: 15000, currency: 'gbp', ...fields });

function harness(options = {}) {
  let rendering;
  const changed = (before, next) => !before || !next || next.some((value, index) => value !== before[index]);
  const react = {
    useState(initial) { const r = rendering; const index = r.cursor++; if (!r.hooks[index]) r.hooks[index] = { value: typeof initial === 'function' ? initial() : initial }; return [r.hooks[index].value, value => { r.hooks[index].value = typeof value === 'function' ? value(r.hooks[index].value) : value; }]; },
    useRef(initial) { const r = rendering; const index = r.cursor++; return r.hooks[index] ?? (r.hooks[index] = { current: initial }); },
    useMemo(create, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.hooks[index] = { value: create(), deps }; return r.hooks[index].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.effects.push(() => { r.hooks[index]?.cleanup?.(); r.hooks[index] = { deps, cleanup: effect() }; }); },
  };
  const types = load('types.ts');
  const safety = load('booking-safety.ts', { './types': types });
  const events = [];
  const stored = new Map();
  const storage = { beforeWrite: async () => {} };
  const secure = {
    getSecureItem: async key => stored.get(key) ?? null,
    setSecureItem: async (key, value) => { events.push({ type: 'storage-start', key, value }); await storage.beforeWrite(key, value); stored.set(key, value); events.push({ type: 'storage-committed', key, value }); },
    deleteSecureItem: async key => { stored.delete(key); },
  };
  const drafts = load('booking-draft-storage.ts', { './booking-safety': safety, './secure-storage': secure });
  const account = { token: options.guest ? null : 'isolated-account-token' };
  const calls = [];
  const transitions = [];
  const updates = [];
  const navigationLocks = [];
  const network = {
    get: async () => resumable(),
    confirm: async () => ({ status: 'paid', paymentConfirmed: true }),
  };
  const requestJson = async (url, init = {}) => {
    const method = init.method || 'GET';
    const call = { url, method, headers: JSON.parse(JSON.stringify(init.headers || {})), body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call); events.push({ type: 'request', method, url });
    if (method === 'GET' && url.startsWith('/api/mobile/customer/bookings/TYR-STEP-ISOLATED/payment?')) return network.get(call);
    if (method === 'POST' && url === '/isolated/confirm') return network.confirm(call);
    throw new Error('Unexpected endpoint; this fixture must never create or charge a payment');
  };
  const node = (type, props) => ({ type, props });
  const { PaymentStep } = load('booking-screen.tsx', {
    react, 'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    '@expo/vector-icons': { Feather: 'Feather' }, 'expo-clipboard': {}, 'expo-haptics': {}, 'expo-router': {}, 'expo-image-picker': {},
    'react-native': { View: 'View', Text: 'Text', Image: 'Image', Platform: { OS: 'ios' }, Linking: { openURL: async () => {} }, StyleSheet: { create: value => value, hairlineWidth: 1 } },
    'react-native-reanimated': { default: { View: 'AnimatedView' }, FadeIn: { duration: value => value } },
    './api': { API: { confirmBooking: '/isolated/confirm' }, requestJson },
    './booking-helpers': {}, './booking-safety': safety, './booking-draft-storage': drafts, './secure-storage': secure,
    './customer-location-step': {}, './customer-callback': {}, './customer-assisted-help-request': {}, './customer-fitting-choice': {},
    './booking-footer': {}, './use-customer-reduced-motion': {}, './customer-booking-access': {},
    './config': { PHONE_TEL: '01410000000' }, './customer-account': { useCustomerAccount: () => account }, './customer-active-booking': {}, './customer-notifications': {},
    './customer-payment-control': { CustomerPaymentControl: 'CustomerPaymentControl' },
    './customer-payment-recovery': load('customer-payment-recovery.ts'),
    './mapbox': {}, './pulsing-map': {}, './theme': { colors: {}, radii: {}, spacing: {}, typography: {} },
    './ui': Object.fromEntries(['Card', 'InlineNotice', 'LoadingState', 'PrimaryButton', 'Row', 'ScreenHeader'].map(name => [name, name])), './types': types,
  }, ['PaymentStep']);
  const seed = { ...types.initialBookingState, bookingId: 'isolated-booking', refNumber: 'TYR-STEP-ISOLATED', bookingAccessToken: 'isolated-booking-capability', pendingPaymentIntentId: paymentId, ...options.state };
  const serialized = safety.bookingDraft(seed, 'payment');
  stored.set(safety.BOOKING_DRAFT_KEY, serialized);
  const restored = safety.restoreBookingDraft(serialized);
  assert.equal(restored.step, 'payment');
  const props = {
    state: restored.state,
    updateState: next => { updates.push(JSON.parse(JSON.stringify(next))); props.state = { ...props.state, ...next }; },
    goTo: step => transitions.push(step), setNavigationLocked: value => navigationLocks.push(value),
  };
  const r = { cursor: 0, hooks: [], effects: [] };
  let tree;
  const read = () => { rendering = r; r.cursor = 0; r.effects = []; tree = PaymentStep(props); r.effects.forEach(effect => effect()); return tree; };
  return {
    props, network, storage, stored, drafts, safety, calls, transitions, updates, events, navigationLocks, read,
    control: () => find(read(), item => item.type === 'CustomerPaymentControl'),
    button: label => find(read(), item => item.type === 'PrimaryButton' && item.props.children === label),
    text: () => JSON.stringify(read()),
    unmount: () => { r.hooks.forEach(hook => hook?.cleanup?.()); },
  };
}

test('a cold-restored payment retrieves only its authorised intent and persists the same attempt before exposing resume', async () => {
  const statusReply = deferred(); const persistence = deferred();
  const h = harness();
  h.network.get = () => statusReply.promise;
  h.storage.beforeWrite = () => persistence.promise;
  h.read();
  assert.equal(h.props.state.stripeClientSecret, null);
  assert.equal(h.control(), undefined);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].method, 'GET');
  assert.equal(h.calls[0].url, `/api/mobile/customer/bookings/TYR-STEP-ISOLATED/payment?paymentIntentId=${paymentId}`);
  assert.deepEqual(h.calls[0].headers, { Authorization: 'Bearer isolated-account-token', 'X-Booking-Access': 'isolated-booking-capability' });
  statusReply.resolve(resumable()); await settle();
  assert.equal(h.events.filter(event => event.type === 'storage-start').length, 1);
  assert.equal(h.events.filter(event => event.type === 'storage-committed').length, 0);
  assert.equal(h.control(), undefined, 'checkout must wait for durable attempt persistence');
  persistence.resolve(); await settle();
  const control = h.control();
  assert.equal(control.props.clientSecret, clientSecret);
  assert.equal(control.props.amountLabel, '£150.00');
  assert.equal(h.props.state.paymentAttemptIntentId, paymentId);
  assert.equal(h.props.state.pendingPaymentIntentId, null);
  const saved = JSON.parse(h.stored.get(h.safety.BOOKING_DRAFT_KEY));
  assert.equal(saved.state.paymentAttemptIntentId, paymentId);
  assert.equal(saved.state.stripeClientSecret, undefined);
  assert.equal(h.calls.length, 1, 'recovery must not create or confirm a new payment');
  h.unmount();
});

test('a guest recovery uses the saved booking capability without an account token', async () => {
  const h = harness({ guest: true }); h.read(); await settle();
  assert.deepEqual(h.calls[0].headers, { 'X-Booking-Access': 'isolated-booking-capability' });
  assert.ok(h.control());
  h.unmount();
});

test('processing stays pending and checks the same payment without POST confirmation or another checkout', async () => {
  const h = harness();
  h.network.get = async () => resumable({ status: 'processing', canResume: false, clientSecret: undefined });
  h.read(); await settle();
  assert.equal(h.control(), undefined);
  assert.equal(h.props.state.pendingPaymentIntentId, paymentId);
  assert.match(h.text(), /bank is still processing/);
  assert.deepEqual(h.transitions, []);
  assert.equal(h.calls.filter(call => call.method === 'POST').length, 0);
  h.button('Check payment status').props.onPress(); await settle();
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every(call => call.method === 'GET' && call.url.endsWith(`paymentIntentId=${paymentId}`)));
  h.unmount();
});

test('Stripe success still waits for confirmed server evidence before opening Done', async () => {
  const confirmation = deferred();
  const h = harness();
  h.network.get = async () => resumable({ status: 'succeeded', canResume: false, clientSecret: undefined });
  h.network.confirm = () => confirmation.promise;
  h.read(); await settle();
  assert.equal(h.calls.filter(call => call.method === 'POST').length, 1);
  assert.deepEqual(h.calls[1].body, { bookingId: 'TYR-STEP-ISOLATED', paymentIntentId: paymentId });
  assert.deepEqual(h.transitions, []);
  assert.equal(h.control(), undefined);
  confirmation.resolve({ status: 'paid', paymentConfirmed: true, bookingAccessToken: 'updated-capability', invoiceDownloadToken: 'isolated-invoice' });
  await settle();
  assert.deepEqual(h.transitions, ['done']);
  assert.equal(h.props.state.pendingPaymentIntentId, null);
  assert.equal(h.props.state.paymentAttemptIntentId, null);
  assert.equal(h.props.state.invoiceDownloadToken, 'isolated-invoice');
  h.unmount();
});

test('an unconfirmed success response keeps the attempt and retries confirmation of the same payment', async () => {
  const h = harness();
  h.network.get = async () => resumable({ status: 'succeeded', canResume: false, clientSecret: undefined });
  h.network.confirm = async () => ({ status: 'paid', paymentConfirmed: false });
  h.read(); await settle();
  assert.deepEqual(h.transitions, []);
  assert.equal(h.props.state.pendingPaymentIntentId, paymentId);
  assert.match(h.text(), /do not make another payment/);
  h.network.confirm = async () => ({ status: 'paid', paymentConfirmed: true });
  h.button('Check payment status').props.onPress(); await settle();
  assert.deepEqual(h.transitions, ['done']);
  assert.ok(h.calls.filter(call => call.method === 'POST').every(call => call.body.paymentIntentId === paymentId));
  h.unmount();
});

test('mismatched intent, client secret, resumable status and denied scope cannot unlock payment', async () => {
  for (const fields of [{ paymentIntentId: 'pi_Other123' }, { clientSecret: 'pi_Other123_secret_neverNetwork' }, { status: 'processing' }, { status: 'unexpected' }]) {
    const h = harness(); h.network.get = async () => resumable(fields);
    h.read(); await settle();
    assert.equal(h.control(), undefined);
    assert.equal(h.updates.length, 0);
    assert.equal(h.events.filter(event => event.type === 'storage-start').length, 0);
    assert.equal(h.calls.filter(call => call.method === 'POST').length, 0);
    assert.deepEqual(h.transitions, []);
    assert.match(h.text(), /review|safely resume/);
    h.unmount();
  }
  const denied = harness({ guest: true });
  denied.network.get = async () => { throw new Error('Unauthorized booking scope'); };
  denied.read(); await settle();
  assert.equal(denied.control(), undefined);
  assert.match(denied.text(), /Unauthorized booking scope/);
  assert.equal(denied.updates.length, 0);
  assert.equal(denied.calls.length, 1);
  denied.unmount();
});

test('failed durable storage never enables a recovered checkout', async () => {
  const h = harness();
  h.storage.beforeWrite = async () => { throw new Error('Synthetic secure storage unavailable'); };
  h.read(); await settle();
  assert.equal(h.control(), undefined);
  assert.equal(h.props.state.pendingPaymentIntentId, paymentId);
  assert.equal(h.updates.length, 0);
  assert.match(h.text(), /Synthetic secure storage unavailable/);
  h.unmount();
});

test('changing account session while recovery GET is pending ignores its response', async () => {
  const reply = deferred(); const h = harness();
  h.network.get = () => reply.promise;
  h.read();
  h.drafts.invalidateBookingDraftSession();
  reply.resolve(resumable()); await settle();
  assert.equal(h.control(), undefined);
  assert.equal(h.updates.length, 0);
  assert.equal(h.events.filter(event => event.type === 'storage-start').length, 0);
  assert.deepEqual(h.transitions, []);
  assert.equal(h.calls.length, 1);
  h.unmount();
});

test('leaving PaymentStep while recovery GET is pending ignores late success and cannot change navigation', async () => {
  const reply = deferred(); const h = harness();
  h.network.get = () => reply.promise;
  h.read(); h.unmount();
  reply.resolve(resumable({ status: 'succeeded', canResume: false, clientSecret: undefined }));
  await settle();
  assert.equal(h.updates.length, 0);
  assert.equal(h.calls.filter(call => call.method === 'POST').length, 0);
  assert.deepEqual(h.transitions, []);
});
