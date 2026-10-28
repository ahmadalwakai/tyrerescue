const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadTs(relative, dependencies = {}, globals = {}) {
  const filename = path.join(__dirname, '..', 'src', relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, globals, { filename })(
    (name) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    }, loaded, loaded.exports,
  );
  return loaded.exports;
}

const returning = loadTs('lib/returning-customer.ts', { './assisted-chat-workflow': {} });
const history = loadTs('lib/incoming-caller-history.ts', { './returning-customer': returning });
const incomingCall = (callId = 'call-1', phone = '+447700900123') => ({
  id: `event-${callId}`, callId, phone,
  createdAt: '2026-10-27T12:00:00.000Z', receivedAt: '2026-10-27T12:00:00.000Z',
});
const match = (key = 'customer-1', overrides = {}) => ({
  key, confidence: 'phone', reasons: ['Same phone number'],
  customer: { name: 'Test Customer', phone: '07700 900123', email: null, accountLinked: false },
  bookingCount: 1,
  bookings: [{
    refNumber: 'TYR-1', createdAt: '2026-10-26T12:00:00.000Z', status: 'completed',
    addressLine: null, lat: null, lng: null, vehicleReg: null, vehicleMake: null, vehicleModel: null,
    tyreSize: null, quantity: null, lockingNutStatus: null, paymentType: null, totalAmount: '123.00',
  }],
  ...overrides,
});

test('only a validated empty successful response means no matching history', () => {
  assert.equal(history.parseIncomingCallerHistory({ matches: [] }, '+447700900123').status, 'not_found');
  for (const invalid of [null, {}, { matches: null }, { matches: [null] }, { matches: [{ key: 'incomplete' }] }]) {
    assert.equal(history.parseIncomingCallerHistory(invalid, '+447700900123').status, 'unavailable');
  }
  assert.equal(history.parseIncomingCallerHistory({ matches: [] }, '+14155550100').status, 'unavailable');
});

test('caller matching requires the exact normalized phone and rejects address matches or malformed details', () => {
  assert.equal(history.parseIncomingCallerHistory({ matches: [match()] }, '+44 7700 900123').status, 'found');
  const invalid = [
    match('other-phone', { customer: { ...match().customer, phone: '+447700900456' } }),
    match('address', { confidence: 'address_tyre' }),
    match('review', { confidence: 'review' }),
    match('bad-booking', { bookings: [{ ...match().bookings[0], createdAt: 'not-a-date' }] }),
    match('bad-count', { bookingCount: 0 }),
    match('bad-customer', { customer: { ...match().customer, name: 42 } }),
  ];
  for (const item of invalid) {
    const result = history.parseIncomingCallerHistory({ matches: [item] }, '+447700900123');
    assert.equal(result.status, 'unavailable');
    assert.equal(result.matches.length, 0);
  }
});

test('separate identities sharing a phone remain separate and duplicate identity keys are invalid', () => {
  const first = match('account-1', { confidence: 'linked_account', customer: { ...match().customer, accountLinked: true } });
  const second = match('guest-2');
  const result = history.parseIncomingCallerHistory({ matches: [first, second] }, '00447700900123');
  assert.equal(result.status, 'found');
  assert.equal(result.matches.length, 2);
  assert.equal(result.matches[0], first);
  assert.equal(result.matches[1], second);
  assert.equal(history.parseIncomingCallerHistory({ matches: [first, first] }, '+447700900123').status, 'unavailable');
});

test('returning status requires a positive booking count and one to five usable history records', () => {
  const booking = match().bookings[0];
  for (const item of [
    match('no-history', { bookingCount: 0, bookings: [] }),
    match('missing-history', { bookingCount: 3, bookings: [] }),
    match('excess-history', { bookingCount: 6, bookings: Array.from({ length: 6 }, () => booking) }),
    match('fractional-count', { bookingCount: 1.5 }),
    match('string-count', { bookingCount: '1' }),
  ]) {
    const result = history.parseIncomingCallerHistory({ matches: [item] }, '+447700900123');
    assert.equal(result.status, 'unavailable');
    assert.equal(result.matches.length, 0);
  }
  const boundedHistory = match('many-bookings', { bookingCount: 50, bookings: Array.from({ length: 5 }, () => booking) });
  assert.equal(history.parseIncomingCallerHistory({ matches: [boundedHistory] }, '+447700900123').status, 'found');
  const matches = Array.from({ length: 20 }, (_, index) => match(`identity-${index}`));
  assert.equal(history.parseIncomingCallerHistory({ matches }, '+447700900123').status, 'found');
  assert.equal(history.parseIncomingCallerHistory({ matches: [...matches, match('identity-21')] }, '+447700900123').status, 'unavailable');
});

function hookHarness(initial = {}) {
  const state = {
    hooks: [], cursor: 0, effects: [], layouts: [], timers: new Map(), nextTimer: 1, now: 0,
    apiRevision: 1, sessionRevision: 1, authenticated: true, requests: [], stateUpdates: 0,
  };
  const changed = (a, b) => !a || !b || a.length !== b.length || b.some((value, i) => value !== a[i]);
  const useEffect = (queue) => (effect, dependencies) => {
    const index = state.cursor++;
    if (!state.hooks[index] || changed(state.hooks[index].dependencies, dependencies)) {
      queue.push(() => {
        state.hooks[index]?.cleanup?.();
        state.hooks[index] = { dependencies, cleanup: effect() };
      });
    }
  };
  const react = {
    useRef(initialValue) {
      const index = state.cursor++;
      if (!state.hooks[index]) state.hooks[index] = { current: initialValue };
      return state.hooks[index];
    },
    useState(initialValue) {
      const index = state.cursor++;
      if (!state.hooks[index]) state.hooks[index] = { value: typeof initialValue === 'function' ? initialValue() : initialValue };
      return [state.hooks[index].value, (value) => {
        state.stateUpdates += 1;
        state.hooks[index].value = typeof value === 'function' ? value(state.hooks[index].value) : value;
      }];
    },
    useCallback(callback, dependencies) {
      const index = state.cursor++;
      if (!state.hooks[index] || changed(state.hooks[index].dependencies, dependencies)) {
        state.hooks[index] = { dependencies, callback };
      }
      return state.hooks[index].callback;
    },
    useEffect: useEffect(state.effects),
    useLayoutEffect: useEffect(state.layouts),
  };
  const api = {
    get hasAdminToken() { return state.authenticated; },
    get(url, options) {
      return new Promise((resolve, reject) => { state.requests.push({ url, options, resolve, reject }); });
    },
  };
  const hook = loadTs('hooks/useIncomingCallerHistory.ts', {
    react,
    '@/lib/api': { api, getApiContextRevision: () => state.apiRevision },
    '@/lib/incoming-caller-history': history,
    '@/lib/returning-customer': returning,
    './useAdminSession': { getAdminSessionRevision: () => state.sessionRevision },
    './useLatestRef': loadTs('hooks/useLatestRef.ts', { react }),
  }, {
    AbortController,
    setTimeout(callback, delay) {
      const id = state.nextTimer++;
      state.timers.set(id, { at: state.now + delay, callback });
      return id;
    },
    clearTimeout(id) { state.timers.delete(id); },
  });
  let options = { call: incomingCall(), enabled: true, scopeKey: 'tyrerescue:session-1', ...initial };
  let result;
  const render = (patch = {}) => {
    options = { ...options, ...patch };
    state.cursor = 0;
    result = hook.useIncomingCallerHistory(options);
    state.layouts.splice(0).forEach((effect) => effect());
    state.effects.splice(0).forEach((effect) => effect());
    return result;
  };
  const advance = (milliseconds) => {
    state.now += milliseconds;
    for (const [id, timer] of [...state.timers]) {
      if (timer.at <= state.now) { state.timers.delete(id); timer.callback(); }
    }
    return render();
  };
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); return render(); };
  const unmount = () => { state.hooks.forEach((item) => item.cleanup?.()); };
  render();
  return { state, render, advance, flush, unmount, get result() { return result; } };
}

test('incoming history starts immediately with only the normalized caller phone and keeps completed results stable', async () => {
  const h = hookHarness();
  assert.equal(h.result.status, 'checking');
  assert.equal(h.state.requests.length, 1, 'no debounce before caller lookup');
  assert.equal(h.state.requests[0].url, '/api/mobile/admin/customers/match?phone=447700900123');
  assert.equal(h.state.requests[0].options.timeoutMs, 3000);
  h.state.requests[0].resolve({ matches: [match()] });
  await h.flush();
  assert.equal(h.result.status, 'found');
  h.render();
  assert.equal(h.state.requests.length, 1);
  assert.equal(h.state.timers.size, 0);
});

test('same-phone calls with new call IDs start a new lookup and ignore the preceding late response', async () => {
  const h = hookHarness();
  const first = h.state.requests[0];
  h.render({ call: incomingCall('call-2') });
  assert.equal(first.options.signal.aborted, true);
  assert.equal(h.result.status, 'checking');
  assert.equal(h.state.requests.length, 2);
  first.resolve({ matches: [match('previous-call')] });
  await h.flush();
  assert.equal(h.result.status, 'checking');
  h.state.requests[1].resolve({ matches: [] });
  await h.flush();
  assert.equal(h.result.status, 'not_found');
});

test('a settled previous caller is hidden immediately when the phone or call changes', async () => {
  const h = hookHarness();
  h.state.requests[0].resolve({ matches: [match()] });
  await h.flush();
  h.render({ call: incomingCall('call-2', '+447700900456') });
  assert.equal(h.result.status, 'checking');
  assert.equal(h.result.matches.length, 0);
  assert.match(h.state.requests[1].url, /phone=447700900456$/);
});

test('API context and administrator changes invalidate responses even before React rerenders', async () => {
  for (const revision of ['apiRevision', 'sessionRevision']) {
    const h = hookHarness();
    const before = h.state.stateUpdates;
    h.state[revision] += 1;
    h.state.requests[0].resolve({ matches: [match('old-context')] });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(h.state.stateUpdates, before);
    h.render();
    assert.equal(h.result.status, 'checking');
    assert.equal(h.result.matches.length, 0);
    assert.equal(h.state.requests.length, 2);
  }
});

test('scope changes and disabled lookup abort old work and never expose the old customer', async () => {
  const h = hookHarness();
  const oldRequest = h.state.requests[0];
  h.render({ scopeKey: 'another-project' });
  assert.equal(oldRequest.options.signal.aborted, true);
  oldRequest.resolve({ matches: [match('old-scope')] });
  await h.flush();
  assert.equal(h.result.status, 'checking');
  const activeRequest = h.state.requests[1];
  h.render({ enabled: false });
  assert.equal(activeRequest.options.signal.aborted, true);
  activeRequest.resolve({ matches: [match('disabled')] });
  await h.flush();
  assert.equal(h.result.status, 'idle');
  assert.equal(h.result.matches.length, 0);
});

test('a three-second deadline reports unavailable, aborts, and cannot overwrite a manual retry', async () => {
  const h = hookHarness();
  const first = h.state.requests[0];
  h.advance(2999);
  assert.equal(h.result.status, 'checking');
  h.advance(1);
  assert.equal(h.result.status, 'unavailable');
  assert.equal(first.options.signal.aborted, true);
  h.result.retry(); h.render();
  assert.equal(h.result.status, 'checking');
  first.resolve({ matches: [match('too-late')] });
  await h.flush();
  assert.equal(h.result.status, 'checking');
  h.state.requests[1].resolve({ matches: [] });
  await h.flush();
  assert.equal(h.result.status, 'not_found');
  assert.equal(h.state.timers.size, 0);
});

test('transport errors and malformed successful data remain unavailable rather than new customer', async () => {
  const h = hookHarness();
  h.state.requests[0].reject(new Error('Offline or endpoint unavailable'));
  await h.flush();
  assert.equal(h.result.status, 'unavailable');
  h.result.retry(); h.render();
  h.state.requests[1].resolve({ matches: [{ key: 'incomplete' }] });
  await h.flush();
  assert.equal(h.result.status, 'unavailable');
});

test('international numbers, missing credentials and no caller make no lookup request', () => {
  const international = hookHarness({ call: incomingCall('international', '+14155550100') });
  assert.equal(international.result.status, 'unavailable');
  assert.equal(international.state.requests.length, 0);
  const empty = hookHarness({ call: null });
  assert.equal(empty.result.status, 'idle');
  assert.equal(empty.state.requests.length, 0);
  empty.state.authenticated = false;
  empty.render({ call: incomingCall() });
  assert.equal(empty.result.status, 'unavailable');
  assert.equal(empty.state.requests.length, 0);
});

test('unmount cancels the deadline and request without accepting a late result', async () => {
  const h = hookHarness();
  const before = h.state.stateUpdates;
  h.unmount();
  assert.equal(h.state.timers.size, 0);
  assert.equal(h.state.requests[0].options.signal.aborted, true);
  h.state.requests[0].resolve({ matches: [match()] });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.state.stateUpdates, before);
});
