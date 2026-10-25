/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadSource(relative, dependencies = {}, globals = {}) {
  const filename = path.join(__dirname, '../src', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { Error, Date, Intl, setTimeout, clearTimeout, ...globals }, { filename })((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (Array.isArray(tree)) return tree.map(child => find(child, predicate)).find(Boolean);
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}

function harness(platform) {
  let rendering;
  const state = { payCalls: 0, confirmCalls: [], attempts: [], activity: [], cancellations: 0,
    pay: async () => {}, confirm: async () => {}, attempt: async () => {}, submit: async () => ({}),
    paymentStatus: 'succeeded', canResume: false };
  const changed = (before, next) => !before || next.some((value, index) => value !== before[index]);
  const react = {
    useState(initial) { const r = rendering; const index = r.cursor++; if (!r.hooks[index]) r.hooks[index] = { value: typeof initial === 'function' ? initial() : initial }; return [r.hooks[index].value, value => { r.hooks[index].value = typeof value === 'function' ? value(r.hooks[index].value) : value; }]; },
    useRef(initial) { const r = rendering; const index = r.cursor++; return r.hooks[index] ?? (r.hooks[index] = { current: initial }); },
    useMemo(create, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.hooks[index] = { value: create(), deps }; return r.hooks[index].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) { const r = rendering; const index = r.cursor++; if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.effects.push(() => { r.hooks[index]?.cleanup?.(); r.hooks[index] = { deps, cleanup: effect() }; }); },
  };
  const node = (type, props) => ({ type, props });
  const paymentId = 'pi_Component123';
  const pay = async () => { state.payCalls++; const result = await state.pay(); return platform === 'web' ? result ?? { paymentIntent: { id: paymentId, status: 'succeeded' } } : undefined; };
  const prepare = async () => {};
  const stripe = { confirmPayment: pay };
  const elements = { submit: () => state.submit() };
  const safety = loadSource('booking-safety.ts', { './types': loadSource('types.ts') });
  const dependencies = {
    react, 'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    'react-native': { View: 'View', Text: 'Text', StyleSheet: { create: value => value } },
    './ui': { InlineNotice: 'InlineNotice', LoadingState: 'LoadingState', PrimaryButton: 'PrimaryButton' },
    './booking-safety': safety,
    './use-customer-payment': { extractPaymentIntentId: value => value.split('_secret_')[0], useCustomerPayment: () => ({ prepare, pay }) },
    './config': { API_BASE_URL: 'https://isolated.invalid', STRIPE_PUBLISHABLE_KEY: 'pk_test_isolated_never_network' },
    './theme': { colors: {}, radii: {}, typography: {} },
    '@stripe/react-stripe-js': { Elements: 'Elements', PaymentElement: 'PaymentElement', useStripe: () => stripe, useElements: () => elements },
    '@stripe/stripe-js': { loadStripe: () => Promise.resolve({}) },
  };
  const { CustomerPaymentControl } = loadSource(`customer-payment-control.${platform}.tsx`, dependencies, { window: {} });
  const props = {
    clientSecret: `${paymentId}_secret_isolated`, amountLabel: '£150.00', refNumber: 'TYR-ISOLATED',
    onPaid: async id => { state.confirmCalls.push(id); return state.confirm(id); },
    onPaymentAttempt: async id => { state.attempts.push(id); await state.attempt(id); },
    onPaymentCancelled: async () => { state.cancellations++; },
    onPaymentActivity: active => { state.activity.push(active); },
    ...(platform === 'native' ? { onCheckPaymentStatus: async id => ({ paymentIntentId: id, status: state.paymentStatus, canResume: state.canResume }) } : {}),
  };
  function renderer(component) {
    const r = { cursor: 0, hooks: [], effects: [] };
    return { read(value) { r.cursor = 0; r.effects = []; rendering = r; const tree = component(value); r.effects.forEach(effect => effect()); return tree; },
      unmount() { r.hooks.forEach(hook => hook?.cleanup?.()); } };
  }
  const outer = renderer(CustomerPaymentControl);
  let inner;
  const read = () => {
    const tree = outer.read(props);
    if (platform !== 'web') return tree;
    const child = tree.props.children;
    inner ??= renderer(child.type);
    return inner.read(child.props);
  };
  return { state, read, button: () => find(read(), item => item.type === 'PrimaryButton'),
    unmount: () => { inner?.unmount(); outer.unmount(); }, paymentId };
}

for (const platform of ['native', 'web']) {
  test(`${platform}: double taps do not duplicate Stripe or confirmation; activity stays locked through server confirmation`, async () => {
    const h = harness(platform); h.read(); await settle();
    const checkout = deferred(); const confirmation = deferred();
    h.state.pay = () => checkout.promise; h.state.confirm = () => confirmation.promise;
    const button = h.button(); const first = button.props.onPress(); const duplicate = button.props.onPress();
    await settle();
    assert.equal(h.state.payCalls, 1); assert.equal(h.state.attempts.length, 1);
    assert.deepEqual(h.state.activity, [true]);
    checkout.resolve(); await settle();
    assert.deepEqual(h.state.confirmCalls, [h.paymentId]);
    assert.deepEqual(h.state.activity, [true]);
    assert.equal(h.button().props.loading, true);
    confirmation.resolve(); await first; await duplicate;
    assert.deepEqual(h.state.activity, [true, false]);
    h.unmount();
  });

  test(`${platform}: confirmation failure retries the same payment without reopening Stripe`, async () => {
    const h = harness(platform); h.read(); await settle();
    h.state.confirm = async () => { throw new Error('Synthetic server unavailable'); };
    await h.button().props.onPress();
    assert.equal(h.state.payCalls, 1);
    assert.equal(h.button().props.children, 'Check booking confirmation');
    h.state.confirm = async () => {};
    await h.button().props.onPress();
    assert.equal(h.state.payCalls, 1); assert.deepEqual(h.state.confirmCalls, [h.paymentId, h.paymentId]);
    assert.deepEqual(h.state.attempts, [h.paymentId]);
    assert.deepEqual(h.state.activity, [true, false, true, false]);
    h.unmount();
  });

  test(`${platform}: durable attempt persistence finishes before Stripe starts, and a failed save cannot charge`, async () => {
    const h = harness(platform); h.read(); await settle();
    const persistence = deferred(); h.state.attempt = () => persistence.promise;
    const pending = h.button().props.onPress(); await settle();
    assert.equal(h.state.payCalls, 0); assert.deepEqual(h.state.activity, [true]);
    persistence.reject(new Error('Synthetic secure storage unavailable')); await pending;
    assert.equal(h.state.payCalls, 0); assert.equal(h.state.confirmCalls.length, 0);
    assert.deepEqual(h.state.activity, [true, false]);
    assert.match(JSON.stringify(h.read()), /Synthetic secure storage unavailable/);
    h.unmount();
  });
}

test('native: a known cancellation clears the durable attempt without claiming the booking was paid', async () => {
  const h = harness('native'); h.read(); await settle();
  h.state.paymentStatus = 'requires_payment_method'; h.state.canResume = true;
  h.state.pay = async () => { const error = new Error('Cancelled by customer'); error.name = 'PaymentCancelled'; throw error; };
  await h.button().props.onPress();
  assert.equal(h.state.cancellations, 1); assert.equal(h.state.confirmCalls.length, 0);
  assert.equal(h.button().props.children, 'Retry payment');
  assert.deepEqual(h.state.activity, [true, false]);
  h.unmount();
});

for (const platform of ['native', 'web']) {
  test(`${platform}: an uncertain SDK result is checked by the server and retry never opens Stripe again`, async () => {
    const h = harness(platform); h.read(); await settle();
    h.state.pay = async () => { throw new Error('Synthetic transport lost after Stripe'); };
    h.state.confirm = async () => { throw new Error('Still checking the same payment'); };
    await h.button().props.onPress(); await h.button().props.onPress();
    assert.equal(h.state.payCalls, 1); assert.deepEqual(h.state.confirmCalls, [h.paymentId, h.paymentId]);
    assert.equal(h.state.cancellations, 0);
    h.unmount();
  });
}
