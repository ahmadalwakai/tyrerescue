import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeWeatherMultiplier,
  neutralWeatherContext,
  getWeatherPricingContext,
  _clearWeatherCache,
} from '../weather';

// ─── computeWeatherMultiplier (deterministic, no I/O) ───────────────────────

describe('computeWeatherMultiplier', () => {
  it('returns 1.00 for clear conditions', () => {
    const result = computeWeatherMultiplier({
      conditionCode: 800,
      precipitationIntensity: 0,
      windSpeed: 3,
      visibility: 10000,
      temperature: 18,
    });
    expect(result.multiplier).toBe(1.0);
    expect(result.severity).toBe(0);
    expect(result.reason).toBe('Clear conditions');
  });

  it('returns 1.03 for light rain (<2.5 mm/h)', () => {
    const result = computeWeatherMultiplier({
      conditionCode: 500,
      precipitationIntensity: 1.2,
      windSpeed: 4,
      visibility: 8000,
      temperature: 12,
    });
    expect(result.multiplier).toBe(1.03);
    expect(result.reason).toBe('Light rain');
  });

  it('returns 1.03 for drizzle codes (3xx) even with 0 precipitation', () => {
    const result = computeWeatherMultiplier({
      conditionCode: 300,
      precipitationIntensity: 0,
      windSpeed: 2,
      visibility: 7000,
      temperature: 10,
    });
    expect(result.multiplier).toBe(1.03);
    expect(result.reason).toBe('Light rain');
  });

  it('returns 1.06 for moderate rain (2.5–7.6 mm/h)', () => {
    const result = computeWeatherMultiplier({
      conditionCode: 501,
      precipitationIntensity: 4.0,
      windSpeed: 5,
      visibility: 6000,
      temperature: 10,
    });
    expect(result.multiplier).toBe(1.06);
    expect(result.reason).toBe('Moderate rain');
  });

  it('returns 1.10 for heavy rain (>=7.6 mm/h)', () => {
    const result = computeWeatherMultiplier({
      conditionCode: 502,
      precipitationIntensity: 10.0,
      windSpeed: 6,
      visibility: 3000,
      temperature: 8,
    });
    expect(result.multiplier).toBe(1.10);
    expect(result.reason).toBe('Heavy rain');
  });

  it('returns 1.12 for rain with strong wind (>12 m/s)', () => {
    const result = computeWeatherMultiplier({
      conditionCode: 501,
      precipitationIntensity: 3.0,
      windSpeed: 15,
      visibility: 5000,
      temperature: 9,
    });
    expect(result.multiplier).toBe(1.12);
    expect(result.reason).toBe('Rain with strong wind');
  });

  it('returns 1.15 for light snow', () => {
    const result = computeWeatherMultiplier({
      conditionCode: 600,
      precipitationIntensity: 1.0,
      windSpeed: 5,
      visibility: 2000,
      temperature: -1,
    });
    expect(result.multiplier).toBe(1.15);
    expect(result.reason).toBe('Snow or icy conditions');
  });

  it('returns 1.20 for significant snow (>2 mm/h or vis <500)', () => {
    const result = computeWeatherMultiplier({
      conditionCode: 601,
      precipitationIntensity: 3.0,
      windSpeed: 8,
      visibility: 800,
      temperature: -3,
    });
    expect(result.multiplier).toBe(1.20);
    expect(result.reason).toBe('Significant snow/ice conditions');
  });

  it('returns 1.25 for heavy snow with very low visibility', () => {
    const result = computeWeatherMultiplier({
      conditionCode: 602,
      precipitationIntensity: 5.0,
      windSpeed: 10,
      visibility: 150,
      temperature: -5,
    });
    expect(result.multiplier).toBe(1.25);
    expect(result.severity).toBe(1.0);
    expect(result.reason).toBe('Heavy snow/ice with very low visibility');
  });

  it('returns 1.15 for freezing rain (code 511)', () => {
    const result = computeWeatherMultiplier({
      conditionCode: 511,
      precipitationIntensity: 1.5,
      windSpeed: 4,
      visibility: 3000,
      temperature: -1,
    });
    expect(result.multiplier).toBe(1.15);
  });

  it('returns 1.15 for icy conditions (temp <= 0) even with clear code', () => {
    const result = computeWeatherMultiplier({
      conditionCode: 800,
      precipitationIntensity: 0,
      windSpeed: 2,
      visibility: 5000,
      temperature: -2,
    });
    expect(result.multiplier).toBe(1.15);
    expect(result.reason).toBe('Snow or icy conditions');
  });

  it('returns 1.15 for thunderstorm conditions (2xx)', () => {
    const result = computeWeatherMultiplier({
      conditionCode: 211,
      precipitationIntensity: 0,
      windSpeed: 8,
      visibility: 5000,
      temperature: 15,
    });
    expect(result.multiplier).toBe(1.15);
    expect(result.reason).toBe('Thunderstorm conditions');
  });

  it('returns 1.15 for dense fog (visibility < 300m)', () => {
    const result = computeWeatherMultiplier({
      conditionCode: 741,
      precipitationIntensity: 0,
      windSpeed: 1,
      visibility: 200,
      temperature: 5,
    });
    expect(result.multiplier).toBe(1.15);
    expect(result.reason).toBe('Very low visibility (dense fog)');
  });
});

// ─── neutralWeatherContext ──────────────────────────────────────────────────

describe('neutralWeatherContext', () => {
  it('returns multiplier 1.0 with fallback source', () => {
    const ctx = neutralWeatherContext();
    expect(ctx.weatherMultiplier).toBe(1.0);
    expect(ctx.source).toBe('fallback');
    expect(ctx.conditionCode).toBe(800);
    expect(ctx.weatherSeverityScore).toBe(0);
  });

  it('includes custom reason', () => {
    const ctx = neutralWeatherContext('API down');
    expect(ctx.weatherReason).toBe('API down');
  });
});

// ─── getWeatherPricingContext (with mocked fetch) ───────────────────────────

describe('getWeatherPricingContext', () => {
  beforeEach(() => {
    _clearWeatherCache();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns fallback when coordinates are invalid', async () => {
    const ctx = await getWeatherPricingContext({ latitude: NaN, longitude: NaN });
    expect(ctx.source).toBe('fallback');
    expect(ctx.weatherMultiplier).toBe(1.0);
    expect(ctx.weatherReason).toContain('invalid');
  });

  it('returns fallback when coordinates are 0,0', async () => {
    const ctx = await getWeatherPricingContext({ latitude: 0, longitude: 0 });
    expect(ctx.source).toBe('fallback');
    expect(ctx.weatherReason).toContain('invalid');
  });

  it('returns fallback when WEATHER_API_KEY is missing', async () => {
    vi.stubEnv('WEATHER_API_KEY', '');
    const ctx = await getWeatherPricingContext({ latitude: 55.86, longitude: -4.25 });
    expect(ctx.source).toBe('fallback');
    expect(ctx.weatherReason).toContain('not configured');
  });

  it('returns api result for clear weather', async () => {
    vi.stubEnv('WEATHER_API_KEY', 'test-key');
    vi.stubEnv('WEATHER_API_BASE_URL', 'https://mock.weather.test');

    const mockResponse = {
      weather: [{ id: 800, main: 'Clear', description: 'clear sky' }],
      main: { temp: 18 },
      wind: { speed: 3 },
      visibility: 10000,
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const ctx = await getWeatherPricingContext({ latitude: 55.86, longitude: -4.25 });

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(ctx.source).toBe('api');
    expect(ctx.weatherMultiplier).toBe(1.0);
    expect(ctx.conditionLabel).toBe('Clear');
    expect(ctx.temperature).toBe(18);
  });

  it('returns api result for heavy rain', async () => {
    vi.stubEnv('WEATHER_API_KEY', 'test-key');
    vi.stubEnv('WEATHER_API_BASE_URL', 'https://mock.weather.test');

    const mockResponse = {
      weather: [{ id: 502, main: 'Rain', description: 'heavy intensity rain' }],
      main: { temp: 8 },
      wind: { speed: 6 },
      visibility: 3000,
      rain: { '1h': 10.5 },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const ctx = await getWeatherPricingContext({ latitude: 55.86, longitude: -4.25 });

    expect(ctx.source).toBe('api');
    expect(ctx.weatherMultiplier).toBe(1.10);
    expect(ctx.precipitationIntensity).toBe(10.5);
    expect(ctx.weatherReason).toBe('Heavy rain');
  });

  it('returns api result for snow', async () => {
    vi.stubEnv('WEATHER_API_KEY', 'test-key');
    vi.stubEnv('WEATHER_API_BASE_URL', 'https://mock.weather.test');

    const mockResponse = {
      weather: [{ id: 601, main: 'Snow', description: 'snow' }],
      main: { temp: -2 },
      wind: { speed: 5 },
      visibility: 400,
      snow: { '1h': 3.2 },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const ctx = await getWeatherPricingContext({ latitude: 55.86, longitude: -4.25 });

    expect(ctx.source).toBe('api');
    expect(ctx.weatherMultiplier).toBe(1.20);
    expect(ctx.weatherReason).toBe('Significant snow/ice conditions');
  });

  it('returns fallback on API HTTP error', async () => {
    vi.stubEnv('WEATHER_API_KEY', 'test-key');
    vi.stubEnv('WEATHER_API_BASE_URL', 'https://mock.weather.test');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Unauthorized', { status: 401 }),
    );

    const ctx = await getWeatherPricingContext({ latitude: 55.86, longitude: -4.25 });

    expect(ctx.source).toBe('fallback');
    expect(ctx.weatherMultiplier).toBe(1.0);
    expect(ctx.weatherReason).toContain('401');
  });

  it('returns fallback on fetch crash', async () => {
    vi.stubEnv('WEATHER_API_KEY', 'test-key');
    vi.stubEnv('WEATHER_API_BASE_URL', 'https://mock.weather.test');

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network failure'));

    const ctx = await getWeatherPricingContext({ latitude: 55.86, longitude: -4.25 });

    expect(ctx.source).toBe('fallback');
    expect(ctx.weatherMultiplier).toBe(1.0);
    expect(ctx.weatherReason).toBe('Weather API request failed');
  });

  it('returns cached result on second call', async () => {
    vi.stubEnv('WEATHER_API_KEY', 'test-key');
    vi.stubEnv('WEATHER_API_BASE_URL', 'https://mock.weather.test');

    const mockResponse = {
      weather: [{ id: 800, main: 'Clear', description: 'clear' }],
      main: { temp: 15 },
      wind: { speed: 2 },
      visibility: 10000,
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const ctx1 = await getWeatherPricingContext({ latitude: 55.86, longitude: -4.25 });
    expect(ctx1.source).toBe('api');

    const ctx2 = await getWeatherPricingContext({ latitude: 55.86, longitude: -4.25 });
    expect(ctx2.source).toBe('cache');
    expect(ctx2.weatherMultiplier).toBe(ctx1.weatherMultiplier);

    // Only one actual fetch
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('constructs correct URL with /data/2.5 appended', async () => {
    vi.stubEnv('WEATHER_API_KEY', 'my-key');
    vi.stubEnv('WEATHER_API_BASE_URL', 'https://api.openweathermap.org');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ weather: [{ id: 800, main: 'Clear', description: 'clear' }], main: { temp: 15 }, wind: { speed: 2 }, visibility: 10000 }), { status: 200 }),
    );

    await getWeatherPricingContext({ latitude: 55.86, longitude: -4.25 });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/data/2.5/weather?');
    expect(calledUrl).toContain('appid=my-key');
    expect(calledUrl).toContain('lat=55.86');
    expect(calledUrl).toContain('lon=-4.25');
    expect(calledUrl).toContain('units=metric');
  });
});
