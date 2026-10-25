 
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/components/AssistedChatScreen.tsx');
const screen = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findNode(predicate, label) {
  let result;
  const visit = (node) => {
    if (!result && predicate(node)) result = node;
    if (!result) ts.forEachChild(node, visit);
  };
  visit(screen);
  assert.ok(result, `Missing source behavior: ${label}`);
  return result;
}
const recoveryCard = findNode((node) => ts.isJsxExpression(node) &&
  node.expression && ts.isConditionalExpression(node.expression) &&
  node.expression.condition.getText(screen) === 'dispatch.canRetryPaymentLink', 'saved-booking recovery card').expression;
const closeReviewEffect = findNode((node) => ts.isCallExpression(node) && node.expression.getText(screen) === 'useEffect' &&
  node.arguments[0]?.getText(screen).includes('draft.dispatchedBookingId') &&
  node.arguments[0]?.getText(screen).includes('setReviewOpen(false)'), 'close saved-booking review effect').arguments[0];

const element = (type, props) => ({ type, props });
function execute(source, globals) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  return vm.runInNewContext(compiled, {
    exports: {},
    require: (name) => {
      assert.equal(name, 'react/jsx-runtime');
      return { jsx: element, jsxs: element, Fragment: 'Fragment' };
    },
    ...globals,
  });
}
function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap((item) => nodes(item, type));
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
}
const forbidden = () => { throw new Error('The UI must not finalize, reprice or create a payment itself.'); };
function renderRecovery(options = {}) {
  let retries = 0;
  const tree = execute(`(${recoveryCard.getText(screen)})`, {
    draft: { paymentChoice: options.choice ?? 'deposit', dispatchedRefNumber: options.reference ?? null },
    dispatch: {
      canRetryPaymentLink: options.visible ?? true,
      busy: options.busy ?? false,
      retryPaymentLink: () => { retries += 1; return Promise.resolve(true); },
      choosePaymentAndDispatch: forbidden,
    },
    paymentLinkActions: { busy: options.linkBusy ?? false, createForDispatchedBooking: forbidden },
    price: { getPrice: forbidden }, api: { post: forbidden, patch: forbidden }, update: forbidden,
    SectionCard: 'SectionCard', Text: 'Text', AppButton: 'AppButton', styles: { bodyText: {} },
  });
  return { tree, button: nodes(tree, 'AppButton')[0], retries: () => retries };
}

test('a partial saved-booking retry delegates to recovery without finalizing or repricing', () => {
  const h = renderRecovery();
  assert.equal(nodes(h.tree, 'SectionCard').length, 1);
  assert.equal(h.button.props.label, 'Retry deposit payment link');
  assert.equal(h.button.props.disabled, false);
  h.button.props.onPress();
  assert.equal(h.retries(), 1);
});

test('the recovery card is hidden when there is no pending saved-booking payment link', () => {
  const h = renderRecovery({ visible: false });
  assert.equal(h.tree, null);
  assert.equal(h.retries(), 0);
});

test('the recovery button is unavailable while either dispatch or an existing-link retry is busy', () => {
  for (const options of [{ busy: true }, { linkBusy: true }]) {
    const h = renderRecovery(options);
    assert.equal(h.button.props.disabled, true);
    assert.equal(h.retries(), 0);
  }
});

test('full-payment recovery retains the same booking reference and the dedicated retry callback', () => {
  const h = renderRecovery({ choice: 'full', reference: 'ISOLATED-SAVED-BOOKING' });
  assert.equal(h.button.props.label, 'Retry payment link');
  assert.match(JSON.stringify(h.tree), /ISOLATED-SAVED-BOOKING/);
  h.button.props.onPress();
  assert.equal(h.retries(), 1);
});

test('the actual review effect reveals recovery only after dispatch settles and a saved identity exists', () => {
  for (const [busy, bookingId, refNumber, expectedCloses] of [
    [true, 'isolated-booking', 'ISOLATED-REF', 0],
    [true, 'isolated-booking', null, 0],
    [false, null, null, 0],
    [false, 'isolated-booking', null, 1],
    [false, null, 'ISOLATED-REF', 1],
    [false, 'isolated-booking', 'ISOLATED-REF', 1],
  ]) {
    const closes = [];
    execute(`(${closeReviewEffect.getText(screen)})();`, {
      dispatch: { busy, choosePaymentAndDispatch: forbidden, retryPaymentLink: forbidden },
      draft: { dispatchedBookingId: bookingId, dispatchedRefNumber: refNumber },
      setReviewOpen: (open) => { closes.push(open); }, update: forbidden, api: { post: forbidden, patch: forbidden },
    });
    assert.equal(closes.length, expectedCloses);
    assert.ok(closes.every((value) => value === false));
  }
});
