const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, imports = {}) {
  const filename = path.join(__dirname, '../src', relative);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Date, Intl, AbortController,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name} in ${relative}`);
      return imports[name];
    },
  }, { filename });
  return module.exports;
}

const presentation = load('lib/bonline-call-presentation.ts');

test('outbound destination normalizes UK and international numbers without dial instructions', () => {
  for (const input of ['07700 900123', '+44 (7700) 900123', '00447700900123', '447700900123']) {
    assert.equal(presentation.normalizeBonlineDestination(input), '+447700900123');
  }
  assert.equal(presentation.normalizeBonlineDestination('+353 1 2345678'), '+35312345678');
  for (const input of ['', '999', '112', '+447700900123;123', '*67+447700900123', '07700900123 ext 4', '+44+7700900123', 'not a number']) {
    assert.equal(presentation.normalizeBonlineDestination(input), null, input);
  }
});

test('revenue formatting preserves pence and distinguishes unavailable totals', () => {
  assert.equal(presentation.formatBonlineMoneyPence(12345), '£123.45');
  assert.equal(presentation.formatBonlineMoneyPence(0), '£0.00');
  assert.equal(presentation.formatBonlineMoneyPence(null), '—');
  assert.equal(presentation.formatBonlineMoneyPence(NaN), '—');
  assert.equal(presentation.formatBonlineMoneyPence(1.5), '—');
  assert.equal(presentation.formatBonlineRate(0.33333), '33.3%');
  assert.equal(presentation.formatBonlineRate(0), '0.0%');
  assert.equal(presentation.formatBonlineRate(null), '—');
});

test('call times follow London daylight saving and missing times stay explicit', () => {
  assert.equal(presentation.formatBonlineCallTime('2026-07-01T12:34:00Z'), '1 Jul, 13:34');
  assert.equal(presentation.formatBonlineCallTime('2026-12-01T12:34:00Z'), '1 Dec, 12:34');
  assert.equal(presentation.formatBonlineCallTime(null), 'Time unavailable');
  assert.equal(presentation.formatBonlineCallTime('bad'), 'Time unavailable');
});

function scopeHarness() {
  const auth = { api: 1, session: 1, token: 'test-only-token' };
  const hooks = [];
  let index = 0;
  const react = {
    useCallback: (callback) => callback,
    useRef(value) {
      const slot = index++;
      hooks[slot] ??= { current: value };
      return hooks[slot];
    },
    useLayoutEffect(effect, deps) {
      const slot = index++;
      const previous = hooks[slot];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        previous?.cleanup?.();
        hooks[slot] = { deps, cleanup: effect() };
      }
    },
  };
  const { useBonlineRequestScope } = load('hooks/useBonlineRequestScope.ts', {
    react,
    '@/lib/api': { getApiContextRevision: () => auth.api, getAdminToken: () => auth.token },
    './useAdminSession': { getAdminSessionRevision: () => auth.session },
  });
  return {
    auth,
    render(enabled = true, key = 'caller-a') { index = 0; return useBonlineRequestScope(enabled, key); },
  };
}

test('pending call confirmations cannot act after logout or workspace/session changes', () => {
  for (const field of ['api', 'session', 'token']) {
    const harness = scopeHarness();
    const scope = harness.render();
    const captured = scope.captureScope();
    assert.equal(scope.isCurrent(captured), true);
    harness.auth[field] = field === 'token' ? null : 2;
    assert.equal(scope.isCurrent(captured), false, field);
  }
});

test('closing/reopening the modal and changing destination permanently invalidate a pending confirmation', () => {
  const harness = scopeHarness();
  let scope = harness.render();
  const first = scope.captureScope();
  scope = harness.render(false);
  assert.equal(scope.isCurrent(first), false);
  scope = harness.render(true);
  assert.equal(scope.isCurrent(first), false);
  const next = scope.captureScope();
  scope = harness.render(true, 'caller-b');
  assert.equal(scope.isCurrent(next), false);
  assert.equal(scope.isCurrent(scope.captureScope()), true);
});

test('an unauthenticated component cannot initiate a request', () => {
  const harness = scopeHarness();
  harness.auth.token = null;
  const scope = harness.render();
  assert.equal(scope.isCurrent(scope.captureScope()), false);
});

const { BonlineOutboundIntents } = load('lib/bonline-outbound-intents.ts');
test('uncertain outbound retries preserve their key across component remounts and explicit new-call requests', () => {
  const intents = new BonlineOutboundIntents();
  let keys = 0;
  const createKey = () => `test-key-${++keys}`;
  const first = intents.begin('admin-a', 'customer-a', createKey);
  intents.update('admin-a', 'customer-a', first.idempotencyKey, 'unknown', 'Request timed out');
  assert.equal(intents.get('admin-a', 'customer-a').status, 'unknown');
  assert.equal(intents.begin('admin-a', 'customer-a', createKey, true).idempotencyKey, first.idempotencyKey);
  assert.equal(keys, 1);
  intents.update('admin-a', 'customer-a', first.idempotencyKey, 'accepted', 'Call requested');
  assert.equal(intents.begin('admin-a', 'customer-a', createKey).idempotencyKey, first.idempotencyKey);
  assert.notEqual(intents.begin('admin-a', 'customer-a', createKey, true).idempotencyKey, first.idempotencyKey);
});

test('late outbound responses cannot alter another admin scope or a newer attempt', () => {
  const intents = new BonlineOutboundIntents();
  intents.begin('admin-a', 'customer-a', () => 'old-key');
  intents.begin('admin-b', 'customer-b', () => 'new-key');
  intents.update('admin-a', 'customer-a', 'old-key', 'accepted', 'Old response');
  assert.equal(intents.get('admin-b', 'customer-b').idempotencyKey, 'new-key');
  intents.update('admin-b', 'customer-b', 'other-key', 'accepted', 'Wrong response');
  assert.equal(intents.get('admin-b', 'customer-b').status, 'pending');
});

const element = (type, props) => ({ type, props });
function buttonHarness(options = {}) {
  const state = { current: true, alerts: [], requests: [], ...options };
  const intents = new BonlineOutboundIntents();
  const theme = load('components/theme.ts');
  const resource = { data: options.capability ?? { enabled: true, reason: 'ready', message: 'Available' }, error: null, refresh: async () => {} };
  class ApiError extends Error {}
  const component = load('components/BonlineCallButton.tsx', {
    react: {
      useRef: (value) => ({ current: value }),
      useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
      useLayoutEffect: (effect) => effect(),
    },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { Alert: { alert: (...args) => state.alerts.push(args) }, StyleSheet: { create: (styles) => styles }, Text: 'Text', View: 'View' },
    '@/lib/api': {
      ApiError, getApiContextRevision: () => 1,
      api: { post: async (url, body) => { state.requests.push({ url, body }); if (state.fail) throw new Error('Network timeout'); return { attemptId: 'attempt-a', status: 'accepted', message: 'Requested', replayed: false }; } },
    },
    '@/hooks/useAdminSession': { getAdminSessionRevision: () => 1 },
    '@/hooks/useBonlineRequestScope': { useBonlineRequestScope: (enabled) => ({ scopeKey: 'scope-a', captureScope: () => ({}), isCurrent: () => enabled && state.current }) },
    '@/hooks/useBonlineResource': { useBonlineResource: () => resource },
    '@/lib/chat-sync': { createClientMessageId: () => '12345678-1234-4123-8123-123456789abc' },
    '@/lib/bonline-call-presentation': presentation,
    '@/lib/bonline-outbound-intents': { bonlineOutboundIntents: intents },
    './ui': { AppButton: 'AppButton' }, './theme': theme,
  });
  function render(props = {}) {
    const tree = component.BonlineCallButton({ phone: '07700 900123', callId: 'call-a', ...props });
    return tree?.props.children.find((node) => node?.type === 'AppButton');
  }
  return { state, render, intents };
}

test('disabled provider capability and invalid phone cannot show a dial confirmation or submit a call', () => {
  for (const options of [{ capability: { enabled: false, reason: 'unverified', message: 'Provider access unavailable' } }, {}]) {
    const h = buttonHarness(options);
    const button = h.render(options.capability ? {} : { phone: '999' });
    assert.equal(button.props.disabled, true);
    button.props.onPress();
    assert.equal(h.state.alerts.length, 0);
    assert.equal(h.state.requests.length, 0);
  }
});

test('call button confirms the business-line action and sends one request despite duplicate confirmation delivery', async () => {
  const h = buttonHarness();
  h.render().props.onPress();
  assert.equal(h.state.requests.length, 0);
  assert.match(h.state.alerts[0][1], /bOnline business line/);
  const confirm = h.state.alerts[0][2][1].onPress;
  await Promise.all([confirm(), confirm()]);
  await confirm();
  assert.equal(h.state.requests.length, 1);
  assert.equal(h.state.requests[0].body.phone, '+447700900123');
  assert.equal(h.state.requests[0].body.confirmed, true);
  assert.equal(h.state.requests[0].body.sourceCallId, 'call-a');
});

test('a confirmation left open after scope change cannot initiate a call', async () => {
  const h = buttonHarness();
  h.render().props.onPress();
  h.state.current = false;
  await h.state.alerts[0][2][1].onPress();
  assert.equal(h.state.requests.length, 0);
});

test('an uncertain network call is checked again with the original request key', async () => {
  const h = buttonHarness({ fail: true });
  h.render().props.onPress();
  await h.state.alerts[0][2][1].onPress();
  const retry = h.render();
  assert.equal(retry.props.label, 'Check call request');
  retry.props.onPress();
  await h.state.alerts[1][2][1].onPress();
  assert.equal(h.state.requests.length, 2);
  assert.equal(h.state.requests[0].body.idempotencyKey, h.state.requests[1].body.idempotencyKey);
});

const modalFilename = path.join(__dirname, '../src/components/BonlineCallManagementModal.tsx');
const modalSource = ts.createSourceFile(modalFilename, fs.readFileSync(modalFilename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function modalExpression(name, globals = {}) {
  let expression;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) expression = node.getText(modalSource).replace(/^export\s+/, '');
    if (ts.isVariableDeclaration(node) && node.name.getText(modalSource) === name) expression = node.initializer.getText(modalSource);
    ts.forEachChild(node, visit);
  }
  visit(modalSource);
  assert.ok(expression, `${name} must exist in the production modal`);
  const compiled = ts.transpileModule(`module.exports = (${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, ...globals }, { filename: modalFilename });
  return module.exports;
}

const isOverdue = modalExpression('isBonlineFollowUpOverdue');
const canLink = modalExpression('canLinkBonlineCall', { normalizeBonlineDestination: presentation.normalizeBonlineDestination });
const callRecord = (overrides = {}) => ({
  id: 'ledger-a', callId: 'provider-call-a', phone: '+447700900123',
  startedAt: '2026-10-28T12:00:00Z', firstReceivedAt: '2026-10-28T12:00:01Z',
  endedAt: '2026-10-28T12:01:00Z', outcome: 'missed',
  followUp: { status: 'pending', createdAt: '2026-10-28T12:01:00Z', assignedTo: null }, ...overrides,
});

test('only unresolved follow-ups cross the fifteen-minute overdue threshold', () => {
  const call = callRecord();
  assert.equal(isOverdue(call, Date.parse('2026-10-28T12:15:59Z')), false);
  assert.equal(isOverdue(call, Date.parse('2026-10-28T12:16:00Z')), true);
  assert.equal(isOverdue(callRecord({ outcome: 'unknown', followUp: null }), Date.parse('2026-10-29T12:00:00Z')), false);
  assert.equal(isOverdue(callRecord({ followUp: { status: 'resolved', createdAt: call.followUp.createdAt } }), Date.parse('2026-10-29T12:00:00Z')), false);
});

test('manual attribution requires a saved record and the same normalized customer number', () => {
  assert.equal(canLink(callRecord(), { phone: '07700 900123', bookingId: 'booking-a' }), true);
  assert.equal(canLink(callRecord(), { phone: '+447700900123', quoteId: 'quote-a' }), true);
  assert.equal(canLink(callRecord(), { phone: '+447700900999', bookingId: 'booking-a' }), false);
  assert.equal(canLink(callRecord(), { phone: '+447700900123' }), false);
  assert.equal(canLink(callRecord({ phone: null }), { phone: '', bookingId: 'booking-a' }), false);
});

function mutationHarness(name, overrides = {}) {
  const state = { current: true, alerts: [], requests: [], ...overrides };
  const globals = {
    captureScope: () => ({}), isCurrent: () => state.current,
    mutationLock: { current: false }, resolution: '  Customer contacted  ',
    setMutating: () => {}, setMutationError: () => {}, setResolutionId: () => {}, setResolution: () => {}, setLinkedIds: () => {},
    calls: { refresh: async () => {} },
    canLinkBonlineCall: canLink,
    attributionContext: { phone: '07700 900123', bookingId: 'booking-a', quoteId: 'quote-a' },
    Alert: { alert: (...args) => state.alerts.push(args) },
    api: {
      patch: async (url, body) => { state.requests.push({ method: 'PATCH', url, body }); },
      post: async (url, body) => { state.requests.push({ method: 'POST', url, body }); },
    },
  };
  return { state, act: modalExpression(name, globals) };
}

test('follow-up action preserves notes and ignores a confirmation after scope change', async () => {
  const h = mutationHarness('updateFollowUp');
  h.act(callRecord(), 'resolve');
  assert.equal(h.state.requests.length, 0);
  await h.state.alerts[0][2][1].onPress();
  assert.equal(h.state.requests[0].body.action, 'resolve');
  assert.equal(h.state.requests[0].body.resolution, 'Customer contacted');
  const stale = mutationHarness('updateFollowUp');
  stale.act(callRecord(), 'claim');
  stale.state.current = false;
  await stale.state.alerts[0][2][1].onPress();
  assert.equal(stale.state.requests.length, 0);
});

test('manual attribution sends both funnel IDs and cannot run after closing the modal', async () => {
  const h = mutationHarness('linkCall');
  h.act(callRecord());
  await h.state.alerts[0][2][1].onPress();
  assert.equal(h.state.requests[0].body.bookingId, 'booking-a');
  assert.equal(h.state.requests[0].body.quoteId, 'quote-a');
  assert.match(h.state.requests[0].url, /\/calls\/ledger-a\/link$/);
  const stale = mutationHarness('linkCall');
  stale.act(callRecord());
  stale.state.current = false;
  await stale.state.alerts[0][2][1].onPress();
  assert.equal(stale.state.requests.length, 0);
});

test('call rows pass the provider call ID to outbound and never dial a missing number', () => {
  const renderCall = modalExpression('renderCall', {
    calls: { data: { currentAdminId: 'admin-a' } }, isBonlineFollowUpOverdue: isOverdue,
    canLinkBonlineCall: canLink, attributionContext: undefined, OUTCOME_LABELS: { missed: 'Missed', unknown: 'Outcome unknown' },
    formatBonlineCallTime: presentation.formatBonlineCallTime, visible: true, tab: 'calls', outbound: { data: { enabled: false } },
    mutating: null, resolutionId: null, linkedIds: new Set(),
    s: {}, View: 'View', Text: 'Text', BonlineCallButton: 'BonlineCallButton', AppButton: 'AppButton',
    require: () => ({ jsx: element, jsxs: element }),
  });
  const findCallButton = (tree) => {
    if (!tree || typeof tree !== 'object') return null;
    if (tree.type === 'BonlineCallButton') return tree;
    for (const child of [tree.props?.children].flat(Infinity)) { const found = findCallButton(child); if (found) return found; }
    return null;
  };
  assert.equal(findCallButton(renderCall(callRecord())).props.callId, 'provider-call-a');
  assert.equal(findCallButton(renderCall(callRecord({ phone: null, followUp: null }))), null);
});
