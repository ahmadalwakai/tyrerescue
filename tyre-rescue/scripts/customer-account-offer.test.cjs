const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/booking-screen.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const find = (tree, predicate) => !tree || typeof tree !== 'object' ? undefined
  : Array.isArray(tree) ? tree.map(child => find(child, predicate)).find(Boolean)
    : predicate(tree) ? tree : find(tree.props?.children, predicate);
function harness(initialName = 'Test Customer', component = 'AccountOffer') {
  const hooks = []; let cursor = 0; let tree; const effects = [];
  const calls = { claims: [], resets: [], requests: [], next: 0 };
  const state = { customerName: initialName, customerEmail: 'customer@isolated.invalid', customerPhone: '07000000000',
    refNumber: 'TYR-PAID-1', bookingId: 'paid-booking', bookingAccessToken: 'paid-device-proof',
    quoteId: 'quote', quoteExpiresAt: new Date(Date.now() + 60_000).toISOString(), selectedTyres: [], tyreSize: {} };
  const react = {
    useState(initial) { const index = cursor++; hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [hooks[index].value, value => { hooks[index].value = value; }]; },
    useRef(initial) { const index = cursor++; return hooks[index] ??= { current: initial }; },
    useEffect(effect) { const index = cursor++; if (!hooks[index]) { hooks[index] = {}; effects.push(() => { hooks[index].cleanup = effect(); }); } },
  };
  const account = { profile: null, createAccountFromBooking: async input => { calls.claims.push(input); return { message: 'Account saved.' }; },
    forgotPassword: async email => { calls.resets.push(email); return 'Reset link requested.'; } };
  const dependencies = {
    react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    '@expo/vector-icons': { Feather: 'Feather' }, 'expo-router': {}, 'expo-image-picker': {}, 'expo-clipboard': {}, 'expo-haptics': {},
    'react-native': { View: 'View', Text: 'Text', Platform: { OS: 'ios' }, StyleSheet: { create: value => value } },
    './customer-account': { useCustomerAccount: () => account },
    './theme': { colors: {}, spacing: {}, typography: {}, radii: {} },
    './ui': Object.fromEntries(['Disclosure', 'TextField', 'InlineNotice', 'PrimaryButton', 'Section', 'ScreenHeader', 'Card'].map(key => [key, key])),
    './booking-footer': { BookingContinueButton: 'BookingContinueButton' },
    './booking-helpers': { requiresNewQuote: () => false, tyreSizeDisplay: () => '', problemTitle: () => '' },
    './types': { tyreSizeDisplay: () => '' },
    './customer-booking-access': { bookingAccessScope: () => 1 },
    './api': { API: { createBooking: '/create' }, requestJson: async (url, init) => { calls.requests.push({ url, init }); return {}; } },
  };
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\nObject.assign(exports,{AccountOffer,CustomerStep});})`, { Date, Error }, { filename: 'booking-screen.tsx' })(
    name => dependencies[name] ?? {}, module, module.exports);
  const props = { state, updateState: value => Object.assign(state, value), goNext: () => { calls.next++; }, goTo: () => {} };
  function render() { cursor = 0; tree = module.exports[component](props); effects.splice(0).forEach(run => run()); return tree; }
  function button(label) { const found = find(render(), node => ['PrimaryButton', 'BookingContinueButton'].includes(node.type) && node.props.children === label); assert.ok(found, `Missing action: ${label}`); return found; }
  function field(label, value) { const found = find(render(), node => node.type === 'TextField' && node.props.label === label); assert.ok(found, `Missing field: ${label}`); found.props.onChangeText(value); }
  const notice = () => find(render(), node => node.type === 'InlineNotice')?.props.children;
  return { state, account, calls, render, button, field, notice, unmount: () => hooks.forEach(hook => hook.cleanup?.()) };
}

test('post-payment creation enforces name and password rules, then sends corrected name and the same paid-booking capability', async () => {
  const h = harness('A');
  h.field('Password', 'Strong123'); h.field('Confirm password', 'Strong123');
  await h.button('Create account').props.onPress();
  assert.match(h.notice(), /full name/); assert.equal(h.calls.claims.length, 0);
  h.field('Full name', '  Alice Customer  '); h.field('Password', 'weak'); h.field('Confirm password', 'weak');
  await h.button('Create account').props.onPress(); assert.match(h.notice(), /uppercase/); assert.equal(h.calls.claims.length, 0);
  h.field('Password', 'Strong123'); h.field('Confirm password', 'Strong123');
  await h.button('Create account').props.onPress();
  const input = h.calls.claims[0]; assert.equal(input.mode, 'create'); assert.equal(input.name, 'Alice Customer');
  assert.equal(input.refNumber, 'TYR-PAID-1'); assert.equal(input.bookingAccessToken, 'paid-device-proof');
  assert.equal(h.state.bookingId, 'paid-booking');
});

test('existing-account sign-in accepts legacy passwords without confirmation and retains paid-booking proof', async () => {
  const h = harness('A'); h.button('Already have an account?').props.onPress();
  assert.equal(find(h.render(), node => node.props?.label === 'Confirm password'), undefined);
  h.field('Password', 'legacy'); await h.button('Sign in and link booking').props.onPress();
  assert.equal(h.calls.claims.length, 1); assert.equal(h.calls.claims[0].mode, 'signin'); assert.equal(h.calls.claims[0].password, 'legacy');
  assert.equal(h.calls.claims[0].refNumber, 'TYR-PAID-1'); assert.equal(h.calls.claims[0].bookingAccessToken, 'paid-device-proof');
});

test('forgot-password stays in the paid booking and a subsequent sign-in claims that same booking', async () => {
  const h = harness(); h.button('Already have an account?').props.onPress(); h.field('Password', 'old');
  await h.button('Forgot password').props.onPress();
  assert.deepEqual(h.calls.resets, ['customer@isolated.invalid']); assert.equal(h.calls.claims.length, 0);
  assert.match(h.notice(), /return here/); assert.equal(h.state.refNumber, 'TYR-PAID-1');
  h.field('Password', 'NewPassword123'); await h.button('Sign in and link booking').props.onPress();
  assert.equal(h.calls.claims[0].bookingAccessToken, 'paid-device-proof');
});

test('failed sign-in retains mode and capability for retry without creating an account', async () => {
  const h = harness(); h.button('Already have an account?').props.onPress(); h.field('Password', 'wrong');
  h.account.createAccountFromBooking = async input => { h.calls.claims.push(input); throw new Error('Wrong password'); };
  await h.button('Sign in and link booking').props.onPress();
  assert.match(h.notice(), /Wrong password/); assert.equal(h.calls.claims[0].mode, 'signin');
  assert.equal(h.state.bookingAccessToken, 'paid-device-proof'); assert.ok(h.button('Forgot password'));
});

test('repeated taps and mode changes cannot race an in-flight account action', async () => {
  const h = harness(); let complete;
  h.account.createAccountFromBooking = input => { h.calls.claims.push(input); return new Promise(resolve => { complete = resolve; }); };
  h.field('Password', 'Strong123'); h.field('Confirm password', 'Strong123');
  const action = h.button('Create account').props.onPress; const work = action(); await action();
  h.button('Already have an account?').props.onPress(); assert.equal(h.calls.claims.length, 1);
  assert.equal(h.button('Already have an account?').props.disabled, true);
  complete({ message: 'Saved' }); await work; assert.ok(h.button('Create account'));
});

test('switching account modes clears passwords and notices but retains the corrected name and booking', async () => {
  const h = harness('A'); h.field('Full name', 'Alice Customer'); h.field('Password', 'Strong123');
  h.button('Already have an account?').props.onPress(); h.field('Password', 'legacy');
  h.button('Create a new account instead').props.onPress();
  assert.equal(find(h.render(), node => node.props?.label === 'Full name').props.value, 'Alice Customer');
  assert.equal(find(h.render(), node => node.props?.label === 'Password').props.value, '');
  assert.equal(h.state.refNumber, 'TYR-PAID-1');
});

test('checkout rejects a one-character name before creating a booking', async () => {
  const h = harness('A', 'CustomerStep');
  await h.button('Continue to payment').props.onPress();
  assert.match(h.notice(), /at least 2/); assert.equal(h.calls.requests.length, 0); assert.equal(h.calls.next, 0);
});
