import { bearingDegrees, haversineMeters, type Coordinates } from '@/services/directions';

export function isValidHeading(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value < 360
  );
}

export function normaliseHeading(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function bearingBetween(origin: Coordinates, destination: Coordinates): number {
  return bearingDegrees(origin, destination);
}

export interface ResolveHeadingInput {
  gpsHeading: number | null | undefined;
  speed: number | null | undefined;
  prevCoord: Coordinates | null;
  currentCoord: Coordinates;
}

/**
 * Stable heading for the driver marker.
 *
 * Priority:
 * 1. GPS heading when speed > 1 m/s (genuinely moving, heading is reliable)
 * 2. Bearing from previous accepted fix when movement > 5 m (avoids GPS jitter)
 * 3. null — caller keeps last stable headingRef value (never rotates to 0)
 */
export function resolveDriverHeading(input: ResolveHeadingInput): number | null {
  const { gpsHeading, speed, prevCoord, currentCoord } = input;

  if (
    typeof gpsHeading === 'number' &&
    gpsHeading >= 0 &&
    typeof speed === 'number' &&
    speed > 1
  ) {
    return normaliseHeading(gpsHeading);
  }

  if (prevCoord && haversineMeters(prevCoord, currentCoord) > 5) {
    return bearingBetween(prevCoord, currentCoord);
  }

  return null;
}
