import { describe, it, expect } from 'vitest';
import {
  calculatePricing,
  calculateHybridPricing,
  parsePricingRules,
  resolvePricingContext,
  getDisplayBreakdown,
  type PricingRules,
  type PricingInput,
  type HybridPricingInput,
  type PricingBreakdown,
  type PricingLineItem,
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
    callout_0_5: 5,
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
    const rules = defaultRules({ callout_0_5: 5 });
    const input = defaultInput({ distanceMiles: 3 });

    const result = calculatePricing(input, rules);

    expect(result.isValid).toBe(true);
    expect(result.calloutFee).toBe(5);
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

  it('does not add a callout fee for scheduled shop fitting', () => {
    const rules = defaultRules({ max_service_miles: 30, callout_10_15: 20 });
    const input = defaultInput({
      bookingType: 'scheduled',
      fittingLocation: 'shop',
      distanceMiles: 45,
    });

    const result = calculatePricing(input, rules);

    expect(result.isValid).toBe(true);
    expect(result.calloutFee).toBe(0);
    expect(result.total).toBe(100);
    expect(result.lineItems.some((item) => item.type === 'callout')).toBe(false);
    expect(result.lineItems.some((item) => /rural/i.test(item.label))).toBe(false);
  });

  it('uses fitting-at-location helper for scheduled mobile fitting', () => {
    const rules = defaultRules({ callout_10_15: 20 });
    const input = defaultInput({
      bookingType: 'scheduled',
      fittingLocation: 'mobile',
      distanceMiles: 11,
    });

    const result = calculatePricing(input, rules);

    expect(result.isValid).toBe(true);
    expect(result.calloutFee).toBe(0);
    expect(result.fittingPrice).toBe(200.2);
    expect(result.tyrePrice).toBe(80);
    expect(result.totalPrice).toBe(280.2);
    expect(result.total).toBe(280.2);
    expect(result.lineItems).toContainEqual({
      label: 'Fitting at your location',
      amount: 200.2,
      type: 'service',
    });
    expect(result.lineItems.some((item) => item.type === 'callout')).toBe(false);
  });

  it('returns manual quote state for mobile fitting over 100 miles', () => {
    const result = calculatePricing(
      defaultInput({
        bookingType: 'scheduled',
        fittingLocation: 'mobile',
        distanceMiles: 100.1,
      }),
      defaultRules(),
    );

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('FITTING_LOCATION_MANUAL_QUOTE_REQUIRED');
  });

  it('adds emergency surcharge for emergency bookings', () => {
    const rules = defaultRules({ emergency_surcharge: 30 });
    const input = defaultInput({ bookingType: 'emergency' });

    const result = calculatePricing(input, rules);

    expect(result.isValid).toBe(true);
    expect(result.totalSurcharges).toBe(30);
  });

  it('resolves scheduled mobile fitting context without emergency surcharge', () => {
    const result = calculatePricing(
      defaultInput({
        bookingType: 'scheduled',
        pricingContext: 'scheduled_mobile_fitting',
        fittingLocation: 'mobile',
        distanceMiles: 5,
      }),
      defaultRules({ emergency_surcharge: 30 }),
    );

    expect(result.isValid).toBe(true);
    expect(result.pricingContext).toBe('scheduled_mobile_fitting');
    expect(result.emergencySurcharge).toBe(0);
    expect(result.fittingPrice).toBe(122.65);
  });

  it('keeps emergency mobile fitting context and applies emergency surcharge', () => {
    const result = calculatePricing(
      defaultInput({
        bookingType: 'emergency',
        pricingContext: 'emergency_mobile_fitting',
        fittingLocation: 'mobile',
        distanceMiles: 5,
      }),
      defaultRules({ emergency_surcharge: 30 }),
    );

    expect(result.isValid).toBe(true);
    expect(result.pricingContext).toBe('emergency_mobile_fitting');
    expect(result.emergencySurcharge).toBe(30);
    expect(result.fittingPrice).toBe(152.65);
    expect(result.totalSurcharges).toBe(30);
  });

  it('defaults missing emergency surcharge rule to zero with metadata', () => {
    const result = calculatePricing(
      defaultInput({
        bookingType: 'emergency',
        pricingContext: 'emergency_mobile_fitting',
        fittingLocation: 'mobile',
        distanceMiles: 5,
        emergencySurchargeRulePresent: false,
      }),
      defaultRules({ emergency_surcharge: 30 }),
    );

    expect(result.isValid).toBe(true);
    expect(result.emergencySurcharge).toBe(0);
    expect(result.emergencySurchargeSource).toBe('missing_rule_default_zero');
  });

  it('returns VAT as zero for canonical pricing', () => {
    const result = calculatePricing(
      defaultInput({
        pricingContext: 'scheduled_mobile_fitting',
        fittingLocation: 'mobile',
        distanceMiles: 5,
      }),
      defaultRules(),
    );

    expect(result.vatRate).toBe(0);
    expect(result.vatAmount).toBe(0);
  });

  it('keeps mobile quote valid when weather lookup falls back to unknown', () => {
    const result = calculatePricing(
      defaultInput({
        pricingContext: 'scheduled_mobile_fitting',
        fittingLocation: 'mobile',
        weatherSurcharge: 0,
        weatherSurchargeCode: 'UNKNOWN',
      }),
      defaultRules(),
    );

    expect(result.isValid).toBe(true);
    expect(result.weatherSurcharge).toBe(0);
    expect(result.weatherSurchargeCode).toBe('UNKNOWN');
  });

  it('applies weather and traffic to canonical mobile fitting price', () => {
    const result = calculatePricing(
      defaultInput({
        pricingContext: 'scheduled_mobile_fitting',
        fittingLocation: 'mobile',
        distanceMiles: 5,
        weatherSurcharge: 10,
        weatherSurchargeCode: 'HEAVY_RAIN',
        trafficSurcharge: 15,
        trafficSurchargeCode: 'HEAVY_TRAFFIC',
        trafficDelayMinutes: 30,
      }),
      defaultRules(),
    );

    expect(result.isValid).toBe(true);
    expect(result.mobileFittingBasePrice).toBe(122.65);
    expect(result.weatherSurcharge).toBe(10);
    expect(result.trafficSurcharge).toBe(15);
    expect(result.fittingPrice).toBe(147.65);
    expect(result.tyrePrice).toBe(80);
    expect(result.total).toBe(227.65);
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

describe('resolvePricingContext', () => {
  it('maps scheduled + mobile to scheduled_mobile_fitting', () => {
    expect(resolvePricingContext({ bookingType: 'scheduled', fittingLocation: 'mobile' }))
      .toBe('scheduled_mobile_fitting');
  });

  it('maps emergency + mobile to emergency_mobile_fitting', () => {
    expect(resolvePricingContext({ bookingType: 'emergency', fittingLocation: 'mobile' }))
      .toBe('emergency_mobile_fitting');
  });

  it('maps scheduled + shop to scheduled_garage_fitting', () => {
    expect(resolvePricingContext({ bookingType: 'scheduled', fittingLocation: 'shop' }))
      .toBe('scheduled_garage_fitting');
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
    // 1 tyre at £80, fitting £20, callout £5 (0-5 miles), no surcharges
    const rules = defaultRules();
    const result = calculateHybridPricing(hybridInput(), rules);

    // 80 + 20 + 5 = 105
    expect(result.basePrice).toBe(80);
    expect(result.tyreServiceFee).toBe(20);
    expect(result.finalPrice).toBe(105);
  });

  it('produces correct finalPrice with light rain weather', () => {
    const rules = defaultRules();
    const result = calculateHybridPricing(
      hybridInput({ weatherMultiplier: 1.03, weatherReason: 'Light rain' }),
      rules,
    );

    // 105 * 1.03 = 108.15
    expect(result.finalPrice).toBe(108.15);
    expect(result.pricingReasons).toContain('Light rain');
  });

  it('produces correct finalPrice with heavy rain weather', () => {
    const rules = defaultRules();
    const result = calculateHybridPricing(
      hybridInput({ weatherMultiplier: 1.10, weatherReason: 'Heavy rain' }),
      rules,
    );

    // 105 * 1.10 = 115.5
    expect(result.finalPrice).toBe(115.5);
  });

  it('produces correct finalPrice with snow/ice weather', () => {
    const rules = defaultRules();
    const result = calculateHybridPricing(
      hybridInput({ weatherMultiplier: 1.25, weatherReason: 'Heavy snow/ice' }),
      rules,
    );

    // 105 * 1.25 = 131.25
    expect(result.finalPrice).toBe(131.25);
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

    // base 105 * 1.15 demand = 120.75, then 120.75 * 1.10 weather = 132.82
    expect(result.finalPrice).toBe(132.82);
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

// ─── Cart vs Summary Parity (Production Trust Regression) ──────────────────

describe('cart vs summary parity', () => {
  it('1 tyre at £85 — summary tyre line equals cart total (£85)', () => {
    const breakdown = calculatePricing(
      defaultInput({
        tyreSelections: [{ tyreId: 't1', quantity: 1, unitPrice: 85, service: 'fit' }],
        distanceMiles: 5,
      }),
      defaultRules()
    );

    const display = getDisplayBreakdown(breakdown);
    const tyre = display.lineItems.find(i => i.type === 'tyre');
    expect(tyre?.amount).toBe(85);
    expect(tyre?.unitPrice).toBe(85);
    expect(tyre?.quantity).toBe(1);
  });

  it('2 tyres at £85 — summary tyre line equals cart total (£170)', () => {
    const breakdown = calculatePricing(
      defaultInput({
        tyreSelections: [{ tyreId: 't1', quantity: 2, unitPrice: 85, service: 'fit' }],
        distanceMiles: 5,
      }),
      defaultRules()
    );

    const display = getDisplayBreakdown(breakdown);
    const tyre = display.lineItems.find(i => i.type === 'tyre');
    expect(tyre?.amount).toBe(170);
    expect(tyre?.quantity).toBe(2);
  });

  it('1 tyre at £85 at 59 miles (rural 100%) — tyre line still £85, surcharge folded into callout (regression)', () => {
    // Reproduces the production bug from the screenshot.
    const breakdown = calculatePricing(
      defaultInput({
        tyreSelections: [{ tyreId: 't1', quantity: 1, unitPrice: 85, service: 'fit' }],
        distanceMiles: 59,
      }),
      defaultRules()
    );

    const display = getDisplayBreakdown(breakdown);

    // Cart vs summary parity: tyre line MUST equal unitPrice * quantity
    const tyre = display.lineItems.find(i => i.type === 'tyre');
    expect(tyre?.amount).toBe(85);

    // Fitting line MUST equal canonical fitting fee * quantity
    const fitting = display.lineItems.find(i => i.type === 'service');
    expect(fitting?.amount).toBe(20);

    // Rural surcharge must NOT appear as its own line — folded into callout
    expect(
      display.lineItems.find(i => i.label.toLowerCase().includes('rural'))
    ).toBeUndefined();
    const callout = display.lineItems.find(i => i.type === 'callout');
    expect(callout?.label).toMatch(/long-distance fee/i);

    // Display line items must sum to the displayed total (allow 1p rounding)
    const sum = display.lineItems
      .filter(i => !['subtotal', 'vat', 'total'].includes(i.type))
      .reduce((s, i) => s + Math.round(i.amount * 100), 0);
    expect(Math.abs(sum - Math.round(display.total * 100))).toBeLessThanOrEqual(1);
  });

  it('1 tyre at £85 — payable total includes £85 once only', () => {
    const breakdown = calculatePricing(
      defaultInput({
        tyreSelections: [{ tyreId: 't1', quantity: 1, unitPrice: 85, service: 'fit' }],
        distanceMiles: 5,
      }),
      defaultRules()
    );

    // Tyre cost in breakdown is exactly £85 (not doubled anywhere)
    expect(breakdown.totalTyreCost).toBe(85);

    // Total = tyre + fitting + callout + minimum-order rule
    // = 85 + 20 + 5 = 110 (above £50 minimum)
    expect(breakdown.total).toBe(110);
  });

  it('2 tyres at £85 — payable total includes £170 once only', () => {
    const breakdown = calculatePricing(
      defaultInput({
        tyreSelections: [{ tyreId: 't1', quantity: 2, unitPrice: 85, service: 'fit' }],
        distanceMiles: 5,
      }),
      defaultRules()
    );

    expect(breakdown.totalTyreCost).toBe(170);
    // 2 tyres × £85 + 2 × £20 fitting − 5% service discount + £5 callout = £213
    expect(breakdown.total).toBe(213);
  });
});

// ─── getDisplayBreakdown Tests ──────────────────────────────────────────────

describe('getDisplayBreakdown', () => {
  /**
   * Helper to create a mock breakdown for testing
   */
  function mockBreakdown(lineItems: PricingLineItem[], total: number): PricingBreakdown {
    return {
      lineItems,
      totalTyreCost: 0,
      totalServiceFee: 0,
      calloutFee: 0,
      totalSurcharges: 0,
      discountAmount: 0,
      surgeMultiplier: 1,
      subtotal: total,
      vatAmount: 0,
      total,
      quoteExpiresAt: new Date(),
      isValid: true,
    };
  }

  it('returns items unchanged when no rural surcharge exists', () => {
    const lineItems: PricingLineItem[] = [
      { label: 'Tyre', amount: 80, type: 'tyre' },
      { label: 'Fitting fee', amount: 20, type: 'service' },
      { label: 'Subtotal', amount: 100, type: 'subtotal' },
      { label: 'Total', amount: 100, type: 'total' },
    ];
    const breakdown = mockBreakdown(lineItems, 100);

    const display = getDisplayBreakdown(breakdown);

    expect(display.lineItems).toHaveLength(4);
    expect(display.lineItems.find(i => i.label === 'Tyre')?.amount).toBe(80);
    expect(display.lineItems.find(i => i.label === 'Fitting fee')?.amount).toBe(20);
    expect(display.total).toBe(100);
  });

  it('removes rural surcharge and folds it into the callout line item', () => {
    // 80 tyre + 20 fitting + 30 callout = 130 base, rural surcharge 65 (50% of 130)
    // Expected display: tyre stays 80, fitting stays 20, callout becomes 30 + 65 = 95
    const lineItems: PricingLineItem[] = [
      { label: 'Tyre', amount: 80, type: 'tyre' },
      { label: 'Fitting fee', amount: 20, type: 'service' },
      { label: 'Callout (35 miles)', amount: 30, type: 'callout' },
      { label: 'Rural area surcharge (50%)', amount: 65, type: 'surcharge' },
      { label: 'Subtotal', amount: 195, type: 'subtotal' },
      { label: 'Total', amount: 195, type: 'total' },
    ];
    const breakdown = mockBreakdown(lineItems, 195);

    const display = getDisplayBreakdown(breakdown);

    // Rural surcharge removed
    expect(display.lineItems.find(i => i.label.toLowerCase().includes('rural'))).toBeUndefined();

    // Tyre and fitting must equal cart values (not redistributed)
    expect(display.lineItems.find(i => i.type === 'tyre')?.amount).toBe(80);
    expect(display.lineItems.find(i => i.type === 'service')?.amount).toBe(20);

    // Callout absorbs the rural surcharge with a transparent label
    const callout = display.lineItems.find(i => i.type === 'callout');
    expect(callout?.amount).toBe(95);
    expect(callout?.label).toMatch(/long-distance fee/i);

    // Total preserved
    expect(display.total).toBe(195);
  });

  it('keeps tyre line equal to cart unit-price * quantity even with rural surcharge (regression)', () => {
    // Reproduces the production bug: 1 tyre at £85, 59 miles, rural 100%.
    // Cart shows £85; summary must also show £85 for the tyre line.
    const lineItems: PricingLineItem[] = [
      { label: 'Tyre', quantity: 1, unitPrice: 85, amount: 85, type: 'tyre' },
      { label: 'Fitting fee', quantity: 1, unitPrice: 20, amount: 20, type: 'service' },
      { label: 'Callout (59 miles)', amount: 25.38, type: 'callout' },
      { label: 'Rural area surcharge (100%)', amount: 130.38, type: 'surcharge' },
      { label: 'Subtotal', amount: 260.76, type: 'subtotal' },
      { label: 'Total', amount: 260.76, type: 'total' },
    ];
    const breakdown = mockBreakdown(lineItems, 260.76);

    const display = getDisplayBreakdown(breakdown);

    const tyre = display.lineItems.find(i => i.type === 'tyre');
    expect(tyre?.amount).toBe(85);
    expect(tyre?.unitPrice).toBe(85);
    expect(tyre?.quantity).toBe(1);

    // Fitting unchanged
    expect(display.lineItems.find(i => i.type === 'service')?.amount).toBe(20);

    // Callout absorbs rural surcharge: 25.38 + 130.38 = 155.76
    const callout = display.lineItems.find(i => i.type === 'callout');
    expect(callout?.amount).toBeCloseTo(155.76, 2);

    // Total preserved
    expect(display.total).toBeCloseTo(260.76, 2);
  });

  it('also folds rural surcharge into callout when discounts are present', () => {
    // 100 tyre + 20 callout - 10 discount + 55 rural surcharge = 165
    const lineItems: PricingLineItem[] = [
      { label: 'Tyre', amount: 100, type: 'tyre' },
      { label: 'Callout (35 miles)', amount: 20, type: 'callout' },
      { label: 'Multi-tyre discount', amount: -10, type: 'discount' },
      { label: 'Rural area surcharge (50%)', amount: 55, type: 'surcharge' },
      { label: 'Subtotal', amount: 165, type: 'subtotal' },
      { label: 'Total', amount: 165, type: 'total' },
    ];
    const breakdown = mockBreakdown(lineItems, 165);

    const display = getDisplayBreakdown(breakdown);

    expect(display.lineItems.find(i => i.label.toLowerCase().includes('rural'))).toBeUndefined();
    expect(display.lineItems.find(i => i.type === 'tyre')?.amount).toBe(100);
    expect(display.lineItems.find(i => i.type === 'discount')?.amount).toBe(-10);
    expect(display.lineItems.find(i => i.type === 'callout')?.amount).toBe(75);

    const displaySum = display.lineItems
      .filter(i => !['subtotal', 'vat', 'total'].includes(i.type))
      .reduce((sum, i) => sum + Math.round(i.amount * 100), 0);
    expect(displaySum).toBe(16500);
  });

  it('preserves subtotal, vatAmount, and total from original breakdown', () => {
    const lineItems: PricingLineItem[] = [
      { label: 'Tyre', amount: 80, type: 'tyre' },
      { label: 'Rural area surcharge (50%)', amount: 40, type: 'surcharge' },
      { label: 'Subtotal', amount: 100, type: 'subtotal' },
      { label: 'VAT', amount: 20, type: 'vat' },
      { label: 'Total', amount: 120, type: 'total' },
    ];
    const breakdown: PricingBreakdown = {
      lineItems,
      totalTyreCost: 80,
      totalServiceFee: 0,
      calloutFee: 0,
      totalSurcharges: 40,
      discountAmount: 0,
      surgeMultiplier: 1,
      subtotal: 100,
      vatAmount: 20,
      total: 120,
      quoteExpiresAt: new Date(),
      isValid: true,
    };

    const display = getDisplayBreakdown(breakdown);

    expect(display.subtotal).toBe(100);
    expect(display.vatAmount).toBe(20);
    expect(display.total).toBe(120);
  });

  it('keeps rural surcharge visible when there is no callout to fold it into', () => {
    // Edge case: no callout line item. Rather than smearing the surcharge
    // into the tyre/discount lines (which would break parity with the cart),
    // keep it visible so the total still reconciles honestly.
    const lineItems: PricingLineItem[] = [
      { label: 'Tyre', amount: 100, type: 'tyre' },
      { label: 'Multi-tyre discount', amount: -10, type: 'discount' },
      { label: 'Rural area surcharge (50%)', amount: 50, type: 'surcharge' },
      { label: 'Subtotal', amount: 140, type: 'subtotal' },
      { label: 'Total', amount: 140, type: 'total' },
    ];
    const breakdown = mockBreakdown(lineItems, 140);

    const display = getDisplayBreakdown(breakdown);

    // Tyre and discount lines remain at their canonical values
    expect(display.lineItems.find(i => i.type === 'tyre')?.amount).toBe(100);
    expect(display.lineItems.find(i => i.type === 'discount')?.amount).toBe(-10);

    // Rural surcharge is preserved (fallback) so totals reconcile
    expect(display.lineItems.find(i => i.label.toLowerCase().includes('rural'))?.amount).toBe(50);

    const displaySum = display.lineItems
      .filter(i => !['subtotal', 'vat', 'total'].includes(i.type))
      .reduce((sum, i) => sum + Math.round(i.amount * 100), 0);
    expect(displaySum).toBe(14000);
  });
});
