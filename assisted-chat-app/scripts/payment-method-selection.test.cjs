 
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { loadSource, deferred, settle } = require('./chat-modals.test.cjs');

const src = path.join(__dirname, '../src');
const parse = (relative) => ts.createSourceFile(relative, fs.readFileSync(path.join(src, relative), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const screen = parse('components/AssistedChatScreen.tsx');
const draftSource = parse('hooks/useAssistedChatDraft.ts');
const geo = loadSource('lib/geo.ts', {});
const workflow = loadSource('lib/assisted-chat-workflow.ts', { './geo': geo });
const pricing = loadSource('lib/pricing-context.ts', {});

function findNode(source, predicate, label) {
  let found;
  const visit = (node) => {
    if (!found && predicate(node)) found = node;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(found, `Missing source node: ${label}`);
  return found;
}

function initializer(source, name) {
  return findNode(source, (node) => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name, name).initializer;
}

const expression = (source, name) => initializer(source, name).getText(source);
function callback(source, name) {
  const node = initializer(source, name);
  return (ts.isCallExpression(node) ? node.arguments[0] : node).getText(source);
}
function declaration(name) {
  return findNode(screen, (node) => ts.isFunctionDeclaration(node) && node.name?.text === name, name).getText(screen);
}
function attribute(node, name) {
  const property = node.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(screen) === name);
  assert.ok(property?.initializer && ts.isJsxExpression(property.initializer), `Missing JSX expression: ${name}`);
  return property.initializer.expression.getText(screen);
}
const panel = findNode(screen, (node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(screen) === 'PaymentDispatchPanel', 'payment panel');
const bottom = findNode(screen, (node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(screen) === 'PremiumBottomAction', 'bottom action');
const reviewSheet = findNode(screen, (node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(screen) === 'DispatchReviewSheet', 'dispatch review');
const node = (type, props) => ({ type, props });
const jsx = { jsx: node, jsxs: node, Fragment: 'Fragment' };
function execute(source, globals = {}) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return vm.runInNewContext(compiled, {
    exports: {},
    require: (name) => {
      assert.equal(name, 'react/jsx-runtime', 'Only the isolated JSX runtime may be required');
      return jsx;
    },
    ...globals,
  });
}
function findNodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap((item) => findNodes(item, predicate));
  return [...(predicate(tree) ? [tree] : []), ...findNodes(tree.props?.children, predicate)];
}
const uiGlobals = {
  ...workflow,
  DEPOSIT_PERCENT: 20,
  PAYMENT_OPTIONS: [{ value: 'FULL_PAYMENT', label: 'Full payment' }, { value: 'CASH_ON_DELIVERY', label: 'Cash on arrival' }],
  styles: new Proxy({}, { get: () => ({}) }), colors: { text: '#fff', success: '#0f0' },
  formatGbp: (amount) => `£${amount.toFixed(2)}`,
  ActivityIndicator: 'ActivityIndicator', SectionCard: 'SectionCard', DetailRow: 'DetailRow',
  View: 'View', Text: 'Text', Pressable: 'Pressable', AppIcon: 'AppIcon', StatusBanner: 'StatusBanner',
  Modal: 'Modal', ScrollView: 'ScrollView', CopyAddressButton: 'CopyAddressButton', AppButton: 'AppButton', Switch: 'Switch',
};
const uiDeclarations = ['formatPence', 'getQuotePricingDistanceMiles', 'getDepositSummary', 'paymentChoiceLabel', 'paymentOptionLabel'].map(declaration).join('\n');
function renderFunction(name, props, globals = {}) {
  return execute(`${uiDeclarations}\n${declaration(name)}\n${name}(props);`, { ...uiGlobals, ...globals, props });
}

function newDraft(patch = {}) {
  const draft = execute(`(${expression(draftSource, 'EMPTY_DRAFT')})`, workflow);
  return {
    ...draft,
    customer: { name: 'Isolated example', phone: '+44 7700 900123', email: '' },
    location: { ...draft.location, address: 'Example address', lat: 55.86, lng: -4.25, status: 'received' },
    serviceType: 'assess',
    quickBookingId: 'test-quick-book', savedQuoteId: 'test-quote', savedQuoteRef: 'TEST-QUOTE',
    quote: { subtotal: 100, vatAmount: 20, total: 120, lineItems: [], distanceKm: 2 },
    ...patch,
  };
}

function createSelectionHarness(options = {}) {
  const state = {
    draft: newDraft(options.draft), editingStage: options.editingStage ?? null,
    busy: Boolean(options.busy), updates: [], order: [], errors: [], notices: [], keyboardDismisses: 0,
    dispatches: [], reviewOpen: false, selectedPaymentOption: 'FULL_PAYMENT', activeQuote: options.activeQuote ?? null,
  };
  function read() {
    const model = workflow.getAssistedChatWorkflow({ draft: state.draft, quoteStatus: 'CONFIRMED_BY_PHONE', quoteConfirmedAt: '2026-10-22T12:00:00Z', canUseApi: true, dispatchBusy: state.busy });
    const globals = {
      ...uiGlobals, draft: state.draft, editingStage: state.editingStage, workflow: model, activeQuote: state.activeQuote,
      dispatch: {
        busy: state.busy,
        setError: (error) => { state.errors.push(error); },
        choosePaymentAndDispatch: async (choice) => { state.dispatches.push(choice); return true; },
      },
      update: (patch) => { state.order.push('update'); state.updates.push(patch); state.draft = { ...state.draft, ...patch }; },
      setEditingStage: (stage) => { state.order.push('stage'); state.editingStage = stage; },
      setReviewOpen: (visible) => { state.reviewOpen = visible; },
      flashNotice: (notice) => { state.notices.push(notice); },
      Keyboard: { dismiss: () => { state.keyboardDismisses += 1; } },
      handleReviewDispatch: () => { state.reviewOpen = true; },
      locationShare: { busy: null, requestLink: () => { throw new Error('Unexpected location request'); } },
      price: { loading: false, getPrice: () => { throw new Error('Unexpected price request'); } },
      quoteActions: { busy: null }, openBookingsInApp: () => { throw new Error('Unexpected booking navigation'); },
    };
    const names = ['activeStage', 'isManualLocationEditing', 'manualLocationBlockedReason', 'setDispatchError', 'primaryLabel', 'primaryDisabled', 'primaryDisabledReason'];
    const declarations = names.map((name) => `const ${name} = ${expression(screen, name)};`).join('\n');
    const action = execute(`${declarations}\n({
      stage: activeStage, label: primaryLabel, disabled: primaryDisabled, reason: primaryDisabledReason,
      helper: (${attribute(bottom, 'helper')}), loading: (${attribute(bottom, 'loading')}),
      update: (${callback(screen, 'handleActiveStageUpdate')}),
      done: (${callback(screen, 'handlePrimaryAction')}), send: (${callback(screen, 'handleSendToDriver')}),
      editPayment: (${attribute(reviewSheet, 'onEditPayment')})
    });`, globals);
    action.choose = execute(`(${attribute(panel, 'onChoose')})`, { ...globals, update: action.update });
    return action;
  }
  function choices() {
    const globals = { ...uiGlobals, draft: state.draft, activeQuote: state.activeQuote, dispatch: { busy: state.busy }, effectiveTotal: 120, update: read().update,
      manualPaymentBusy: null, handleMarkPaid: async (kind) => { state.markPaid = [...(state.markPaid ?? []), kind]; }, handleCopyPaymentDetails: async () => { state.copies = (state.copies ?? 0) + 1; } };
    const props = Object.fromEntries(panel.attributes.properties.filter((item) => ts.isJsxAttribute(item) && item.initializer && ts.isJsxExpression(item.initializer)).map((item) => [item.name.getText(screen), execute(`(${item.initializer.expression.getText(screen)})`, globals)]));
    return findNodes(renderFunction('PaymentDispatchPanel', props), (item) => item.type === 'Pressable');
  }
  function review() {
    return renderFunction('DispatchReviewSheet', {
      visible: true, draft: state.draft, activeQuote: state.activeQuote, selectedPaymentOption: state.selectedPaymentOption,
      effectiveTotal: 120, quoteConfirmed: true, dispatchBusy: state.busy, dispatchError: null,
      onClose: () => { state.reviewOpen = false; }, onSend: read().send, onEditPayment: read().editPayment,
    });
  }
  return { state, read, choices, review };
}

test('payment methods remain selectable until Done Editing, with no dispatch side effects', async () => {
  const h = createSelectionHarness();
  assert.equal(h.read().stage, 'PAYMENT');
  for (const choice of ['full', 'cash', 'deposit', 'full']) {
    const index = ['full', 'deposit', 'cash'].indexOf(choice);
    const cards = h.choices();
    assert.equal(cards.length, 3);
    assert.equal(cards[index].props.disabled, false);
    cards[index].props.onPress();
    assert.equal(h.state.draft.paymentChoice, choice);
    assert.equal(h.read().stage, 'PAYMENT');
    assert.deepEqual(h.choices().map((card) => card.props.accessibilityState.selected), ['full', 'deposit', 'cash'].map((item) => item === choice));
  }
  assert.deepEqual(h.state.dispatches, []);
  assert.equal(h.state.draft.dispatchedBookingId, null);
  assert.equal(h.state.draft.paymentLink, null);
  assert.deepEqual(h.state.errors, [null, null, null, null]);
  assert.deepEqual(h.state.order.filter((item) => item !== 'update'), ['stage', 'stage', 'stage', 'stage']);
  assert.ok(h.state.order.every((value, index) => value !== 'update' || h.state.order[index - 1] === 'stage'), 'Latch the editor before draft updates can advance the workflow');
});

test('Done Editing advances to review without creating a booking or payment link', async () => {
  const h = createSelectionHarness();
  h.read().choose('cash');
  const action = h.read();
  assert.equal(action.label, 'Done Editing');
  assert.equal(action.disabled, false);
  await action.done();
  assert.equal(h.state.editingStage, null);
  assert.equal(h.state.keyboardDismisses, 1);
  assert.equal(h.read().stage, 'READY_TO_DISPATCH');
  assert.equal(h.read().label, 'Review & Dispatch');
  assert.deepEqual(h.state.dispatches, []);
  await h.read().done();
  assert.equal(h.state.reviewOpen, true);
  assert.deepEqual(h.state.dispatches, []);
});

test('Done Editing requires a selected payment method and cannot interrupt dispatch', async () => {
  for (const options of [{ editingStage: 'PAYMENT' }, { editingStage: 'PAYMENT', busy: true, draft: { paymentChoice: 'cash' } }]) {
    const h = createSelectionHarness(options);
    const action = h.read();
    assert.equal(action.label, 'Done Editing');
    assert.equal(action.disabled, true);
    await action.done();
    assert.equal(h.state.editingStage, 'PAYMENT');
    assert.equal(h.state.keyboardDismisses, 0);
    assert.deepEqual(h.state.dispatches, []);
  }
});

for (const [label, patch, busy] of [
  ['busy dispatch', {}, true],
  ['booking reference', { dispatchedRefNumber: 'TEST-BOOKING' }, false],
  ['booking ID without a reference', { dispatchedBookingId: 'test-created-booking' }, false],
  ['live payment link without a reference', { paymentLink: { bookingId: 'test-created-booking', paymentUrl: 'https://example.invalid/checkout' } }, false],
]) {
  test(`payment cards and callbacks preserve existing state for ${label}`, () => {
    const h = createSelectionHarness({ editingStage: 'PAYMENT', busy, draft: { paymentChoice: 'full', ...patch } });
    const original = JSON.stringify(h.state.draft);
    assert.ok(h.choices().every((card) => card.props.disabled));
    h.read().choose('cash');
    assert.equal(JSON.stringify(h.state.draft), original);
    assert.deepEqual(h.state.updates, []);
    assert.deepEqual(h.state.dispatches, []);
  });
}

test('dispatch review shows the latest selection rather than an older confirmed quote option', () => {
  const h = createSelectionHarness();
  h.read().choose('cash');
  const row = findNodes(h.review(), (item) => item.type === 'DetailRow' && item.props.label === 'Selected payment')[0];
  assert.equal(row.props.value, 'Cash on arrival');
  h.read().choose('deposit');
  const changed = findNodes(h.review(), (item) => item.type === 'DetailRow' && item.props.label === 'Selected payment')[0];
  assert.equal(changed.props.value, 'Deposit 20%');
});

test('Change payment method reopens the editor from review without discarding the booking draft', async () => {
  const h = createSelectionHarness();
  h.read().choose('full');
  await h.read().done();
  await h.read().done();
  assert.equal(h.state.reviewOpen, true);
  const original = JSON.stringify(h.state.draft);
  const change = findNodes(h.review(), (item) => item.type === 'AppButton' && item.props.label === 'Change payment method')[0];
  assert.equal(change.props.disabled, false);
  change.props.onPress();
  assert.equal(h.state.reviewOpen, false);
  assert.equal(h.read().stage, 'PAYMENT');
  assert.equal(JSON.stringify(h.state.draft), original);
  assert.deepEqual(h.state.dispatches, []);
  h.choices()[2].props.onPress();
  assert.equal(h.state.draft.paymentChoice, 'cash');
  await h.read().done();
  assert.equal(h.read().stage, 'READY_TO_DISPATCH');
  assert.equal(h.state.draft.quote.total, 120);
  assert.equal(h.state.draft.quickBookingId, 'test-quick-book');
  assert.deepEqual(h.state.dispatches, []);
});

test('a confirmed server payment locks its recorded method and prevents another dispatch', () => {
  const h = createSelectionHarness({ editingStage: 'PAYMENT', draft: { paymentChoice: 'full' }, activeQuote: { quoteStatus: 'PAID' } });
  const original = JSON.stringify(h.state.draft);
  assert.ok(h.choices().every((card) => card.props.disabled));
  h.read().choose('cash');
  assert.equal(JSON.stringify(h.state.draft), original);
  const actions = findNodes(h.review(), (item) => item.type === 'AppButton' && ['Change payment method', 'Send to Driver'].includes(item.props.label));
  assert.equal(actions.length, 2);
  assert.ok(actions.every((action) => action.props.disabled));
  assert.ok(findNodes(h.review(), (item) => item.type === 'StatusBanner').some((item) => /already confirmed/.test(item.props.message)));
  assert.deepEqual(h.state.dispatches, []);
});

test('review cannot bypass existing booking and checkout locks when a reference is missing', () => {
  for (const patch of [
    { dispatchedRefNumber: 'TEST-FINALIZED' },
    { dispatchedBookingId: 'test-finalized-booking' },
    { paymentLink: { paymentUrl: 'https://example.invalid/existing-checkout', bookingId: 'test-finalized-booking' } },
  ]) {
    const h = createSelectionHarness({ draft: { paymentChoice: 'full', ...patch } });
    const actions = findNodes(h.review(), (item) => item.type === 'AppButton' && ['Change payment method', 'Send to Driver'].includes(item.props.label));
    assert.equal(actions.length, 2);
    assert.ok(actions.every((action) => action.props.disabled));
    assert.ok(findNodes(h.review(), (item) => item.type === 'StatusBanner').some((item) => /already created/.test(item.props.message)));
    assert.deepEqual(h.state.dispatches, []);
  }
});

test('only explicit Send to Driver confirms the currently selected payment method', async () => {
  const h = createSelectionHarness();
  h.read().choose('full');
  h.read().choose('deposit');
  await h.read().done();
  await h.read().done();
  assert.deepEqual(h.state.dispatches, []);
  const send = findNodes(h.review(), (item) => item.type === 'AppButton' && item.props.label === 'Send to Driver')[0];
  assert.equal(send.props.disabled, false);
  await send.props.onPress();
  assert.deepEqual(h.state.dispatches, ['deposit']);
  assert.equal(h.state.reviewOpen, false);
});

function createDispatchHarness(patch = {}) {
  const state = { draft: newDraft(patch), updates: [], gets: [], patches: [], posts: [], created: [], hooks: [], cursor: 0, patchPending: null, revision: 1, serverBooking: null, failDeposit: null, failFinalize: null, getHandler: null, beforeDeposit: null, payable: true };
  class ApiError extends Error { constructor(message, status, details) { super(message); this.status = status; this.details = details; } }
  const react = {
    useState(initial) {
      const index = state.cursor++;
      if (!(index in state.hooks)) state.hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [state.hooks[index], (value) => { state.hooks[index] = typeof value === 'function' ? value(state.hooks[index]) : value; }];
    },
    useRef(initial) {
      const index = state.cursor++;
      if (!(index in state.hooks)) state.hooks[index] = { current: initial };
      return state.hooks[index];
    },
    useCallback: (fn) => fn,
    useEffect(effect) {
      const index = state.cursor++;
      if (!(index in state.hooks)) state.hooks[index] = { cleanup: effect() };
    },
  };
  const breakdown = { subtotal: 100, vatAmount: 20, total: 120, lineItems: [] };
  const api = {
    get: async (url) => {
      state.gets.push(url);
      if (state.getHandler) return state.getHandler(url);
      return state.serverBooking ? { finalized: true, response: state.serverBooking, canCollectPayment: state.payable } : { finalized: false };
    },
    patch: async (url, body) => {
      state.patches.push({ url, body });
      if (state.patchPending) await state.patchPending.promise;
      return { booking: { priceBreakdown: breakdown, distanceKm: '2' } };
    },
    post: async (url, body) => {
      state.posts.push({ url, body });
      if (url.endsWith('/deposit')) {
        state.beforeDeposit?.(JSON.parse(JSON.stringify(state.draft)));
        if (state.failDeposit) throw state.failDeposit;
        return { checkoutUrl: 'https://example.invalid/deposit', depositAmountPence: 2400, remainingBalancePence: 9600 };
      }
      if (url.endsWith('/checkout-session')) return { checkoutUrl: 'https://example.invalid/recovered-full' };
      assert.equal(url, '/api/admin/quick-book/test-quick-book/finalize');
      const response = { bookingId: 'test-finalized-booking', refNumber: 'TEST-FINALIZED', breakdown, paymentMethod: body.paymentMethod, depositAmountPence: body.paymentMethod === 'deposit' ? 2400 : null, remainingBalancePence: body.paymentMethod === 'deposit' ? 9600 : null, paymentUrl: body.paymentMethod === 'stripe' ? 'https://example.invalid/full' : null };
      state.serverBooking = response;
      if (state.failFinalize) throw state.failFinalize;
      return response;
    },
  };
  const hook = loadSource('hooks/useAssistedChatDispatch.ts', {
    '@/hooks/useLatestRef': { useLatestRef: (value) => { const ref = react.useRef(value); ref.current = value; return ref; } },
    react, '@/lib/api': { api, ApiError, getApiContextRevision: () => state.revision },
    '@/lib/pricing-context': pricing, '@/lib/assisted-chat-workflow': workflow,
  });
  function read() {
    state.cursor = 0;
    return hook.useAssistedChatDispatch({
      draft: state.draft, lockingNutCharge: 0,
      update: (update) => { state.updates.push(update); state.draft = { ...state.draft, ...update }; },
      onBookingCreated: (event) => { state.created.push(event); },
    });
  }
  return { state, read, api, ApiError, react, unmount: () => { for (const hook of state.hooks) hook?.cleanup?.(); } };
}

for (const [choice, expected] of [['full', 'stripe'], ['deposit', 'deposit'], ['cash', 'cash']]) {
  test(`explicit ${choice} dispatch sends the canonical ${expected} payload exactly once`, async () => {
    const h = createDispatchHarness({ paymentChoice: 'full' });
    assert.equal(h.state.posts.length, 0);
    const success = await h.read().choosePaymentAndDispatch(choice);
    assert.equal(success, true);
    assert.equal(h.state.patches.length, 1);
    const finalizes = h.state.posts.filter((call) => call.url.endsWith('/finalize'));
    assert.equal(finalizes.length, 1);
    assert.equal(finalizes[0].body.paymentMethod, expected);
    assert.equal(h.state.posts.filter((call) => call.url.endsWith('/deposit')).length, choice === 'deposit' ? 1 : 0);
    assert.equal(h.state.created.length, 1);
    assert.equal(h.state.created[0].paymentChoice, choice);
    assert.equal(h.state.draft.paymentChoice, choice);
    assert.equal(h.state.draft.dispatchedBookingId, 'test-finalized-booking');
    assert.equal(h.state.draft.paymentLink?.amountPence ?? null, choice === 'full' ? 12000 : choice === 'deposit' ? 2400 : null);
    assert.equal(h.state.draft.quote.total, 120);
    assert.equal(h.read().busy, false);
  });
}

test('dispatch hook mutex blocks a second confirmation while the first request is pending', async () => {
  const h = createDispatchHarness();
  h.state.patchPending = deferred();
  const first = h.read().choosePaymentAndDispatch('cash');
  await settle();
  assert.equal(h.read().busy, true);
  assert.equal(await h.read().choosePaymentAndDispatch('full'), false);
  assert.equal(h.state.patches.length, 1);
  assert.equal(h.state.posts.length, 0);
  h.state.patchPending.resolve();
  assert.equal(await first, true);
  assert.equal(h.state.posts.filter((call) => call.url.endsWith('/finalize')).length, 1);
  assert.equal(h.state.posts[0].body.paymentMethod, 'cash');
  assert.equal(h.state.created.length, 1);
});

test('dispatch hook refuses to finalize any draft that already has a booking or checkout', async () => {
  for (const patch of [
    { dispatchedRefNumber: 'TEST-FINALIZED' },
    { dispatchedBookingId: 'test-finalized-booking' },
    { paymentLink: { paymentUrl: 'https://example.invalid/existing-checkout', bookingId: 'test-finalized-booking' } },
  ]) {
    const h = createDispatchHarness(patch);
    const original = JSON.stringify(h.state.draft);
    assert.equal(await h.read().choosePaymentAndDispatch('cash'), false);
    assert.equal(JSON.stringify(h.state.draft), original);
    assert.equal(h.state.patches.length + h.state.posts.length, 0);
    assert.equal(h.state.created.length, 0);
    assert.equal(h.read().busy, false);
  }
});


test('a failed deposit checkout retains the confirmed booking before the second request and retries that booking only', async () => {
  const h = createDispatchHarness({ manualPriceGbp: 900 });
  h.state.failDeposit = new Error('Isolated checkout unavailable');
  h.state.beforeDeposit = (draft) => {
    assert.equal(draft.dispatchedBookingId, 'test-finalized-booking');
    assert.equal(draft.dispatchedRefNumber, 'TEST-FINALIZED');
    assert.equal(draft.paymentChoice, 'deposit');
    assert.equal(draft.quote.total, 120);
    assert.equal(draft.manualPriceGbp, null);
  };
  assert.equal(await h.read().choosePaymentAndDispatch('deposit'), false);
  assert.match(h.read().error, /Booking TEST-FINALIZED is saved/);
  assert.equal(h.read().result.bookingId, 'test-finalized-booking');
  assert.equal(h.read().canRetryPaymentLink, true);
  assert.equal(h.state.created.length, 1);
  assert.equal(h.state.created[0].paymentLink, null);
  h.state.failDeposit = null;
  assert.equal(await h.read().retryPaymentLink(), true);
  assert.equal(h.state.patches.length, 1);
  assert.equal(h.state.posts.filter((call) => call.url.endsWith('/finalize')).length, 1);
  assert.equal(h.state.posts.filter((call) => call.url.endsWith('/deposit')).length, 2);
  assert.equal(h.state.posts.filter((call) => call.url.includes('/payment-link')).length, 0);
  assert.equal(h.state.draft.paymentLink.kind, 'deposit');
  assert.equal(h.state.draft.paymentLink.amountPence, 2400);
  assert.equal(h.state.draft.paymentLink.remainingBalancePence, 9600);
  assert.equal(h.state.created.length, 1);
  assert.equal(h.read().canRetryPaymentLink, false);
});

test('a deposit endpoint 404 never clears the confirmed IDs, price, quick-book ID, or method', async () => {
  const h = createDispatchHarness();
  h.state.failDeposit = new h.ApiError('Deposit endpoint unavailable', 404);
  assert.equal(await h.read().choosePaymentAndDispatch('deposit'), false);
  assert.equal(h.state.draft.quickBookingId, 'test-quick-book');
  assert.equal(h.state.draft.dispatchedBookingId, 'test-finalized-booking');
  assert.equal(h.state.draft.dispatchedRefNumber, 'TEST-FINALIZED');
  assert.equal(h.state.draft.paymentChoice, 'deposit');
  assert.equal(h.state.draft.quote.total, 120);
  assert.equal(h.state.draft.priceNeedsRefresh, false);
  assert.equal(h.state.updates.filter((update) => update.quickBookingId === null).length, 0);
});

test('restarting after deposit failure restores the server method and price without another PATCH or finalize', async () => {
  const first = createDispatchHarness();
  first.state.failDeposit = new Error('Offline');
  await first.read().choosePaymentAndDispatch('deposit');
  const h = createDispatchHarness(JSON.parse(JSON.stringify(first.state.draft)));
  h.state.serverBooking = first.state.serverBooking;
  assert.equal(h.read().canRetryPaymentLink, true);
  assert.equal(await h.read().retryPaymentLink(), true);
  assert.equal(h.state.patches.length, 0);
  assert.deepEqual(h.state.posts.map((call) => call.url), ['/api/bookings/test-finalized-booking/deposit']);
  assert.equal(h.state.draft.paymentChoice, 'deposit');
  assert.equal(h.state.draft.quote.total, 120);
});

test('a committed finalize with a lost network response recovers the same booking and creates only its deposit checkout', async () => {
  const h = createDispatchHarness();
  h.state.failFinalize = new TypeError('Network response lost after commit');
  assert.equal(await h.read().choosePaymentAndDispatch('deposit'), true);
  assert.equal(h.state.gets.length, 2);
  assert.equal(h.state.patches.length, 1);
  assert.equal(h.state.posts.filter((call) => call.url.endsWith('/finalize')).length, 1);
  assert.equal(h.state.posts.filter((call) => call.url.endsWith('/deposit')).length, 1);
  assert.equal(h.state.draft.dispatchedBookingId, 'test-finalized-booking');
  assert.equal(h.state.created.length, 1);
});

test('an already-finalized race recovers the canonical server choice instead of charging the newly selected choice', async () => {
  const h = createDispatchHarness();
  const canonical = { bookingId: 'existing-race-booking', refNumber: 'EXISTING-RACE', paymentMethod: 'cash', paymentUrl: null,
    breakdown: { subtotal: 175, vatAmount: 35, total: 210, lineItems: [] } };
  let reads = 0;
  h.state.getHandler = async () => ++reads === 1 ? { finalized: false } : { finalized: true, response: canonical, canCollectPayment: true };
  h.state.failFinalize = new h.ApiError('Already finalized', 409, { bookingId: canonical.bookingId });
  assert.equal(await h.read().choosePaymentAndDispatch('deposit'), true);
  assert.equal(h.state.draft.dispatchedBookingId, canonical.bookingId);
  assert.equal(h.state.draft.paymentChoice, 'cash');
  assert.equal(h.state.draft.quote.total, 210);
  assert.equal(h.state.posts.filter((call) => call.url.endsWith('/deposit')).length, 0);
  assert.equal(h.state.created[0].paymentChoice, 'cash');
});

test('a 409 identity survives a second network failure and a subsequent explicit recovery never finalizes again', async () => {
  const h = createDispatchHarness();
  h.state.failFinalize = new h.ApiError('Already finalized', 409, { bookingId: 'test-finalized-booking' });
  let reads = 0;
  h.state.getHandler = async () => {
    if (++reads === 1) return { finalized: false };
    throw new TypeError('Recovery read offline');
  };
  assert.equal(await h.read().choosePaymentAndDispatch('deposit'), false);
  assert.equal(h.state.draft.dispatchedBookingId, 'test-finalized-booking');
  assert.match(h.read().error, /already created.*saved/);
  assert.equal(h.state.draft.paymentChoice, null, 'Do not present an unverified local method as the recovered server method');
  assert.equal(h.read().canRetryPaymentLink, true);
  h.state.getHandler = null;
  assert.equal(await h.read().retryPaymentLink(), true);
  assert.equal(h.state.patches.length, 1);
  assert.equal(h.state.posts.filter((call) => call.url.endsWith('/finalize')).length, 1);
  assert.equal(h.state.posts.filter((call) => call.url.endsWith('/deposit')).length, 1);
});

for (const status of [401, 404, 502]) {
  test(`a missing or unavailable recovery read (${status}) fails closed before repricing or booking creation`, async () => {
    const h = createDispatchHarness();
    const before = JSON.stringify(h.state.draft);
    h.state.getHandler = async () => { throw new h.ApiError('Recovery read unavailable', status); };
    assert.equal(await h.read().choosePaymentAndDispatch('deposit'), false);
    assert.equal(JSON.stringify(h.state.draft), before);
    assert.equal(h.state.posts.length + h.state.patches.length, 0);
    assert.equal(h.read().busy, false);
  });
}

test('a recovered booking that is already paid or closed never creates another payment session', async () => {
  const h = createDispatchHarness();
  h.state.serverBooking = { bookingId: 'paid-existing', refNumber: 'PAID-EXISTING', paymentMethod: 'deposit', paymentUrl: null,
    breakdown: { subtotal: 100, vatAmount: 20, total: 120, lineItems: [] } };
  h.state.payable = false;
  assert.equal(await h.read().choosePaymentAndDispatch('full'), false);
  assert.equal(h.state.draft.dispatchedBookingId, 'paid-existing');
  assert.equal(h.state.draft.paymentChoice, 'deposit');
  assert.equal(h.state.posts.length + h.state.patches.length, 0);
  assert.match(h.read().error, /confirmed payment|no longer payable/);
  assert.equal(h.read().canRetryPaymentLink, false);
  assert.doesNotMatch(h.read().error, /Retry the payment link/);
});

test('fresh screen with a lost finalize identity recovers before PATCH even when a different method is selected', async () => {
  const h = createDispatchHarness({ paymentChoice: 'cash', manualPriceGbp: 900 });
  h.state.serverBooking = { bookingId: 'existing-deposit', refNumber: 'EXISTING-DEPOSIT', paymentMethod: 'deposit', paymentUrl: null,
    breakdown: { subtotal: 100, vatAmount: 20, total: 120, lineItems: [] } };
  assert.equal(await h.read().choosePaymentAndDispatch('cash'), true);
  assert.equal(h.state.patches.length, 0);
  assert.equal(h.state.posts.filter((call) => call.url.endsWith('/finalize')).length, 0);
  assert.equal(h.state.draft.paymentChoice, 'deposit');
  assert.equal(h.state.draft.quote.total, 120);
  assert.equal(h.state.draft.manualPriceGbp, null);
  assert.equal(h.state.posts[0].url, '/api/bookings/existing-deposit/deposit');
});

test('recovered full payment uses the existing full-checkout endpoint and never creates a booking', async () => {
  const h = createDispatchHarness({ paymentChoice: 'full', dispatchedBookingId: 'existing-full', dispatchedRefNumber: 'EXISTING-FULL' });
  h.state.serverBooking = { bookingId: 'existing-full', refNumber: 'EXISTING-FULL', paymentMethod: 'stripe', paymentUrl: null,
    breakdown: { subtotal: 100, vatAmount: 20, total: 120, lineItems: [] } };
  assert.equal(await h.read().retryPaymentLink(), true);
  assert.equal(h.state.patches.length, 0);
  assert.deepEqual(h.state.posts.map((call) => call.url), ['/api/admin/quick-book/test-quick-book/checkout-session']);
  assert.equal(h.state.draft.paymentLink.kind, 'full');
  assert.equal(h.state.draft.paymentLink.amountPence, 12000);
});

test('retry mutex ignores double taps and a late checkout cannot update another account', async () => {
  const h = createDispatchHarness({ paymentChoice: 'deposit', dispatchedBookingId: 'existing-deposit', dispatchedRefNumber: 'EXISTING-DEPOSIT' });
  const pending = deferred();
  h.state.getHandler = () => pending.promise;
  const first = h.read().retryPaymentLink();
  assert.equal(await h.read().retryPaymentLink(), false);
  assert.equal(h.state.gets.length, 1);
  h.state.revision += 1;
  pending.resolve({ finalized: true, canCollectPayment: true, response: { bookingId: 'existing-deposit', refNumber: 'EXISTING-DEPOSIT', paymentMethod: 'deposit', paymentUrl: null } });
  assert.equal(await first, false);
  assert.equal(h.state.posts.length + h.state.patches.length, 0);
  assert.equal(h.state.created.length, 0);
  assert.equal(h.read().busy, false);
});


test('a finalized PATCH conflict restores the same booking before any further price or finalize request', async () => {
  const h = createDispatchHarness();
  const canonical = { bookingId: 'existing-patch-booking', refNumber: 'EXISTING-PATCH', paymentMethod: 'deposit', paymentUrl: null,
    breakdown: { subtotal: 100, vatAmount: 20, total: 120, lineItems: [] } };
  let reads = 0;
  h.state.getHandler = async () => ++reads === 1 ? { finalized: false } : { finalized: true, response: canonical, canCollectPayment: true };
  h.api.patch = async (url, body) => {
    h.state.patches.push({ url, body });
    throw new h.ApiError('Already finalized', 409, { bookingId: canonical.bookingId });
  };
  assert.equal(await h.read().choosePaymentAndDispatch('cash'), true);
  assert.equal(h.state.draft.paymentChoice, 'deposit');
  assert.equal(h.state.draft.dispatchedBookingId, canonical.bookingId);
  assert.equal(h.state.posts.filter((call) => call.url.endsWith('/finalize')).length, 0);
  assert.deepEqual(h.state.posts.map((call) => call.url), ['/api/bookings/existing-patch-booking/deposit']);
});

test('unmount during recovery cannot continue repricing, finalizing, persistence or history callbacks', async () => {
  const h = createDispatchHarness();
  const pending = deferred();
  h.state.getHandler = () => pending.promise;
  const first = h.read().choosePaymentAndDispatch('deposit');
  h.unmount();
  pending.resolve({ finalized: false });
  assert.equal(await first, false);
  assert.equal(h.state.posts.length + h.state.patches.length + h.state.updates.length, 0);
  assert.equal(h.state.created.length, 0);
});

test('unmount during deposit creation cannot overwrite a newer screen draft with its late checkout', async () => {
  const h = createDispatchHarness();
  const pending = deferred();
  const originalPost = h.api.post;
  h.api.post = async (url, body) => url.endsWith('/deposit') ? pending.promise : originalPost(url, body);
  const first = h.read().choosePaymentAndDispatch('deposit');
  await settle();
  assert.equal(h.state.draft.dispatchedBookingId, 'test-finalized-booking');
  const count = h.state.updates.length;
  h.unmount();
  pending.resolve({ checkoutUrl: 'https://example.invalid/late-checkout', depositAmountPence: 2400, remainingBalancePence: 9600 });
  assert.equal(await first, false);
  assert.equal(h.state.updates.length, count);
  assert.equal(h.state.draft.paymentLink, null);
  assert.equal(h.state.created.length, 0);
});


function createExistingPaymentHarness(patch = {}) {
  const state = { draft: newDraft({ paymentChoice: 'deposit', dispatchedBookingId: 'existing-deposit', dispatchedRefNumber: 'EXISTING-DEPOSIT', ...patch }),
    hooks: [], cursor: 0, revision: 1, posts: [], updates: [], pending: null, failure: null };
  const react = {
    useState(initial) { const index = state.cursor++; if (!(index in state.hooks)) state.hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [state.hooks[index], (value) => { state.hooks[index] = typeof value === 'function' ? value(state.hooks[index]) : value; }]; },
    useRef(initial) { const index = state.cursor++; if (!(index in state.hooks)) state.hooks[index] = { current: initial }; return state.hooks[index]; },
    useCallback: (fn) => fn, useMemo: (fn) => fn(), useEffect: () => {},
    // Layout effects sync the draft fence refs; run them as part of render,
    // which is when this harness reads them.
    useLayoutEffect: (effect) => { effect(); },
  };
  const api = { post: async (url, body) => {
    state.posts.push({ url, body });
    if (state.pending) return state.pending.promise;
    if (state.failure) throw state.failure;
    return url.endsWith('/deposit')
      ? { checkoutUrl: 'https://example.invalid/retry-deposit', depositAmountPence: 2400, remainingBalancePence: 9600 }
      : { bookingId: 'existing-deposit', refNumber: 'EXISTING-DEPOSIT', paymentUrl: 'https://example.invalid/full-balance', amountPence: 12000, createdAtIso: '2026-10-22T12:00:00Z' };
  } };
  const hook = loadSource('hooks/useAdminPaymentLink.ts', {
    react, 'react-native': { AppState: { currentState: 'active' }, Platform: { OS: 'ios' } },
    '@/lib/api': { api, ApiError: class ApiError extends Error {}, getApiContextRevision: () => state.revision },
    '@/lib/browser-network-events': { subscribeBrowserNetworkEvents: () => {} },
    '@/lib/native-event-subscription': { removeNativeEventSubscription: () => {} },
    '@/lib/startup-logging': { logStartupModuleFailed: () => {} },
    '@/lib/payment-link-status': loadSource('lib/payment-link-status.ts', {}),
  }, { AbortController, setTimeout, clearTimeout });
  const read = () => { state.cursor = 0; return hook.useAdminPaymentLink({ draft: state.draft, update: (update) => { state.updates.push(update); state.draft = { ...state.draft, ...update }; } }); };
  return { state, read };
}

test('existing booking payment-link retry preserves deposit when the initial checkout never returned a link', async () => {
  const h = createExistingPaymentHarness();
  const link = await h.read().createForDispatchedBooking();
  assert.deepEqual(h.state.posts.map((call) => call.url), ['/api/bookings/existing-deposit/deposit']);
  assert.equal(link.kind, 'deposit');
  assert.equal(link.amountPence, 2400);
  assert.equal(link.remainingBalancePence, 9600);
  assert.equal(h.state.draft.paymentChoice, 'deposit');
});

test('a deposit with no confirmed booking ID refuses to create a full balance link', async () => {
  const h = createExistingPaymentHarness({ dispatchedBookingId: null });
  assert.equal(await h.read().createForDispatchedBooking(), null);
  assert.equal(h.state.posts.length, 0);
  assert.match(h.read().error, /Recover this booking/);
});

test('a pending retry for an old customer never attaches its payment link to a new draft', async () => {
  const h = createExistingPaymentHarness();
  h.state.pending = deferred();
  const first = h.read().createForDispatchedBooking();
  h.state.draft = newDraft({ customer: { name: 'New isolated customer', phone: '', email: '' } });
  h.read();
  h.state.pending.resolve({ checkoutUrl: 'https://example.invalid/old-deposit', depositAmountPence: 2400, remainingBalancePence: 9600 });
  assert.equal(await first, null);
  assert.equal(h.state.updates.length, 0);
  assert.equal(h.state.draft.paymentLink, null);
  assert.equal(h.read().error, null);
});

test('a pending retry error from an old customer is ignored by the new draft', async () => {
  const h = createExistingPaymentHarness();
  h.state.pending = deferred();
  const first = h.read().createForDispatchedBooking();
  h.state.draft = newDraft(); h.read();
  h.state.pending.reject(new Error('Old isolated failure'));
  assert.equal(await first, null);
  assert.equal(h.state.updates.length, 0);
  assert.equal(h.read().error, null);
});

test('existing-booking retry mutex and API-context fence prevent duplicate or stale payment links', async () => {
  const h = createExistingPaymentHarness();
  h.state.pending = deferred();
  const first = h.read().createForDispatchedBooking();
  assert.equal(await h.read().createForDispatchedBooking(), null);
  assert.equal(h.state.posts.length, 1);
  h.state.revision += 1;
  h.state.pending.resolve({ checkoutUrl: 'https://example.invalid/old-project', depositAmountPence: 2400, remainingBalancePence: 9600 });
  assert.equal(await first, null);
  assert.equal(h.state.updates.length, 0);
});

test('full existing bookings retain the outstanding-balance endpoint', async () => {
  const h = createExistingPaymentHarness({ paymentChoice: 'full' });
  const link = await h.read().createForDispatchedBooking();
  assert.deepEqual(h.state.posts.map((call) => call.url), ['/api/admin/bookings/EXISTING-DEPOSIT/payment-link']);
  assert.equal(link.kind, 'full');
  assert.equal(link.amountPence, 12000);
});

function panelProps(patch = {}) {
  const calls = { toggles: [], marks: [], copies: 0 };
  return {
    calls,
    props: {
      effectiveTotal: 194.32, selectedChoice: 'full', busy: false, paymentLink: null, dispatchedRefNumber: null,
      dispatchedBookingId: null, paymentConfirmed: false, onChoose: () => {}, externalPayment: null, manualPaymentRecorded: null,
      onToggleExternalPayment: (kind) => calls.toggles.push(kind), onMarkPaid: (kind) => calls.marks.push(kind),
      markPaidBusy: null, onCopyPaymentDetails: () => { calls.copies += 1; }, ...patch,
    },
  };
}
const buttons = (tree) => findNodes(tree, (item) => item.type === 'AppButton').map((item) => item.props);

test('before the booking exists, "already paid elsewhere" is a switch for full and deposit, never for cash', () => {
  for (const choice of ['full', 'deposit']) {
    const { props, calls } = panelProps({ selectedChoice: choice });
    const [toggle] = findNodes(renderFunction('PaymentDispatchPanel', props), (item) => item.type === 'Switch');
    assert.equal(toggle.props.value, false);
    toggle.props.onValueChange(true);
    toggle.props.onValueChange(false);
    assert.deepEqual(calls.toggles, [choice, null]);
  }
  const on = findNodes(renderFunction('PaymentDispatchPanel', panelProps({ selectedChoice: 'deposit', externalPayment: 'deposit' }).props), (item) => item.type === 'Switch');
  assert.equal(on[0].props.value, true);
  assert.equal(findNodes(renderFunction('PaymentDispatchPanel', panelProps({ selectedChoice: 'cash' }).props), (item) => item.type === 'Switch').length, 0);
});

test('after the booking exists, staff can mark the deposit and then the balance as paid', () => {
  const { props, calls } = panelProps({ selectedChoice: 'deposit', dispatchedRefNumber: 'TYR-1', dispatchedBookingId: 'b1' });
  const labels = buttons(renderFunction('PaymentDispatchPanel', props));
  assert.deepEqual(labels.map((item) => item.label), ['Mark deposit paid (other link)', 'Mark balance paid (other link)', 'Copy payment details']);
  labels[0].onPress();
  assert.deepEqual(calls.marks, ['deposit']);
  const afterDeposit = buttons(renderFunction('PaymentDispatchPanel', panelProps({ selectedChoice: 'deposit', dispatchedRefNumber: 'TYR-1', manualPaymentRecorded: 'deposit' }).props));
  assert.deepEqual(afterDeposit.map((item) => item.label), ['Mark balance paid (other link)', 'Copy payment details']);
  const paid = buttons(renderFunction('PaymentDispatchPanel', panelProps({ dispatchedRefNumber: 'TYR-1', manualPaymentRecorded: 'full' }).props));
  assert.deepEqual(paid.map((item) => item.label), ['Copy payment details']);
});

test('the copy button is always there and copies the link once it exists', () => {
  const { props, calls } = panelProps();
  const [copy] = buttons(renderFunction('PaymentDispatchPanel', props));
  assert.equal(copy.label, 'Copy payment details');
  copy.onPress();
  assert.equal(calls.copies, 1);
  const linked = buttons(renderFunction('PaymentDispatchPanel', panelProps({ paymentLink: { kind: 'full', paymentUrl: 'https://pay.example.invalid', amountPence: 19432 } }).props));
  assert.equal(linked.at(-1).label, 'Copy payment link');
});

for (const kind of ['full', 'deposit']) {
  test(`already paid elsewhere (${kind}) creates no Stripe link and records the payment on the new booking`, async () => {
    const h = createDispatchHarness({ paymentChoice: kind, externalPayment: kind });
    const original = h.api.post;
    h.api.post = async (url, body) => {
      if (!url.endsWith('/manual-payment')) return original(url, body);
      h.state.posts.push({ url, body });
      return { status: 'recorded', kind };
    };
    assert.equal(await h.read().choosePaymentAndDispatch(kind), true);
    assert.deepEqual(h.state.posts.map((call) => call.url), [
      '/api/admin/quick-book/test-quick-book/finalize',
      '/api/mobile/admin/bookings/TEST-FINALIZED/manual-payment',
    ]);
    assert.equal(h.state.posts[1].body.kind, kind);
    assert.equal(h.state.draft.paymentLink, null);
    assert.equal(h.state.draft.manualPaymentRecorded, kind);
    assert.equal(h.read().canRetryPaymentLink, false);
  });
}

test('if recording the outside payment fails, the booking stays and no Stripe link is created', async () => {
  const h = createDispatchHarness({ paymentChoice: 'full', externalPayment: 'full' });
  const original = h.api.post;
  h.api.post = async (url, body) => {
    if (!url.endsWith('/manual-payment')) return original(url, body);
    throw new Error('Server unavailable.');
  };
  assert.equal(await h.read().choosePaymentAndDispatch('full'), false);
  assert.equal(h.state.posts.some((call) => call.url.endsWith('/checkout-session')), false);
  assert.equal(h.state.draft.dispatchedRefNumber, 'TEST-FINALIZED');
  assert.match(h.read().error, /Booking TEST-FINALIZED is saved\. Could not mark it as paid/);
});
