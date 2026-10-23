const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/customer-payment-recovery.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const source = { exports: {} };
vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { Error }, { filename })(
  name => { throw new Error(`Unexpected dependency: ${name}`); }, source, source.exports,
);
const { validateCustomerPaymentStatus } = source.exports;
const expectedId = 'pi_Isolated123';
const status = (fields = {}) => ({ paymentIntentId: expectedId, status: 'requires_payment_method', canResume: true, clientSecret: `${expectedId}_secret_neverNetwork`, amountPence: 15000, currency: 'gbp', ...fields });

test('only a resumable status for the same intent with its matching secret unlocks another attempt', () => {
  for (const name of ['requires_payment_method', 'requires_confirmation', 'requires_action']) {
    const result = Object.freeze(status({ status: name }));
    assert.equal(validateCustomerPaymentStatus(result, expectedId), result);
  }
});

test('processing, success, cancellation and manual capture remain non-resumable server states', () => {
  for (const name of ['processing', 'succeeded', 'canceled', 'requires_capture']) {
    const result = status({ status: name, canResume: false, clientSecret: undefined });
    assert.equal(validateCustomerPaymentStatus(result, expectedId), result);
    assert.throws(() => validateCustomerPaymentStatus(status({ status: name }), expectedId), /safely resume/);
  }
});

test('unknown server states are never accepted as permission to resume checkout', () => {
  assert.throws(() => validateCustomerPaymentStatus(status({ status: 'unexpected' }), expectedId), /safely resume/);
  const review = status({ status: 'unexpected', canResume: false, clientSecret: undefined });
  assert.equal(validateCustomerPaymentStatus(review, expectedId).canResume, false);
});

test('a different intent, malformed expected ID or bank URL evidence cannot stand in for the saved payment', () => {
  for (const value of [null, {}, [], 'succeeded', status({ paymentIntentId: 'pi_Other123' }), { payment_intent: expectedId, redirect_status: 'succeeded' }]) {
    assert.throws(() => validateCustomerPaymentStatus(value, expectedId), /review/);
  }
  for (const id of ['', 'pi_', 'pi_Bad-id', 'cs_Checkout', expectedId + '_secret_private']) {
    assert.throws(() => validateCustomerPaymentStatus(status(), id), /review/);
  }
});

test('resume rejects a missing, empty or unrelated secret even if every other server field looks valid', () => {
  for (const clientSecret of [undefined, null, '', `${expectedId}_secret_`, 'pi_Other123_secret_neverNetwork', true]) {
    assert.throws(() => validateCustomerPaymentStatus(status({ clientSecret }), expectedId), /safely resume/);
  }
});

test('invalid amounts, currencies and status shapes cannot unlock a payment attempt', () => {
  for (const amountPence of [0, -1, 15000.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '15000', null]) {
    assert.throws(() => validateCustomerPaymentStatus(status({ amountPence }), expectedId), /review/);
  }
  for (const fields of [{ currency: 'usd' }, { currency: 'GBP' }, { currency: undefined }, { status: null }, { status: 200 }, { canResume: 'true' }, { canResume: undefined }]) {
    assert.throws(() => validateCustomerPaymentStatus(status(fields), expectedId), /review/);
  }
});
