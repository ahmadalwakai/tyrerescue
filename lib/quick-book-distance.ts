import { loadAvailableDriverDistanceCandidates } from '@/lib/driver-distance-candidates';
import { resolveDistance, type DistanceResult } from '@/lib/mapbox';

export async function resolveQuickBookDistance(customer: {
  lat: number;
  lng: number;
}): Promise<DistanceResult> {
  let driverCandidates: Awaited<ReturnType<typeof loadAvailableDriverDistanceCandidates>> = [];

  try {
    driverCandidates = await loadAvailableDriverDistanceCandidates();
  } catch (error) {
    console.error('[quick-book:distance] driver candidate load failed; using garage fallback', error);
  }

  return resolveDistance(customer, driverCandidates);
}

export function distanceResultToKm(result: DistanceResult): number {
  return Math.round(result.distanceMiles * 1.60934 * 100) / 100;
}