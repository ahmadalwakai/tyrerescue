import { describe, expect, it } from 'vitest';
import {
  calculateFittingAtLocationPrice,
  formatGbp,
} from '../fitting-location-pricing';

describe('calculateFittingAtLocationPrice', () => {
  it.each([
    [0, 121],
    [5, 122.65],
    [6, 153],
    [10, 153],
    [11, 200.2],
    [20, 211],
    [21, 256.43],
    [40, 283.6],
    [41, 435.75],
    [100, 539],
  ])('returns %s miles as £%s', (distanceMiles, expectedPrice) => {
    const result = calculateFittingAtLocationPrice(distanceMiles);

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.fittingPrice).toBe(expectedPrice);
    }
  });

  it('returns manual quote state over 100 miles', () => {
    const result = calculateFittingAtLocationPrice(100.1);

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
