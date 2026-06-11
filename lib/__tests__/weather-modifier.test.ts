import { describe, expect, it } from 'vitest';
import { calculateWeatherSurcharge } from '../pricing/weather-modifier';

describe('calculateWeatherSurcharge', () => {
  it('returns zero for clear weather', () => {
    expect(calculateWeatherSurcharge({ condition: 'Clear' })).toEqual({
      surcharge: 0,
      code: 'NONE',
      manualQuoteRequired: false,
    });
  });

  it('returns light rain surcharge', () => {
    expect(calculateWeatherSurcharge({ condition: 'Light rain', precipitationMm: 1 })).toMatchObject({
      surcharge: 5,
      code: 'LIGHT_RAIN',
      manualQuoteRequired: false,
    });
  });

  it('returns heavy rain surcharge', () => {
    expect(calculateWeatherSurcharge({ condition: 'Rain', precipitationMm: 3 })).toMatchObject({
      surcharge: 12,
      code: 'HEAVY_RAIN',
      manualQuoteRequired: false,
    });
  });

  it('returns snow and ice surcharge', () => {
    expect(calculateWeatherSurcharge({ condition: 'Snow', temperatureC: -1, precipitationMm: 1 })).toMatchObject({
      surcharge: 20,
      code: 'SNOW_ICE',
      manualQuoteRequired: false,
    });
  });

  it('requires manual quote for severe weather', () => {
    expect(calculateWeatherSurcharge({ condition: 'Severe storm', windMph: 48 })).toMatchObject({
      surcharge: 0,
      code: 'SEVERE_WEATHER',
      manualQuoteRequired: true,
    });
  });

  it('keeps failed or missing weather neutral', () => {
    expect(calculateWeatherSurcharge({})).toEqual({
      surcharge: 0,
      code: 'UNKNOWN',
      manualQuoteRequired: false,
    });
  });
});
