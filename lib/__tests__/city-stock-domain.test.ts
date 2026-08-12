import { describe, expect, it } from 'vitest';
import {
  buildStockIdempotencyKey,
  computeCityStockSnapshot,
  normalizeMissingTyreSize,
  validateCityStockMovementDelta,
} from '@/lib/stock/city-stock-domain';

describe('city stock domain', () => {
  it('computes available stock and suggested buy per city balance', () => {
    const snapshot = computeCityStockSnapshot({
      currentStock: 4,
      reservedStock: 1,
      orderedStock: 2,
      minStock: 3,
      targetStock: 10,
    });

    expect(snapshot.availableStock).toBe(3);
    expect(snapshot.suggestedBuy).toBe(4);
    expect(snapshot.isLowStock).toBe(true);
    expect(snapshot.isOutOfStock).toBe(false);
  });

  it('detects overcommitted city stock', () => {
    const snapshot = computeCityStockSnapshot({
      currentStock: 2,
      reservedStock: 5,
      orderedStock: 0,
      minStock: 1,
      targetStock: 4,
    });

    expect(snapshot.availableStock).toBe(-3);
    expect(snapshot.isOvercommitted).toBe(true);
    expect(snapshot.isOutOfStock).toBe(true);
  });

  it('validates canonical stock movement directions', () => {
    expect(validateCityStockMovementDelta('RECEIVED', 3).valid).toBe(true);
    expect(validateCityStockMovementDelta('SALE', -1).valid).toBe(true);
    expect(validateCityStockMovementDelta('SALE_REVERSAL', 1).valid).toBe(true);
    expect(validateCityStockMovementDelta('DAMAGED', -1).valid).toBe(true);
    expect(validateCityStockMovementDelta('CORRECTION', -2).valid).toBe(true);
    expect(validateCityStockMovementDelta('CORRECTION', 2).valid).toBe(true);

    expect(validateCityStockMovementDelta('SALE', 1).valid).toBe(false);
    expect(validateCityStockMovementDelta('RECEIVED', -1).valid).toBe(false);
    expect(validateCityStockMovementDelta('SALE', 0).valid).toBe(false);
  });

  it('normalizes missing tyre sizes and builds stable idempotency keys', () => {
    expect(normalizeMissingTyreSize(' 205 / 55 / r16 ')).toBe('205/55/R16');
    expect(buildStockIdempotencyKey(['sale', 'city-1', null, 'booking-1', 2])).toBe('sale:city-1:booking-1:2');
  });
});
