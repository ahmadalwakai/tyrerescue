const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadSource(relative, dependencies = {}) {
  const filename = path.join(__dirname, '..', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { URL }, { filename })(
    (name) => { if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`); return dependencies[name]; },
    module, module.exports,
  );
  return module.exports;
}

const redirect = loadSource('src/customer-payment-redirect.ts');
const nativeIntent = loadSource('app/+native-intent.tsx', { '../src/customer-payment-redirect': redirect });
const query = '?payment_intent=pi_Isolated123&payment_intent_client_secret=pi_Isolated123_secret_never_network&redirect_status=succeeded';

test('the SDK forwarder filter accepts only this app and its exact bank-return endpoint', () => {
  for (const base of ['tyrerescue://stripe-redirect', 'tyrerescue://stripe-redirect/', 'tyrerescue:///stripe-redirect', 'tyrerescue:///stripe-redirect/']) {
    assert.equal(redirect.isStripeRedirectUrl(base), true);
    assert.equal(redirect.isStripeRedirectUrl(base + query), true);
    assert.equal(redirect.isStripeRedirectUrl(base + '#bank-return'), true);
  }
});

test('foreign schemes, misleading hosts, credentials, ports and unrelated app routes stay outside the Stripe filter', () => {
  for (const url of [
    'https://stripe-redirect', 'otherapp://stripe-redirect', 'tyrerescue:stripe-redirect',
    'tyrerescue://stripe-redirect.evil', 'tyrerescue://evil/stripe-redirect',
    'tyrerescue://stripe-redirect/extra', 'tyrerescue://stripe-redirect:443',
    'tyrerescue://user:password@stripe-redirect', 'tyrerescue:////stripe-redirect',
    'tyrerescue:///stripe-redirect/extra', '/stripe-redirect', 'stripe-redirect',
    'tyre\nrescue://stripe-redirect', ' tyrerescue://stripe-redirect', 'tyrerescue://stripe-redirect\\extra',
    '', 'not a URL', null, undefined,
  ]) assert.equal(redirect.isStripeRedirectUrl(url), false, String(url));
});

test('a warm bank return keeps the checkout route mounted and drops every callback query and fragment', () => {
  for (const path of ['tyrerescue://stripe-redirect', 'tyrerescue:///stripe-redirect', '/stripe-redirect', 'stripe-redirect/']) {
    const rewritten = nativeIntent.redirectSystemPath({ path: path + query + '#bank-return', initial: false });
    assert.equal(rewritten, '');
    assert.equal(rewritten.includes('secret'), false);
  }
});

test('a cold bank return opens Book so the saved payment attempt can recover, without trusting URL payment evidence', () => {
  for (const suffix of [query, '?redirect_status=failed', '?redirect_status=canceled', '?payment_intent=pi_Other']) {
    assert.equal(nativeIntent.redirectSystemPath({ path: 'tyrerescue://stripe-redirect' + suffix, initial: true }), '/');
  }
});

test('Expo-normalised callback paths use the same cold and warm policy without widening the provider URL filter', () => {
  for (const path of ['/stripe-redirect', '/stripe-redirect/', 'stripe-redirect', 'stripe-redirect/']) {
    assert.equal(redirect.isStripeRedirectUrl(path), false);
    assert.equal(nativeIntent.redirectSystemPath({ path: path + query, initial: true }), '/');
    assert.equal(nativeIntent.redirectSystemPath({ path: path + query, initial: false }), '');
  }
});

test('normal app links retain their route and query; malformed callback inputs cannot crash native routing', () => {
  for (const path of ['/track?ref=TYR-ISOLATED', 'tyrerescue://chat?ref=TYR-ISOLATED', 'https://www.tyrerescue.uk/help', 'otherapp://stripe-redirect', '/stripe-redirect-extra?ref=one']) {
    for (const initial of [true, false]) assert.equal(nativeIntent.redirectSystemPath({ path, initial }), path);
  }
  assert.equal(nativeIntent.redirectSystemPath({ path: null, initial: true }), '/');
  assert.equal(nativeIntent.redirectSystemPath({ path: 'tyrerescue://[invalid', initial: false }), 'tyrerescue://[invalid');
});

test('repeated callback delivery is stateless, and the native-intent adapter needs no Stripe initialisation', () => {
  for (let index = 0; index < 3; index++) {
    assert.equal(nativeIntent.redirectSystemPath({ path: 'tyrerescue://stripe-redirect' + query, initial: false }), '');
    assert.equal(nativeIntent.redirectSystemPath({ path: 'tyrerescue://stripe-redirect' + query, initial: true }), '/');
  }
});
