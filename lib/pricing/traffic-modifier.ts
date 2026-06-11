import type { PricingMode } from './weather-modifier';

export type TrafficSurchargeCode =
  | 'NONE'
  | 'MODERATE_TRAFFIC'
  | 'HEAVY_TRAFFIC'
  | 'SEVERE_TRAFFIC'
  | 'UNKNOWN';

export interface TrafficSurchargeInput {
  distanceMiles: number;
  durationMinutes?: number | null;
  mode?: PricingMode;
}

export interface TrafficSurchargeResult {
  surcharge: number;
  delayMinutes: number;
  code: TrafficSurchargeCode;
}

export function calculateTrafficSurcharge(input: TrafficSurchargeInput): TrafficSurchargeResult {
  const mode = input.mode ?? 'scheduled_mobile';

  if (
    !Number.isFinite(input.distanceMiles) ||
    input.distanceMiles < 0 ||
    typeof input.durationMinutes !== 'number' ||
    !Number.isFinite(input.durationMinutes) ||
    input.durationMinutes < 0
  ) {
    return { surcharge: 0, delayMinutes: 0, code: 'UNKNOWN' };
  }

  if (mode === 'scheduled_shop') {
    return { surcharge: 0, delayMinutes: 0, code: 'NONE' };
  }

  // Baseline speed: 30 mph → 2 minutes per mile
  const expectedMinutes = input.distanceMiles * 2;
  const delayMinutes = Math.max(0, input.durationMinutes - expectedMinutes);

  if (delayMinutes === 0) {
    return { surcharge: 0, delayMinutes: 0, code: 'NONE' };
  }

  // Code categorisation (labels only — surcharge formula is continuous)
  let code: TrafficSurchargeCode;
  if (delayMinutes <= 20) {
    code = 'MODERATE_TRAFFIC';
  } else if (delayMinutes <= 35) {
    code = 'HEAVY_TRAFFIC';
  } else {
    code = 'SEVERE_TRAFFIC';
  }

  // Spec formula: Math.min(delayMinutes * rate, cap)
  // scheduled_mobile: £0.45/min, capped at £20
  // emergency_mobile: £0.75/min, capped at £35
  const surcharge = mode === 'emergency_mobile'
    ? Math.min(delayMinutes * 0.75, 35)
    : Math.min(delayMinutes * 0.45, 20);

  return { surcharge: Math.round(surcharge * 100) / 100, delayMinutes, code };
}
