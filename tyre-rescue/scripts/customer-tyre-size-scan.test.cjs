/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

// Keep these tests isolated: importing another .test.cjs file registers its tests too.
const filename = path.join(__dirname, '../src/customer-tyre-size-scan.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sourceModule = { exports: {} };
vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {}, { filename })(
  name => { throw new Error(`Unexpected runtime dependency: ${name}`); },
  sourceModule,
  sourceModule.exports,
);
const { findTyreSizeCandidates } = sourceModule.exports;
const candidates = input => JSON.parse(JSON.stringify(findTyreSizeCandidates(input)));
const size = (width, aspect, rim) => ({ width, aspect, rim, label: `${width}/${aspect} R${rim}` });

test('reads a common car sidewall marking without including the load and speed rating', () => {
  assert.deepEqual(candidates('MICHELIN\n205/55 R16 91V\nRADIAL TUBELESS'), [size('205', '55', '16')]);
});

test('reads compact, passenger and light-commercial metric markings', () => {
  for (const text of ['205/55R16', 'P205/55R16 91H', 'P 205/55 R16', '205/55ZR16 91Y', '205/55 Z R16']) {
    assert.deepEqual(candidates(text), [size('205', '55', '16')], text);
  }
  for (const text of ['LT225/75R16', 'LT 225/75 R16C 118/116R', '225/75 R16CP 118R']) {
    assert.deepEqual(candidates(text), [size('225', '75', '16')], text);
  }
});

test('handles case, spaces and OCR line breaks without guessing missing digits', () => {
  for (const text of ['205 / 55 r 16', '205/\n55\nR16', '205\t/55\tZr\t16']) {
    assert.deepEqual(candidates(text), [size('205', '55', '16')], text);
  }
});

test('normalizes full-width characters and Unicode fraction or division slashes', () => {
  for (const text of ['２０５／５５ Ｒ１６', '205⁄55 R16', '205∕55 R16']) {
    assert.deepEqual(candidates(text), [size('205', '55', '16')], text);
  }
});

test('preserves distinct readings for explicit selection instead of choosing one automatically', () => {
  assert.deepEqual(candidates('FRONT 205/55 R16\nREAR 225/45 R17'), [
    size('205', '55', '16'), size('225', '45', '17'),
  ]);
});

test('deduplicates equivalent readings while preserving their first-seen order', () => {
  assert.deepEqual(candidates('225/45R17\n205/55 R16\nP225/45 R17 91Y\n205 / 55 r16'), [
    size('225', '45', '17'), size('205', '55', '16'),
  ]);
});

test('accepts the explicit scanner dimension boundaries', () => {
  assert.deepEqual(candidates('125/20 R10\n445/95 R24'), [size('125', '20', '10'), size('445', '95', '24')]);
});

test('rejects values outside supported dimension ranges and five-unit size increments', () => {
  for (const text of ['120/55R16', '450/55R16', '123/55R16', '205/15R16', '205/100R16', '205/22R16', '205/55R09', '205/55R25']) {
    assert.deepEqual(candidates(text), [], text);
  }
});

test('does not reinterpret decimal or oversized rims as a smaller valid whole-inch rim', () => {
  for (const text of ['205/55 R16.5', '205/55 R160', '205/55 R1691V', '205/55 R16,5']) {
    assert.deepEqual(candidates(text), [], text);
  }
});

test('does not extract a size from the middle of an alphanumeric identifier', () => {
  for (const text of ['ABC205/55R16', '1205/55R16', 'LT1205/55R16', 'X205/55R16']) {
    assert.deepEqual(candidates(text), [], text);
  }
});

test('allows ordinary surrounding punctuation without absorbing it into the size', () => {
  assert.deepEqual(candidates('SIZE: (205/55 R16); please check.'), [size('205', '55', '16')]);
});

test('never corrects visually similar letters into digits', () => {
  for (const text of ['2O5/55 R16', '205/5S R16', '205/55 RI6', '205/55 Rl6', '2O5/SS RI6']) {
    assert.deepEqual(candidates(text), [], text);
  }
});

test('does not invent a profile or infer a size from incomplete and nonmetric markings', () => {
  for (const text of ['205 R16', '205/55', '205 55 16', '205/55 16', '205-55 R16', '31x10.50 R15', '7.50 R16', '205/55 B16']) {
    assert.deepEqual(candidates(text), [], text);
  }
});

test('ignores DOT date codes, pressure, ratings and treadwear information', () => {
  const sidewall = 'DOT 1A2B 0524\nMAX PRESS 350 kPa (51 PSI)\nMAX LOAD 615 kg\nTREADWEAR 300 TRACTION AA TEMPERATURE A\n91V 205 55 16';
  assert.deepEqual(candidates(sidewall), []);
});

test('bad or blank native output safely produces no candidate without coercion', () => {
  for (const input of [undefined, null, '', ' \n\t ', 2055516, false, [], {}, { toString() { throw new Error('Must not coerce native output'); } }]) {
    assert.deepEqual(candidates(input), []);
  }
});

test('a rejected marking does not hide a separate readable tyre size', () => {
  assert.deepEqual(candidates('205/55 R16.5\nDOT 0524\n225/45 R17 94Y'), [size('225', '45', '17')]);
});
