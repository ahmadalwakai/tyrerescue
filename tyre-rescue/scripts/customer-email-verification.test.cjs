const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, deferred, settle } = require('../../assisted-chat-app/scripts/chat-modals.test.cjs');

function harness() {
  const state = { calls: 0, refreshes: 0, writes: 0, now: 100_000, timers: [], send: async () => 'Verification email sent.' };
  const hooks = []; let cursor = 0; let effects = [];
  const react = {
    useState(initial) { const index = cursor++; hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [hooks[index].value, value => { state.writes++; hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value; }]; },
    useRef(initial) { return hooks[cursor++] ??= { current: initial }; },
    useEffect(effect, deps) { const index = cursor++; if (!hooks[index] || deps.some((item, i) => item !== hooks[index].deps[i])) effects.push(() => { hooks[index]?.cleanup?.(); hooks[index] = { deps, cleanup: effect() }; }); },
  };
  class CustomerApiError extends Error { constructor(message, status, retryAfterSeconds = null) { super(message); this.status = status; this.retryAfterSeconds = retryAfterSeconds; } }
  class ClockDate extends Date { static now() { return state.now; } }
  const { CustomerEmailVerification } = loadSource('../../tyre-rescue/src/customer-email-verification.tsx', {
    react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { Text: 'Text' }, './api': { CustomerApiError }, './theme': { colors: {} },
    './ui': { Card: 'Card', InlineNotice: 'InlineNotice', PrimaryButton: 'PrimaryButton' },
  }, { Error, Date: ClockDate, setTimeout: callback => { state.timers.push(callback); return callback; }, clearTimeout: () => {} });
  let offline = false;
  function read() { cursor = 0; effects = []; const tree = CustomerEmailVerification({ offline, refreshing: false, resendVerification: async () => { state.calls++; return state.send(); }, refresh: async () => { state.refreshes++; } }); effects.forEach(effect => effect()); return tree; }
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
  const button = label => nodes(read()).find(item => item.type === 'PrimaryButton' && String(item.props.children).includes(label));
  return { state, read, button, CustomerApiError, offline: value => { offline = value; }, unmount: () => hooks.forEach(hook => hook.cleanup?.()) };
}

test('resend prevents double taps, shows success and enforces the cooldown', async () => {
  const h = harness(); const pending = deferred(); h.state.send = () => pending.promise;
  const button = h.button('Resend verification'); button.props.onPress(); button.props.onPress();
  assert.equal(h.state.calls, 1); pending.resolve('Verification email sent.'); await settle();
  assert.match(JSON.stringify(h.read()), /Verification email sent/);
  assert.equal(h.button('Resend available').props.disabled, true);
  h.button('Resend available').props.onPress(); assert.equal(h.state.calls, 1);
  h.state.now += 60_000; h.state.timers.at(-1)();
  assert.equal(h.button('Resend verification').props.disabled, false); h.unmount();
});

test('failure is visible without a success message and offline prevents a send', async () => {
  const h = harness(); h.state.send = async () => { throw new h.CustomerApiError('Could not send.', 503); };
  h.button('Resend verification').props.onPress(); await settle();
  assert.match(JSON.stringify(h.read()), /Could not send/);
  assert.doesNotMatch(JSON.stringify(h.read()), /Verification email sent/);
  h.offline(true); const button = h.button('Resend verification'); assert.equal(button.props.disabled, true);
  button.props.onPress(); assert.equal(h.state.calls, 1);
  h.button('I have verified').props.onPress(); assert.equal(h.state.refreshes, 1); h.unmount();
});

test('rate limits pause resends and a late result cannot update an unmounted account', async () => {
  const h = harness(); h.state.send = async () => { throw new h.CustomerApiError('Too many attempts.', 429); };
  h.button('Resend verification').props.onPress(); await settle();
  assert.equal(h.button('Resend available').props.disabled, true); h.unmount();
  const next = harness(); const pending = deferred(); next.state.send = () => pending.promise;
  next.button('Resend verification').props.onPress(); next.unmount(); const writes = next.state.writes;
  pending.resolve('Late success'); await settle(); assert.equal(next.state.writes, writes);
});

for (const retryAfterSeconds of [37, 3600]) {
  test(`rate-limit countdown honors the server's ${retryAfterSeconds}s interval`, async () => {
    const h = harness();
    h.state.send = async () => { throw new h.CustomerApiError('Too many attempts.', 429, retryAfterSeconds); };
    h.button('Resend verification').props.onPress(); await settle();
    assert.equal(h.button('Resend available').props.children, `Resend available in ${retryAfterSeconds}s`);
    h.state.now += (retryAfterSeconds - 1) * 1000; h.state.timers.at(-1)();
    const waiting = h.button('Resend available');
    assert.equal(waiting.props.children, 'Resend available in 1s');
    assert.equal(waiting.props.disabled, true); waiting.props.onPress(); assert.equal(h.state.calls, 1);
    h.state.now += 1000; h.state.timers.at(-1)();
    const ready = h.button('Resend verification'); assert.equal(ready.props.disabled, false);
    ready.props.onPress(); await settle(); assert.equal(h.state.calls, 2); h.unmount();
  });
}

test('a missing retry interval keeps the fallback cooldown while zero allows an immediate retry', async () => {
  for (const retryAfterSeconds of [null, 0]) {
    const h = harness();
    h.state.send = async () => { throw new h.CustomerApiError('Too many attempts.', 429, retryAfterSeconds); };
    h.button('Resend verification').props.onPress(); await settle();
    if (retryAfterSeconds === null) {
      assert.equal(h.button('Resend available').props.children, 'Resend available in 60s');
      assert.equal(h.button('Resend available').props.disabled, true);
    } else {
      assert.equal(h.button('Resend verification').props.disabled, false);
    }
    h.unmount();
  }
});
