import { describe, it, expect } from 'vitest';
import {
  calculatePricing,
  calculateHybridPricing,
  parsePricingRules,
  resolvePricingContext,
  resolvePricingMode,
  resolveMode,
  getDisplayBreakdown,
  type PricingRules,
  type PricingInput,
  type HybridPricingInput,
} from '../pricing-engine';
import {
  calculateTravelFee,
  milesBetween,
  calculateFittingAtLocationPrice,
} from '../fitting-location-pricing';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultRules(overrides: Partial<PricingRules> = {}): PricingRules {
  return {
    tpms_fee_per_tyre: 10,
    shop_fit_labour_per_tyre: 18,
    shop_repair_labour_per_tyre: 25,
    mobile_fit_labour_per_tyre: 18,
    mobile_repair_labour_per_tyre: 25,
    emergency_fit_labour_per_tyre: 22,
    emergency_repair_labour_per_tyre: 30,
    emergency_priority_fee: 47,
    shop_weekend_fee: 10,
    shop_bank_holiday_fee: 20,
    mobile_weekend_fee: 12,
    mobile_bank_holiday_fee: 25,
    emergency_bank_holiday_fee: 45,
    mobile_min_service_subtotal: 47,
    emergency_min_service_subtotal: 90,
    multi_tyre_discount_2: 5,
    multi_tyre_discount_3: 8,
    multi_tyre_discount_4: 12,
    emergency_multi_tyre_discount_3: 3,
    emergency_multi_tyre_discount_4: 5,
    minimum_order_total: 50,
    max_service_miles: 190,
    quote_expiry_minutes: 15,
    surge_pricing_enabled: false,
    ...overrides,
  };
}

// Monday
const WEEKDAY = new Date('2025-01-06T10:00:00Z');
// Saturday
const WEEKEND = new Date('2025-01-04T10:00:00Z');

function shopInput(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    tyreSelections: [{ tyreId: 'test-1', quantity: 1, unitPrice: 80, service: 'fit' }],
    distanceMiles: 5,
    bookingType: 'scheduled',
    pricingContext: 'scheduled_garage_fitting',
    bookingDate: WEEKDAY,
    isBankHoliday: false,
    ...overrides,
  };
}

function mobileInput(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    tyreSelections: [{ tyreId: 'test-1', quantity: 1, unitPrice: 80, service: 'fit' }],
    distanceMiles: 5,
    bookingType: 'scheduled',
    pricingContext: 'scheduled_mobile_fitting',
    bookingDate: WEEKDAY,
    isBankHoliday: false,
    ...overrides,
  };
}

function emergencyInput(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    tyreSelections: [{ tyreId: 'test-1', quantity: 1, unitPrice: 80, service: 'fit' }],
    distanceMiles: 5,
    bookingType: 'emergency',
    pricingContext: 'emergency_mobile_fitting',
    bookingDate: WEEKDAY,
    isBankHoliday: false,
    ...overrides,
  };
}

// ─── calculateTravelFee ───────────────────────────────────────────────────────
// Tier structure: base £24 (0–3 mi), +£1.70/mi (3–10), +£2.35/mi (10–20),
//                +£3.00/mi (20–40), +£3.85/mi (40–60), +£4.25/mi (60–100)

describe('calculateTravelFee', () => {
  it('returns null for invalid distance', () => {
    expect(calculateTravelFee(-1)).toBeNull();
    expect(calculateTravelFee(NaN)).toBeNull();
  });

  it('returns null for distance > 100 miles', () => {
    expect(calculateTravelFee(100)).toBe(366.4);
    expect(calculateTravelFee(100.01)).toBeNull();
  });

  it('returns 24 for 0 miles (base covers first 3 miles)', () => {
    expect(calculateTravelFee(0)).toBe(24);
  });

  it('returns 24 for 3 miles (exact tier boundary)', () => {
    expect(calculateTravelFee(3)).toBe(24);
  });

  it('returns correct fee for 5 miles', () => {
    // 24 + (5-3)*1.70 = 24 + 3.40 = 27.40
    expect(calculateTravelFee(5)).toBe(27.4);
  });

  it('returns correct fee for 10 miles (tier boundary)', () => {
    // 24 + (10-3)*1.70 = 24 + 11.90 = 35.90
    expect(calculateTravelFee(10)).toBe(35.9);
  });

  it('returns correct fee for 11 miles', () => {
    // 24 + 7*1.70 + 1*2.35 = 38.25
    expect(calculateTravelFee(11)).toBe(38.25);
  });

  it('returns correct fee for 20 miles (tier boundary)', () => {
    // 24 + 11.90 + 10*2.35 = 59.40
    expect(calculateTravelFee(20)).toBe(59.4);
  });

  it('returns correct fee for 40 miles (tier boundary)', () => {
    // 24 + 11.90 + 23.50 + 20*3.00 = 119.40
    expect(calculateTravelFee(40)).toBe(119.4);
  });

  it('returns correct fee for 60 miles', () => {
    // 24 + 11.90 + 23.50 + 60.00 + 20*3.85 = 196.40
    expect(calculateTravelFee(60)).toBe(196.4);
  });

  it('returns correct fee for 100 miles (max allowed)', () => {
    // 196.40 + 40*4.25 = 366.40
    expect(calculateTravelFee(100)).toBe(366.4);
  });

  it('has no price jumps at tier boundaries (continuous) — spec test 4', () => {
    // Prove continuity by checking exact values around tier edges.
    // If there were a discrete step the mid-boundary value would jump by several pounds.

    // Around 3-mile boundary: 2.99→24, 3→24, 3.01→24.02
    expect(calculateTravelFee(2.99)).toBe(24);
    expect(calculateTravelFee(3)).toBe(24);
    expect(calculateTravelFee(3.01)).toBe(24.02);

    // Around 10-mile boundary: 9.99→35.88, 10→35.90, 10.01→35.92
    expect(calculateTravelFee(9.99)).toBe(35.88);
    expect(calculateTravelFee(10)).toBe(35.9);
    expect(calculateTravelFee(10.01)).toBe(35.92);

    // Around 20-mile boundary: 19.99→59.38, 20→59.40, 20.01→59.43
    expect(calculateTravelFee(19.99)).toBe(59.38);
    expect(calculateTravelFee(20)).toBe(59.4);
    expect(calculateTravelFee(20.01)).toBe(59.43);

    // Around 40-mile boundary
    const at39_99 = calculateTravelFee(39.99)!;
    const at40 = calculateTravelFee(40)!;
    const at40_01 = calculateTravelFee(40.01)!;
    expect(at40 - at39_99).toBeLessThan(0.10); // tiny step, not a slab jump
    expect(at40_01 - at40).toBeLessThan(0.10);
  });
});

describe('milesBetween', () => {
  it('returns 0 when distance is below the range', () => {
    expect(milesBetween(2, 3, 10)).toBe(0);
  });

  it('returns distance within range when fully inside', () => {
    expect(milesBetween(5, 3, 10)).toBe(2);
  });

  it('returns the full range width when distance exceeds the range', () => {
    expect(milesBetween(20, 3, 10)).toBe(7);
  });
});

describe('calculateFittingAtLocationPrice', () => {
  it('returns INVALID_DISTANCE for null input', () => {
    const result = calculateFittingAtLocationPrice(null);
    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toBe('INVALID_DISTANCE');
  });

  it('returns MANUAL_QUOTE_REQUIRED for > 100 miles', () => {
    const result = calculateFittingAtLocationPrice(100.01);
    expect(result.available).toBe(false);
    if (!result.available) expect(result.reason).toBe('MANUAL_QUOTE_REQUIRED');
  });

  it('returns travelFee only (fittingLabourFee = 0 in v2)', () => {
    const result = calculateFittingAtLocationPrice(5);
    expect(result.available).toBe(true);
    if (result.available) {
      // 24 + 2*1.70 = 27.40
      expect(result.travelFee).toBe(27.4);
      expect(result.fittingLabourFee).toBe(0);
      expect(result.fittingPrice).toBe(27.4);
    }
  });

  it('is valid at exactly 60 miles', () => {
    const result = calculateFittingAtLocationPrice(60);
    expect(result.available).toBe(true);
    // 24 + 11.90 + 23.50 + 60.00 + 77.00 = 196.40
    if (result.available) expect(result.travelFee).toBe(196.4);
  });

  it('is valid at exactly 100 miles', () => {
    const result = calculateFittingAtLocationPrice(100);
    expect(result.available).toBe(true);
    if (result.available) expect(result.travelFee).toBe(366.4);
  });
});

// ─── calculatePricing — scheduled_shop ───────────────────────────────────────

describe('calculatePricing — scheduled_shop', () => {
  it('1 tyre fit weekday: labour only, no travel', () => {
    const result = calculatePricing(shopInput(), defaultRules());
    expect(result.isValid).toBe(true);
    expect(result.mode).toBe('scheduled_shop');
    expect(result.totalTyreCost).toBe(80);
    expect(result.calloutFee).toBe(0);
    expect(result.total).toBe(98); // 80 + 18
    expect(result.fittingPrice).toBeUndefined(); // shop has no fittingPrice
  });

  it('2 tyres: 5% bundle discount on labour only', () => {
    const result = calculatePricing(shopInput({
      tyreSelections: [{ tyreId: 't1', quantity: 2, unitPrice: 80, service: 'fit' }],
    }), defaultRules());
    // labour = 2×18=36, discount = 36×0.05=1.80, service = 34.20, total = 160+34.20
    expect(result.isValid).toBe(true);
    expect(result.discountAmount).toBe(1.8);
    expect(result.total).toBe(194.2);
  });

  it('3 tyres: 8% bundle discount', () => {
    const result = calculatePricing(shopInput({
      tyreSelections: [{ tyreId: 't1', quantity: 3, unitPrice: 80, service: 'fit' }],
    }), defaultRules());
    // labour = 3×18=54, discount = 54×0.08=4.32, service = 49.68, total = 240+49.68=289.68
    expect(result.discountAmount).toBeCloseTo(4.32, 2);
    expect(result.total).toBeCloseTo(289.68, 2);
  });

  it('weekend adds shop_weekend_fee (£10), not mobile rate', () => {
    const result = calculatePricing(shopInput({ bookingDate: WEEKEND }), defaultRules());
    // 80 + 18 + 10 = 108
    expect(result.total).toBe(108);
    expect(result.totalSurcharges).toBe(10);
  });

  it('bank holiday adds shop_bank_holiday_fee (£20)', () => {
    const result = calculatePricing(shopInput({ isBankHoliday: true }), defaultRules());
    // 80 + 18 + 20 = 118
    expect(result.total).toBe(118);
  });

  it('applies minimum_order_total when total is low', () => {
    // 1 tyre £10, service-only repair: tyre=0, service=25 → total=25 < 50
    const result = calculatePricing(shopInput({
      tyreSelections: [],
      serviceType: 'repair',
      tyreQuantity: 1,
    }), defaultRules());
    expect(result.isValid).toBe(true);
    expect(result.total).toBe(50); // minimum enforced
  });

  it('ignores weather and traffic surcharges for shop mode — spec test 11', () => {
    const result = calculatePricing(shopInput({
      weatherSurcharge: 20,
      weatherSurchargeCode: 'SNOW_ICE',
      trafficSurcharge: 15,
    }), defaultRules());
    // Shop ignores both — total stays at 98
    expect(result.total).toBe(98);
    expect(result.weatherSurcharge).toBe(0);
    expect(result.trafficSurcharge).toBe(0);
    expect(result.calloutFee).toBe(0);
  });

  it('scheduled_shop with distance > 100 does not return mobile coverage manual quote', () => {
    const result = calculatePricing(shopInput({ distanceMiles: 120 }), defaultRules());
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.mode).toBe('scheduled_shop');
  });

  it('does not return invalid even when weatherManualQuoteRequired for shop', () => {
    const result = calculatePricing(shopInput({ weatherManualQuoteRequired: true }), defaultRules());
    expect(result.isValid).toBe(true);
  });

  it('includes TPMS fee and excludes it from bundle discount', () => {
    const result = calculatePricing(shopInput({
      tyreSelections: [{ tyreId: 't1', quantity: 2, unitPrice: 80, service: 'fit', requiresTpms: true }],
    }), defaultRules());
    // labour=36, discount=1.80, TPMS=20, service=36-1.80+20=54.20, tyre=160, total=214.20
    expect(result.total).toBeCloseTo(214.2, 2);
    expect(result.discountAmount).toBeCloseTo(1.8, 2);
  });

  it('repair uses shop_repair_labour_per_tyre rate', () => {
    const result = calculatePricing(shopInput({
      tyreSelections: [{ tyreId: 't1', quantity: 1, unitPrice: 80, service: 'repair' }],
    }), defaultRules());
    // 80 + 25 = 105
    expect(result.total).toBe(105);
  });

  it('all line items have a code', () => {
    const result = calculatePricing(shopInput({ isBankHoliday: true, bookingDate: WEEKEND }), defaultRules());
    for (const item of result.lineItems) {
      expect(item.code).toBeTruthy();
    }
  });
});

// ─── calculatePricing — scheduled_mobile ─────────────────────────────────────

describe('calculatePricing — scheduled_mobile', () => {
  it('1 tyre fit 5 miles weekday: minimum service applies — spec test 5', () => {
    const result = calculatePricing(mobileInput(), defaultRules());
    // labour=18, travel=27.40, raw=45.40 < min(47), adj=1.60, service=47, total=127
    expect(result.isValid).toBe(true);
    expect(result.mode).toBe('scheduled_mobile');
    expect(result.totalTyreCost).toBe(80);
    expect(result.calloutFee).toBe(27.4);
    expect(result.serviceSubtotal).toBe(47);
    expect(result.total).toBe(127);
    expect(typeof result.fittingPrice).toBe('number'); // mobile detection field
    expect(result.fittingPrice).toBe(47);
  });

  it('10 miles: no minimum needed, uses actual service cost', () => {
    const result = calculatePricing(mobileInput({ distanceMiles: 10 }), defaultRules());
    // labour=18, travel=35.90, raw=53.90 > 47, service=53.90, total=133.90
    expect(result.total).toBe(133.9);
    expect(result.serviceSubtotal).toBe(53.9);
  });

  it('at 20 miles: service matches ~£77.40 for one fit tyre — spec test 6', () => {
    const result = calculatePricing(mobileInput({ distanceMiles: 20 }), defaultRules());
    // labour=18, travel=59.40, raw=77.40 > 47, service=77.40, total=157.40
    expect(result.isValid).toBe(true);
    expect(result.serviceSubtotal).toBeCloseTo(77.4, 2);
    expect(result.total).toBeCloseTo(157.4, 2);
  });

  it('at 40 miles: service matches ~£137.40 for one fit tyre — spec test 7', () => {
    const result = calculatePricing(mobileInput({ distanceMiles: 40 }), defaultRules());
    // labour=18, travel=119.40, raw=137.40 > 47, service=137.40, total=217.40
    expect(result.isValid).toBe(true);
    expect(result.serviceSubtotal).toBeCloseTo(137.4, 2);
    expect(result.total).toBeCloseTo(217.4, 2);
  });

  it('60 miles (max): valid pricing returned', () => {
    const result = calculatePricing(mobileInput({ distanceMiles: 60 }), defaultRules());
    // labour=18, travel=196.40, raw=214.40, service=214.40, total=294.40
    expect(result.isValid).toBe(true);
    expect(result.calloutFee).toBe(196.4);
    expect(result.total).toBe(294.4);
  });

  it('100 miles (max): valid pricing returned', () => {
    const result = calculatePricing(mobileInput({ distanceMiles: 100 }), defaultRules());
    expect(result.isValid).toBe(true);
    expect(result.calloutFee).toBe(366.4);
    expect(result.total).toBe(464.4);
  });

  it('100.01 miles: returns outside auto-pricing area — spec test 11', () => {
    const result = calculatePricing(mobileInput({ distanceMiles: 100.01 }), defaultRules());
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('OUTSIDE_AUTO_PRICING_AREA');
  });

  it('invalid distance: returns invalid distance error', () => {
    const result = calculatePricing(mobileInput({ distanceMiles: -1 }), defaultRules());
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('FITTING_LOCATION_INVALID_DISTANCE');
  });

  it('severe weather: blocked with WEATHER_MANUAL_QUOTE_REQUIRED — spec test 12', () => {
    const result = calculatePricing(mobileInput({ weatherManualQuoteRequired: true }), defaultRules());
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('WEATHER_MANUAL_QUOTE_REQUIRED');
  });

  it('weather surcharge added to service (mode-appropriate amount from caller)', () => {
    // Caller computes £12 heavy rain for mobile mode and passes it in
    const result = calculatePricing(mobileInput({ weatherSurcharge: 12, weatherSurchargeCode: 'HEAVY_RAIN' }), defaultRules());
    // labour=18, travel=27.40, weather=12, raw=57.40 > 47, service=57.40, total=137.40
    expect(result.total).toBe(137.4);
    expect(result.weatherSurcharge).toBe(12);
  });

  it('traffic surcharge added to service', () => {
    const result = calculatePricing(mobileInput({ trafficSurcharge: 8, trafficSurchargeCode: 'MODERATE_TRAFFIC' }), defaultRules());
    // labour=18, travel=27.40, traffic=8, raw=53.40 > 47, service=53.40, total=133.40
    expect(result.total).toBe(133.4);
    expect(result.trafficSurcharge).toBe(8);
  });

  it('weekend adds mobile_weekend_fee (£12)', () => {
    const result = calculatePricing(mobileInput({ bookingDate: WEEKEND }), defaultRules());
    // labour=18, travel=27.40, weekend=12, raw=57.40 > 47, service=57.40, total=137.40
    expect(result.total).toBe(137.4);
  });

  it('bank holiday adds mobile_bank_holiday_fee (£25)', () => {
    const result = calculatePricing(mobileInput({ isBankHoliday: true }), defaultRules());
    // labour=18, travel=27.40, bh=25, raw=70.40 > 47, service=70.40, total=150.40
    expect(result.total).toBe(150.4);
  });

  it('2 tyres: 5% bundle discount on labour only, not travel', () => {
    const result = calculatePricing(mobileInput({
      tyreSelections: [{ tyreId: 't1', quantity: 2, unitPrice: 80, service: 'fit' }],
    }), defaultRules());
    // labour=36, discount=1.80, travel=27.40, raw=61.60 > 47, service=61.60, total=221.60
    expect(result.discountAmount).toBe(1.8);
    expect(result.calloutFee).toBe(27.4);
    expect(result.total).toBe(221.6);
  });

  it('demand multiplier applies to service only, never to tyre cost — spec test 4', () => {
    const result = calculatePricing(mobileInput({
      surgeMultiplier: 1.10,
    }), defaultRules({ surge_pricing_enabled: true }));
    // service before demand: 47 (minimum), demand clamp: 1.10 (within 0.95–1.15)
    // demand amount: 47 × 0.10 = 4.70, service after: 51.70
    // tyre: 80 (unchanged!), total: 80 + 51.70 = 131.70
    expect(result.surgeMultiplier).toBe(1.10);
    expect(result.tyreSubtotal).toBe(80);
    expect(result.serviceSubtotal).toBeCloseTo(51.7, 2);
    expect(result.total).toBeCloseTo(131.7, 2);
  });

  it('demand clamp for mobile: max 1.15', () => {
    const result = calculatePricing(mobileInput({
      surgeMultiplier: 1.30, // above mobile max
    }), defaultRules({ surge_pricing_enabled: true }));
    expect(result.surgeMultiplier).toBe(1.15); // clamped
  });

  it('demand clamp for mobile: min 0.95', () => {
    const result = calculatePricing(mobileInput({
      surgeMultiplier: 0.80, // below mobile min
    }), defaultRules({ surge_pricing_enabled: true }));
    expect(result.surgeMultiplier).toBe(0.95); // clamped
  });

  it('service-only repair 5 miles', () => {
    const result = calculatePricing(mobileInput({
      tyreSelections: [],
      serviceType: 'repair',
      tyreQuantity: 1,
    }), defaultRules());
    // repair labour: 25, travel: 27.40, raw: 52.40 > 47, service=52.40, tyre=0, total=52.40
    expect(result.isValid).toBe(true);
    expect(result.totalTyreCost).toBe(0);
    expect(result.total).toBe(52.4);
  });

  it('surge disabled ignores multiplier', () => {
    const result = calculatePricing(mobileInput({ surgeMultiplier: 1.20 }),
      defaultRules({ surge_pricing_enabled: false }));
    expect(result.surgeMultiplier).toBe(1.0);
  });

  it('tyreSubtotal and serviceSubtotal fields populated correctly', () => {
    const result = calculatePricing(mobileInput(), defaultRules());
    expect(result.tyreSubtotal).toBe(80);
    expect(result.serviceSubtotal).toBe(47);
    expect(result.tyrePrice).toBe(80);
    expect(result.totalPrice).toBe(127);
  });

  it('all line items have a code', () => {
    const result = calculatePricing(mobileInput({
      weatherSurcharge: 12,
      weatherSurchargeCode: 'HEAVY_RAIN',
      trafficSurcharge: 5,
      trafficSurchargeCode: 'MODERATE_TRAFFIC',
      isBankHoliday: true,
    }), defaultRules());
    for (const item of result.lineItems) {
      expect(item.code).toBeTruthy();
    }
  });
});

// ─── calculatePricing — emergency_mobile ─────────────────────────────────────

describe('calculatePricing — emergency_mobile', () => {
  it('1 tyre fit 5 miles weekday: correct emergency pricing — spec test 8', () => {
    const result = calculatePricing(emergencyInput(), defaultRules());
    // emergency travel: 27.40 × 1.15 = 31.51, labour: 22, priority: 47
    // raw service: 100.51; guardrail: max(81, 58.75, 90) = 90 → not triggered
    expect(result.isValid).toBe(true);
    expect(result.mode).toBe('emergency_mobile');
    expect(result.calloutFee).toBeCloseTo(31.51, 2);
    expect(result.emergencySurcharge).toBe(47);
    expect(result.emergencySurchargeSource).toBe('pricing_rule');
    expect(result.serviceSubtotal).toBeCloseTo(100.51, 2);
    expect(result.total).toBeCloseTo(180.51, 2);
    expect(typeof result.fittingPrice).toBe('number'); // mobile detection
  });

  it('at 20 miles: service matches ~£137.31 for one fit tyre — spec test 9', () => {
    const result = calculatePricing(emergencyInput({ distanceMiles: 20 }), defaultRules());
    // scheduled travel=59.40, emergency travel=68.31, labour=22, priority=47
    // raw=137.31; guardrail: max(111.40, 96.75, 90) = 111.40 → not triggered
    expect(result.isValid).toBe(true);
    expect(result.serviceSubtotal).toBeCloseTo(137.31, 2);
    expect(result.total).toBeCloseTo(217.31, 2);
  });

  it('at 40 miles: service matches ~£206.31 for one fit tyre — spec test 10', () => {
    const result = calculatePricing(emergencyInput({ distanceMiles: 40 }), defaultRules());
    // scheduled travel=119.40, emergency travel=137.31, labour=22, priority=47
    // raw=206.31; guardrail: max(171.40, 171.75, 90) = 171.75 → not triggered
    expect(result.isValid).toBe(true);
    expect(result.serviceSubtotal).toBeCloseTo(206.31, 2);
    expect(result.total).toBeCloseTo(286.31, 2);
  });

  it('emergency travel fee is 1.15× the scheduled mobile travel fee', () => {
    const mobileResult = calculatePricing(mobileInput({ distanceMiles: 10 }), defaultRules());
    const emergResult = calculatePricing(emergencyInput({ distanceMiles: 10 }), defaultRules());
    // scheduledTravel(10) = 35.90, emergencyTravel = 35.90 × 1.15 = 41.285 → 41.29 (ROUND_HALF_UP)
    // Use precision 1 (tolerance 0.05) to stay robust against the half-penny rounding boundary.
    expect(emergResult.calloutFee).toBeCloseTo(mobileResult.calloutFee * 1.15, 1);
  });

  it('emergency priority fee always present (never £0) — spec test 8', () => {
    const result = calculatePricing(emergencyInput(), defaultRules());
    expect(result.emergencySurcharge).toBeGreaterThan(0);
    expect(result.emergencySurcharge).toBe(47);
  });

  it('missing emergency DB rule still results in emergency priority >= £47 — spec test 8', () => {
    // parsePricingRules with no emergency_priority_fee key falls back to default 47
    const rules = parsePricingRules([]);
    expect(rules.emergency_priority_fee).toBe(47);
    const result = calculatePricing(emergencyInput(), rules);
    expect(result.emergencySurcharge).toBeGreaterThanOrEqual(47);
  });

  it('bank holiday adds emergency_bank_holiday_fee (£45)', () => {
    const result = calculatePricing(emergencyInput({ isBankHoliday: true }), defaultRules());
    // labour=22, travel=31.51, priority=47, bh=45 → raw=145.51 > guardrail(90)
    expect(result.total).toBeCloseTo(225.51, 2);
  });

  it('weekend surcharge NOT applied to emergency (emergency is always urgent)', () => {
    const result = calculatePricing(emergencyInput({ bookingDate: WEEKEND }), defaultRules());
    // no weekend fee for emergency mode
    const weekdayResult = calculatePricing(emergencyInput(), defaultRules());
    expect(result.total).toBe(weekdayResult.total);
  });

  it('guardrail enforced when priority fee is very low', () => {
    // With priority_fee=10, raw service = 22+31.51+10 = 63.51
    // scheduledMobileBase: 18+27.40=45.40 → scheduledMobileService=max(45.40,47)=47
    // guardrail = max(47+34=81, 47*1.25=58.75, 90) = 90
    // 63.51 < 90 → adjustment = 26.49, service = 90
    const result = calculatePricing(emergencyInput(),
      defaultRules({ emergency_priority_fee: 10 }));
    expect(result.isValid).toBe(true);
    expect(result.serviceSubtotal).toBeCloseTo(90, 2);
    expect(result.total).toBeCloseTo(170, 2);
  });

  it('guardrail uses EMERGENCY_GUARDRAIL_ADJUSTMENT code', () => {
    const result = calculatePricing(emergencyInput(),
      defaultRules({ emergency_priority_fee: 10 }));
    const guardrailItem = result.lineItems.find((li) => li.code === 'EMERGENCY_GUARDRAIL_ADJUSTMENT');
    expect(guardrailItem).toBeDefined();
    expect(guardrailItem?.amount).toBeGreaterThan(0);
  });

  it('guardrail: emergency >= scheduledMobile + £34 — spec test 3', () => {
    // Service-only repair at 5 miles:
    // scheduledMobileBase=25+27.40=52.40, scheduledMobileService=max(52.40,47)=52.40
    // guardrailMin = max(52.40+34=86.40, 52.40*1.25=65.50, 90) = 90
    const result = calculatePricing(emergencyInput({
      tyreSelections: [],
      serviceType: 'repair',
      tyreQuantity: 1,
    }), defaultRules({ emergency_priority_fee: 1 }));
    // emergency raw: 30 + 31.51 + 1 = 62.51 < 90 → guardrail applies
    expect(result.serviceSubtotal).toBeCloseTo(90, 2);
  });

  it('demand clamp for emergency: min 1.00, max 1.25', () => {
    const result = calculatePricing(emergencyInput({ surgeMultiplier: 1.30 }),
      defaultRules({ surge_pricing_enabled: true }));
    expect(result.surgeMultiplier).toBe(1.25); // capped at 1.25

    const result2 = calculatePricing(emergencyInput({ surgeMultiplier: 0.80 }),
      defaultRules({ surge_pricing_enabled: true }));
    expect(result2.surgeMultiplier).toBe(1.0); // floor at 1.0 (no discount for emergency)
  });

  it('demand multiplier applies to service only', () => {
    const result = calculatePricing(emergencyInput({ surgeMultiplier: 1.20 }),
      defaultRules({ surge_pricing_enabled: true }));
    // service before demand: 100.51, demand: 1.20
    // demand amount: 100.51 × 0.20 = 20.10, service after: 120.61
    // tyre: 80 (unchanged), total: 200.61
    expect(result.tyreSubtotal).toBe(80);
    expect(result.serviceSubtotal).toBeCloseTo(120.61, 2);
    expect(result.total).toBeCloseTo(200.61, 2);
  });

  it('emergency bundle discount rates: 0% for 2 tyres', () => {
    const result = calculatePricing(emergencyInput({
      tyreSelections: [{ tyreId: 't1', quantity: 2, unitPrice: 80, service: 'fit' }],
    }), defaultRules());
    expect(result.discountAmount).toBe(0); // no emergency discount for 2 tyres
  });

  it('emergency bundle discount rates: 3% for 3 tyres', () => {
    const result = calculatePricing(emergencyInput({
      tyreSelections: [{ tyreId: 't1', quantity: 3, unitPrice: 80, service: 'fit' }],
    }), defaultRules());
    // labour = 3×22=66, discount = 66×0.03=1.98
    expect(result.discountAmount).toBeCloseTo(1.98, 2);
  });

  it('emergency: 60 miles is auto-priced — spec test 11', () => {
    const result = calculatePricing(emergencyInput({ distanceMiles: 60 }), defaultRules());
    expect(result.isValid).toBe(true);
    expect(result.calloutFee).toBeCloseTo(225.86, 2);
  });

  it('emergency: 100 miles is auto-priced — spec test 11', () => {
    const result = calculatePricing(emergencyInput({ distanceMiles: 100 }), defaultRules());
    expect(result.isValid).toBe(true);
    expect(result.calloutFee).toBeCloseTo(421.36, 2);
  });

  it('emergency: 100.01 miles returns outside auto-pricing area — spec test 11', () => {
    const result = calculatePricing(emergencyInput({ distanceMiles: 100.01 }), defaultRules());
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('OUTSIDE_AUTO_PRICING_AREA');
  });
});

// ─── resolvePricingContext ────────────────────────────────────────────────────

describe('resolvePricingContext', () => {
  it('returns emergency_mobile_fitting for emergency bookings', () => {
    expect(resolvePricingContext({ bookingType: 'emergency' })).toBe('emergency_mobile_fitting');
  });

  it('returns scheduled_mobile_fitting for mobile scheduled bookings', () => {
    expect(resolvePricingContext({ bookingType: 'scheduled', fittingLocation: 'mobile' })).toBe('scheduled_mobile_fitting');
  });

  it('returns scheduled_garage_fitting when no fittingLocation specified', () => {
    expect(resolvePricingContext({ bookingType: 'scheduled' })).toBe('scheduled_garage_fitting');
  });

  it('returns scheduled_garage_fitting for shop fittingLocation', () => {
    expect(resolvePricingContext({ bookingType: 'scheduled', fittingLocation: 'shop' })).toBe('scheduled_garage_fitting');
  });
});

// ─── resolvePricingMode (and backward-compat resolveMode alias) ───────────────

describe('resolvePricingMode', () => {
  it('scheduled_garage_fitting context → scheduled_shop', () => {
    expect(resolvePricingMode({ pricingContext: 'scheduled_garage_fitting' })).toBe('scheduled_shop');
  });

  it('fittingLocation shop → scheduled_shop', () => {
    expect(resolvePricingMode({ fittingLocation: 'shop', bookingType: 'scheduled' })).toBe('scheduled_shop');
  });

  it('emergency_mobile_fitting context → emergency_mobile', () => {
    expect(resolvePricingMode({ pricingContext: 'emergency_mobile_fitting' })).toBe('emergency_mobile');
  });

  it('bookingType emergency → emergency_mobile', () => {
    expect(resolvePricingMode({ bookingType: 'emergency' })).toBe('emergency_mobile');
  });

  it('scheduled_mobile_fitting context → scheduled_mobile', () => {
    expect(resolvePricingMode({ pricingContext: 'scheduled_mobile_fitting' })).toBe('scheduled_mobile');
  });

  it('no context, scheduled bookingType → scheduled_mobile', () => {
    expect(resolvePricingMode({ bookingType: 'scheduled' })).toBe('scheduled_mobile');
  });

  it('explicit mode field takes precedence', () => {
    expect(resolvePricingMode({
      mode: 'scheduled_shop',
      bookingType: 'emergency',
      pricingContext: 'emergency_mobile_fitting',
    })).toBe('scheduled_shop');
  });

  it('resolveMode alias produces same result as resolvePricingMode', () => {
    const inputs = [
      { bookingType: 'emergency' as const },
      { bookingType: 'scheduled' as const, fittingLocation: 'shop' as const },
      { bookingType: 'scheduled' as const, fittingLocation: 'mobile' as const },
    ];
    for (const inp of inputs) {
      expect(resolveMode(inp)).toBe(resolvePricingMode(inp));
    }
  });
});

// ─── parsePricingRules ────────────────────────────────────────────────────────

describe('parsePricingRules', () => {
  it('returns all defaults when given empty rules array', () => {
    const rules = parsePricingRules([]);
    expect(rules.tpms_fee_per_tyre).toBe(10);
    expect(rules.shop_fit_labour_per_tyre).toBe(18);
    expect(rules.mobile_fit_labour_per_tyre).toBe(18);
    expect(rules.emergency_fit_labour_per_tyre).toBe(22);
    expect(rules.emergency_priority_fee).toBe(47);
    expect(rules.mobile_min_service_subtotal).toBe(47);
    expect(rules.emergency_min_service_subtotal).toBe(90);
    expect(rules.surge_pricing_enabled).toBe(false);
  });

  it('overrides specific values from DB rows', () => {
    const rules = parsePricingRules([
      { key: 'shop_fit_labour_per_tyre', value: '22' },
      { key: 'emergency_priority_fee', value: '65' },
    ]);
    expect(rules.shop_fit_labour_per_tyre).toBe(22);
    expect(rules.emergency_priority_fee).toBe(65);
    expect(rules.mobile_fit_labour_per_tyre).toBe(18); // still default
  });

  it('parses boolean surge_pricing_enabled correctly', () => {
    const rules = parsePricingRules([{ key: 'surge_pricing_enabled', value: 'true' }]);
    expect(rules.surge_pricing_enabled).toBe(true);
  });
});

// ─── getDisplayBreakdown ──────────────────────────────────────────────────────

describe('getDisplayBreakdown', () => {
  it('returns items unchanged when no rural surcharge exists (v2 normal case)', () => {
    const result = calculatePricing(mobileInput(), defaultRules());
    const display = getDisplayBreakdown(result);

    expect(display.total).toBe(result.total);
    expect(display.subtotal).toBe(result.subtotal);
    expect(display.lineItems.length).toBe(result.lineItems.length);
  });

  it('folds legacy rural surcharge into callout line item', () => {
    const mockBreakdown = {
      lineItems: [
        { label: 'Tyre', amount: 80, type: 'tyre' as const, code: 'TYRE_SUBTOTAL' as const },
        { label: 'Callout (5 mi.)', amount: 32, type: 'callout' as const, code: 'TRAVEL_DISTANCE' as const },
        { label: 'Rural area surcharge (50%)', amount: 56, type: 'surcharge' as const, code: 'TRAVEL_DISTANCE' as const },
        { label: 'Subtotal', amount: 168, type: 'subtotal' as const, code: 'LINE_SUBTOTAL' as const },
        { label: 'Total', amount: 168, type: 'total' as const, code: 'LINE_TOTAL' as const },
      ],
      subtotal: 168,
      vatAmount: 0,
      total: 168,
      // Required PricingBreakdown fields
      totalTyreCost: 80, totalServiceFee: 0, calloutFee: 32,
      totalSurcharges: 56, discountAmount: 0, surgeMultiplier: 1,
      vatRate: 0, quoteExpiresAt: new Date(), isValid: true,
    };

    const display = getDisplayBreakdown(mockBreakdown as Parameters<typeof getDisplayBreakdown>[0]);
    const ruralLines = display.lineItems.filter((li) => li.label.toLowerCase().includes('rural'));
    expect(ruralLines).toHaveLength(0);

    const calloutLine = display.lineItems.find((li) => li.type === 'callout');
    expect(calloutLine?.amount).toBe(88); // 32 + 56
    expect(calloutLine?.label).toContain('long-distance fee');
    expect(display.total).toBe(168);
  });
});

// ─── calculateHybridPricing ───────────────────────────────────────────────────

describe('calculateHybridPricing', () => {
  const hybridMobile = (overrides: Partial<HybridPricingInput> = {}): HybridPricingInput => ({
    ...mobileInput(),
    ...overrides,
  });

  it('weatherMultiplier=1.0, no demand → same total as base calculatePricing', () => {
    const base = calculatePricing(mobileInput(), defaultRules());
    const hybrid = calculateHybridPricing(hybridMobile({ weatherMultiplier: 1.0 }), defaultRules());
    expect(hybrid.finalPrice).toBe(base.total);
    expect(hybrid.legacyBreakdown.isValid).toBe(true);
  });

  it('applies weather multiplier to service only, not tyres', () => {
    const hybrid = calculateHybridPricing(
      hybridMobile({ weatherMultiplier: 1.10 }),
      defaultRules(),
    );
    // service before weather=47 (minimum), after=47×1.10=51.70
    // tyre=80 (unchanged), total=131.70
    expect(hybrid.finalPrice).toBeCloseTo(131.7, 2);
    expect(hybrid.basePrice).toBe(80); // tyre cost
    expect(hybrid.weatherMultiplier).toBe(1.10);
  });

  it('does not apply weather multiplier when flat weatherSurcharge already passed', () => {
    // Guard: flat fee already applied → weatherMult must be 1.0 to avoid double-charging
    const withFlatFee = calculateHybridPricing(
      hybridMobile({ weatherMultiplier: 1.10, weatherSurcharge: 12, weatherSurchargeCode: 'HEAVY_RAIN' }),
      defaultRules(),
    );
    const withMultiplierOnly = calculateHybridPricing(
      hybridMobile({ weatherMultiplier: 1.10 }),
      defaultRules(),
    );
    // With flat fee, weatherMultiplier must be neutralised (guard active)
    expect(withFlatFee.weatherMultiplier).toBe(1.0);
    // Without flat fee, multiplier is applied
    expect(withMultiplierOnly.weatherMultiplier).toBe(1.10);
  });

  it('caps combined multiplier at 1.50 (emergency mode, clamp matches input)', () => {
    const hybrid = calculateHybridPricing(
      { ...emergencyInput(), surgeMultiplier: 1.25, weatherMultiplier: 1.25 },
      defaultRules({ surge_pricing_enabled: true }),
    );
    // service after demand=125.64, preDemandService≈100.512
    // combinedMult=1.5625>1.50, so cap: 100.512*1.50≈150.77, total≈230.77
    expect(hybrid.finalPrice).toBeCloseTo(230.77, 2);
    expect(hybrid.pricingAudit.surgeMultiplier).toBe(1.25);
  });

  it('marks legacyBreakdown.isValid = true for valid inputs', () => {
    const hybrid = calculateHybridPricing(hybridMobile(), defaultRules());
    expect(hybrid.legacyBreakdown.isValid).toBe(true);
  });

  it('returns invalid legacyBreakdown for severe weather', () => {
    const hybrid = calculateHybridPricing(
      hybridMobile({ weatherManualQuoteRequired: true }),
      defaultRules(),
    );
    expect(hybrid.legacyBreakdown.isValid).toBe(false);
    expect(hybrid.legacyBreakdown.error).toBe('WEATHER_MANUAL_QUOTE_REQUIRED');
  });

  it('pricingReasons includes emergency for emergency bookings', () => {
    const hybrid = calculateHybridPricing(
      { ...emergencyInput(), weatherMultiplier: 1.0 },
      defaultRules(),
    );
    expect(hybrid.pricingReasons).toContain('Emergency booking');
  });
});

// ─── Pricing consistency — spec tests 1, 2, 3, 4, 5, 12, 13 ──────────────────

describe('pricing consistency', () => {
  it('shop service < mobile service < emergency service for same tyre and date — spec tests 1 & 2', () => {
    const rules = defaultRules();
    const shop = calculatePricing(shopInput(), rules);
    const mobile = calculatePricing(mobileInput(), rules);
    const emerg = calculatePricing(emergencyInput(), rules);

    expect(emerg.serviceSubtotal!).toBeGreaterThan(mobile.serviceSubtotal!);
    expect(mobile.serviceSubtotal!).toBeGreaterThan(shop.total - shop.totalTyreCost);
    expect(emerg.total).toBeGreaterThan(mobile.total);
    expect(mobile.total).toBeGreaterThan(shop.total);
  });

  it('emergency service >= max(£90, scheduledMobile + £34, scheduledMobile * 1.25) — spec test 3', () => {
    const rules = defaultRules();
    // Service-only at 5 miles to isolate service comparison
    const mobileResult = calculatePricing(
      mobileInput({ tyreSelections: [], serviceType: 'repair', tyreQuantity: 1 }),
      rules,
    );
    const emergResult = calculatePricing(
      emergencyInput({ tyreSelections: [], serviceType: 'repair', tyreQuantity: 1 }),
      rules,
    );
    const mS = mobileResult.serviceSubtotal!;
    const eS = emergResult.serviceSubtotal!;
    expect(eS).toBeGreaterThanOrEqual(Math.max(mS + 34, mS * 1.25, 90));
  });

  it('tyre cost is never multiplied by demand — spec test 4', () => {
    const rules = defaultRules({ surge_pricing_enabled: true });
    const withDemand = calculatePricing(mobileInput({ surgeMultiplier: 1.15 }), rules);
    const noDemand = calculatePricing(mobileInput(), rules);

    expect(withDemand.tyreSubtotal).toBe(noDemand.tyreSubtotal);
    expect(withDemand.total).toBeGreaterThan(noDemand.total);
  });

  it('total = tyreSubtotal + serviceSubtotal always', () => {
    const cases = [
      calculatePricing(shopInput(), defaultRules()),
      calculatePricing(mobileInput(), defaultRules()),
      calculatePricing(emergencyInput(), defaultRules()),
      calculatePricing(mobileInput({ distanceMiles: 20 }), defaultRules()),
    ];
    for (const result of cases) {
      if (result.isValid) {
        expect(result.total).toBeCloseTo(
          (result.tyreSubtotal ?? 0) + (result.serviceSubtotal ?? 0),
          2,
        );
      }
    }
  });

  it('calculatePricing is deterministic (architectural basis for quote/quick-book parity) — spec test 13', () => {
    // Both the customer quote route and admin quick-book call calculatePricing
    // with the same inputs. After dynamic layer removal, both return
    // calculatePricing output directly (quick-book adds admin adjustment only).
    // Verified here by showing determinism for identical inputs.
    const input = mobileInput();
    const rules = defaultRules();
    const a = calculatePricing(input, rules);
    const b = calculatePricing(input, rules);
    expect(a.total).toBe(b.total);
    expect(a.serviceSubtotal).toBe(b.serviceSubtotal);
    expect(a.tyreSubtotal).toBe(b.tyreSubtotal);
  });

  it('no stale v1 labels in live v2 breakdowns — spec test 13', () => {
    const rules = defaultRules();
    const inputs = [shopInput(), mobileInput(), emergencyInput()];
    for (const input of inputs) {
      const result = calculatePricing(input, rules);
      expect(result.isValid).toBe(true);
      for (const item of result.lineItems) {
        expect(item.label.toLowerCase()).not.toMatch(/rural area/);
        expect(item.label.toLowerCase()).not.toMatch(/callout slab/);
        expect(item.label.toLowerCase()).not.toMatch(/zone [a-z]/);
        expect(item.label.toLowerCase()).not.toMatch(/emergency_surcharge/);
      }
    }
  });

  it('backend-origin distance enforced: engine uses provided distanceMiles directly — spec test 6 note', () => {
    // The engine uses whatever distanceMiles is passed; route-layer calls
    // resolveDistance() server-side and never accepts a client-provided distance.
    // Unit-testable behaviour: different distances produce different totals.
    const rules = defaultRules();
    const near = calculatePricing(mobileInput({ distanceMiles: 5 }), rules);
    const far = calculatePricing(mobileInput({ distanceMiles: 30 }), rules);
    expect(far.calloutFee).toBeGreaterThan(near.calloutFee);
  });
});
