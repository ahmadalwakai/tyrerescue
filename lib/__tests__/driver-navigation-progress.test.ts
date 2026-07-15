import { describe, expect, it } from 'vitest';
import type { DirectionsRoute, RouteStep } from '../../driver-app/src/services/directions';
import {
  buildNavigationProgress,
  isNewerNavigationPayload,
  metersPerSecondToMph,
  smoothCircularHeading,
  smoothSpeedMps,
  splitInstructionRoadName,
  validateRouteGeometry,
} from '../../driver-app/src/lib/navigation/navigationProgress';

const origin = { lat: 55, lng: -4 };
const destination = { lat: 55, lng: -3.996 };
const geometry: [number, number][] = [
  [-4, 55],
  [-3.999, 55],
  [-3.998, 55],
  [-3.997, 55],
  [-3.996, 55],
];

function step(index: number, overrides: Partial<RouteStep> = {}): RouteStep {
  const coord = geometry[index];
  return {
    instruction: index === 0 ? 'Head east' : `Continue on A${index}`,
    distanceMeters: 80,
    durationSeconds: 15,
    name: index === 0 ? null : `A${index}`,
    maneuverType: index === 0 ? 'depart' : index === geometry.length - 1 ? 'arrive' : 'turn',
    maneuverModifier: index === 0 ? 'straight' : 'right',
    drivingSide: 'left',
    exit: null,
    location: coord,
    ...overrides,
  };
}

function route(overrides: Partial<DirectionsRoute> = {}): DirectionsRoute {
  return {
    geometry,
    distanceMeters: 300,
    durationSeconds: 120,
    trafficDurationSeconds: 120,
    typicalDurationSeconds: 110,
    steps: [step(0), step(2), step(4)],
    congestion: null,
    roadClasses: { motorways: false, tolls: false, ferries: false },
    destinationSnap: null,
    ...overrides,
  };
}

describe('driver navigation progress', () => {
  it('smooths speed and heading across circular north', () => {
    expect(metersPerSecondToMph(10)).toBeCloseTo(22.369, 3);
    expect(smoothSpeedMps(10, 20, 0.5)).toBe(15);
    expect(smoothCircularHeading(350, 10, 0.5)).toBe(0);
  });

  it('isolates road names for mixed-direction instruction rendering', () => {
    expect(splitInstructionRoadName('Merge onto M8', 'M8')).toEqual({
      before: 'Merge onto ',
      road: 'M8',
      after: '',
    });
    expect(splitInstructionRoadName('Continue straight', 'A720')).toBeNull();
  });

  it('validates route geometry before accepting a Mapbox response', () => {
    expect(validateRouteGeometry({ route: route(), origin, destination }).ok).toBe(true);

    const invalid = route({
      geometry: [
        [-4, 55],
        [-80, 30],
        [-3.996, 55],
      ],
      distanceMeters: 1_000_000,
    });
    const validation = validateRouteGeometry({ route: invalid, origin, destination });
    expect(validation.ok).toBe(false);
    expect(validation.reason).toBe('segment-jump');
  });

  it('snaps only inside the safe route corridor', () => {
    const near = buildNavigationProgress({
      rawLocation: { lat: 55.00005, lng: -3.9995 },
      route: route(),
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: null,
      gpsHeading: 90,
      speedMps: 8,
      accuracyMeters: 8,
      fixTimestampMs: 1_000,
      nowMs: 1_100,
    });

    expect(near.displayMode).toBe('snapped');
    expect(near.distanceFromRouteMeters).toBeLessThan(75);
    expect(near.remainingDistanceMeters).toBeLessThan(300);
    expect(near.travelledGeometry?.length).toBeGreaterThanOrEqual(2);

    const far = buildNavigationProgress({
      rawLocation: { lat: 55.01, lng: -3.9995 },
      route: route(),
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: near,
      gpsHeading: 90,
      speedMps: 8,
      accuracyMeters: 8,
      fixTimestampMs: 2_000,
      nowMs: 2_100,
    });

    expect(far.displayMode).toBe('raw');
    expect(far.distanceFromRouteMeters).toBeGreaterThan(75);
  });

  it('uses route progress for current maneuver and remaining ETA', () => {
    const beforeTurn = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9992 },
      route: route(),
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: null,
      gpsHeading: 90,
      speedMps: 10,
      accuracyMeters: 5,
      fixTimestampMs: 1_000,
      nowMs: 1_100,
    });
    expect(beforeTurn.currentStepIndex).toBe(1);
    expect(beforeTurn.distanceToManeuverMeters).toBeGreaterThan(0);

    const afterTurn = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9974 },
      route: route(),
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: beforeTurn,
      gpsHeading: 90,
      speedMps: 10,
      accuracyMeters: 5,
      fixTimestampMs: 2_000,
      nowMs: 2_100,
    });
    expect(afterTurn.currentStepIndex).toBe(2);
    expect(afterTurn.remainingDurationSeconds).toBeLessThan(beforeTurn.remainingDurationSeconds ?? 0);
  });

  it('does not jump progress backwards to an older segment', () => {
    const previous = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9974 },
      route: route(),
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: null,
      gpsHeading: 90,
      speedMps: 12,
      accuracyMeters: 5,
      fixTimestampMs: 1_000,
      nowMs: 1_100,
    });
    const backwardsFix = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9998 },
      route: route(),
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous,
      gpsHeading: 90,
      speedMps: 12,
      accuracyMeters: 5,
      fixTimestampMs: 2_000,
      nowMs: 2_100,
    });

    expect(backwardsFix.distanceAlongMeters ?? 0).toBeGreaterThan(
      (previous.distanceAlongMeters ?? 0) - 35,
    );
    expect(backwardsFix.displayMode).toBe('raw');
  });

  it('keeps the display marker still for stale timestamps and inaccurate impossible jumps', () => {
    const previous = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9992 },
      route: route(),
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: null,
      gpsHeading: 90,
      speedMps: 10,
      accuracyMeters: 5,
      fixTimestampMs: 2_000,
      nowMs: 2_100,
    });

    const stale = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9988 },
      route: route(),
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous,
      gpsHeading: 90,
      speedMps: 10,
      accuracyMeters: 5,
      fixTimestampMs: 1_900,
      nowMs: 2_200,
    });
    expect(stale.displayLocation).toEqual(previous.displayLocation);
    expect(stale.fixTimestampMs).toBe(previous.fixTimestampMs);

    const impossible = buildNavigationProgress({
      rawLocation: { lat: 55.1, lng: -3.9 },
      route: route(),
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous,
      gpsHeading: 90,
      speedMps: 10,
      accuracyMeters: 80,
      fixTimestampMs: 2_500,
      nowMs: 2_600,
    });
    expect(impossible.displayLocation).toEqual(previous.displayLocation);
    expect(impossible.fixTimestampMs).toBe(previous.fixTimestampMs);
  });

  it('resets filters and matching when the route revision changes', () => {
    const previous = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9974 },
      route: route(),
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: null,
      gpsHeading: 90,
      speedMps: 20,
      accuracyMeters: 5,
      fixTimestampMs: 1_000,
      nowMs: 1_100,
    });

    const reset = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9998 },
      route: route(),
      routeRevision: 'r2',
      routeIsCurrent: true,
      previous,
      gpsHeading: 270,
      speedMps: 4,
      accuracyMeters: 5,
      fixTimestampMs: 900,
      nowMs: 1_000,
    });

    expect(reset.forceSnap).toBe(true);
    expect(reset.speedMps).toBe(4);
    expect(reset.distanceAlongMeters ?? Infinity).toBeLessThan(previous.distanceAlongMeters ?? 0);
  });

  it('rejects older same-route payloads but allows new route revisions', () => {
    const current = { routeRevision: 'r1', fixTimestampMs: 5_000 };
    expect(
      isNewerNavigationPayload(current, { routeRevision: 'r1', fixTimestampMs: 4_000 }),
    ).toBe(false);
    expect(
      isNewerNavigationPayload(current, { routeRevision: 'r2', fixTimestampMs: 4_000 }),
    ).toBe(true);
  });
});
