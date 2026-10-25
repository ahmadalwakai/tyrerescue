/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const settle = async () => { for (let index = 0; index < 24; index++) await Promise.resolve(); };
function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function timers() {
  let now = 0; let sequence = 0;
  const pending = new Map();
  return {
    setTimeout(callback, delay) { const id = ++sequence; pending.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id) { pending.delete(id); },
    async advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const next = [...pending].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; pending.delete(next[0]); next[1].callback(); await settle();
      }
      now = end; await settle();
    },
  };
}
function load(relative, dependencies = {}, globals = {}) {
  const filename = path.join(__dirname, '../src', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { Error, Date, Intl, ...globals }, { filename })((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected isolated dependency: ${name}`);
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
      return [r.hooks[index].value, (value) => { r.hooks[index].value = typeof value === 'function' ? value(r.hooks[index].value) : value; }];
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
      read(props) { rendering = r; r.cursor = 0; r.effects = []; const tree = component(props); r.effects.forEach((effect) => effect()); return tree; },
      unmount() { r.hooks.forEach((hook) => hook?.cleanup?.()); },
    };
  }
  return { react, renderer };
}
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (Array.isArray(tree)) return tree.map((child) => find(child, predicate)).find(Boolean);
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}
function failure(name, message) { const error = new Error(message); error.name = name; return error; }

function controllerHarness() {
  const h = hooks(); const clock = timers();
  const id = 'pi_Recovery123';
  const listeners = new Set();
  const state = {
    payCalls: 0, prepareCalls: 0, attempts: [], checks: [], confirms: [], cancellations: 0, activity: [], nativeOpen: false,
    prepare: async () => {}, pay: async () => {}, confirm: async () => {},
    check: async () => ({ paymentIntentId: id, status: 'succeeded', canResume: false }),
    attempt: async () => {}, cancel: async () => {},
  };
  const prepare = async () => { state.prepareCalls++; return state.prepare(); };
  const pay = async () => { state.payCalls++; return state.pay(); };
  const isPresenting = () => state.nativeOpen;
  const node = (type, props) => ({ type, props });
  const safety = load('booking-safety.ts', { './types': load('types.ts') }, clock);
  const { CustomerPaymentControl } = load('customer-payment-control.native.tsx', {
    react: h.react, 'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    'react-native': { View: 'View', AppState: { currentState: 'active', addEventListener(_event, callback) { listeners.add(callback); return { remove: () => listeners.delete(callback) }; } } },
    './ui': { InlineNotice: 'InlineNotice', LoadingState: 'LoadingState', PrimaryButton: 'PrimaryButton' },
    './booking-safety': safety,
    './use-customer-payment': { extractPaymentIntentId: (secret) => secret.split('_secret_')[0], useCustomerPayment: () => ({ prepare, pay, isPresenting }) },
  }, clock);
  const props = {
    amountLabel: '£120.00', clientSecret: `${id}_secret_isolated`,
    onPaid: async (value) => { state.confirms.push(value); return state.confirm(value); },
    onPaymentAttempt: async (value) => { state.attempts.push(value); return state.attempt(value); },
    onPaymentCancelled: async () => { state.cancellations++; return state.cancel(); },
    onPaymentActivity: (active) => state.activity.push(active),
    onCheckPaymentStatus: async (value) => { state.checks.push(value); return state.check(value); },
  };
  const renderer = h.renderer(CustomerPaymentControl);
  const read = () => renderer.read(props);
  return {
    state, props, id, read, clock,
    ready: async () => { read(); await settle(); return read(); },
    button: (label) => find(read(), (item) => item.type === 'PrimaryButton' && (!label ? item.props.icon === 'lock' : item.props.children === label)),
    emit: (next) => listeners.forEach((callback) => callback(next)),
    unmount: () => renderer.unmount(),
  };
}

test('native setup failures expose a bounded retry, and repeated retry taps initialise only once', async () => {
  const h = controllerHarness();
  h.state.prepare = async () => { throw new Error('Synthetic setup offline'); };
  await h.ready();
  assert.equal(h.button().props.disabled, true);
  assert.match(JSON.stringify(h.read()), /Synthetic setup offline/);
  const prepare = deferred(); h.state.prepare = () => prepare.promise;
  const retry = h.button('Retry payment setup');
  retry.props.onPress(); retry.props.onPress();
  assert.equal(h.state.prepareCalls, 2);
  prepare.resolve(); await settle();
  assert.equal(h.button().props.disabled, false);
  assert.equal(h.state.payCalls, 0);
  h.unmount();
});

test('native setup timeout unlocks setup retry; a late previous setup cannot mark a newer setup ready', async () => {
  const h = controllerHarness(); const old = deferred(); h.state.prepare = () => old.promise;
  await h.ready(); await h.clock.advance(30_000);
  assert.match(JSON.stringify(h.read()), /Preparing payment timed out/);
  const next = deferred(); h.state.prepare = () => next.promise;
  h.button('Retry payment setup').props.onPress();
  old.resolve(); await settle();
  assert.equal(h.button().props.disabled, true);
  next.resolve(); await settle();
  assert.equal(h.button().props.disabled, false);
  h.unmount();
});

test('native cancellation retains its durable attempt until the server verifies the same intent is unpaid', async () => {
  const h = controllerHarness(); await h.ready();
  h.state.pay = async () => { throw failure('PaymentCancelled', 'Synthetic customer cancellation'); };
  const check = deferred(); h.state.check = () => check.promise;
  const pending = h.button().props.onPress(); await settle();
  assert.deepEqual(h.state.checks, [h.id]);
  assert.equal(h.state.cancellations, 0);
  assert.equal(h.button().props.loading, true);
  check.resolve({ paymentIntentId: h.id, status: 'requires_payment_method', canResume: true });
  await pending;
  assert.equal(h.state.cancellations, 1);
  assert.equal(h.state.confirms.length, 0);
  assert.equal(h.button().props.children, 'Retry payment');
  assert.match(JSON.stringify(h.read()), /Payment cancelled/);
  h.unmount();
});

test('native Failed and Timeout errors offer retry of the same server-approved intent while retaining durable proof', async () => {
  for (const name of ['PaymentFailed', 'PaymentTimedOut']) {
    const h = controllerHarness(); await h.ready();
    h.state.pay = async () => { throw failure(name, `Synthetic ${name}`); };
    h.state.check = async () => ({ paymentIntentId: h.id, status: 'requires_payment_method', canResume: true });
    await h.button().props.onPress();
    assert.equal(h.state.cancellations, 0);
    assert.equal(h.button().props.children, 'Retry payment');
    assert.match(JSON.stringify(h.read()), /Our server confirmed this payment can be retried/);
    const feedback = find(h.read(), (item) => item.type === 'InlineNotice' && item.props.tone === 'danger').props.children;
    assert.match(feedback, name === 'PaymentFailed' ? /^Payment failed\./ : /^Payment timed out\./);
    h.state.pay = async () => {};
    await h.button().props.onPress();
    assert.deepEqual(h.state.attempts, [h.id, h.id]);
    assert.deepEqual(h.state.confirms, [h.id]);
    h.unmount();
  }
});

test('a cancelled bank action awaiting authentication preserves the durable intent', async () => {
  const h = controllerHarness(); await h.ready();
  h.state.pay = async () => { throw failure('PaymentCancelled', 'Synthetic bank cancellation'); };
  h.state.check = async () => ({ paymentIntentId: h.id, status: 'requires_action', canResume: true });
  await h.button().props.onPress();
  assert.equal(h.state.cancellations, 0);
  assert.equal(h.button().props.children, 'Retry payment');
  h.unmount();
});

test('unknown and processing bank results only recheck the same payment and never reopen Stripe', async () => {
  const h = controllerHarness(); await h.ready();
  h.state.pay = async () => { throw failure('PaymentUnknown', 'Synthetic lost bank return'); };
  h.state.check = async () => ({ paymentIntentId: h.id, status: 'processing', canResume: false });
  await h.button().props.onPress(); await h.button().props.onPress();
  assert.equal(h.state.payCalls, 1);
  assert.equal(h.state.cancellations, 0);
  assert.equal(h.state.confirms.length, 0);
  assert.match(JSON.stringify(h.read()), /bank is still processing/);
  assert.equal(h.button().props.children, 'Check booking confirmation');
  h.state.check = async () => ({ paymentIntentId: h.id, status: 'succeeded', canResume: false });
  await h.button().props.onPress();
  assert.deepEqual(h.state.confirms, [h.id]);
  assert.equal(h.state.payCalls, 1);
  h.unmount();
});

test('an SDK failure with a server processing result does not claim the payment failed', async () => {
  const h = controllerHarness(); await h.ready();
  h.state.pay = async () => { throw failure('PaymentFailed', 'Synthetic bank result not returned'); };
  h.state.check = async () => ({ paymentIntentId: h.id, status: 'processing', canResume: false });
  await h.button().props.onPress();
  const feedback = find(h.read(), (item) => item.type === 'InlineNotice' && item.props.tone === 'danger').props.children;
  assert.doesNotMatch(feedback, /^Payment failed\./);
  assert.match(feedback, /bank is still processing/);
  assert.equal(h.button().props.children, 'Check booking confirmation');
  assert.equal(h.state.cancellations, 0);
  h.unmount();
});

test('a status timeout or mismatched intent cannot unlock a new payment', async () => {
  const h = controllerHarness(); await h.ready();
  h.state.pay = async () => { throw failure('PaymentTimedOut', 'Synthetic bank timeout'); };
  const check = deferred(); h.state.check = () => check.promise;
  const pending = h.button().props.onPress(); await settle();
  await h.clock.advance(25_000); await pending;
  assert.equal(h.button().props.loading, false);
  assert.match(JSON.stringify(h.read()), /Payment status could not be checked/);
  check.resolve({ paymentIntentId: h.id, status: 'requires_payment_method', canResume: true }); await settle();
  assert.equal(h.button().props.children, 'Check booking confirmation');
  h.state.check = async () => ({ paymentIntentId: 'pi_Other', status: 'requires_payment_method', canResume: true });
  await h.button().props.onPress();
  assert.equal(h.state.payCalls, 1);
  assert.equal(h.state.cancellations, 0);
  assert.match(JSON.stringify(h.read()), /needs review by our team/);
  h.unmount();
});

test('foreground resume checks an unresolved intent without reopening payment or trusting the return URL', async () => {
  const h = controllerHarness(); await h.ready();
  h.state.pay = async () => { throw failure('PaymentUnknown', 'Synthetic missing SDK callback'); };
  h.state.check = async () => ({ paymentIntentId: h.id, status: 'processing', canResume: false });
  await h.button().props.onPress();
  h.state.check = async () => ({ paymentIntentId: h.id, status: 'succeeded', canResume: false });
  h.emit('background'); h.emit('active'); await settle();
  assert.deepEqual(h.state.checks, [h.id, h.id]);
  assert.deepEqual(h.state.confirms, [h.id]);
  assert.equal(h.state.payCalls, 1);
  h.unmount();
});

test('double taps, foreground events and late SDK completion cannot duplicate confirmation or mutate an unmounted control', async () => {
  const h = controllerHarness(); await h.ready(); const sdk = deferred(); h.state.pay = () => sdk.promise;
  const confirm = h.button().props.onPress;
  const first = confirm(); const duplicate = confirm(); await settle();
  h.emit('background'); h.emit('active');
  assert.equal(h.state.payCalls, 1);
  assert.equal(h.state.checks.length, 0);
  h.unmount(); sdk.resolve(); await first; await duplicate;
  assert.equal(h.state.confirms.length, 0);
  assert.deepEqual(h.state.activity, [true, false]);
});

test('a native sheet still open after an uncertain result blocks retry even if the server reports resumable', async () => {
  const h = controllerHarness(); await h.ready();
  h.state.nativeOpen = true;
  h.state.pay = async () => { throw failure('PaymentUnknown', 'Synthetic bridge watchdog'); };
  h.state.check = async () => ({ paymentIntentId: h.id, status: 'requires_payment_method', canResume: true });
  await h.button().props.onPress(); await h.button().props.onPress();
  assert.equal(h.state.payCalls, 1);
  assert.equal(h.state.prepareCalls, 1);
  assert.equal(h.state.cancellations, 0);
  assert.equal(h.button().props.children, 'Check booking confirmation');
  h.state.nativeOpen = false;
  await h.button().props.onPress();
  assert.equal(h.button().props.children, 'Retry payment');
  h.unmount();
});

function hookHarness() {
  const clock = timers();
  const state = { presentCalls: [], present: async () => ({}), initCalls: 0 };
  const sdk = {
    initPaymentSheet: async () => { state.initCalls++; return {}; },
    presentPaymentSheet: async (options) => { state.presentCalls.push(options); return state.present(); },
  };
  const module = load('use-customer-payment.native.ts', {
    react: { useCallback: (callback) => callback }, 'react-native': { Platform: { OS: 'ios' } },
    '@stripe/stripe-react-native': { useStripe: () => sdk },
    './config': { APPLE_MERCHANT_ID: undefined, STRIPE_PUBLISHABLE_KEY: 'pk_test_isolated' },
  }, { ...clock, __DEV__: true });
  return { state, clock, module, payment: module.useCustomerPayment() };
}

test('Stripe native presentation receives a finite native timeout and preserves SDK failure categories', async () => {
  for (const [code, name] of [['Canceled', 'PaymentCancelled'], ['Failed', 'PaymentFailed'], ['Timeout', 'PaymentTimedOut']]) {
    const h = hookHarness(); h.state.present = async () => ({ error: { code, message: `Synthetic ${code}` } });
    await assert.rejects(h.payment.pay(), { name, message: `Synthetic ${code}` });
    assert.equal(h.state.presentCalls[0].timeout, 120_000);
    assert.equal(h.payment.isPresenting(), false);
  }
});

test('the JS watchdog preserves the global native lock across hook remounts until the late native result arrives', async () => {
  const h = hookHarness(); const native = deferred(); h.state.present = () => native.promise;
  const result = h.payment.pay(); const rejected = assert.rejects(result, { name: 'PaymentUnknown' });
  await settle(); await h.clock.advance(135_000); await rejected;
  const remounted = h.module.useCustomerPayment();
  assert.equal(remounted.isPresenting(), true);
  await assert.rejects(remounted.pay(), /previous payment window is still open/);
  await assert.rejects(remounted.prepare('pi_Isolated_secret_existing'), /previous payment window is still open/);
  assert.equal(h.state.presentCalls.length, 1);
  assert.equal(h.state.initCalls, 0);
  native.resolve({}); await settle();
  assert.equal(remounted.isPresenting(), false);
  h.state.present = async () => ({});
  await remounted.prepare('pi_Isolated_secret_existing'); await remounted.pay();
  assert.equal(h.state.presentCalls.length, 2);
});
