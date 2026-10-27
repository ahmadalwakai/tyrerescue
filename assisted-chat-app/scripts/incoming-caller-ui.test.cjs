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
  const loaded = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, globals, { filename })((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}

const call = (id = 'one', phone = '+447700900123') => ({
  id: `event-${id}`, callId: id, phone, createdAt: '2026-10-27T12:00:00Z', receivedAt: '2026-10-27T12:00:01Z',
});
const match = (key = 'one', name = 'Cara Customer') => ({
  key, confidence: 'phone', reasons: ['Same phone number'],
  customer: { name, phone: '+447700900123', email: 'test@example.invalid', accountLinked: false },
  bookingCount: 1,
  bookings: [{ refNumber: `TYR-${key}`, createdAt: '2026-10-20T12:00:00Z', status: 'completed',
    addressLine: '12 High Street', lat: 55.86, lng: -4.25, vehicleReg: 'TEST123', vehicleMake: null,
    vehicleModel: null, tyreSize: '205/55R16', quantity: 2, lockingNutStatus: null,
    paymentType: 'card', totalAmount: '120.50' }],
});
const history = (status, matches = []) => ({ status, matches });

function text(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  return Array.isArray(tree) ? tree.map(text).join(' ') : text(tree.props?.children);
}
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (Array.isArray(tree)) return tree.map((child) => find(child, predicate)).find(Boolean);
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}
function button(tree, label) {
  const result = find(tree, (node) => node.type === 'Pressable' && text(node).replace(/\s+/g, ' ').trim() === label);
  assert.ok(result, `Missing button: ${label}`);
  return result;
}

/** The smallest visible booking container binds its amount to that booking's identity. */
function bookingSummary(tree, refNumber) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (Array.isArray(tree)) return tree.map((child) => bookingSummary(child, refNumber)).find(Boolean);
  return bookingSummary(tree.props?.children, refNumber)
    ?? (tree.type === 'View' && text(tree).replace(/\s+/g, '').includes(`#${refNumber}`) ? tree : undefined);
}

/** Render the real components, including AppButton, with isolated React/native boundaries. */
function harness() {
  let rendering;
  let now = Date.parse('2026-10-27T12:00:02Z');
  let nextTimer = 1;
  const timers = new Map();
  const listeners = new Set();
  const state = { animationStarts: 0, animationStops: 0, reducedMotion: false };
  const changed = (before, next) => !before || !next || next.some((value, index) => value !== before[index]);
  const react = {
    useState(initial) {
      const r = rendering; const index = r.cursor++;
      if (!r.hooks[index]) r.hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [r.hooks[index].value, (next) => {
        r.hooks[index].value = typeof next === 'function' ? next(r.hooks[index].value) : next;
        r.owner.dirty = true;
      }];
    },
    useEffect(effect, deps) {
      const r = rendering; const index = r.cursor++;
      if (!r.hooks[index] || changed(r.hooks[index].deps, deps)) r.owner.effects.push(() => {
        r.hooks[index]?.cleanup?.();
        r.hooks[index] = { deps, cleanup: effect() };
      });
    },
  };
  const timerGlobals = {
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    },
    setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const animation = () => ({ start() { state.animationStarts += 1; }, stop() { state.animationStops += 1; } });
  const native = {
    Animated: { Value: class { setValue() {} interpolate(value) { return value; } }, View: 'Animated.View',
      timing: () => ({}), delay: () => ({}), sequence: animation },
    Easing: { cubic: (v) => v, in: (v) => v, out: (v) => v },
    View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput', ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: (value) => value, absoluteFillObject: {} }, Platform: { OS: 'ios' },
    AppState: { currentState: 'active', addEventListener: (_event, callback) => {
      listeners.add(callback); return { remove: () => listeners.delete(callback) };
    } },
  };
  const element = (type, props, key) => ({ type, props, key });
  const shared = {
    react, 'react/jsx-runtime': { jsx: element, jsxs: element }, 'react-native': native,
    './theme': loadSource('components/theme.ts'),
    './motion': { USE_NATIVE_DRIVER: true, useReducedMotion: () => state.reducedMotion,
      useFadeSlideIn: () => ({}), usePressScale: () => ({ pressScaleStyle: {}, pressIn() {}, pressOut() {} }) },
  };
  const ui = loadSource('components/ui.tsx', shared);
  const returningHelpers = loadSource('lib/returning-customer.ts', { './assisted-chat-workflow': {} });
  const returning = loadSource('components/ReturningCustomerCard.tsx', {
    ...shared, './ui': ui, '@/lib/returning-customer': returningHelpers,
  });
  const { IncomingCallerHistoryCard: Card } = loadSource('components/IncomingCallerHistoryCard.tsx', {
    ...shared, './ui': ui, './ReturningCustomerCard': returning,
  });
  const { HeaderIncomingCallPopup: Popup } = loadSource('components/HeaderIncomingCallPopup.tsx', {
    ...shared, './icons/AppIcon': { AppIcon: 'AppIcon' },
  }, timerGlobals);

  function mount(factory) {
    const owner = { dirty: false, effects: [] };
    let instances = new Map();
    let tree;
    const cleanup = (instance) => { for (const hook of instance.hooks) hook?.cleanup?.(); };
    return {
      read() {
        let passes = 0;
        do {
          assert.ok(passes++ < 20, 'Component render did not settle');
          owner.dirty = false; owner.effects = [];
          const visited = new Map();
          function render(node, location) {
            if (node == null || typeof node !== 'object') return node;
            if (Array.isArray(node)) return node.map((child, index) => render(child, `${location}/${child?.key ?? index}`));
            if (typeof node.type === 'function') {
              const id = `${location}:${node.type.name}:${node.key ?? ''}`;
              const instance = instances.get(id) ?? { hooks: [], owner };
              instance.cursor = 0; visited.set(id, instance); rendering = instance;
              return render(node.type(node.props), `${id}/result`);
            }
            return { ...node, props: { ...node.props, children: render(node.props?.children, `${location}/children`) } };
          }
          tree = render(factory(), 'root');
          for (const [id, instance] of instances) if (!visited.has(id)) cleanup(instance);
          instances = visited;
          for (const effect of owner.effects) effect();
        } while (owner.dirty);
        return tree;
      },
      unmount() { for (const instance of instances.values()) cleanup(instance); instances.clear(); },
    };
  }
  function advance(ms) {
    const end = now + ms;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next; now = timer.at; timers.delete(id); timer.fn();
    }
    now = end;
  }
  return { state, Popup, Card, element, mount, advance, timers, listeners,
    suspend(ms) { now += ms; },
    foreground() { for (const listener of [...listeners]) listener('active'); },
  };
}

for (const [result, label, detail] of [
  [history('checking'), 'Checking customer history…', null],
  [history('found', [match()]), 'Returning customer', 'Cara Customer'],
  [history('found', [match('one', null)]), 'Returning customer', 'Previous bookings with this number'],
  [history('found', [match(), match('two', 'Second Customer')]), 'Returning customer', '2 records · confirm customer'],
  [history('not_found'), 'No previous bookings', null],
  [history('unavailable'), 'History unavailable', null],
]) {
  test(`caller popup accurately renders ${result.status}${detail ? `: ${detail}` : ''}`, () => {
    const h = harness();
    const r = h.mount(() => h.element(h.Popup, { call: call(), history: result, onDismiss() {} }, 'one'));
    const tree = r.read();
    const alert = find(tree, (node) => node.props?.accessibilityRole === 'alert');
    assert.match(text(tree), new RegExp(label));
    assert.ok(alert.props.accessibilityLabel.includes('+447700900123'));
    if (detail) assert.ok(alert.props.accessibilityLabel.includes(detail));
    if (result.matches.length > 1) assert.doesNotMatch(text(tree), /Cara Customer|Second Customer/);
    if (result.status === 'unavailable') assert.doesNotMatch(text(tree), /No previous bookings|new customer/i);
    r.unmount(); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
  });
}

test('a lookup result and changed callback do not extend the popup four-second deadline', () => {
  const h = harness(); const dismissed = [];
  const props = { call: call(), history: history('checking'), onDismiss: (id) => dismissed.push(`old:${id}`) };
  const r = h.mount(() => h.element(h.Popup, props, props.call.callId)); r.read();
  h.advance(2_500); props.history = history('found', [match()]);
  props.onDismiss = (id) => dismissed.push(`current:${id}`); r.read();
  assert.equal(h.state.animationStarts, 1, 'history arrival must not restart the animation');
  h.advance(1_499); assert.deepEqual(dismissed, []);
  h.advance(1); assert.deepEqual(dismissed, ['current:one']);
  r.unmount(); assert.equal(h.listeners.size, 0);
});

test('a new keyed caller cleans up the prior timer and receives its own four seconds', () => {
  const h = harness(); const dismissed = [];
  const props = { call: call('one'), history: history('checking'), onDismiss: (id) => dismissed.push(id) };
  const r = h.mount(() => h.element(h.Popup, props, props.call.callId)); r.read();
  h.advance(3_000); props.call = call('two'); r.read();
  assert.equal(h.timers.size, 1); assert.equal(h.listeners.size, 1); assert.equal(h.state.animationStops, 1);
  h.advance(1_000); assert.deepEqual(dismissed, []);
  h.advance(2_999); assert.deepEqual(dismissed, []);
  h.advance(1); assert.deepEqual(dismissed, ['two']); r.unmount();
});

test('returning from suspended iOS dismisses an expired popup, including Reduce Motion', () => {
  const h = harness(); h.state.reducedMotion = true; const dismissed = [];
  const r = h.mount(() => h.element(h.Popup, { call: call(), history: history('checking'), onDismiss: (id) => dismissed.push(id) }, 'one'));
  r.read(); assert.equal(h.state.animationStarts, 0);
  h.suspend(8_000); h.foreground(); assert.deepEqual(dismissed, ['one']);
  r.unmount(); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});

test('history stays readable after popup expiry, can finish later, and dismisses independently', () => {
  const h = harness(); let popup = true; let card = true; let result = history('checking'); let retries = 0;
  const r = h.mount(() => [
    popup ? h.element(h.Popup, { call: call(), history: result, onDismiss: () => { popup = false; } }, 'popup-one') : null,
    card ? h.element(h.Card, { call: call(), history: result, useDisabledReason: null,
      onUse() {}, onDismiss: () => { card = false; }, onRetry: () => { retries += 1; } }, 'card-one') : null,
  ]);
  r.read(); h.advance(4_000);
  let tree = r.read(); assert.equal(find(tree, (node) => node.props?.accessibilityRole === 'alert'), undefined);
  assert.match(text(tree), /Incoming caller history.*Checking previous bookings/);
  result = history('found', [match()]); tree = r.read();
  assert.match(text(tree), /Cara Customer.*TYR-one/);
  assert.equal(find(tree, (node) => node.props?.accessibilityRole === 'alert'), undefined);
  button(tree, 'Dismiss caller history').props.onPress(); assert.equal(text(r.read()).trim(), '');
  assert.equal(retries, 0); r.unmount();
});

test('a mismatched draft disables the real Use details button while preserving readable history', () => {
  const h = harness(); const used = []; const record = match();
  const props = { call: call(), history: history('found', [record]), useDisabledReason: 'This draft has a different phone number.',
    onUse: (value) => used.push(value), onDismiss() {}, onRetry() {} };
  const r = h.mount(() => h.element(h.Card, props, 'one')); let tree = r.read();
  assert.match(text(tree), /Cara Customer.*This draft has a different phone number/);
  let use = button(tree, 'Use details (empty fields only)');
  assert.equal(use.props.accessibilityState.disabled, true); assert.equal(use.props.onPress, undefined);
  assert.deepEqual(used, []);
  props.useDisabledReason = null; tree = r.read(); use = button(tree, 'Use details (empty fields only)');
  use.props.onPress(); assert.equal(used[0], record); r.unmount();
});

test('multiple history records remain distinct and Use details receives the selected record', () => {
  const h = harness(); const first = match(); const second = match('two', 'Second Customer'); const used = [];
  const r = h.mount(() => h.element(h.Card, { call: call(), history: history('found', [first, second]),
    useDisabledReason: null, onUse: (value) => used.push(value), onDismiss() {}, onRetry() {} }, 'one'));
  let tree = r.read(); button(tree, 'Second Customer · 1').props.onPress(); tree = r.read();
  assert.match(text(tree), /TYR-two/); assert.doesNotMatch(text(tree), /TYR-one/);
  button(tree, 'Use details (empty fields only)').props.onPress(); assert.equal(used[0], second); r.unmount();
});

test('the latest booking price is explicit beside its own date and reference, separate from payment method', () => {
  const h = harness(); const record = match(); record.bookings[0].totalAmount = '1234.50';
  const r = h.mount(() => h.element(h.Card, { call: call(), history: history('found', [record]),
    useDisabledReason: null, onUse() {}, onDismiss() {}, onRetry() {} }, 'one'));
  const summary = bookingSummary(r.read(), 'TYR-one'); assert.ok(summary);
  assert.match(text(summary), /#\s*TYR-one\s*·\s*20 Oct 2026/);
  assert.match(text(summary), /Previous booking price\s*£1,234\.50/);
  const payment = find(summary, (node) => node.type === 'Text' && /^Payment/.test(text(node)));
  assert.ok(payment); assert.match(text(payment), /card/); assert.doesNotMatch(text(payment), /£|1,234/);
  r.unmount();
});

for (const [value, label, expected] of [
  ['0', 'zero', '£0.00'],
  ['0.00', 'decimal zero', '£0.00'],
  [null, 'null', 'Not recorded'],
  [undefined, 'absent', 'Not recorded'],
  ['', 'empty string', 'Not recorded'],
  ['   ', 'whitespace', 'Not recorded'],
  ['not-a-price', 'invalid text', 'Not recorded'],
  ['NaN', 'NaN', 'Not recorded'],
  ['Infinity', 'infinity', 'Not recorded'],
]) {
  test(`previous price renders ${label} as ${expected}`, () => {
    const h = harness(); const record = match();
    if (value === undefined) delete record.bookings[0].totalAmount;
    else record.bookings[0].totalAmount = value;
    const r = h.mount(() => h.element(h.Card, { call: call(), history: history('found', [record]),
      useDisabledReason: null, onUse() {}, onDismiss() {}, onRetry() {} }, 'one'));
    const summary = bookingSummary(r.read(), 'TYR-one'); assert.ok(summary);
    const shown = text(summary).replace(/\s+/g, ' ');
    assert.ok(shown.includes(`Previous booking price ${expected}`), shown);
    if (expected === 'Not recorded') assert.doesNotMatch(shown, /£0\.00/);
    else assert.doesNotMatch(shown, /Not recorded/);
    r.unmount();
  });
}

test('selecting another customer changes the displayed previous price, date and reference together', () => {
  const h = harness(); const first = match(); const second = match('two', 'Second Customer');
  second.bookings[0] = { ...second.bookings[0], totalAmount: '299.75', createdAt: '2026-09-21T12:00:00Z' };
  const r = h.mount(() => h.element(h.Card, { call: call(), history: history('found', [first, second]),
    useDisabledReason: null, onUse() {}, onDismiss() {}, onRetry() {} }, 'one'));
  let tree = r.read(); assert.match(text(bookingSummary(tree, 'TYR-one')), /Previous booking price\s*£120\.50/);
  assert.doesNotMatch(text(tree), /£299\.75/);
  button(tree, 'Second Customer · 1').props.onPress(); tree = r.read();
  const summary = bookingSummary(tree, 'TYR-two'); assert.ok(summary);
  assert.match(text(summary), /#\s*TYR-two\s*·\s*21 Sept 2026/);
  assert.match(text(summary), /Previous booking price\s*£299\.75/);
  assert.equal(bookingSummary(tree, 'TYR-one'), undefined); assert.doesNotMatch(text(tree), /£120\.50/);
  r.unmount();
});

test('expanded earlier bookings keep their own price and date without replacing the latest price', () => {
  const h = harness(); const record = match(); record.bookingCount = 2;
  record.bookings.push({ ...record.bookings[0], refNumber: 'TYR-older', createdAt: '2026-08-01T12:00:00Z', totalAmount: '79.99' });
  const r = h.mount(() => h.element(h.Card, { call: call(), history: history('found', [record]),
    useDisabledReason: null, onUse() {}, onDismiss() {}, onRetry() {} }, 'one'));
  let tree = r.read(); assert.equal(bookingSummary(tree, 'TYR-older'), undefined);
  assert.doesNotMatch(text(tree), /£79\.99/);
  button(tree, 'Show earlier bookings (1)').props.onPress(); tree = r.read();
  const latest = bookingSummary(tree, 'TYR-one'); const older = bookingSummary(tree, 'TYR-older');
  assert.ok(latest); assert.ok(older);
  assert.match(text(latest), /#\s*TYR-one\s*·\s*20 Oct 2026/);
  assert.match(text(latest), /Previous booking price\s*£120\.50/); assert.doesNotMatch(text(latest), /£79\.99/);
  assert.match(text(older), /#\s*TYR-older\s*·\s*1 Aug 2026/);
  assert.match(text(older), /Booking price\s*£79\.99/); assert.doesNotMatch(text(older), /Previous booking price|£120\.50/);
  button(tree, 'Hide earlier bookings').props.onPress(); tree = r.read();
  assert.equal(bookingSummary(tree, 'TYR-older'), undefined); assert.match(text(tree), /£120\.50/);
  r.unmount();
});

test('unavailable history offers Retry without calling the caller new; not-found is explicit', () => {
  const h = harness(); let retries = 0; let dismisses = 0;
  const props = { call: call(), history: history('unavailable'), useDisabledReason: null, onUse() {},
    onRetry: () => { retries += 1; }, onDismiss: () => { dismisses += 1; } };
  const r = h.mount(() => h.element(h.Card, props, 'one')); let tree = r.read();
  assert.match(text(tree), /could not be checked.*has not been marked as a new customer/);
  assert.doesNotMatch(text(tree), /No previous bookings found/);
  button(tree, 'Retry history check').props.onPress(); assert.equal(retries, 1);
  props.history = history('not_found'); tree = r.read();
  assert.match(text(tree), /No previous bookings found for this number/);
  assert.equal(find(tree, (node) => node.type === 'Pressable' && text(node).trim() === 'Retry history check'), undefined);
  button(tree, 'Dismiss caller history').props.onPress(); assert.equal(dismisses, 1); r.unmount();
});

/** Execute production callback bodies so stale callback tests cover their actual guards. */
function screenCallback(name, globals) {
  const filename = path.join(__dirname, '../src/components/AssistedChatScreen.tsx');
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && ts.isCallExpression(node.initializer)) {
      callback = node.initializer.arguments[0];
    }
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(callback, `Missing production callback ${name}`);
  const compiled = ts.transpileModule(`module.exports = ${callback.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} }; vm.runInNewContext(compiled, { ...globals, module }, { filename });
  return module.exports;
}

function screenHarness(phone = '+447700900123') {
  const state = { caller: null, popup: null, pending: null, phone, draft: { customer: { phone, name: 'Typed name', email: '' } },
    apiRevision: 1, sessionRevision: 1, authenticated: true, updates: [] };
  const callerRef = { current: null }; const phoneRef = { current: phone }; const draftRef = { current: state.draft };
  const helpers = loadSource('lib/incoming-phone-call.ts'); const money = loadSource('lib/money.ts');
  function context() {
    return {
      incomingCallerScope: `tyrerescue:${state.apiRevision}:${state.sessionRevision}`,
      incomingCallerRef: callerRef, phoneInputRef: phoneRef, phoneFocusedRef: { current: false }, draftRef,
      draft: state.draft, pendingIncomingCall: state.pending, incomingCallHasSavedBooking: Boolean(state.draft.quickBookingId),
      activeProjectId: 'tyrerescue', incomingCallScreenReady: true, api: { get hasAdminToken() { return state.authenticated; } },
      getApiContextRevision: () => state.apiRevision, getAdminSessionRevision: () => state.sessionRevision,
      canAutofillIncomingPhone: helpers.canAutofillIncomingPhone, normalizePhoneForWhatsApp: money.normalizePhoneForWhatsApp,
      setIncomingCaller: (value) => { state.caller = value; },
      setIncomingCallPopup: (value) => { state.popup = typeof value === 'function' ? value(state.popup) : value; },
      setPendingIncomingCall: (value) => { state.pending = value; },
      setPhoneInput: (value) => { state.phone = value; }, setPhoneSynced() {}, setEditingStage() {},
      update: (patch) => { state.updates.push(patch); state.draft = { ...state.draft, ...patch }; draftRef.current = state.draft; },
    };
  }
  return { state, callerRef, draftRef,
    receive: (value) => screenCallback('handleIncomingCall', context())(value),
    useNumber: () => screenCallback('handleUseIncomingNumber', context()),
    dismiss: () => screenCallback('handleDismissIncomingCaller', context())(),
    expirePopup: (id) => screenCallback('handleDismissIncomingCallPopup', context())(id),
  };
}

test('screen A → B → A replaces caller context and cannot reuse B’s pending number', () => {
  const h = screenHarness(); const a = call('A'); const b = call('B', '+447700900456');
  h.receive(b); const staleUseB = h.useNumber(); assert.equal(h.state.pending.callId, 'B');
  h.receive(a); assert.equal(h.state.caller.call.callId, 'A'); assert.equal(h.state.pending, null);
  staleUseB(); assert.equal(h.state.phone, a.phone); assert.equal(h.state.updates.length, 0);
  h.expirePopup('B'); assert.equal(h.state.popup.callId, 'A');
  h.expirePopup('A'); assert.equal(h.state.popup, null); assert.equal(h.state.caller.call.callId, 'A');
});

test('screen dismissal clears persistent history and rejects an already captured caller-number action', () => {
  const h = screenHarness(); h.receive(call('B', '+447700900456')); const use = h.useNumber();
  h.dismiss(); use();
  assert.equal(h.callerRef.current, null); assert.equal(h.state.caller, null);
  assert.equal(h.state.pending, null); assert.equal(h.state.popup, null); assert.equal(h.state.updates.length, 0);
});

test('screen caller-number actions recheck live session, project and newly saved draft state', () => {
  for (const change of [
    (h) => { h.state.sessionRevision += 1; },
    (h) => { h.state.apiRevision += 1; },
    (h) => { h.state.authenticated = false; },
    (h) => { h.draftRef.current = { ...h.state.draft, quickBookingId: 'saved-after-render' }; },
  ]) {
    const h = screenHarness(); h.receive(call('B', '+447700900456')); const use = h.useNumber();
    change(h); use(); assert.equal(h.state.updates.length, 0);
  }
});
