export type WeatherSurchargeCode =
  | 'NONE'
  | 'LIGHT_RAIN'
  | 'HEAVY_RAIN'
  | 'SNOW_ICE'
  | 'SEVERE_WEATHER'
  | 'UNKNOWN';

export type PricingMode = 'scheduled_shop' | 'scheduled_mobile' | 'emergency_mobile';

export interface WeatherSurchargeInput {
  condition?: string | null;
  severity?: string | null;
  precipitationMm?: number | null;
  windMph?: number | null;
  temperatureC?: number | null;
  mode?: PricingMode;
}

export interface WeatherSurchargeResult {
  surcharge: number;
  code: WeatherSurchargeCode;
  manualQuoteRequired: boolean;
}

const MOBILE_SURCHARGES: Record<WeatherSurchargeCode, number> = {
  NONE: 0,
  UNKNOWN: 0,
  LIGHT_RAIN: 5,
  HEAVY_RAIN: 12,
  SNOW_ICE: 20,
  SEVERE_WEATHER: 0,
};

const EMERGENCY_SURCHARGES: Record<WeatherSurchargeCode, number> = {
  NONE: 0,
  UNKNOWN: 0,
  LIGHT_RAIN: 10,
  HEAVY_RAIN: 20,
  SNOW_ICE: 35,
  SEVERE_WEATHER: 0,
};

function includesAny(value: string, terms: string[]): boolean {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function classifyWeather(
  condition: string,
  severity: string,
  precipitationMm: number | null,
  windMph: number | null,
  temperatureC: number | null,
): WeatherSurchargeCode {
  const combined = `${condition} ${severity}`.trim();

  if (!combined && precipitationMm == null && windMph == null && temperatureC == null) {
    return 'UNKNOWN';
  }

  if (
    includesAny(combined, ['severe storm', 'dangerous', 'red warning', 'extreme']) ||
    (includesAny(combined, ['storm', 'thunderstorm']) && windMph != null && windMph >= 45) ||
    (windMph != null && windMph >= 55)
  ) {
    return 'SEVERE_WEATHER';
  }

  const hasPrecipitation = precipitationMm != null && precipitationMm > 0;
  if (
    includesAny(combined, ['snow', 'ice', 'icy', 'sleet', 'freezing']) ||
    (temperatureC != null && temperatureC <= 0 && hasPrecipitation)
  ) {
    return 'SNOW_ICE';
  }

  if (includesAny(combined, ['heavy rain']) || (precipitationMm != null && precipitationMm > 2)) {
    return 'HEAVY_RAIN';
  }

  if (
    includesAny(combined, ['light rain', 'rain', 'drizzle', 'shower']) ||
    (precipitationMm != null && precipitationMm > 0 && precipitationMm <= 2)
  ) {
    return 'LIGHT_RAIN';
  }

  if (includesAny(combined, ['clear', 'normal', 'cloud', 'mist', 'fog'])) {
    return 'NONE';
  }

  return 'UNKNOWN';
}

export function calculateWeatherSurcharge(input: WeatherSurchargeInput): WeatherSurchargeResult {
  const mode = input.mode ?? 'scheduled_mobile';

  if (mode === 'scheduled_shop') {
    return { surcharge: 0, code: 'NONE', manualQuoteRequired: false };
  }

  const condition = input.condition?.trim().toLowerCase() ?? '';
  const severity = input.severity?.trim().toLowerCase() ?? '';
  const precipitationMm = numberOrNull(input.precipitationMm);
  const windMph = numberOrNull(input.windMph);
  const temperatureC = numberOrNull(input.temperatureC);

  const code = classifyWeather(condition, severity, precipitationMm, windMph, temperatureC);

  if (code === 'SEVERE_WEATHER') {
    return { surcharge: 0, code: 'SEVERE_WEATHER', manualQuoteRequired: true };
  }

  const table = mode === 'emergency_mobile' ? EMERGENCY_SURCHARGES : MOBILE_SURCHARGES;
  return { surcharge: table[code], code, manualQuoteRequired: false };
}
