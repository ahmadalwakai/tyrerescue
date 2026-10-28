const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

function load(relative, dependencies, globals = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, Error, AbortController, ...globals, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return module.exports;
}
const timing = load('lib/booking-schedule.ts', {});
const theme = load('components/theme.ts', {});
const now = Date.now();
const tomorrow = new Date(`${timing.getLondonDateString(new Date(now))}T12:00:00Z`);
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
const date = tomorrow.toISOString().slice(0, 10);
const slot = (extra = {}) => ({ slotId: 'one', date, label: '10:00am - 11:00am', timeStart: '10:00', timeEnd: '11:00', active: true, available: true, spotsLeft: 1, ...extra });
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

function hooks() {
  const values = [];
  let cursor = 0, effects = [];
  return {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!values[index]) values[index] = { value: typeof initial === 'function' ? initial() : initial };
        return [values[index].value, (value) => { values[index].value = typeof value === 'function' ? value(values[index].value) : value; }];
      },
      useEffect(effect, deps) {
        const index = cursor++;
        if (!values[index] || deps.some((value, i) => value !== values[index].deps[i])) {
          effects.push(() => { values[index]?.cleanup?.(); values[index] = { deps, cleanup: effect() }; });
        }
      },
    },
    render(fn) { cursor = 0; effects = []; const result = fn(); effects.forEach((effect) => effect()); return result; },
    unmount() { values.forEach((value) => value.cleanup?.()); },
  };
}
function slotHarness() {
  const h = hooks();
  const state = { authenticated: true, apiRevision: 1, sessionRevision: 1, project: 'tyrerescue', date, enabled: true, requests: [], pending: [] };
  const module = load('hooks/useBookingSlots.ts', {
    react: h.react,
    '@/lib/api': {
      getApiContextRevision: () => state.apiRevision,
      api: {
        get hasAdminToken() { return state.authenticated; },
        get(url, options) { const response = deferred(); state.requests.push({ url, options }); state.pending.push(response); return response.promise; },
      },
    },
    './useAdminSession': { getAdminSessionRevision: () => state.sessionRevision },
  });
  return { state, parse: module.parseBookingSlots, read: () => h.render(() => module.useBookingSlots(state.date, state.enabled, state.project)), unmount: h.unmount };
}

test('availability only exposes active non-full slots for the requested day', () => {
  const h = slotHarness();
  assert.equal(h.parse({ slots: [slot(), slot({ available: false }), slot({ active: false }), slot({ spotsLeft: 0 })] }, date).length, 1);
  for (const value of [{}, { slots: [slot({ date: '2000-01-01' })] }, { slots: [slot({ timeStart: '25:99' })] }]) {
    assert.throws(() => h.parse(value, date));
  }
});

test('slot fetch failure exposes retry and never fabricates availability', async () => {
  const h = slotHarness();
  assert.equal(h.read().loading, true);
  h.state.pending[0].reject(new Error('Network unavailable'));
  await tick();
  assert.equal(h.read().slots.length, 0);
  assert.equal(h.read().error, 'Network unavailable');
  h.read().refresh();
  assert.equal(h.read().loading, true);
  h.state.pending[1].resolve({ slots: [slot()] });
  await tick();
  assert.equal(h.read().slots.length, 1);
  assert.equal(h.read().error, null);
  h.unmount();
});

test('changing date, project or session ignores and aborts earlier slot responses', async () => {
  for (const field of ['date', 'project', 'apiRevision', 'sessionRevision']) {
    const h = slotHarness();
    h.read();
    h.state[field] = field === 'date' ? '2099-01-01' : field === 'project' ? 'other' : 2;
    h.read();
    assert.equal(h.state.requests[0].options.signal.aborted, true);
    h.state.pending[0].resolve({ slots: [slot()] });
    await tick();
    assert.equal(h.read().loading, true);
    assert.equal(h.read().slots.length, 0);
    h.unmount();
    assert.equal(h.state.requests[1].options.signal.aborted, true);
  }
});

test('signed-out and emergency mode do not request appointment data', () => {
  const h = slotHarness();
  h.state.enabled = false;
  h.read();
  h.state.enabled = true;
  h.state.authenticated = false;
  assert.match(h.read().error, /Sign in/);
  assert.equal(h.state.requests.length, 0);
});

function cardHarness(initial = {}) {
  const h = hooks();
  const state = { draft: { bookingType: 'emergency', scheduledAt: null, ...initial }, busy: false, changes: [], slots: { slots: [slot()], loading: false, error: null, refresh() {} } };
  const node = (type, props) => ({ type, props });
  const module = load('components/BookingScheduleCard.tsx', {
    react: h.react, 'react/jsx-runtime': { jsx: node, jsxs: node },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: (value) => value } },
    '@/hooks/useNow': { useNow: () => now }, '@/hooks/useBookingSlots': { useBookingSlots: () => state.slots },
    '@/lib/booking-schedule': timing, './theme': theme,
    './ui': { AppButton: 'AppButton', InlineNotice: 'InlineNotice', SectionCard: 'SectionCard' },
  });
  const read = () => h.render(() => module.BookingScheduleCard({ draft: state.draft, busy: state.busy, projectId: 'tyrerescue', onChange(type, at) {
    state.changes.push({ type, at });
    state.draft = { ...state.draft, ...timing.buildBookingSchedulePatch(state.draft, type, at) };
    return null;
  } }));
  const walk = (tree) => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(walk) : [tree, ...walk(tree.props?.children)];
  const find = (id) => walk(read()).find((item) => item.props?.testID === id);
  const press = (id) => { const item = find(id); assert.ok(item, `Missing ${id}`); if (!item.props.disabled) item.props.onPress?.(); return item; };
  return { state, read, find, press };
}

test('operator explicitly chooses Scheduled then a London slot; selecting a new day clears the old price and time', () => {
  const h = cardHarness();
  h.read();
  assert.equal(h.state.changes.length, 0);
  h.press('booking-type-scheduled');
  assert.equal(h.state.draft.bookingType, 'scheduled');
  assert.equal(h.state.draft.scheduledAt, null);
  h.press(`booking-date-${date}`);
  h.press('booking-slot-one');
  assert.equal(h.state.draft.scheduledAt, timing.londonSlotToIso(date, '10:00'));
  assert.equal(h.find('booking-slot-one').props.accessibilityState.selected, true);
  h.state.draft.quote = { total: 100 };
  h.state.draft.savedQuoteId = 'old-quote';
  h.press(`booking-date-${timing.getLondonDateString(new Date(now))}`);
  assert.equal(h.state.draft.scheduledAt, null);
  assert.equal(h.state.draft.quote, null);
  assert.equal(h.state.draft.savedQuoteId, null);
});

test('switching back to Emergency removes appointment; saved booking and busy actions cannot change timing', () => {
  const h = cardHarness({ bookingType: 'scheduled', scheduledAt: timing.londonSlotToIso(date, '10:00') });
  h.state.busy = true;
  assert.equal(h.press('booking-type-emergency').props.disabled, true);
  assert.equal(h.state.changes.length, 0);
  h.state.busy = false;
  h.press('booking-type-emergency');
  assert.equal(h.state.draft.scheduledAt, null);
  h.state.draft.dispatchedBookingId = 'saved-booking';
  assert.equal(h.press('booking-type-scheduled').props.disabled, true);
  assert.equal(h.state.draft.bookingType, 'emergency');
});

test('empty and failed slot lists show a useful next step without inventing a time', () => {
  const h = cardHarness({ bookingType: 'scheduled' });
  h.state.slots.slots = [];
  assert.match(JSON.stringify(h.read()), /No available times/);
  h.state.slots.error = 'Could not load appointments';
  assert.match(JSON.stringify(h.read()), /Could not load appointments/);
  assert.equal(h.state.changes.length, 0);
});

test('an unverified saved appointment does not present the draft time as confirmed or allow timing edits', () => {
  const h = cardHarness({ bookingType: 'scheduled', scheduledAt: timing.londonSlotToIso(date, '10:00'), bookingTimingNeedsReview: true });
  const output = JSON.stringify(h.read());
  assert.match(output, /Review the saved appointment in Bookings/);
  assert.doesNotMatch(output, /booking-type-|booking-slot-|booking-schedule-summary/);
  assert.equal(h.state.changes.length, 0);
});
