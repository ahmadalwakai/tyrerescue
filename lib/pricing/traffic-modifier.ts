export type TrafficSurchargeCode =
  | 'NONE'
  | 'MODERATE_TRAFFIC'
  | 'HEAVY_TRAFFIC'
  | 'SEVERE_TRAFFIC'
  | 'UNKNOWN';

export interface TrafficSurchargeInput {
  distanceMiles: number;
  durationMinutes?: number | null;
}

export interface TrafficSurchargeResult {
  surcharge: number;
  delayMinutes: number;
  code: TrafficSurchargeCode;
}

export function calculateTrafficSurcharge(input: TrafficSurchargeInput): TrafficSurchargeResult {
  if (
    !Number.isFinite(input.distanceMiles) ||
    input.distanceMiles < 0 ||
    typeof input.durationMinutes !== 'number' ||
    !Number.isFinite(input.durationMinutes) ||
    input.durationMinutes < 0
  ) {
    return { surcharge: 0, delayMinutes: 0, code: 'UNKNOWN' };
  }

  const expectedMinutes = (input.distanceMiles / 30) * 60;
  const delayMinutes = Math.max(0, input.durationMinutes - expectedMinutes);

  if (delayMinutes <= 10) {
    return { surcharge: 0, delayMinutes, code: 'NONE' };
  }
  if (delayMinutes <= 20) {
    return { surcharge: 8, delayMinutes, code: 'MODERATE_TRAFFIC' };
  }
  if (delayMinutes <= 35) {
    return { surcharge: 15, delayMinutes, code: 'HEAVY_TRAFFIC' };
  }

  return { surcharge: 25, delayMinutes, code: 'SEVERE_TRAFFIC' };
}
