const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, dependencies = {}, globals = {}) {
  const filename = path.join(__dirname, '..', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {
    Error, process: { env: {} }, __DEV__: true, ...globals,
  }, { filename })((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

const merchant = 'merchant.com.example.customer';
const baseConfig = require('../app.json').expo;

function configure(value, config = baseConfig) {
  return load('app.config.ts', {}, {
    process: { env: value === undefined ? {} : { EXPO_PUBLIC_APPLE_MERCHANT_ID: value } },
  }).default({ config });
}

function stripePlugin(config) {
  return config.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === '@stripe/stripe-react-native')[1];
}

function runtimeConfig(config) {
  return load('src/config.ts', {
    'react-native': { Platform: { OS: 'ios' } },
    'expo-constants': { expoConfig: config },
  });
}

test('an unconfigured build keeps card payments and adds no Apple Pay merchant entitlement', () => {
  for (const value of [undefined, '', '   ']) {
    const config = configure(value);
    assert.equal(stripePlugin(config).merchantIdentifier, undefined);
    assert.equal(stripePlugin(config).enableGooglePay, false);
    assert.equal(runtimeConfig(config).APPLE_MERCHANT_ID, undefined);
    assert.equal(config.ios.bundleIdentifier, baseConfig.ios.bundleIdentifier);
    assert.equal(config.version, baseConfig.version);
    assert.equal(config.extra.eas.projectId, baseConfig.extra.eas.projectId);
  }
});

test('a configured build uses the same trimmed merchant in the native plugin and runtime', () => {
  const config = configure(` ${merchant} `);
  assert.equal(stripePlugin(config).merchantIdentifier, merchant);
  assert.equal(runtimeConfig(config).APPLE_MERCHANT_ID, merchant);
  assert.equal(stripePlugin(config).enableGooglePay, false);
});

test('invalid merchant IDs stop the build instead of producing a broken Apple Pay release', () => {
  for (const value of ['example', 'merchant.', 'merchant..example', 'merchant.com/example', 'merchant.com example']) {
    assert.throws(() => configure(value), /EXPO_PUBLIC_APPLE_MERCHANT_ID/);
  }
});

test('clearing the environment also clears stale merchant configuration', () => {
  const configured = configure(merchant);
  const cleared = configure(undefined, configured);
  assert.equal(stripePlugin(cleared).merchantIdentifier, undefined);
  assert.equal(runtimeConfig(cleared).APPLE_MERCHANT_ID, undefined);
});

test('Expo preserves the merchant in its resolved public config and Stripe generates the corresponding entitlement', () => {
  const { getConfig } = require('@expo/config');
  const { setApplePayEntitlement } = require('@stripe/stripe-react-native/lib/commonjs/plugin/withStripe');
  const previous = process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID;
  try {
    delete process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID;
    const unconfigured = getConfig(path.join(__dirname, '..')).exp;
    assert.equal(unconfigured.extra.appleMerchantIdentifier, '');
    assert.deepEqual(setApplePayEntitlement(stripePlugin(unconfigured).merchantIdentifier, {}), {});

    process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID = merchant;
    const configured = getConfig(path.join(__dirname, '..')).exp;
    assert.equal(configured.extra.appleMerchantIdentifier, merchant);
    assert.equal(runtimeConfig(configured).APPLE_MERCHANT_ID, merchant);
    assert.deepEqual(setApplePayEntitlement(stripePlugin(configured).merchantIdentifier, {}), {
      'com.apple.developer.in-app-payments': [merchant],
    });
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID;
    else process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID = previous;
  }
});

function paymentHarness(merchantId, platform = 'ios', overrides = {}) {
  const calls = [];
  const stripe = {
    initPaymentSheet: async (params) => { calls.push(params); return {}; },
    presentPaymentSheet: async () => ({}),
    ...overrides,
  };
  const module = load('src/use-customer-payment.native.ts', {
    react: { useCallback: (callback) => callback },
    'react-native': { Platform: { OS: platform } },
    '@stripe/stripe-react-native': { useStripe: () => stripe },
    './config': { APPLE_MERCHANT_ID: merchantId, STRIPE_PUBLISHABLE_KEY: 'pk_test_isolated' },
  });
  return { calls, payment: module.useCustomerPayment() };
}

test('iOS PaymentSheet offers Apple Pay for the GB business using the existing server PaymentIntent', async () => {
  const h = paymentHarness(merchant);
  await h.payment.prepare('pi_isolated_secret_existing');
  const params = h.calls[0];
  assert.equal(params.applePay.merchantCountryCode, 'GB');
  assert.equal(params.paymentIntentClientSecret, 'pi_isolated_secret_existing');
  assert.equal(params.merchantDisplayName, 'Tyre Rescue');
  assert.equal(params.allowsDelayedPaymentMethods, false);
  assert.equal(params.returnURL, 'tyrerescue://stripe-redirect');
});

test('cards remain available without a merchant and Android does not enable Apple Pay', async () => {
  for (const [identifier, platform] of [[undefined, 'ios'], [merchant, 'android']]) {
    const h = paymentHarness(identifier, platform);
    await h.payment.prepare('pi_isolated_secret_existing');
    assert.equal(h.calls[0].applePay, undefined);
    assert.equal(h.calls[0].paymentIntentClientSecret, 'pi_isolated_secret_existing');
  }
});

test('wallet cancellation retains the payment cancellation signal used to avoid false confirmation', async () => {
  const h = paymentHarness(merchant, 'ios', {
    presentPaymentSheet: async () => ({ error: { code: 'Canceled', message: 'Payment cancelled' } }),
  });
  await assert.rejects(h.payment.pay(), { name: 'PaymentCancelled', message: 'Payment cancelled' });
});

test('StripeProvider receives the configured merchant and keeps the existing redirect scheme', () => {
  const { CustomerStripeProvider } = load('src/stripe-provider.native.tsx', {
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    '@stripe/stripe-react-native': { StripeProvider: 'StripeProvider' },
    './config': { APPLE_MERCHANT_ID: merchant, STRIPE_PUBLISHABLE_KEY: 'pk_test_isolated' },
  });
  const provider = CustomerStripeProvider({ children: 'checkout' });
  assert.equal(provider.props.merchantIdentifier, merchant);
  assert.equal(provider.props.urlScheme, 'tyrerescue');
  assert.equal(provider.props.children, 'checkout');
});
