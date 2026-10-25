 
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadSource } = require('./chat-modals.test.cjs');

const geo = loadSource('lib/geo.ts', {});
const { quoteFromQuickBookPatch } = loadSource('lib/assisted-chat-workflow.ts', { '@/lib/geo': geo });
const price = { subtotal: 100, vatAmount: 20, total: 120, lineItems: [] };

test('pricing displays retain the charged distance rather than raw travel or garage distance', () => {
  const quote = quoteFromQuickBookPatch({
    ...price,
    distanceMiles: 12.5,
    pricingDistanceMiles: 20,
    serviceDistanceMiles: 99,
    garageDistanceMiles: 150,
    pricingDistanceSource: 'garage_floor',
    distanceFloorApplied: true,
  }, '888');
  assert.equal(quote.distanceMiles, 12.5);
  assert.equal(quote.pricingDistanceMiles, 12.5);
  assert.equal(quote.distanceKm, 12.5 * 1.60934);
  assert.equal(quote.pricingDistanceSource, 'garage_floor');
  assert.equal(quote.distanceFloorApplied, true);
  assert.equal(quote.total, 120);
});

test('pricing metadata provides the canonical display distance when distanceMiles is absent', () => {
  const quote = quoteFromQuickBookPatch({ ...price, distanceMiles: null, pricingDistanceMiles: 6 }, '888');
  assert.equal(quote.distanceMiles, 6);
  assert.equal(quote.pricingDistanceMiles, 6);
  assert.equal(quote.distanceKm, 6 * 1.60934);
});

test('a canonical zero distance is retained instead of replaced with a travel-distance fallback', () => {
  const quote = quoteFromQuickBookPatch({ ...price, distanceMiles: 0, pricingDistanceMiles: 6 }, '888');
  assert.equal(quote.distanceMiles, 0);
  assert.equal(quote.pricingDistanceMiles, 0);
  assert.equal(quote.distanceKm, 0);
});

test('legacy responses use raw kilometres only when canonical distance metadata is missing', () => {
  const quote = quoteFromQuickBookPatch(price, '32');
  assert.equal(quote.distanceKm, 32);
  assert.equal(quote.distanceMiles, null);
  assert.equal(quote.pricingDistanceMiles, null);
});

test('an unknown distance stays unknown when no canonical or legacy distance exists', () => {
  const quote = quoteFromQuickBookPatch(price, null);
  assert.equal(quote.distanceKm, null);
  assert.equal(quote.distanceMiles, null);
});

test('a missing price breakdown cannot produce a payable quote', () => {
  assert.throws(() => quoteFromQuickBookPatch(null, '32'), /Pricing engine returned no breakdown/);
});
