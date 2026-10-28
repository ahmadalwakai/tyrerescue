const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/components/AssistedChatScreen.tsx');
const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function nodes(predicate, root = source) {
  const result = [];
  function visit(node) {
    if (predicate(node)) result.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return result;
}

function declaration(name) {
  const matches = nodes((node) => ts.isVariableDeclaration(node) && node.name.getText(source) === name);
  assert.equal(matches.length, 1, `Expected one production declaration of ${name}`);
  return matches[0].initializer;
}

function evaluate(expression, globals = {}) {
  const compiled = ts.transpileModule(`module.exports = (${expression.getText(source)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const element = (type, props, key) => ({ type, props, key });
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    ...globals,
    module,
    exports: module.exports,
    require(name) {
      assert.equal(name, 'react/jsx-runtime');
      return { jsx: element, jsxs: element };
    },
  }, { filename });
  return module.exports;
}

function callback(name, globals) {
  const initializer = declaration(name);
  assert.ok(ts.isCallExpression(initializer));
  return evaluate(initializer.arguments[0], globals);
}

function hookOptions(name, globals) {
  const calls = nodes((node) => ts.isCallExpression(node) && node.expression.getText(source) === name);
  assert.equal(calls.length, 1, `Expected one production ${name} call`);
  return evaluate(calls[0].arguments[0], globals);
}

function loadHelpers(relative) {
  const helperFilename = path.join(__dirname, '../src', relative);
  const compiled = ts.transpileModule(fs.readFileSync(helperFilename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports }, { filename: helperFilename });
  return module.exports;
}

const phoneHelpers = loadHelpers('lib/incoming-phone-call.ts');
const moneyHelpers = loadHelpers('lib/money.ts');
const layers = nodes((node) => ts.isJsxElement(node) && node.openingElement.attributes.properties.some((attribute) => (
  ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'testID'
  && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === 'incoming-call-notification-layer'
)));
assert.equal(layers.length, 1, 'The screen must own one incoming-call notification layer');
const layer = layers[0];

const call = (id = 'one') => ({
  id: `event-${id}`, callId: id, phone: '+447700900123',
  createdAt: '2026-10-28T12:00:00Z', receivedAt: '2026-10-28T12:00:01Z',
});

/** Execute the real parent callbacks and JSX, without mounting unrelated app services. */
function screenHarness(overrides = {}) {
  const state = {
    hydrated: true, activeProjectId: 'tyrerescue', activeStage: 'CUSTOMER',
    operatorModalActive: false, urgentPopupOpen: false, driverJourneys: { visible: false },
    scope: 'tyrerescue:1:1', caller: null, popup: null, dismissedHistory: null,
    pending: null, phone: '', focused: false, history: { status: 'checking', matches: [] },
    draft: { customer: { phone: '', name: 'Existing name', email: '' } },
    updates: [], editingStages: [], synced: false, ...overrides,
  };
  const callerRef = { current: state.caller };
  const phoneRef = { current: state.phone };
  function context() {
    const globals = {
      ...state,
      incomingCaller: state.caller,
      incomingCallerScope: state.scope,
      incomingCallPopup: state.popup,
      dismissedCallerHistoryPopupKey: state.dismissedHistory,
      incomingCallerHistory: state.history,
      incomingCallerRef: callerRef,
      phoneInputRef: phoneRef,
      phoneFocusedRef: { current: state.focused },
      incomingCallHasSavedBooking: Boolean(state.draft.quickBookingId),
      api: { hasAdminToken: true },
      canAutofillIncomingPhone: phoneHelpers.canAutofillIncomingPhone,
      normalizePhoneForWhatsApp: moneyHelpers.normalizePhoneForWhatsApp,
      setIncomingCaller: (value) => { state.caller = value; },
      setIncomingCallPopup: (value) => { state.popup = typeof value === 'function' ? value(state.popup) : value; },
      setDismissedCallerHistoryPopupKey: (value) => { state.dismissedHistory = value; },
      setPendingIncomingCall: (value) => { state.pending = value; },
      setPhoneInput: (value) => { state.phone = value; },
      setPhoneSynced: (value) => { state.synced = value; },
      setEditingStage: (value) => { state.editingStages.push(value); },
      update: (patch) => { state.updates.push(patch); state.draft = { ...state.draft, ...patch }; },
      View: 'View', HeaderIncomingCallPopup: 'HeaderIncomingCallPopup',
      styles: { incomingCallNotificationLayer: {} }, insets: { top: 47, left: 0, right: 0 },
    };
    for (const name of ['activeIncomingCaller', 'incomingCallNoticesVisible', 'incomingCallScreenReady', 'callerHistoryPopupKey']) {
      globals[name] = evaluate(declaration(name), globals);
    }
    for (const name of ['handleDismissIncomingCallPopup', 'handleDismissCallerHistoryPopup', 'handleDismissIncomingCaller', 'handleIncomingCall']) {
      globals[name] = callback(name, globals);
    }
    return globals;
  }
  return {
    state, phoneRef,
    receive(value) { context().handleIncomingCall(value); },
    popups() { return [evaluate(layer, context()).props.children].flat().filter(Boolean); },
    listenOptions() { return hookOptions('useIncomingPhoneCall', context()); },
    historyOptions() { return hookOptions('useIncomingCallerHistory', context()); },
    dismissCaller() { context().handleDismissIncomingCaller(); },
  };
}

function popup(harness, variant = 'call') {
  return harness.popups().find((item) => (item.props.variant ?? 'call') === variant);
}

test('notification layer is fixed outside scrolling and keyboard avoidance, below safe-area insets', () => {
  const ancestors = [];
  for (let parent = layer.parent; parent; parent = parent.parent) {
    if (ts.isJsxElement(parent)) ancestors.push(parent.openingElement.tagName.getText(source));
  }
  assert.ok(ancestors.includes('SafeAreaView'));
  assert.equal(ancestors.includes('ScrollView'), false, 'Scrolling the form must not hide the four-second banners');
  assert.equal(ancestors.includes('KeyboardAvoidingView'), false, 'Keyboard movement must not shift the banner layer');

  const stylesInitializer = declaration('styles');
  const stylesObject = stylesInitializer.arguments[0];
  const namedStyle = (name) => evaluate(stylesObject.properties.find((property) => property.name?.getText(source) === name).initializer);
  const notificationStyle = namedStyle('incomingCallNotificationLayer');
  assert.equal(notificationStyle.position, 'absolute');
  assert.ok(notificationStyle.zIndex > 1, 'Notification layer must paint above the form');
  const tree = evaluate(layer, {
    View: 'View', styles: { incomingCallNotificationLayer: notificationStyle },
    insets: { top: 47, left: 11, right: 13 }, incomingCallPopup: null, activeIncomingCaller: null,
  });
  assert.equal(tree.props.pointerEvents, 'none', 'Brief notices must not intercept booking controls');
  const offsets = tree.props.style[1];
  assert.ok(offsets.top > 47);
  assert.ok(offsets.left >= 11 && offsets.right >= 13);
});

test('history has its own render lifetime after call banner expiry and lookup completion', () => {
  const h = screenHarness(); const incoming = call(); h.receive(incoming);
  assert.equal(h.popups().length, 1);
  assert.equal(popup(h, 'history'), undefined, 'Do not spend the history notice lifetime waiting for its lookup');
  popup(h).props.onDismiss(incoming.callId);
  assert.equal(h.popups().length, 0);
  assert.equal(h.state.caller.call, incoming, 'Call banner expiry must retain customer history context');
  h.state.history = { status: 'found', matches: [{ customer: { name: 'Returning customer' } }] };
  const historyPopup = popup(h, 'history');
  assert.ok(historyPopup, 'Late lookup results still receive an independently mounted history notice');
  assert.equal(historyPopup.props.call, incoming);
  assert.equal(historyPopup.props.history, h.state.history);
  historyPopup.props.onDismiss(incoming.callId);
  assert.equal(h.popups().length, 0);
  assert.equal(h.state.caller.call, incoming, 'History notice expiry must retain the persistent history card');
  h.state.history = { ...h.state.history };
  assert.equal(h.popups().length, 0, 'Lookup rerenders must not reopen a dismissed history notice');
});

test('dismissing history leaves the call banner intact; a new caller gets distinct notice keys', () => {
  const h = screenHarness({ history: { status: 'found', matches: [] } });
  h.receive(call('one'));
  const firstKeys = h.popups().map((item) => item.key);
  popup(h, 'history').props.onDismiss('one');
  assert.ok(popup(h)); assert.equal(popup(h, 'history'), undefined);
  h.receive(call('two'));
  assert.equal(h.popups().length, 2);
  for (const item of h.popups()) assert.equal(firstKeys.includes(item.key), false);
  h.dismissCaller();
  assert.equal(h.popups().length, 0, 'Explicit caller dismissal removes both notices and the persistent context');
});

for (const status of ['not_found', 'unavailable']) {
  test(`a settled ${status} lookup receives the separate history notice`, () => {
    const h = screenHarness(); h.receive(call());
    h.state.history = { status, matches: [] };
    assert.equal(popup(h, 'history').props.history.status, status);
  });
}

test('operator modal and booking alert visibility pauses both notices without remounting them', () => {
  const h = screenHarness({ history: { status: 'found', matches: [] } }); h.receive(call());
  const initialKeys = h.popups().map((item) => item.key);
  for (const [key, value, restore] of [
    ['operatorModalActive', true, false], ['urgentPopupOpen', true, false],
    ['driverJourneys', { visible: true }, { visible: false }],
  ]) {
    h.state[key] = value;
    assert.equal(h.popups().length, 2, 'Paused notices stay mounted to preserve their remaining visible time');
    assert.deepEqual(h.popups().map((item) => item.key), initialKeys);
    assert.ok(h.popups().every((item) => item.props.visible === false));
    h.state[key] = restore;
    assert.deepEqual(h.popups().map((item) => item.key), initialKeys);
    assert.ok(h.popups().every((item) => item.props.visible === true));
  }
});

test('receiving calls outside CUSTOMER preserves the form while populating notices and history lookup', () => {
  for (const activeStage of ['LOCATION', 'TYRE', 'PAYMENT', 'DISPATCHED']) {
    const h = screenHarness({ activeStage }); const incoming = call(activeStage);
    const originalDraft = JSON.stringify(h.state.draft);
    h.receive(incoming);
    assert.equal(h.state.caller.call, incoming);
    assert.equal(popup(h).props.call, incoming);
    assert.equal(h.state.pending, incoming);
    assert.equal(h.historyOptions().enabled, true);
    assert.equal(h.historyOptions().call, incoming);
    assert.equal(JSON.stringify(h.state.draft), originalDraft);
    assert.equal(h.state.phone, ''); assert.equal(h.phoneRef.current, '');
    assert.equal(h.state.updates.length, 0); assert.equal(h.state.editingStages.length, 0);
  }
});

test('broader call listening preserves existing autofill protections and the available empty-form path', () => {
  for (const overrides of [
    { operatorModalActive: true }, { urgentPopupOpen: true }, { driverJourneys: { visible: true } },
    { focused: true }, { phone: '+447700900456', draft: { customer: { phone: '+447700900456' } } },
    { draft: { customer: { phone: '' }, quickBookingId: 'already-saved' } },
  ]) {
    const h = screenHarness(overrides); const originalDraft = JSON.stringify(h.state.draft);
    h.receive(call());
    assert.equal(h.state.updates.length, 0); assert.equal(h.state.editingStages.length, 0);
    assert.equal(JSON.stringify(h.state.draft), originalDraft);
    assert.ok(popup(h), 'Protected drafts still receive incoming-call notices');
  }
  const ready = screenHarness(); const incoming = call(); ready.receive(incoming);
  assert.equal(ready.state.draft.customer.phone, incoming.phone);
  assert.equal(ready.state.draft.customer.name, 'Existing name');
  assert.equal(ready.state.updates.length, 1); assert.equal(ready.state.synced, true);
  assert.equal(ready.state.pending, null);
});

test('listener stays enabled across booking stages and presentation gates, with hydration and project isolation', () => {
  const h = screenHarness();
  for (const activeStage of ['CUSTOMER', 'LOCATION', 'TYRE', 'PAYMENT', 'DISPATCHED']) {
    h.state.activeStage = activeStage;
    h.state.operatorModalActive = true; h.state.urgentPopupOpen = true; h.state.driverJourneys.visible = true;
    assert.equal(h.listenOptions().enabled, true, `${activeStage} must not stop receiving calls`);
  }
  h.state.hydrated = false; assert.equal(h.listenOptions().enabled, false);
  h.state.hydrated = true; h.state.activeProjectId = 'other-project'; assert.equal(h.listenOptions().enabled, false);
  h.state.activeProjectId = null; assert.equal(h.listenOptions().enabled, true);
});

test('switching account or project scope cannot render the previous caller notices', () => {
  const h = screenHarness({ history: { status: 'found', matches: [] } }); h.receive(call());
  assert.equal(h.popups().length, 2);
  h.state.scope = 'tyrerescue:1:2';
  assert.equal(h.popups().length, 0);
  assert.equal(h.historyOptions().call, null);
});
