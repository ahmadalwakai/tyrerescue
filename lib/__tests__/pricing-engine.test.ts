import { describe, it, expect } from 'vitest';
import {
  calculatePricing,
  parsePricingRules,
  type PricingRules,
  type PricingInput,
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
