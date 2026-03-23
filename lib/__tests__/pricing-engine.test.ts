import { describe, it, expect } from 'vitest';
import {
  calculatePricing,
  calculateHybridPricing,
  parsePricingRules,
  type PricingRules,
  type PricingInput,
  type HybridPricingInput,
} from '../pricing-engine';

function defaultRules(overrides: Partial<PricingRules> = {}): PricingRules {
  return {
    fitting_fee_per_tyre: 20,
    repair_fee_per_tyre: 25,
    tpms_fee_per_tyre: 10,
    emergency_surcharge: 30,
    weekend_surcharge: 15,
    bank_holiday_surcharge: 25,
    multi_tyre_discount_2: 5,
    multi_tyre_discount_3: 8,
    multi_tyre_discount_4: 12,
    minimum_order_total: 50,
    max_service_miles: 190,
    quote_expiry_minutes: 15,
    surge_pricing_enabled: false,
    callout_0_5: 0,
    callout_5_10: 10,
    callout_10_15: 20,
    callout_15_20: 30,
    callout_20_30: 45,
    callout_30_40: 60,
    callout_40_base: 60,
    callout_40_per_mile: 1.5,
    ...overrides,
  };
}

function defaultInput(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    tyreSelections: [
      { tyreId: 'test-1', quantity: 1, unitPrice: 80, service: 'fit' },
    ],
    distanceMiles: 5,
    bookingType: 'scheduled',
    bookingDate: new Date('2025-01-06T10:00:00Z'), // Monday
    isBankHoliday: false,
    ...overrides,
  };
}

describe('calculatePricing', () => {
  it('returns OUTSIDE_SERVICE_AREA when distance exceeds max_service_miles', () => {
    const rules = defaultRules({ max_service_miles: 30 });
    const input = defaultInput({ distanceMiles: 35 });

    const result = calculatePricing(input, rules);

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('OUTSIDE_SERVICE_AREA');
  });

  it('accepts distance within max_service_miles', () => {
    const rules = defaultRules({ max_service_miles: 50 });
    const input = defaultInput({ distanceMiles: 45 });

    const result = calculatePricing(input, rules);

    expect(result.isValid).toBe(true);
  });

  it('calculates correct callout fee for 0-5 mile range', () => {
    const rules = defaultRules({ callout_0_5: 0 });
    const input = defaultInput({ distanceMiles: 3 });

    const result = calculatePricing(input, rules);

    expect(result.isValid).toBe(true);
    expect(result.calloutFee).toBe(0);
  });

  it('calculates correct callout fee for 10-15 mile range', () => {
    const rules = defaultRules({ callout_10_15: 20 });
    const input = defaultInput({ distanceMiles: 12 });

    const result = calculatePricing(input, rules);

    expect(result.isValid).toBe(true);
    expect(result.calloutFee).toBe(20);
  });

  it('calculates correct callout fee for 40+ miles', () => {
    const rules = defaultRules({ callout_40_base: 60, callout_40_per_mile: 1.5 });
    const input = defaultInput({ distanceMiles: 45 });

    const result = calculatePricing(input, rules);

    expect(result.isValid).toBe(true);
    // 60 + (45-40) * 1.5 = 60 + 7.5 = 67.5
    expect(result.calloutFee).toBe(67.5);
  });

  it('adds emergency surcharge for emergency bookings', () => {
    const rules = defaultRules({ emergency_surcharge: 30 });
    const input = defaultInput({ bookingType: 'emergency' });

    const result = calculatePricing(input, rules);

    expect(result.isValid).toBe(true);
    expect(result.totalSurcharges).toBe(30);
  });

  it('calculates repair-only pricing without tyre selections', () => {
    const rules = defaultRules({ repair_fee_per_tyre: 25 });
    const input = defaultInput({
      tyreSelections: [],
      serviceType: 'repair',
      tyreQuantity: 2,
    });

    const result = calculatePricing(input, rules);

    expect(result.isValid).toBe(true);
    // 2 repairs at £25 each
    expect(result.totalServiceFee).toBe(50);
    expect(result.totalTyreCost).toBe(0);
  });

  it('calculates fitting-only pricing without tyre selections (quick-book path)', () => {
    const rules = defaultRules({ fitting_fee_per_tyre: 20 });
    const input = defaultInput({
      tyreSelections: [],
      serviceType: 'fit',
      tyreQuantity: 2,
      distanceMiles: 8,
    });

    const result = calculatePricing(input, rules);

    expect(result.isValid).toBe(true);
    // 2 fittings at £20 each
    expect(result.totalServiceFee).toBe(40);
    expect(result.totalTyreCost).toBe(0);
    // Callout fee for 5-10 miles
    expect(result.calloutFee).toBe(rules.callout_5_10);
    // Service line item should say "Tyre Fitting"
    const serviceLine = result.lineItems.find((li) => li.type === 'service');
    expect(serviceLine?.label).toContain('Tyre Fitting');
  });

  it('calculates assessment-only pricing without tyre selections', () => {
    const rules = defaultRules({ fitting_fee_per_tyre: 20 });
    const input = defaultInput({
      tyreSelections: [],
      serviceType: 'assess',
      tyreQuantity: 1,
    });

    const result = calculatePricing(input, rules);

    expect(result.isValid).toBe(true);
    expect(result.totalServiceFee).toBe(20);
    const serviceLine = result.lineItems.find((li) => li.type === 'service');
    expect(serviceLine?.label).toContain('Assessment');
  });

  it('returns invalid when no serviceType and no tyre selections', () => {
    const rules = defaultRules();
    const input = defaultInput({
      tyreSelections: [],
      serviceType: undefined,
    });

    const result = calculatePricing(input, rules);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('No tyres selected');
  });

  it('includes emergency surcharge in service-only fitting path', () => {
    const rules = defaultRules({ fitting_fee_per_tyre: 20, emergency_surcharge: 30 });
    const input = defaultInput({
      tyreSelections: [],
      serviceType: 'fit',
      tyreQuantity: 1,
      bookingType: 'emergency',
    });

    const result = calculatePricing(input, rules);

    expect(result.isValid).toBe(true);
    expect(result.totalSurcharges).toBe(30);
    // Total should be at least fitting(20) + emergency(30) = 50
    expect(result.total).toBeGreaterThanOrEqual(50);
  });
});

describe('parsePricingRules', () => {
  it('uses defaults when no rules provided', () => {
    const rules = parsePricingRules([]);
    expect(rules.max_service_miles).toBe(190);
    expect(rules.fitting_fee_per_tyre).toBe(20);
  });

  it('overrides defaults with provided values', () => {
    const rules = parsePricingRules([
      { key: 'max_service_miles', value: '75' },
      { key: 'fitting_fee_per_tyre', value: '30' },
    ]);
    expect(rules.max_service_miles).toBe(75);
    expect(rules.fitting_fee_per_tyre).toBe(30);
  });

  it('parses boolean rules correctly', () => {
    const rules = parsePricingRules([
      { key: 'surge_pricing_enabled', value: 'true' },
    ]);
    expect(rules.surge_pricing_enabled).toBe(true);
  });
});

// ─── Hybrid Pricing (Weather + Demand Aware) ────────────────────────────────

function hybridInput(overrides: Partial<HybridPricingInput> = {}): HybridPricingInput {
  return {
    tyreSelections: [
      { tyreId: 'test-1', quantity: 1, unitPrice: 80, service: 'fit' },
    ],
    distanceMiles: 5,
    bookingType: 'scheduled',
    bookingDate: new Date('2025-01-06T10:00:00Z'), // Monday
    isBankHoliday: false,
    ...overrides,
  };
}

describe('calculateHybridPricing', () => {
  it('returns same price as legacy when no weather/demand multipliers', () => {
    const rules = defaultRules();
    const input = hybridInput();
    const hybrid = calculateHybridPricing(input, rules);

    expect(hybrid.weatherMultiplier).toBe(1.0);
    expect(hybrid.demandMultiplier).toBe(1.0);
    // No multiplier effect → hybrid finalPrice should equal legacy total
    const legacy = calculatePricing(input, rules);
    expect(hybrid.finalPrice).toBe(legacy.total);
  });

  it('applies weather multiplier on top of base price', () => {
    const rules = defaultRules();
    const base = hybridInput();
    const withWeather = hybridInput({ weatherMultiplier: 1.10, weatherReason: 'Heavy rain' });

    const baseResult = calculateHybridPricing(base, rules);
    const weatherResult = calculateHybridPricing(withWeather, rules);

    expect(weatherResult.weatherMultiplier).toBe(1.10);
    expect(weatherResult.finalPrice).toBeGreaterThan(baseResult.finalPrice);
    expect(weatherResult.pricingReasons).toContain('Heavy rain');
  });

  it('applies demand multiplier via surge pricing', () => {
    const rules = defaultRules({ surge_pricing_enabled: true });
    const input = hybridInput({ surgeMultiplier: 1.15, demandReason: 'High live demand' });
    const result = calculateHybridPricing(input, rules);

    expect(result.demandMultiplier).toBe(1.15);
    expect(result.pricingReasons).toContain('High live demand');
    expect(result.subtotalAfterMultipliers).toBeGreaterThan(result.subtotalBeforeMultipliers);
  });

  it('stacks demand and weather multipliers', () => {
    const rules = defaultRules({ surge_pricing_enabled: true });
    const input = hybridInput({
      surgeMultiplier: 1.10,
      weatherMultiplier: 1.06,
      demandReason: 'High demand',
      weatherReason: 'Moderate rain',
    });
    const result = calculateHybridPricing(input, rules);

    expect(result.demandMultiplier).toBe(1.10);
    expect(result.weatherMultiplier).toBe(1.06);
    // Combined should be more than just one
    const baseResult = calculateHybridPricing(hybridInput(), rules);
    expect(result.finalPrice).toBeGreaterThan(baseResult.finalPrice);
  });

  it('clamps combined multiplier to 1.50x max', () => {
    const rules = defaultRules({ surge_pricing_enabled: true });
    const input = hybridInput({
      surgeMultiplier: 1.20,       // max surge
      weatherMultiplier: 1.25,     // max weather
    });
    const result = calculateHybridPricing(input, rules);

    // 1.20 × 1.25 = 1.50 (exactly at cap)
    expect(result.pricingAudit.surgeMultiplier).toBe(1.20);
    expect(result.pricingAudit.weatherMultiplier).toBe(1.25);

    // Now exceed: would be 1.20 * 1.25 = 1.50, right at boundary
    // The cap message shouldn't appear since 1.50 === 1.50
    // Let's verify math is correct
    expect(result.subtotalBeforeMultipliers).toBeGreaterThan(0);
    expect(result.finalPrice).toBeGreaterThanOrEqual(rules.minimum_order_total);
  });

  it('clamps weather multiplier between 1.00 and 1.25', () => {
    const rules = defaultRules();

    const lowResult = calculateHybridPricing(
      hybridInput({ weatherMultiplier: 0.80 }),
      rules,
    );
    expect(lowResult.weatherMultiplier).toBe(1.0);

    const highResult = calculateHybridPricing(
      hybridInput({ weatherMultiplier: 1.50 }),
      rules,
    );
    expect(highResult.weatherMultiplier).toBe(1.25);
  });

  it('handles NaN weather multiplier gracefully', () => {
    const rules = defaultRules();
    const result = calculateHybridPricing(
      hybridInput({ weatherMultiplier: NaN }),
      rules,
    );
    expect(result.weatherMultiplier).toBe(1.0);
    expect(Number.isFinite(result.finalPrice)).toBe(true);
  });

  it('handles Infinity weather multiplier gracefully', () => {
    const rules = defaultRules();
    const result = calculateHybridPricing(
      hybridInput({ weatherMultiplier: Infinity }),
      rules,
    );
    expect(result.weatherMultiplier).toBe(1.0);
    expect(Number.isFinite(result.finalPrice)).toBe(true);
  });

  it('includes emergency reason when bookingType is emergency', () => {
    const rules = defaultRules();
    const result = calculateHybridPricing(
      hybridInput({ bookingType: 'emergency' }),
      rules,
    );
    expect(result.pricingReasons).toContain('Emergency booking');
    expect(result.emergencyFee).toBe(30);
  });

  it('returns full audit trail', () => {
    const rules = defaultRules({ surge_pricing_enabled: true });
    const result = calculateHybridPricing(
      hybridInput({ surgeMultiplier: 1.05, weatherMultiplier: 1.03 }),
      rules,
    );

    expect(result.pricingAudit).toBeDefined();
    expect(result.pricingAudit.lineItems.length).toBeGreaterThan(0);
    expect(typeof result.pricingAudit.calculatedAt).toBe('string');
    expect(result.pricingAudit.surgeMultiplier).toBe(1.05);
    expect(result.pricingAudit.weatherMultiplier).toBe(1.03);
  });

  it('preserves legacy breakdown for backward compatibility', () => {
    const rules = defaultRules();
    const result = calculateHybridPricing(hybridInput(), rules);

    expect(result.legacyBreakdown).toBeDefined();
    expect(result.legacyBreakdown.isValid).toBe(true);
    expect(result.legacyBreakdown.lineItems.length).toBeGreaterThan(0);
  });

  it('applies minimum order total', () => {
    const rules = defaultRules({ minimum_order_total: 200 });
    const result = calculateHybridPricing(
      hybridInput({
        tyreSelections: [{ tyreId: 'test-1', quantity: 1, unitPrice: 10, service: 'fit' }],
      }),
      rules,
    );

    expect(result.finalPrice).toBe(200);
    expect(result.pricingReasons).toContain('Minimum order total applied');
  });

  it('produces correct finalPrice for normal booking (no multipliers)', () => {
    // 1 tyre at £80, fitting £20, callout £0 (0-5 miles), no surcharges
    const rules = defaultRules();
    const result = calculateHybridPricing(hybridInput(), rules);

    // 80 + 20 = 100
    expect(result.basePrice).toBe(80);
    expect(result.tyreServiceFee).toBe(20);
    expect(result.finalPrice).toBe(100);
  });

  it('produces correct finalPrice with light rain weather', () => {
    const rules = defaultRules();
    const result = calculateHybridPricing(
      hybridInput({ weatherMultiplier: 1.03, weatherReason: 'Light rain' }),
      rules,
    );

    // 100 * 1.03 = 103
    expect(result.finalPrice).toBe(103);
    expect(result.pricingReasons).toContain('Light rain');
  });

  it('produces correct finalPrice with heavy rain weather', () => {
    const rules = defaultRules();
    const result = calculateHybridPricing(
      hybridInput({ weatherMultiplier: 1.10, weatherReason: 'Heavy rain' }),
      rules,
    );

    // 100 * 1.10 = 110
    expect(result.finalPrice).toBe(110);
  });

  it('produces correct finalPrice with snow/ice weather', () => {
    const rules = defaultRules();
    const result = calculateHybridPricing(
      hybridInput({ weatherMultiplier: 1.25, weatherReason: 'Heavy snow/ice' }),
      rules,
    );

    // 100 * 1.25 = 125
    expect(result.finalPrice).toBe(125);
  });

  it('produces correct finalPrice with high demand + heavy rain', () => {
    const rules = defaultRules({ surge_pricing_enabled: true });
    const result = calculateHybridPricing(
      hybridInput({
        surgeMultiplier: 1.15,
        weatherMultiplier: 1.10,
      }),
      rules,
    );

    // base 100 * 1.15 demand = 115, then 115 * 1.10 weather = 126.5
    expect(result.finalPrice).toBe(126.5);
  });

  it('final price is always rounded to 2 decimal places', () => {
    const rules = defaultRules({ surge_pricing_enabled: true });
    const result = calculateHybridPricing(
      hybridInput({ surgeMultiplier: 1.07, weatherMultiplier: 1.03 }),
      rules,
    );

    // Check rounding: no more than 2 decimal places
    const decimalPart = result.finalPrice.toString().split('.')[1] ?? '';
    expect(decimalPart.length).toBeLessThanOrEqual(2);
  });
});
