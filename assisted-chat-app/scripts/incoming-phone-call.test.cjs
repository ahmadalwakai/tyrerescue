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

const helpers = loadTs('lib/incoming-phone-call.ts');
const instant = Date.parse('2026-10-27T12:00:00.000Z');
const iso = (delta = 0) => new Date(instant + delta).toISOString();
const call = (id, delta = -1_000) => ({
  id: `event-${id}`, callId: `call-${id}`, phone: '+447700900123', createdAt: iso(delta), receivedAt: iso(delta),
});
const batch = (cursor, events = []) => ({ enabled: true, cursor, serverTime: iso(), events });

test('a current ringing call fills on first open, then repeated delivery is ignored', () => {
  const feed = new helpers.IncomingPhoneCallFeed();
  assert.equal(feed.accept(batch('c1', [call('one')])).callId, 'call-one');
  assert.equal(feed.accept(batch('c2', [{ ...call('one'), id: 'retry-event' }])), null);
  assert.equal(feed.cursor, 'c2');
});

test('batch selection uses the newest fresh call and remembers every delivered call', () => {
  const feed = new helpers.IncomingPhoneCallFeed();
  assert.equal(feed.accept(batch('c1', [call('newest', -500), call('older', -2_000)])).callId, 'call-newest');
  assert.equal(feed.accept(batch('c2', [call('older', -2_000)])), null);
});

test('server-relative age rejects stale/future calls independently of the iPhone clock', () => {
  const feed = new helpers.IncomingPhoneCallFeed();
  assert.equal(feed.accept(batch('c1', [call('old', -90_001), call('future', 1_000)])), null);
  assert.equal(feed.accept(batch('c2', [call('boundary', -90_000)])).callId, 'call-boundary');
});

test('malformed call numbers and batch shapes are rejected before they reach a booking', () => {
  assert.equal(helpers.parseIncomingPhoneCalls(batch('c1', [{ ...call('x'), phone: 'withheld' }])), null);
  assert.equal(helpers.parseIncomingPhoneCalls(batch('c1', [{ ...call('x'), receivedAt: 'invalid' }])), null);
  assert.equal(helpers.parseIncomingPhoneCalls({ ...batch('c1'), serverTime: null }), null);
  assert.equal(helpers.parseIncomingPhoneCalls(batch('', [])), null);
  assert.equal(helpers.parseIncomingPhoneCalls(batch('c1', Array.from({ length: 51 }, (_, i) => call(i)))), null);
  assert.equal(helpers.parseIncomingPhoneCalls(batch('c1', [call('valid')])).events.length, 1);
});

test('blank booking auto-fills, while manual typing, focus and saved bookings are protected', () => {
  const blank = { phoneInput: '', customerPhone: '', phoneFocused: false, hasSavedBooking: false };
  assert.equal(helpers.canAutofillIncomingPhone(blank), true);
  assert.equal(helpers.canAutofillIncomingPhone({ ...blank, phoneInput: '0' }), false);
  assert.equal(helpers.canAutofillIncomingPhone({ ...blank, customerPhone: '07700900456' }), false);
  assert.equal(helpers.canAutofillIncomingPhone({ ...blank, phoneFocused: true }), false);
  assert.equal(helpers.canAutofillIncomingPhone({ ...blank, hasSavedBooking: true }), false);
});

test('feed reset separates workspaces and the remembered call set remains bounded', () => {
  const feed = new helpers.IncomingPhoneCallFeed();
  for (let i = 0; i < 129; i += 1) feed.accept(batch(`c${i}`, [call(i)]));
  assert.equal(feed.accept(batch('c130', [call(0)])).callId, 'call-0');
  feed.reset();
  assert.equal(feed.cursor, null);
  assert.equal(feed.accept(batch('fresh', [call(128)])).callId, 'call-128');
});

function hookHarness() {
  const state = {
    hooks: [], effects: [], cursor: 0, listeners: [], appState: 'active', apiRevision: 1, sessionRevision: 1,
    authenticated: true, now: instant, calls: [], responses: [], delivered: [], resets: 0, poller: null,
  };
  const changed = (prior, next) => !prior || !next || next.some((v, i) => v !== prior[i]);
  const react = {
    useRef(initial) {
      const index = state.cursor++;
      if (!state.hooks[index]) state.hooks[index] = { current: initial };
      return state.hooks[index];
    },
    useState(initial) {
      const index = state.cursor++;
      if (!state.hooks[index]) state.hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [state.hooks[index].value, (value) => {
        state.hooks[index].value = typeof value === 'function' ? value(state.hooks[index].value) : value;
      }];
    },
    useEffect(effect, dependencies) {
      const index = state.cursor++;
      if (!state.hooks[index] || changed(state.hooks[index].dependencies, dependencies)) {
        state.effects.push(() => {
          state.hooks[index]?.cleanup?.();
          state.hooks[index] = { dependencies, cleanup: effect() };
        });
      }
    },
  };
  class ApiError extends Error {
    constructor(status) { super('Unavailable'); this.status = status; }
  }
  class TestDate extends Date { static now() { return state.now; } }
  const api = {
    get hasAdminToken() { return state.authenticated; },
    async get(url, options) {
      state.calls.push({ url, options });
      const next = state.responses.shift();
      if (typeof next === 'function') return next();
      if (next instanceof Error) throw next;
      return next;
    },
  };
  const hook = loadTs('hooks/useIncomingPhoneCall.ts', {
    react,
    'react-native': {
      Platform: { OS: 'ios' },
      AppState: {
        get currentState() { return state.appState; },
        addEventListener(_, listener) {
          state.listeners.push(listener);
          return { remove() { state.listeners = state.listeners.filter((item) => item !== listener); } };
        },
      },
    },
    '@/lib/api': { api, ApiError, getApiContextRevision: () => state.apiRevision },
    '@/lib/incoming-phone-call': helpers,
    './useAdminSession': { getAdminSessionRevision: () => state.sessionRevision },
    './useLatestRef': { useLatestRef(value) {
      const ref = react.useRef(value);
      react.useEffect(() => { ref.current = value; });
      return ref;
    } },
    './usePolling': { usePolling(task, options) { state.poller = { task, options }; } },
  }, { Date: TestDate });
  let options = {
    enabled: true, projectId: 'tyrerescue',
    onCall: (value) => state.delivered.push(value), onReset: () => { state.resets += 1; },
  };
  const render = (patch = {}) => {
    options = { ...options, ...patch };
    state.cursor = 0;
    hook.useIncomingPhoneCall(options);
    state.effects.splice(0).forEach((effect) => effect());
  };
  const poll = () => state.poller.options.enabled
    ? state.poller.task(new AbortController().signal) : Promise.resolve();
  const appState = (next) => {
    state.appState = next;
    state.listeners.forEach((listener) => listener(next));
    render();
  };
  render();
  return { state, render, poll, appState, ApiError };
}

test('hook delivers API caller ID with cursor polling and no overlapping stale replay', async () => {
  const h = hookHarness();
  h.state.responses.push(batch('cursor-1', [call('one')]), batch('cursor-2', [call('one'), call('two')]));
  await h.poll(); await h.poll();
  assert.equal(h.state.calls[0].url, '/api/mobile/admin/phone/incoming-call');
  assert.equal(h.state.calls[1].url, '/api/mobile/admin/phone/incoming-call?after=cursor-1');
  assert.equal(h.state.delivered.length, 2);
  assert.equal(h.state.poller.options.intervalMs, 1500);
});

test('late response after project/session switching never fills the new booking', async () => {
  const h = hookHarness();
  let finish;
  h.state.responses.push(() => new Promise((resolve) => { finish = resolve; }));
  const pending = h.poll();
  h.state.apiRevision += 1;
  h.state.sessionRevision += 1;
  h.render({ projectId: 'different-project' });
  finish(batch('old-cursor', [call('old-user')]));
  await pending;
  assert.equal(h.state.delivered.length, 0);
  h.state.responses.push(batch('new-cursor', [call('new-user')]));
  await h.poll();
  assert.equal(h.state.calls[1].url, '/api/mobile/admin/phone/incoming-call');
  assert.equal(h.state.delivered[0].callId, 'call-new-user');
});

test('bOnline ringing overlay pauses delivery but retains cursor and catches the active call on return', async () => {
  const h = hookHarness();
  h.state.responses.push(batch('c1'));
  await h.poll();
  let finish;
  h.state.responses.push(() => new Promise((resolve) => { finish = resolve; }));
  const pending = h.poll();
  h.appState('inactive');
  finish(batch('c2', [call('ringing')]));
  await pending;
  assert.equal(h.state.delivered.length, 0);
  await h.poll();
  assert.equal(h.state.calls.length, 2, 'no polling during the call overlay');
  h.appState('active');
  h.state.responses.push(batch('c3', [call('ringing')]));
  await h.poll();
  assert.equal(h.state.calls[2].url, '/api/mobile/admin/phone/incoming-call?after=c1');
  assert.equal(h.state.delivered[0].callId, 'call-ringing');
});

test('manual keystroke in the response event loop blocks automatic overwrite', async () => {
  const h = hookHarness();
  const liveContext = { phoneInput: '', customerPhone: '', phoneFocused: false, hasSavedBooking: false };
  let filled = null;
  h.render({ onCall: (value) => { if (helpers.canAutofillIncomingPhone(liveContext)) filled = value.phone; } });
  let finish;
  h.state.responses.push(() => new Promise((resolve) => { finish = resolve; }));
  const pending = h.poll();
  liveContext.phoneInput = '07'; // Screen updates its ref before React commits.
  finish(batch('c1', [call('typing')]));
  await pending;
  assert.equal(filled, null);
});

test('a backend without the endpoint retries quietly instead of polling every 1.5 seconds', async () => {
  const h = hookHarness();
  h.state.responses.push(new h.ApiError(404));
  await h.poll(); await h.poll();
  assert.equal(h.state.calls.length, 1);
  h.state.now += 30_001;
  h.state.responses.push(batch('ready', [call('one')]));
  await h.poll();
  assert.equal(h.state.calls.length, 2);
  assert.equal(h.state.delivered.length, 1);
});
