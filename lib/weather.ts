/**
 * Weather-aware pricing context for Tyre Rescue.
 *
 * Uses OpenWeatherMap (or compatible) API to fetch current/forecast conditions,
 * then deterministically maps them to a pricing multiplier (1.00–1.25).
 *
 * Design principles:
 * - Never throws; always returns a neutral fallback on failure.
 * - In-memory cache with 15-minute TTL per location bucket.
 * - No PII stored; only weather observations.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WeatherPricingContext {
  conditionCode: number;
  conditionLabel: string;
  precipitationIntensity: number;   // mm/h  (0 = none)
  precipitationProbability: number; // 0–1
  windSpeed: number;                // m/s
  visibility: number;               // metres
  temperature: number;              // °C
  weatherSeverityScore: number;     // 0–1 composite
  weatherMultiplier: number;        // 1.00–1.25
  weatherReason: string;
  source: 'api' | 'cache' | 'fallback';
  observedAt: string;               // ISO-8601
}

interface OpenWeatherResponse {
  weather?: Array<{ id: number; main: string; description: string }>;
  main?: { temp: number };
  wind?: { speed: number };
  visibility?: number;
  rain?: { '1h'?: number; '3h'?: number };
  snow?: { '1h'?: number; '3h'?: number };
}

interface OpenWeatherForecastResponse {
  list?: Array<{
    dt?: number;
    dt_txt?: string;
    weather?: Array<{ id: number; main: string; description: string }>;
    main?: { temp: number };
    wind?: { speed: number };
    visibility?: number;
    pop?: number;
    rain?: { '3h'?: number };
    snow?: { '3h'?: number };
  }>;
}

export type WeatherIconKey =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'rain'
  | 'snow'
  | 'storm'
  | 'fog'
  | 'wind'
  | 'unknown';

export interface WeatherScheduleSummary {
  date: string;
  time: string | null;
  icon: WeatherIconKey;
  conditionCode: number;
  conditionLabel: string;
  temperature: number | null;
  precipitationProbability: number | null;
  weatherSeverityScore: number;
  weatherReason: string;
  source: 'api' | 'cache' | 'fallback';
  observedAt: string;
}

// ─── Cache ──────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 15 * 60_000; // 15 minutes

interface CacheEntry {
  context: WeatherPricingContext;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

interface ForecastCacheEntry {
  data: OpenWeatherForecastResponse;
  expiresAt: number;
  observedAt: string;
}

const forecastCache = new Map<string, ForecastCacheEntry>();

function makeCacheKey(lat: number, lng: number): string {
  // Round to 2 decimal places (~1 km resolution) for cache bucketing
  const rlat = Math.round(lat * 100) / 100;
  const rlng = Math.round(lng * 100) / 100;
  return `${rlat}:${rlng}`;
}

/** Exported for testing only. */
export function _clearWeatherCache(): void {
  cache.clear();
  forecastCache.clear();
}

// ─── Neutral Fallback ───────────────────────────────────────────────────────

export function neutralWeatherContext(reason?: string): WeatherPricingContext {
  return {
    conditionCode: 800,
    conditionLabel: 'Clear',
    precipitationIntensity: 0,
    precipitationProbability: 0,
    windSpeed: 0,
    visibility: 10000,
    temperature: 15,
    weatherSeverityScore: 0,
    weatherMultiplier: 1.0,
    weatherReason: reason ?? 'No weather data available',
    source: 'fallback',
    observedAt: new Date().toISOString(),
  };
}

// ─── Deterministic Multiplier Mapping ───────────────────────────────────────

/**
 * Map raw weather conditions to a multiplier.
 *
 * Rules (from spec):
 *   clear / normal          → 1.00
 *   light rain              → 1.03
 *   moderate rain           → 1.06
 *   heavy rain              → 1.10
 *   strong wind + rain      → 1.12
 *   snow / ice / low vis    → 1.15–1.25
 */
export function computeWeatherMultiplier(opts: {
  conditionCode: number;
  precipitationIntensity: number;
  windSpeed: number;
  visibility: number;
  temperature: number;
}): { multiplier: number; severity: number; reason: string } {
  const { conditionCode, precipitationIntensity, windSpeed, visibility, temperature } = opts;

  // Snow or ice conditions (6xx = snow, 511 = freezing rain)
  const isSnowOrIce =
    (conditionCode >= 600 && conditionCode < 700) ||
    conditionCode === 511 ||
    temperature <= 0;

  if (isSnowOrIce) {
    // Graduated within snow/ice range
    if (precipitationIntensity > 4 || visibility < 200) {
      return { multiplier: 1.25, severity: 1.0, reason: 'Heavy snow/ice with very low visibility' };
    }
    if (precipitationIntensity > 2 || visibility < 500) {
      return { multiplier: 1.20, severity: 0.85, reason: 'Significant snow/ice conditions' };
    }
    return { multiplier: 1.15, severity: 0.7, reason: 'Snow or icy conditions' };
  }

  // Very low visibility (fog, mist) without snow
  if (visibility < 300) {
    return { multiplier: 1.15, severity: 0.7, reason: 'Very low visibility (dense fog)' };
  }

  // Thunderstorm (2xx)
  if (conditionCode >= 200 && conditionCode < 300) {
    return { multiplier: 1.15, severity: 0.7, reason: 'Thunderstorm conditions' };
  }

  // Rain + strong wind
  const isRain = precipitationIntensity > 0 || (conditionCode >= 300 && conditionCode < 600);
  if (isRain && windSpeed > 12) {
    return { multiplier: 1.12, severity: 0.6, reason: 'Rain with strong wind' };
  }

  // Heavy rain (>= 7.6 mm/h OpenWeatherMap designation)
  if (precipitationIntensity >= 7.6) {
    return { multiplier: 1.10, severity: 0.5, reason: 'Heavy rain' };
  }

  // Moderate rain (2.5–7.6 mm/h)
  if (precipitationIntensity >= 2.5) {
    return { multiplier: 1.06, severity: 0.35, reason: 'Moderate rain' };
  }

  // Light rain (>0 and <2.5 mm/h) or drizzle codes (3xx)
  if (precipitationIntensity > 0 || (conditionCode >= 300 && conditionCode < 400)) {
    return { multiplier: 1.03, severity: 0.15, reason: 'Light rain' };
  }

  // Clear / normal
  return { multiplier: 1.0, severity: 0, reason: 'Clear conditions' };
}

function weatherIconFromCode(conditionCode: number, windSpeed = 0): WeatherIconKey {
  if (conditionCode >= 200 && conditionCode < 300) return 'storm';
  if (conditionCode >= 300 && conditionCode < 600) return windSpeed > 12 ? 'wind' : 'rain';
  if (conditionCode >= 600 && conditionCode < 700) return 'snow';
  if (conditionCode >= 700 && conditionCode < 800) return 'fog';
  if (conditionCode === 800) return windSpeed > 12 ? 'wind' : 'clear';
  if (conditionCode === 801 || conditionCode === 802) return windSpeed > 12 ? 'wind' : 'partly-cloudy';
  if (conditionCode > 802 && conditionCode < 900) return windSpeed > 12 ? 'wind' : 'cloudy';
  return 'unknown';
}

function londonDateAndTimeFromForecastItem(item: { dt?: number; dt_txt?: string }): {
  date: string;
  time: string;
} | null {
  const sourceDate = typeof item.dt === 'number'
    ? new Date(item.dt * 1000)
    : item.dt_txt
      ? new Date(`${item.dt_txt.replace(' ', 'T')}Z`)
      : null;

  if (!sourceDate || Number.isNaN(sourceDate.getTime())) return null;

  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(sourceDate);

  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(sourceDate);

  return { date, time };
}

function forecastItemToScheduleSummary(
  item: NonNullable<OpenWeatherForecastResponse['list']>[number],
  date: string,
  time: string | null,
  source: 'api' | 'cache',
  observedAt: string,
): WeatherScheduleSummary {
  const conditionCode = item.weather?.[0]?.id ?? 800;
  const conditionLabel = item.weather?.[0]?.main ?? 'Clear';
  const temperature = item.main?.temp ?? null;
  const windSpeed = item.wind?.speed ?? 0;
  const visibility = item.visibility ?? 10000;
  const precipitationIntensity = item.rain?.['3h'] ?? item.snow?.['3h'] ?? 0;
  const { severity, reason } = computeWeatherMultiplier({
    conditionCode,
    precipitationIntensity,
    windSpeed,
    visibility,
    temperature: temperature ?? 15,
  });

  return {
    date,
    time,
    icon: weatherIconFromCode(conditionCode, windSpeed),
    conditionCode,
    conditionLabel,
    temperature,
    precipitationProbability: typeof item.pop === 'number' ? item.pop : null,
    weatherSeverityScore: severity,
    weatherReason: reason,
    source,
    observedAt,
  };
}

function neutralScheduleSummary(
  date: string,
  reason: string,
): WeatherScheduleSummary {
  const fallback = neutralWeatherContext(reason);
  return {
    date,
    time: null,
    icon: 'unknown',
    conditionCode: fallback.conditionCode,
    conditionLabel: fallback.conditionLabel,
    temperature: null,
    precipitationProbability: null,
    weatherSeverityScore: fallback.weatherSeverityScore,
    weatherReason: fallback.weatherReason,
    source: fallback.source,
    observedAt: fallback.observedAt,
  };
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function minutesFromTime(time: string | null): number {
  if (!time) return 12 * 60;
  const [hh, mm] = time.split(':').map(Number);
  return hh * 60 + mm;
}

function pickDailyForecast(
  items: WeatherScheduleSummary[],
): WeatherScheduleSummary | null {
  if (items.length === 0) return null;

  return [...items].sort((a, b) => {
    if (b.weatherSeverityScore !== a.weatherSeverityScore) {
      return b.weatherSeverityScore - a.weatherSeverityScore;
    }
    const aMiddayDistance = Math.abs(minutesFromTime(a.time) - 12 * 60);
    const bMiddayDistance = Math.abs(minutesFromTime(b.time) - 12 * 60);
    if (aMiddayDistance !== bMiddayDistance) return aMiddayDistance - bMiddayDistance;
    return (b.precipitationProbability ?? 0) - (a.precipitationProbability ?? 0);
  })[0];
}

async function getForecastData(latitude: number, longitude: number): Promise<{
  data: OpenWeatherForecastResponse | null;
  source: 'api' | 'cache' | 'fallback';
  observedAt: string;
  reason?: string;
}> {
  const key = makeCacheKey(latitude, longitude);
  const cached = forecastCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return { data: cached.data, source: 'cache', observedAt: cached.observedAt };
  }

  const apiKey = process.env.WEATHER_API_KEY || '';
  const rawBase = process.env.WEATHER_API_BASE_URL || 'https://api.openweathermap.org';
  const baseUrl = rawBase.endsWith('/data/2.5') ? rawBase : `${rawBase.replace(/\/+$/, '')}/data/2.5`;

  if (!apiKey) {
    return {
      data: null,
      source: 'fallback',
      observedAt: new Date().toISOString(),
      reason: 'Weather API key not configured',
    };
  }

  try {
    const url = `${baseUrl}/forecast?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&units=metric&appid=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        data: null,
        source: 'fallback',
        observedAt: new Date().toISOString(),
        reason: `Weather forecast API error: ${response.status}`,
      };
    }

    const data: OpenWeatherForecastResponse = await response.json();
    const observedAt = new Date().toISOString();
    forecastCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS, observedAt });

    return { data, source: 'api', observedAt };
  } catch (error) {
    const reason =
      error instanceof DOMException && error.name === 'AbortError'
        ? 'Weather forecast API request timed out'
        : 'Weather forecast API request failed';
    return {
      data: null,
      source: 'fallback',
      observedAt: new Date().toISOString(),
      reason,
    };
  }
}

export async function getWeatherScheduleSummaries(params: {
  latitude: number;
  longitude: number;
  dates: string[];
}): Promise<{
  daily: WeatherScheduleSummary[];
  hourly: WeatherScheduleSummary[];
}> {
  const dates = [...new Set(params.dates.filter(isIsoDate))].slice(0, 15);

  if (dates.length === 0) {
    return { daily: [], hourly: [] };
  }

  if (
    !Number.isFinite(params.latitude) ||
    !Number.isFinite(params.longitude) ||
    params.latitude === 0 && params.longitude === 0
  ) {
    return {
      daily: dates.map((date) => neutralScheduleSummary(date, 'Missing or invalid coordinates')),
      hourly: [],
    };
  }

  const forecast = await getForecastData(params.latitude, params.longitude);
  if (!forecast.data?.list?.length || forecast.source === 'fallback') {
    const reason = forecast.reason ?? 'Weather forecast unavailable';
    return {
      daily: dates.map((date) => neutralScheduleSummary(date, reason)),
      hourly: [],
    };
  }

  const wantedDates = new Set(dates);
  const source = forecast.source === 'cache' ? 'cache' : 'api';
  const hourly = forecast.data.list
    .map((item) => {
      const parts = londonDateAndTimeFromForecastItem(item);
      if (!parts || !wantedDates.has(parts.date)) return null;
      return forecastItemToScheduleSummary(
        item,
        parts.date,
        parts.time,
        source,
        forecast.observedAt,
      );
    })
    .filter((item): item is WeatherScheduleSummary => Boolean(item));

  const daily = dates.map((date) => {
    const picked = pickDailyForecast(hourly.filter((item) => item.date === date));
    return picked
      ? { ...picked, time: null }
      : neutralScheduleSummary(date, 'Forecast unavailable for this date');
  });

  return { daily, hourly };
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export async function getWeatherPricingContext(params: {
  latitude: number;
  longitude: number;
  scheduledAt?: string | Date | null;
  areaName?: string | null;
}): Promise<WeatherPricingContext> {
  const { latitude, longitude } = params;

  // Guard: invalid or missing coordinates
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude === 0 && longitude === 0
  ) {
    return neutralWeatherContext('Missing or invalid coordinates');
  }

  // Check cache
  const key = makeCacheKey(latitude, longitude);
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return { ...cached.context, source: 'cache' };
  }

  // Resolve API config
  const apiKey = process.env.WEATHER_API_KEY || '';
  const rawBase = process.env.WEATHER_API_BASE_URL || 'https://api.openweathermap.org';
  // Ensure /data/2.5 path is present
  const baseUrl = rawBase.endsWith('/data/2.5') ? rawBase : `${rawBase.replace(/\/+$/, '')}/data/2.5`;

  if (!apiKey) {
    return neutralWeatherContext('Weather API key not configured');
  }

  try {
    const url = `${baseUrl}/weather?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&units=metric&appid=${encodeURIComponent(apiKey)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[weather] API returned ${response.status}`);
      return neutralWeatherContext(`Weather API error: ${response.status}`);
    }

    const data: OpenWeatherResponse = await response.json();

    const conditionCode = data.weather?.[0]?.id ?? 800;
    const conditionLabel = data.weather?.[0]?.main ?? 'Clear';
    const temperature = data.main?.temp ?? 15;
    const windSpeed = data.wind?.speed ?? 0;
    const visibility = data.visibility ?? 10000;
    const precipitationIntensity =
      data.rain?.['1h'] ?? data.rain?.['3h'] ?? data.snow?.['1h'] ?? data.snow?.['3h'] ?? 0;

    const { multiplier, severity, reason } = computeWeatherMultiplier({
      conditionCode,
      precipitationIntensity,
      windSpeed,
      visibility,
      temperature,
    });

    const context: WeatherPricingContext = {
      conditionCode,
      conditionLabel,
      precipitationIntensity,
      precipitationProbability: 0, // Current weather API doesn't return probability; set 0
      windSpeed,
      visibility,
      temperature,
      weatherSeverityScore: severity,
      weatherMultiplier: multiplier,
      weatherReason: reason,
      source: 'api',
      observedAt: new Date().toISOString(),
    };

    // Store in cache
    cache.set(key, { context, expiresAt: Date.now() + CACHE_TTL_MS });

    return context;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.error('[weather] API request timed out');
    } else {
      console.error('[weather] API fetch failed:', error);
    }
    return neutralWeatherContext('Weather API request failed');
  }
}
