const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadTs(relative, dependencies = {}) {
  const filename = path.join(__dirname, '..', 'src', relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {}, { filename })((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}
const geo = loadTs('lib/geo.ts');
const workflow = loadTs('lib/assisted-chat-workflow.ts', { './geo': geo, './booking-schedule': loadTs('lib/booking-schedule.ts', {}) });
const helper = loadTs('lib/call-booking-draft.ts', { './assisted-chat-workflow': workflow });
const plain = (value) => JSON.parse(JSON.stringify(value));
const draft = () => ({
  customer: { name: 'Existing customer', phone: '+447700900123', email: 'customer@example.test' },
  location: { method: 'link', address: 'Original road', lat: 55.9, lng: -4.1, postcode: 'G1 1AA', link: 'original-link', whatsappLink: 'original-share', status: 'received' },
  tyreLines: [{ id: 'front', size: '225/45/R17', quantity: 2, brand: 'Old brand', price: 80, loadIndex: '94', axle: 'front', runFlat: true }, { id: 'rear', size: '245/40/R17', quantity: 2 }],
  serviceType: 'fit', tyreConfirmedFromSidewall: true, note: 'Existing driver note',
  quote: { total: 200 }, manualPriceGbp: 180, priceNeedsRefresh: false,
  paymentChoice: 'deposit', paymentLink: null, quickBookingId: null, savedQuoteId: null, savedQuoteRef: null, dispatchedBookingId: null, dispatchedRefNumber: null,
});
const review = (extra = {}) => ({ locationAddress: '10 High Street, Glasgow G1 1AA', tyreSize: '205/55 R16', problem: 'Rear tyre has a puncture', serviceType: 'repair', useLocation: true, useTyreSize: true, useProblem: true, ...extra });

test('extracts location, normalized tyre and the customer problem without guessing payment or repair suitability', () => {
  const { review: found } = helper.extractCallBookingReview("Customer: I'm at 10 High Street, Glasgow G1 1AA. My rear tyre is flat. Tyre size: 205/55 R16. I will pay cash.");
  assert.equal(found.locationAddress, '10 High Street, Glasgow G1 1AA');
  assert.equal(found.tyreSize, '205/55/R16');
  assert.equal(found.problem, 'My rear tyre is flat');
  assert.equal(found.serviceType, 'assess');
  assert.equal(found.useLocation, true);
  assert.equal('paymentChoice' in found, false);
  assert.equal('customer' in found, false);
});

test('staff questions and negated customer problems do not become a diagnosis or suggested location/size', () => {
  const { review: found } = helper.extractCallBookingReview('Agent: Are you at 10 High Street? Tyre size: 205/55 R16. Is the tyre flat?\nCustomer: No puncture or flat tyre.');
  assert.equal(found.locationAddress, '');
  assert.equal(found.tyreSize, '');
  assert.equal(found.problem, '');
});

test('multiple sizes and locations are left for the operator to resolve', () => {
  const result = helper.extractCallBookingReview('Address: 10 High Street\nAddress: 20 West Street\nSize: 205/55 R16 or 225/45 R17\nProblem: sidewall damage');
  assert.equal(result.review.tyreSize, '');
  assert.equal(result.review.locationAddress, '');
  assert.equal(result.review.problem, 'sidewall damage');
  assert.equal(result.warnings.some((warning) => /More than one tyre size/.test(warning)), true);
  assert.equal(result.warnings.some((warning) => /More than one location/.test(warning)), true);
});

test('conflicting postcode corrections invalidate an otherwise explicit address', () => {
  const result = helper.extractCallBookingReview('Customer: I am at 12 High Street, Glasgow G1 1AA. Actually not G1 1AA, my postcode is G2 2AB.');
  assert.equal(result.review.locationAddress, '');
  assert.equal(result.review.useLocation, false);
  assert.equal(result.warnings.some((warning) => /Conflicting postcodes/.test(warning)), true);
  const consistent = helper.extractCallBookingReview('Customer: I am at 12 High Street, Glasgow G1 1AA. My postcode is G11AA.');
  assert.equal(consistent.review.locationAddress, '12 High Street, Glasgow G1 1AA');
});

test('two locations within one sentence remain separate candidates for review', () => {
  const result = helper.extractCallBookingReview('Customer: My address is 12 High Street but I am at 20 West Street.');
  assert.equal(result.review.locationAddress, '');
  assert.equal(result.review.useLocation, false);
  assert.equal(result.warnings.some((warning) => /More than one location/.test(warning)), true);
});

test('ruled-out or uncertain tyre sizes are not preselected', () => {
  for (const text of ['Customer: It is not 205/55 R16.', 'Customer: It is maybe 205/55 R16.', 'Customer: I think the tyre size is 205/55 R16.', 'المقاس ليس ٢٠٥/٥٥ R١٦']) {
    const result = helper.extractCallBookingReview(text);
    assert.equal(result.review.tyreSize, '');
    assert.equal(result.review.useTyreSize, false);
    assert.equal(result.warnings.some((warning) => /size/.test(warning)), true);
  }
  const corrected = helper.extractCallBookingReview('Customer: It is not 205/55 R16, but 225/45 R17.');
  assert.equal(corrected.review.tyreSize, '225/45/R17');
  const alternative = helper.extractCallBookingReview('Customer: It is 205/55 R16 or maybe 225/45 R17.');
  assert.equal(alternative.review.tyreSize, '');
});

test('spaced tyre sizes from call notes normalize like sidewall notation', () => {
  assert.equal(helper.extractCallBookingReview('Customer: Tyre size is 205 55 16.').review.tyreSize, '205/55/R16');
  assert.equal(helper.extractCallBookingReview('المقاس ٢٠٥ ٥٥ ١٦').review.tyreSize, '205/55/R16');
});

test('Arabic notes and Arabic digits support the same reviewed fields', () => {
  const result = helper.extractCallBookingReview('الموقع: شارع الملك 10\nمقاس الإطار: ٢٠٥/٥٥ R١٦\nالمشكلة: يوجد مسمار في الإطار');
  assert.equal(result.review.locationAddress, 'شارع الملك 10');
  assert.equal(result.review.tyreSize, '205/55/R16');
  assert.equal(result.review.problem, 'يوجد مسمار في الإطار');
});

test('a unique postcode is only an address suggestion and unknown fields remain blank', () => {
  const result = helper.extractCallBookingReview('Customer: Postcode G11AA. Please send someone.');
  assert.equal(result.review.locationAddress, 'G1 1AA');
  assert.equal(result.review.tyreSize, '');
  assert.equal(result.review.problem, '');
  assert.equal(result.warnings.some((warning) => /Only a postcode/.test(warning)), true);
  assert.equal(result.review.useTyreSize, false);
  assert.throws(() => helper.extractCallBookingReview('x'.repeat(12_001)), /12,000/);
});

test('review apply preserves customer identity, clears stale geocoding/pricing and drops old tyre metadata', () => {
  const before = draft();
  const snapshot = plain(before);
  const patch = helper.buildCallBookingDraftPatch(before, review());
  assert.deepEqual(plain(before), snapshot);
  assert.equal('customer' in patch, false);
  assert.equal(patch.location.address, '10 High Street, Glasgow G1 1AA');
  for (const key of ['lat', 'lng', 'postcode', 'link', 'whatsappLink']) assert.equal(patch.location[key], null);
  assert.equal(patch.location.status, 'idle');
  assert.equal(patch.tyreLines[0].size, '205/55/R16');
  assert.equal(patch.tyreLines[0].quantity, 2);
  for (const key of ['brand', 'price', 'loadIndex', 'axle', 'runFlat']) assert.equal(patch.tyreLines[0][key], null);
  assert.deepEqual(plain(patch.tyreLines[1]), snapshot.tyreLines[1]);
  assert.equal(patch.tyreConfirmedFromSidewall, false);
  assert.equal(patch.quote, null);
  assert.equal(patch.manualPriceGbp, null);
  assert.equal(patch.paymentChoice, null);
  assert.equal(patch.priceNeedsRefresh, true);
  assert.equal(patch.note, 'Existing driver note\nCall note: Rear tyre has a puncture');
  assert.equal(patch.serviceType, 'repair');
  assert.equal('quickBookingId' in patch, false);
});

test('deselected fields never overwrite manual values and notes alone retain pricing', () => {
  const patch = helper.buildCallBookingDraftPatch(draft(), review({ useLocation: false, useTyreSize: false, serviceType: 'fit' }));
  assert.deepEqual(plain(patch), { note: 'Existing driver note\nCall note: Rear tyre has a puncture' });
});

test('inspection and locking-nut bookings retain selected size as an informational note without requiring a problem', () => {
  for (const serviceType of ['assess', 'locking_nut']) {
    const existing = draft();
    const selected = review({ serviceType, useLocation: false, useProblem: false });
    const patch = helper.buildCallBookingDraftPatch(existing, selected);
    assert.equal(patch.note, 'Existing driver note\nReported tyre size: 205/55/R16 (confirm before tyre work).');
    assert.equal(patch.serviceType, serviceType);
    assert.equal(patch.tyreLines[0].size, '205/55/R16');
    const repeated = helper.buildCallBookingDraftPatch({ ...existing, ...patch }, selected);
    assert.equal('note' in repeated, false);
  }
});

test('reapplying the same reviewed problem and service-only size does not duplicate notes', () => {
  const selected = review({ serviceType: 'assess' });
  const existing = draft();
  const patch = helper.buildCallBookingDraftPatch(existing, selected);
  assert.equal(patch.note, 'Existing driver note\nCall note: Rear tyre has a puncture\nReported tyre size: 205/55/R16 (confirm before tyre work).');
  const repeated = helper.buildCallBookingDraftPatch({ ...existing, ...patch }, selected);
  assert.equal('note' in repeated, false);
});

test('unchanged address/size preserve coordinates, fitment proof and pricing', () => {
  const patch = helper.buildCallBookingDraftPatch(draft(), review({ locationAddress: 'Original road', tyreSize: '225/45 R17', serviceType: 'fit', useProblem: false }));
  assert.deepEqual(plain(patch), {});
});

test('every saved-booking identifier blocks applying even if the review contains only notes', () => {
  for (const key of ['quickBookingId', 'savedQuoteId', 'savedQuoteRef', 'paymentLink', 'dispatchedBookingId', 'dispatchedRefNumber']) {
    const existing = { ...draft(), [key]: key === 'paymentLink' ? { paymentUrl: 'existing' } : 'saved-value' };
    assert.match(helper.getCallBookingDraftBlockedReason(existing), /Start a new draft/);
    assert.throws(() => helper.buildCallBookingDraftPatch(existing, review()), /Start a new draft/);
    assert.equal(existing[key] != null, true);
  }
});

test('invalid or empty selected values cannot be applied; unselected invalid suggestions are ignored', () => {
  assert.throws(() => helper.buildCallBookingDraftPatch(draft(), review({ tyreSize: '999/99 R99' })), /valid tyre size/);
  assert.throws(() => helper.buildCallBookingDraftPatch(draft(), review({ locationAddress: '' })), /location/);
  assert.throws(() => helper.buildCallBookingDraftPatch(draft(), review({ problem: '' })), /problem description/);
  assert.throws(() => helper.buildCallBookingDraftPatch(draft(), review({ useLocation: false, useTyreSize: false, useProblem: false })), /at least one/);
  assert.throws(() => helper.buildCallBookingDraftPatch(draft(), review({ serviceType: 'free-repair' })), /service type/);
  assert.doesNotThrow(() => helper.buildCallBookingDraftPatch(draft(), review({ useTyreSize: false, tyreSize: 'wrong' })));
});
