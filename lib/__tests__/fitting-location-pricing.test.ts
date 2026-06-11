import { describe, expect, it } from 'vitest';
import {
  calculateFittingAtLocationPrice,
  formatGbp,
} from '../fitting-location-pricing';

// v2: fittingPrice is the travel fee only (labour is billed separately by the pricing engine)
// Tier structure: base £24 (0–3 mi), +£1.70/mi (3–10), +£2.35/mi (10–20), +£3.00/mi (20–40), +£3.85/mi (40–60)
describe('calculateFittingAtLocationPrice', () => {
  it.each([
    [0,    24],
    [3,    24],
    [5,    27.4],
    [6,    29.1],
    [10,   35.9],
    [11,   38.25],
    [20,   59.4],
    [21,   62.4],
    [40,   119.4],
    [41,   123.25],
    [60,   196.4],
  ])('returns %s miles as £%s travel fee', (distanceMiles, expectedPrice) => {
    const result = calculateFittingAtLocationPrice(distanceMiles);

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.fittingPrice).toBe(expectedPrice);
    }
  });

  it('returns manual quote state over 60 miles', () => {
    const result = calculateFittingAtLocationPrice(60.1);

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe('MANUAL_QUOTE_REQUIRED');
      expect(result.fittingPrice).toBeNull();
    }
  });

  it.each([null, undefined, NaN, Infinity, -1])('rejects invalid distance %s', (distanceMiles) => {
    const result = calculateFittingAtLocationPrice(distanceMiles);

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe('INVALID_DISTANCE');
    }
  });

  it('formats GBP with en-GB currency rules', () => {
    expect(formatGbp(89.65)).toBe('£89.65');
  });
});
