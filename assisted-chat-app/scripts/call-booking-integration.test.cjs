const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const src = path.join(__dirname, '../src');
function load(relative, dependencies = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(src, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return module.exports;
}
const workflow = load('lib/assisted-chat-workflow.ts', { './geo': load('lib/geo.ts'), './booking-schedule': load('lib/booking-schedule.ts') });
const { buildCallBookingDraftPatch } = load('lib/call-booking-draft.ts', { './assisted-chat-workflow': workflow });
const screen = ts.createSourceFile('screen.tsx', fs.readFileSync(path.join(src, 'components/AssistedChatScreen.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(screen) === 'handleApplyCallReview') callback = node.initializer.arguments[0].getText(screen);
  ts.forEachChild(node, visit);
}
visit(screen);
assert.ok(callback, 'The call review must be connected to the booking screen');
const compiledCallback = ts.transpileModule(`(${callback})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

const review = {
  locationAddress: '12 High Street', tyreSize: '205/55 R16', problem: 'Rear tyre has a puncture',
  serviceType: 'repair', useLocation: true, useTyreSize: true, useProblem: true,
};
function harness(options = {}) {
  const state = { updates: [], notes: [], notices: [], acknowledgements: [], extractionCalls: 0 };
  const draft = {
    customer: { name: 'Test caller', phone: '+447700900123', email: '' },
    location: { method: 'address', address: '', lat: null, lng: null, postcode: null, link: null, whatsappLink: null, status: 'idle' },
    tyreLines: [workflow.createBookingTyreLine({ id: 'tyre-1' })],
    serviceType: 'fit', note: 'Existing note', quote: null, manualPriceGbp: null, priceNeedsRefresh: false,
    quickBookingId: null, savedQuoteId: null, savedQuoteRef: null, paymentLink: null, dispatchedBookingId: null, dispatchedRefNumber: null,
    ...options.draft,
  };
  const apply = vm.runInNewContext(compiledCallback, {
    hydrated: options.hydrated ?? true,
    api: { hasAdminToken: options.authenticated ?? true },
    callAssistApiRevision: 10, getApiContextRevision: () => options.apiRevision ?? 10,
    callAssistSessionRevision: 20, getAdminSessionRevision: () => options.sessionRevision ?? 20,
    price: { loading: options.pricing ?? false }, dispatch: { busy: options.dispatching ?? false }, quoteActions: { busy: options.savingQuote ?? false },
    draft, Error,
    buildCallBookingDraftPatch(current, checked) { state.extractionCalls += 1; return buildCallBookingDraftPatch(current, checked); },
    update(patch) { state.updates.push(patch); },
    setNoteInput(note) { state.notes.push(note); },
    setDuplicateAck(value) { state.acknowledgements.push(value); },
    flashNotice(notice) { state.notices.push(notice); },
  });
  return { state, apply, draft };
}

test('reviewed fields update only the local draft and preserve the caller identity', () => {
  const { state, apply, draft } = harness();
  assert.equal(apply(review), null);
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].location.address, '12 High Street');
  assert.equal(state.updates[0].tyreLines[0].size, '205/55/R16');
  assert.equal(state.updates[0].note, 'Existing note\nCall note: Rear tyre has a puncture');
  assert.equal(state.updates[0].customer, undefined);
  assert.equal(draft.customer.phone, '+447700900123');
  assert.deepEqual(state.notes, [state.updates[0].note]);
  assert.equal(state.acknowledgements[0], false);
  // The sandbox exposes no POST/finalize/dispatch action. Any such call fails.
});

test('account changes and pending hydration prevent a reviewed transcript entering the wrong draft', () => {
  for (const options of [{ hydrated: false }, { authenticated: false }, { apiRevision: 11 }, { sessionRevision: 21 }]) {
    const { state, apply } = harness(options);
    assert.match(apply(review), /account changed/i);
    assert.equal(state.extractionCalls, 0);
    assert.equal(state.updates.length, 0);
  }
});

test('in-flight quote, price and dispatch actions block concurrent call changes', () => {
  for (const options of [{ pricing: true }, { dispatching: true }, { savingQuote: true }]) {
    const { state, apply } = harness(options);
    assert.match(apply(review), /Wait for the current booking action/);
    assert.equal(state.extractionCalls, 0);
    assert.equal(state.updates.length, 0);
  }
});

test('saved bookings and invalid review fields leave the draft and note input untouched', () => {
  for (const options of [{ draft: { quickBookingId: 'saved-quote' } }, { draft: { dispatchedBookingId: 'saved-booking' } }, {}]) {
    const { state, apply } = harness(options);
    assert.ok(apply({ ...review, tyreSize: 'invalid tyre' }));
    assert.equal(state.updates.length, 0);
    assert.equal(state.notes.length, 0);
    assert.equal(state.notices.length, 0);
  }
});
