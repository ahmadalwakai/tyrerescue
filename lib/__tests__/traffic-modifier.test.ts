import { describe, expect, it } from 'vitest';
import { calculateTrafficSurcharge } from '../pricing/traffic-modifier';

describe('calculateTrafficSurcharge', () => {
  it('returns zero when duration is missing', () => {
    expect(calculateTrafficSurcharge({ distanceMiles: 10, durationMinutes: null })).toEqual({
      surcharge: 0,
      delayMinutes: 0,
      code: 'UNKNOWN',
    });
  });

  it('returns zero when delay is 10 minutes or less', () => {
    expect(calculateTrafficSurcharge({ distanceMiles: 10, durationMinutes: 30 })).toMatchObject({
      surcharge: 0,
      code: 'NONE',
    });
  });

  it('returns moderate traffic surcharge for 15 minute delay', () => {
    expect(calculateTrafficSurcharge({ distanceMiles: 10, durationMinutes: 35 })).toMatchObject({
      surcharge: 8,
      delayMinutes: 15,
      code: 'MODERATE_TRAFFIC',
    });
  });

  it('returns heavy traffic surcharge for 30 minute delay', () => {
    expect(calculateTrafficSurcharge({ distanceMiles: 10, durationMinutes: 50 })).toMatchObject({
      surcharge: 15,
      delayMinutes: 30,
      code: 'HEAVY_TRAFFIC',
    });
  });

  it('returns severe traffic surcharge for 40 minute delay', () => {
    expect(calculateTrafficSurcharge({ distanceMiles: 10, durationMinutes: 60 })).toMatchObject({
      surcharge: 25,
      delayMinutes: 40,
      code: 'SEVERE_TRAFFIC',
    });
  });
});
