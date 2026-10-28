 
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { loadSource } = require('./chat-modals.test.cjs');

const src = path.join(__dirname, '../src');
const parse = (relative) => ts.createSourceFile(relative, fs.readFileSync(path.join(src, relative), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const screen = parse('components/AssistedChatScreen.tsx');
const locationSection = parse('components/LocationSection.tsx');
const draftSource = parse('hooks/useAssistedChatDraft.ts');
const geo = loadSource('lib/geo.ts', {});
const workflowModule = loadSource('lib/assisted-chat-workflow.ts', { './geo': geo });

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

function expression(source, name) {
  return initializer(source, name).getText(source);
}

function callback(source, name) {
  const node = initializer(source, name);
  return (ts.isCallExpression(node) ? node.arguments[0] : node).getText(source);
}

const bottomAction = findNode(screen, (node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(screen) === 'PremiumBottomAction', 'bottom action');
function actionAttribute(name) {
  const node = bottomAction.attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.getText(screen) === name);
  assert.ok(node?.initializer && ts.isJsxExpression(node.initializer), `Missing action expression: ${name}`);
  return node.initializer.expression.getText(screen);
}

function execute(source, globals) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return vm.runInNewContext(compiled, globals);
}

function createHarness(options = {}) {
  const draft = execute(`(${expression(draftSource, 'EMPTY_DRAFT')})`, workflowModule);
  Object.assign(draft, options.draft ?? {});
  draft.customer = { name: 'Example customer', phone: '', email: '', ...options.customer };
  draft.location = {
    ...draft.location,
    method: 'address', address: 'Example street, Glasgow', lat: 55.8642, lng: -4.2518, status: 'received',
    ...options.location,
  };
  const state = { draft, editingStage: options.editingStage ?? 'LOCATION', links: [], notices: [], keyboardDismisses: 0, prices: 0, saves: 0, confirms: 0, dispatches: 0, updates: [] };
  function read() {
    const workflow = workflowModule.getAssistedChatWorkflow({ draft: state.draft, canUseApi: true });
    const globals = {
      ...workflowModule,
      draft: state.draft, editingStage: state.editingStage, workflow,
      locationShare: { busy: options.busy ?? null, requestLink: async (method) => { state.links.push(method); } },
      price: { loading: Boolean(options.priceLoading), getPrice: async () => { state.prices += 1; } },
      quoteActions: { busy: options.quoteBusy ?? null, saveQuote: async () => { state.saves += 1; }, confirmQuote: async () => { state.confirms += 1; } },
      dispatch: { busy: Boolean(options.dispatchBusy) },
      Keyboard: { dismiss: () => { state.keyboardDismisses += 1; } },
      flashNotice: (notice) => { state.notices.push(notice); },
      setEditingStage: (stage) => { state.editingStage = stage; },
      update: (patch) => { state.updates.push(patch); state.draft = { ...state.draft, ...patch }; },
      handleReviewDispatch: () => { state.dispatches += 1; },
      openBookingsInApp: () => { throw new Error('Unexpected booking navigation'); },
    };
    const declarations = ['activeStage', 'isManualLocationEditing', 'manualLocationBlockedReason', 'primaryLabel', 'primaryDisabled', 'primaryDisabledReason']
      .map((name) => `const ${name} = ${expression(screen, name)};`).join('\n');
    return execute(`${declarations}\n({
      stage: activeStage, label: primaryLabel, disabled: primaryDisabled, reason: primaryDisabledReason,
      helper: (${actionAttribute('helper')}), icon: (${actionAttribute('icon')}), loading: (${actionAttribute('loading')}),
      press: (${callback(screen, 'handlePrimaryAction')}), update: (${callback(screen, 'handleActiveStageUpdate')})
    });`, globals);
  }
  function typeAddress(text) {
    execute(`(${callback(locationSection, 'handleAddressChange')})`, {
      draft: state.draft,
      setAddressInput: () => {}, setShowSuggestions: () => {},
      update: read().update, timer: { current: null }, clearTimeout: () => {},
      // Debounced search remains inert; this test never geocodes or calls an API.
      setTimeout: () => 1, search: () => { throw new Error('Unexpected geocoding request'); },
    })(text);
  }
  return { state, read, typeAddress };
}

test('confirmed manual address completes editing without sending a link or calculating a price', async () => {
  const h = createHarness({ busy: 'whatsapp', priceLoading: true, quoteBusy: 'save', dispatchBusy: true });
  const action = h.read();
  assert.equal(action.label, 'Done Editing');
  assert.equal(action.disabled, false);
  assert.equal(action.loading, false);
  assert.equal(action.icon, 'check');
  assert.match(action.helper, /continue to the next step/);
  await action.press();
  assert.equal(h.state.editingStage, null);
  assert.equal(h.state.keyboardDismisses, 1);
  assert.equal(h.read().stage, 'TYRE');
  assert.deepEqual(h.state.links, []);
  assert.equal(h.state.prices + h.state.saves + h.state.confirms + h.state.dispatches, 0);
});

test('manual address selection stays in the editor until Done Editing is pressed', async () => {
  const h = createHarness({ location: { address: '', lat: null, lng: null, status: 'idle' } });
  h.state.editingStage = null;
  assert.equal(h.read().stage, 'LOCATION');
  const selectedLocation = { ...h.state.draft.location, address: 'Selected example street', lat: 55.86, lng: -4.25, status: 'received' };
  h.read().update({ location: selectedLocation });
  assert.equal(workflowModule.getAssistedChatStage({ draft: h.state.draft }), 'TYRE');
  assert.equal(h.read().stage, 'LOCATION');
  assert.equal(h.read().label, 'Done Editing');
  await h.read().press();
  assert.equal(h.read().stage, 'TYRE');
  assert.deepEqual(h.state.links, []);
});

test('typed but unselected address cannot advance or send a link', async () => {
  const h = createHarness({ location: { lat: null, lng: null, status: 'idle' } });
  const action = h.read();
  assert.equal(action.label, 'Done Editing');
  assert.equal(action.disabled, true);
  assert.match(action.reason, /Select an address from the suggestions/);
  // The reason is rendered once, beneath the button; the helper keeps the guidance.
  assert.equal(action.helper, 'Confirm this address and continue to the next step');
  await action.press();
  assert.equal(h.state.editingStage, 'LOCATION');
  assert.equal(h.state.keyboardDismisses, 0);
  assert.equal(h.state.notices[0].text, action.reason);
  assert.deepEqual(h.state.links, []);
});

test('manual address confirmation rejects missing, nonfinite, out-of-range coordinates and blank address', () => {
  const valid = createHarness().state.draft.location;
  const invalid = [
    { address: '   ' }, { lat: null }, { lng: null }, { lat: NaN }, { lng: Infinity },
    { lat: 90.1 }, { lat: -90.1 }, { lng: 180.1 }, { lng: -180.1 },
  ];
  for (const patch of invalid) {
    assert.ok(workflowModule.getManualLocationBlockedReason({ ...valid, ...patch }));
  }
  assert.equal(workflowModule.getManualLocationBlockedReason(valid), null);
});

test('editing a confirmed address invalidates old coordinates and price until another address is selected', async () => {
  const h = createHarness({ draft: { quote: { total: 120 }, paymentChoice: 'cash', paymentLink: { paymentUrl: 'https://example.invalid/payment' } } });
  h.typeAddress('Another example street');
  assert.equal(h.state.draft.location.address, 'Another example street');
  assert.equal(h.state.draft.location.lat, null);
  assert.equal(h.state.draft.location.lng, null);
  assert.equal(h.state.draft.quote, null);
  assert.equal(h.state.draft.paymentChoice, null);
  assert.equal(h.state.draft.paymentLink, null);
  assert.equal(h.read().disabled, true);
  await h.read().press();
  assert.equal(h.read().stage, 'LOCATION');
  assert.deepEqual(h.state.links, []);
});

test('Done Editing resumes pricing when tyre details are already confirmed', async () => {
  const h = createHarness({ draft: { tyreLines: [workflowModule.createBookingTyreLine({ id: 'example-tyre', size: '205/55/R16', quantity: 1 })], tyreConfirmedFromSidewall: true } });
  await h.read().press();
  assert.equal(h.read().stage, 'PRICE');
  assert.equal(h.read().label, 'Get Price');
  assert.equal(h.state.prices, 0);
  assert.deepEqual(h.state.links, []);
});

test('Ask customer retains WhatsApp, email, then copy preference for both initial and reopened location steps', async () => {
  for (const editingStage of ['LOCATION', null]) {
    for (const [customer, expected] of [
      [{ phone: '+44 7700 900123', email: 'example@example.invalid' }, 'whatsapp'],
      [{ email: 'example@example.invalid' }, 'email'],
      [{}, 'copy'],
    ]) {
      const h = createHarness({ customer, location: { method: 'link', address: '', lat: null, lng: null, status: 'idle' } });
      h.state.editingStage = editingStage;
      assert.equal(h.read().label, 'Send Location Link');
      assert.equal(h.read().disabled, false);
      assert.match(h.read().helper, /Customer will receive the location link/);
      await h.read().press();
      assert.deepEqual(h.state.links, [expected]);
      assert.equal(h.state.editingStage, editingStage);
      assert.equal(h.state.keyboardDismisses, 0);
    }
  }
});

test('Ask customer continues showing its send-in-progress state without manual-address validation', () => {
  const h = createHarness({ busy: 'whatsapp', location: { method: 'link', address: '', lat: null, lng: null } });
  const action = h.read();
  assert.equal(action.label, 'Send Location Link');
  assert.equal(action.disabled, true);
  assert.equal(action.loading, true);
  assert.equal(action.reason, null);
  assert.equal(action.icon, 'paper-plane');
});
