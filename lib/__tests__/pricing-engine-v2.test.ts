import { describe, it, expect } from 'vitest';
import { calculatePrice, type PriceFactors } from '../pricing/engine';

function factors(overrides: Partial<PriceFactors> = {}): PriceFactors {
  return {
    baseTyrePrice: 60,
    quantity: 4,
    distanceKm: 5,
    timeSlot: 'standard',
    demandLevel: 'normal',
    weatherCondition: 'clear',
    ...overrides,
  };
}

describe('calculatePrice', () => {
  it('calculates base case with no surcharges', () => {
    const r = calculatePrice(factors());
    // tyres: 60*4=240, fitting: 15*4=60, callout: 0 (5km < 10km)
    // subtotal: 300, no surcharges, VAT: 60, total: 360
    expect(r.tyresCost).toBe(240);
    expect(r.fittingFee).toBe(60);
    expect(r.calloutFee).toBe(0);
    expect(r.timeSurcharge).toBe(0);
    expect(r.demandAdjustment).toBe(0);
    expect(r.weatherAdjustment).toBe(0);
    expect(r.vatAmount).toBe(60);
    expect(r.total).toBe(360);
    expect(r.factors).toEqual([]);
  });

  it('applies distance surcharge beyond 10km', () => {
    const r = calculatePrice(factors({ distanceKm: 25 }));
    // callout: (25-10)*1 = 15
    expect(r.calloutFee).toBe(15);
    expect(r.distanceSurcharge).toBe(15);
    expect(r.factors).toContain('Distance surcharge (25km)');
  });

  it('no callout fee at exactly 10km', () => {
    const r = calculatePrice(factors({ distanceKm: 10 }));
    expect(r.calloutFee).toBe(0);
  });

  it('applies evening time surcharge (+20%)', () => {
    const r = calculatePrice(factors({ timeSlot: 'evening' }));
    // subtotal: 300, surcharge: 300*0.20 = 60
    expect(r.timeSurcharge).toBe(60);
    expect(r.factors).toContain('Evening booking (+20%)');
  });

  it('applies weekend time surcharge (+15%)', () => {
    const r = calculatePrice(factors({ timeSlot: 'weekend' }));
    expect(r.timeSurcharge).toBe(45);
    expect(r.factors).toContain('Weekend booking (+15%)');
  });

  it('applies emergency time surcharge (+50%)', () => {
    const r = calculatePrice(factors({ timeSlot: 'emergency' }));
    expect(r.timeSurcharge).toBe(150);
    expect(r.factors).toContain('Emergency booking (+50%)');
  });

  it('applies high demand adjustment (+10%)', () => {
    const r = calculatePrice(factors({ demandLevel: 'high' }));
    // 300 * 0.10 = 30
    expect(r.demandAdjustment).toBe(30);
    expect(r.factors).toContain('High demand (+10%)');
  });

  it('applies low demand discount (-5%)', () => {
    const r = calculatePrice(factors({ demandLevel: 'low' }));
    expect(r.demandAdjustment).toBe(-15);
    expect(r.factors).toContain('Low demand (-5%)');
  });

  it('applies rain weather adjustment (+5%)', () => {
    const r = calculatePrice(factors({ weatherCondition: 'rain' }));
    expect(r.weatherAdjustment).toBe(15);
    expect(r.factors).toContain('Heavy rain (+5%)');
  });

  it('applies snow weather adjustment (+15%)', () => {
    const r = calculatePrice(factors({ weatherCondition: 'snow' }));
    expect(r.weatherAdjustment).toBe(45);
    expect(r.factors).toContain('Snow conditions (+15%)');
  });

  it('applies severe weather adjustment (+25%)', () => {
    const r = calculatePrice(factors({ weatherCondition: 'severe' }));
    expect(r.weatherAdjustment).toBe(75);
    expect(r.factors).toContain('Severe weather (+25%)');
  });

  it('stacks all surcharges correctly', () => {
    const r = calculatePrice(factors({
      distanceKm: 25,
      timeSlot: 'evening',
      demandLevel: 'high',
      weatherCondition: 'rain',
    }));
    // tyres: 240, fitting: 60, callout: 15 → subtotal: 315
    // time: 315*0.20 = 63
    // demand: 315*0.10 = 31.50
    // weather: 315*0.05 = 15.75
    // preVat: 315 + 63 + 31.50 + 15.75 = 425.25
    // vat: 425.25 * 0.20 = 85.05
    // total: 425.25 + 85.05 = 510.30
    expect(r.tyresCost).toBe(240);
    expect(r.fittingFee).toBe(60);
    expect(r.calloutFee).toBe(15);
    expect(r.timeSurcharge).toBe(63);
    expect(r.demandAdjustment).toBe(31.5);
    expect(r.weatherAdjustment).toBe(15.75);
    expect(r.vatAmount).toBe(85.05);
    expect(r.total).toBe(510.3);
    expect(r.factors).toHaveLength(4);
  });

  it('handles single tyre', () => {
    const r = calculatePrice(factors({ quantity: 1 }));
    expect(r.tyresCost).toBe(60);
    expect(r.fittingFee).toBe(15);
    expect(r.total).toBe(90); // (60+15)*1.20
  });

  it('handles zero distance', () => {
    const r = calculatePrice(factors({ distanceKm: 0 }));
    expect(r.calloutFee).toBe(0);
  });

  it('VAT is 20% of pre-VAT total', () => {
    const r = calculatePrice(factors());
    const preVat = r.tyresCost + r.fittingFee + r.calloutFee
      + r.timeSurcharge + r.demandAdjustment + r.weatherAdjustment;
    expect(r.vatAmount).toBeCloseTo(preVat * 0.2, 2);
    expect(r.total).toBeCloseTo(preVat + r.vatAmount, 2);
  });
});
