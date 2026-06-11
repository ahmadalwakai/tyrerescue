import { describe, expect, it } from 'vitest';
import { calculateTrafficSurcharge } from '../pricing/traffic-modifier';

describe('calculateTrafficSurcharge', () => {
  it('returns UNKNOWN when duration is missing or invalid', () => {
    expect(calculateTrafficSurcharge({ distanceMiles: 10, durationMinutes: null })).toEqual({
      surcharge: 0,
      delayMinutes: 0,
      code: 'UNKNOWN',
    });
    expect(calculateTrafficSurcharge({ distanceMiles: 10, durationMinutes: undefined })).toEqual({
      surcharge: 0,
      delayMinutes: 0,
      code: 'UNKNOWN',
    });
  });

  it('returns NONE when there is no delay (on-time)', () => {
    // 10 miles × 2 min/mile = 20 min expected; actual = 20 → delay = 0
    expect(calculateTrafficSurcharge({ distanceMiles: 10, durationMinutes: 20 })).toEqual({
      surcharge: 0,
      delayMinutes: 0,
      code: 'NONE',
    });
  });

  it('returns NONE for shop mode regardless of delay', () => {
    expect(calculateTrafficSurcharge({ distanceMiles: 10, durationMinutes: 60, mode: 'scheduled_shop' })).toEqual({
      surcharge: 0,
      delayMinutes: 0,
      code: 'NONE',
    });
  });

  // Spec formula: trafficDelayFee = Math.min(delayMinutes * 0.45, 20) for scheduled_mobile

  it('returns surcharge for 10 minute delay (no de-minimis threshold)', () => {
    // 10 miles × 2 = 20 expected; actual 30 → delay 10
    // surcharge = min(10 × 0.45, 20) = 4.5
    expect(calculateTrafficSurcharge({ distanceMiles: 10, durationMinutes: 30 })).toMatchObject({
      surcharge: 4.5,
      delayMinutes: 10,
      code: 'MODERATE_TRAFFIC',
    });
  });

  it('returns correct surcharge for 15 minute delay', () => {
    // 10 miles × 2 = 20; actual 35 → delay 15
    // surcharge = min(15 × 0.45, 20) = 6.75
    expect(calculateTrafficSurcharge({ distanceMiles: 10, durationMinutes: 35 })).toMatchObject({
      surcharge: 6.75,
      delayMinutes: 15,
      code: 'MODERATE_TRAFFIC',
    });
  });

  it('returns correct surcharge for 30 minute delay (heavy traffic)', () => {
    // 10 miles × 2 = 20; actual 50 → delay 30
    // surcharge = min(30 × 0.45, 20) = 13.5
    expect(calculateTrafficSurcharge({ distanceMiles: 10, durationMinutes: 50 })).toMatchObject({
      surcharge: 13.5,
      delayMinutes: 30,
      code: 'HEAVY_TRAFFIC',
    });
  });

  it('returns correct surcharge for 40 minute delay (severe traffic)', () => {
    // 10 miles × 2 = 20; actual 60 → delay 40
    // surcharge = min(40 × 0.45, 20) = 18
    expect(calculateTrafficSurcharge({ distanceMiles: 10, durationMinutes: 60 })).toMatchObject({
      surcharge: 18,
      delayMinutes: 40,
      code: 'SEVERE_TRAFFIC',
    });
  });

  it('caps scheduled_mobile surcharge at £20', () => {
    // Need delay > 44.4 min to hit the cap: 10 miles × 2 = 20; actual 70 → delay 50
    // surcharge = min(50 × 0.45, 20) = min(22.5, 20) = 20
    expect(calculateTrafficSurcharge({ distanceMiles: 10, durationMinutes: 70 })).toMatchObject({
      surcharge: 20,
      code: 'SEVERE_TRAFFIC',
    });
  });

  it('emergency_mobile uses higher rate (£0.75/min) capped at £35', () => {
    // 10 miles × 2 = 20; actual 50 → delay 30
    // surcharge = min(30 × 0.75, 35) = 22.5
    expect(calculateTrafficSurcharge({
      distanceMiles: 10,
      durationMinutes: 50,
      mode: 'emergency_mobile',
    })).toMatchObject({
      surcharge: 22.5,
      delayMinutes: 30,
      code: 'HEAVY_TRAFFIC',
    });
  });

  it('emergency_mobile surcharge is capped at £35', () => {
    // Need delay > 46.7 min to hit cap: 10 miles × 2 = 20; actual 70 → delay 50
    // surcharge = min(50 × 0.75, 35) = min(37.5, 35) = 35
    expect(calculateTrafficSurcharge({
      distanceMiles: 10,
      durationMinutes: 70,
      mode: 'emergency_mobile',
    })).toMatchObject({
      surcharge: 35,
      code: 'SEVERE_TRAFFIC',
    });
  });

  it('zero delay produces zero surcharge', () => {
    expect(calculateTrafficSurcharge({ distanceMiles: 5, durationMinutes: 10 })).toMatchObject({
      surcharge: 0,
      delayMinutes: 0,
      code: 'NONE',
    });
  });

  it('small delay (1 minute) generates a small surcharge', () => {
    // 10 miles × 2 = 20; actual 21 → delay 1
    // surcharge = min(1 × 0.45, 20) = 0.45
    expect(calculateTrafficSurcharge({ distanceMiles: 10, durationMinutes: 21 })).toMatchObject({
      surcharge: 0.45,
      delayMinutes: 1,
      code: 'MODERATE_TRAFFIC',
    });
  });
});
