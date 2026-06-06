export type WeatherSurchargeCode =
  | 'NONE'
  | 'LIGHT_RAIN'
  | 'HEAVY_RAIN'
  | 'SNOW_ICE'
  | 'SEVERE_WEATHER'
  | 'UNKNOWN';

export interface WeatherSurchargeInput {
  condition?: string | null;
  severity?: string | null;
  precipitationMm?: number | null;
  windMph?: number | null;
  temperatureC?: number | null;
}

export interface WeatherSurchargeResult {
  surcharge: number;
  code: WeatherSurchargeCode;
  manualQuoteRequired: boolean;
}

function includesAny(value: string, terms: string[]): boolean {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function calculateWeatherSurcharge(input: WeatherSurchargeInput): WeatherSurchargeResult {
  const condition = input.condition?.trim().toLowerCase() ?? '';
  const severity = input.severity?.trim().toLowerCase() ?? '';
  const precipitationMm = numberOrNull(input.precipitationMm);
  const windMph = numberOrNull(input.windMph);
  const temperatureC = numberOrNull(input.temperatureC);
  const combined = `${condition} ${severity}`.trim();

  if (!combined && precipitationMm == null && windMph == null && temperatureC == null) {
    return { surcharge: 0, code: 'UNKNOWN', manualQuoteRequired: false };
  }

  if (
    includesAny(combined, ['severe storm', 'dangerous', 'red warning', 'extreme']) ||
    (includesAny(combined, ['storm', 'thunderstorm']) && windMph != null && windMph >= 45) ||
    (windMph != null && windMph >= 55)
  ) {
    return { surcharge: 0, code: 'SEVERE_WEATHER', manualQuoteRequired: true };
  }

  const hasPrecipitation = precipitationMm != null && precipitationMm > 0;
  if (
    includesAny(combined, ['snow', 'ice', 'icy', 'sleet', 'freezing']) ||
    (temperatureC != null && temperatureC <= 0 && hasPrecipitation)
  ) {
    return { surcharge: 20, code: 'SNOW_ICE', manualQuoteRequired: false };
  }

  if (includesAny(combined, ['heavy rain']) || (precipitationMm != null && precipitationMm > 2)) {
    return { surcharge: 10, code: 'HEAVY_RAIN', manualQuoteRequired: false };
  }

  if (
    includesAny(combined, ['light rain', 'rain', 'drizzle', 'shower']) ||
    (precipitationMm != null && precipitationMm > 0 && precipitationMm <= 2)
  ) {
    return { surcharge: 5, code: 'LIGHT_RAIN', manualQuoteRequired: false };
  }

  if (includesAny(combined, ['clear', 'normal', 'cloud', 'mist', 'fog'])) {
    return { surcharge: 0, code: 'NONE', manualQuoteRequired: false };
  }

  return { surcharge: 0, code: 'UNKNOWN', manualQuoteRequired: false };
}
