const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, dependencies = {}, globals = {}) {
  const filename = path.join(__dirname, '..', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { URL, __DEV__: true, ...globals }, { filename })(
    (name) => { if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`); return dependencies[name]; },
    module, module.exports,
  );
  return module.exports;
}

function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function settle() { for (let index = 0; index < 12; index++) await Promise.resolve(); }
const bankUrl = 'tyrerescue://stripe-redirect?payment_intent=pi_Isolated&payment_intent_client_secret=pi_Isolated_secret_never_network';

function harness(options = {}) {
  const listeners = new Set();
  const listenerHistory = [];
  const calls = [];
  const logs = [];
  const effects = [];
  let previousDependencies;
  let cleanup;
  let initialReads = 0;
  let subscriptions = 0;
  const state = { callback: async () => true };
  const handleURLCallback = async (url) => { calls.push(url); return state.callback(url); };
  const jsx = (type, props) => ({ type, props });
  const { CustomerStripeProvider } = load('src/stripe-provider.native.tsx', {
    react: { useEffect: (effect, dependencies) => {
      if (!previousDependencies || dependencies.some((value, index) => value !== previousDependencies[index])) {
        previousDependencies = dependencies;
        effects.push(() => { cleanup?.(); cleanup = effect(); });
      }
    } },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { Linking: {
      getInitialURL: () => { initialReads++; return options.initialPromise || Promise.resolve(options.initialUrl || null); },
      addEventListener: (event, listener) => {
        assert.equal(event, 'url');
        subscriptions++;
        listeners.add(listener);
        listenerHistory.push(listener);
        return { remove: () => listeners.delete(listener) };
      },
    } },
    '@stripe/stripe-react-native': { StripeProvider: 'StripeProvider', useStripe: () => ({ handleURLCallback }) },
    './config': { APPLE_MERCHANT_ID: undefined, STRIPE_PUBLISHABLE_KEY: options.publishableKey ?? 'pk_test_isolated' },
    './customer-payment-redirect': load('src/customer-payment-redirect.ts'),
  }, { __DEV__: options.development ?? true, console: Object.fromEntries(['log', 'warn', 'error', 'info'].map(name => [name, (...args) => logs.push(args)])) });
  let tree;
  function renderNode(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(renderNode); return; }
    if (typeof node.type === 'function') renderNode(node.type(node.props));
    else renderNode(node.props?.children);
  }
  const render = () => {
    tree = CustomerStripeProvider({ children: [{ type: 'Checkout', props: {} }, { type: 'Help', props: {} }] });
    renderNode(tree);
    effects.splice(0).forEach(effect => effect());
    return tree;
  };
  render();
  return {
    state, calls, logs, render, get tree() { return tree; },
    emit: (url) => [...listeners].forEach(listener => listener({ url })),
    emitStale: (url) => listenerHistory.forEach(listener => listener({ url })),
    unmount: () => { cleanup?.(); cleanup = undefined; },
    listeners: () => listeners.size, subscriptions: () => subscriptions, initialReads: () => initialReads,
  };
}

test('the provider keeps array children inside one Stripe child and forwards a cold bank return exactly to the SDK', async () => {
  const h = harness({ initialUrl: bankUrl });
  assert.equal(h.tree.type, 'StripeProvider');
  assert.equal(h.tree.props.children.type, 'Fragment');
  assert.equal(h.tree.props.urlScheme, 'tyrerescue');
  await settle();
  assert.deepEqual(h.calls, [bankUrl]);
  assert.equal(h.listeners(), 1);
  assert.deepEqual(h.logs, []);
  h.unmount();
});

test('warm bank returns are forwarded but unrelated routes and foreign schemes never reach Stripe', async () => {
  const h = harness();
  await settle();
  for (const url of ['otherapp://stripe-redirect', 'https://stripe-redirect', 'tyrerescue://track?ref=ISOLATED', '/stripe-redirect', 'tyrerescue://stripe-redirect/other']) h.emit(url);
  assert.deepEqual(h.calls, []);
  h.emit(bankUrl);
  h.emit('tyrerescue:///stripe-redirect?redirect_status=failed');
  await settle();
  assert.deepEqual(h.calls, [bankUrl, 'tyrerescue:///stripe-redirect?redirect_status=failed']);
  assert.deepEqual(h.logs, []);
  h.unmount();
});

test('concurrent delivery of the same callback is deduplicated without keeping it after completion', async () => {
  const pending = deferred();
  const h = harness();
  h.state.callback = () => pending.promise;
  h.emit(bankUrl); h.emit(bankUrl);
  await settle();
  assert.deepEqual(h.calls, [bankUrl]);
  pending.resolve(true); await settle();
  h.emit(bankUrl); await settle();
  assert.deepEqual(h.calls, [bankUrl, bankUrl]);
  h.unmount();
});

test('stable provider rerenders do not duplicate the listener or re-read the launch URL', async () => {
  const h = harness();
  h.render(); h.render(); await settle();
  assert.equal(h.subscriptions(), 1);
  assert.equal(h.initialReads(), 1);
  assert.equal(h.listeners(), 1);
  h.unmount();
});

test('unmount removes the listener and ignores a late launch URL or already queued native event', async () => {
  const initial = deferred();
  const h = harness({ initialPromise: initial.promise });
  h.unmount();
  initial.resolve(bankUrl);
  h.emitStale(bankUrl);
  await settle();
  assert.equal(h.listeners(), 0);
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.logs, []);
});

test('SDK and launch-URL rejection are contained without logging the client secret or leaving deduplication stuck', async () => {
  const h = harness();
  h.state.callback = async () => { throw new Error('Synthetic SDK rejected ' + bankUrl); };
  h.emit(bankUrl); await settle();
  h.emit(bankUrl); await settle();
  assert.equal(h.calls.length, 2);
  assert.deepEqual(h.logs, []);
  h.unmount();

  const initial = deferred();
  const rejectedLaunch = harness({ initialPromise: initial.promise });
  initial.reject(new Error('Synthetic initial link unavailable'));
  await settle();
  assert.deepEqual(rejectedLaunch.calls, []);
  assert.deepEqual(rejectedLaunch.logs, []);
  rejectedLaunch.unmount();
});

test('an unavailable Stripe key or test key in production creates no callback subscription', async () => {
  for (const options of [{ publishableKey: '' }, { publishableKey: 'invalid' }, { publishableKey: 'pk_test_isolated', development: false }]) {
    const h = harness({ ...options, initialUrl: bankUrl });
    await settle();
    assert.equal(h.tree.type, 'Fragment');
    assert.equal(h.listeners(), 0);
    assert.equal(h.initialReads(), 0);
    assert.deepEqual(h.calls, []);
  }
});
