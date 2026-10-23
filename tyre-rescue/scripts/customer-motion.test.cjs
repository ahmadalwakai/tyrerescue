const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource, deferred, settle } = require('../../assisted-chat-app/scripts/chat-modals.test.cjs');

function harness() {
  const query = deferred();
  let value;
  let onChange;
  let effect;
  let cleanup;
  let mounted = false;
  let removed = false;
  let updates = 0;
  const { useCustomerReducedMotion } = loadSource('../../tyre-rescue/src/use-customer-reduced-motion.ts', {
    react: {
      useState(initial) { if (!mounted) value = initial; return [value, next => { value = next; updates++; }]; },
      useEffect(callback) { if (!mounted) effect = callback; },
    },
    'react-native': { AccessibilityInfo: {
      addEventListener(event, listener) { assert.equal(event, 'reduceMotionChanged'); onChange = listener; return { remove() { removed = true; } }; },
      isReduceMotionEnabled: () => query.promise,
    } },
  });
  return {
    query,
    read() { const result = useCustomerReducedMotion(); if (!mounted) { mounted = true; cleanup = effect(); } return result; },
    change(enabled) { onChange(enabled); },
    unmount() { cleanup(); },
    get removed() { return removed; },
    get updates() { return updates; },
  };
}

test('motion stays reduced until the system preference is available', async () => {
  const h = harness();
  assert.equal(h.read(), true);
  h.query.resolve(false); await settle();
  assert.equal(h.read(), false);
  h.change(true); assert.equal(h.read(), true);
  h.unmount();
});

test('a live accessibility preference cannot be overwritten by a delayed initial lookup', async () => {
  const h = harness(); h.read(); h.change(true);
  h.query.resolve(false); await settle();
  assert.equal(h.read(), true);
  h.unmount();
});

test('a missing preference keeps the quieter default', async () => {
  const h = harness(); h.read();
  h.query.reject(new Error('Synthetic system preference unavailable')); await settle();
  assert.equal(h.read(), true);
  h.unmount();
});

test('unmount removes the accessibility listener and ignores late callbacks', async () => {
  const h = harness(); h.read(); h.unmount();
  const before = h.updates;
  h.change(false); h.query.resolve(false); await settle();
  assert.equal(h.removed, true);
  assert.equal(h.updates, before);
});

test('web motion listeners stay independent when one of several controls unmounts', () => {
  const listeners = new Set();
  const preference = { matches: false, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  let rendering;
  const { useCustomerReducedMotion } = loadSource('../../tyre-rescue/src/use-customer-reduced-motion.web.ts', {
    react: {
      useState(initial) { const r = rendering; if (!r.mounted) r.value = initial; return [r.value, next => { r.value = next; }]; },
      useEffect(callback) { if (!rendering.mounted) rendering.effect = callback; },
    },
  }, { window: { matchMedia: () => preference } });
  const create = () => ({ mounted: false, value: undefined });
  const read = r => { rendering = r; const value = useCustomerReducedMotion(); if (!r.mounted) { r.mounted = true; r.cleanup = r.effect(); } return value; };
  const first = create(); const second = create();
  read(first); read(second);
  assert.equal(listeners.size, 2); assert.equal(read(second), false);
  first.cleanup();
  for (const listener of listeners) listener({ matches: true });
  assert.equal(read(first), false); assert.equal(read(second), true);
  second.cleanup(); assert.equal(listeners.size, 0);
});
