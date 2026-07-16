import { describe, expect, it } from 'vitest';
import type { DirectionsRoute, RouteStep } from '../../driver-app/src/services/directions';
import {
  buildNavigationProgress,
  getManeuverShimmerSpec,
  getManeuverWarningPhase,
  isNewerNavigationPayload,
  metersPerSecondToMph,
  selectRerouteOrigin,
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
    lanes: [],
    intersections: [],
    roadClass: null,
    speedLimitSign: null,
    speedLimitUnit: null,
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
    maxspeeds: null,
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

  it('surfaces only real Mapbox maxspeed data for the current segment', () => {
    const withLimits = route({
      maxspeeds: [
        { speed: 30, unit: 'mph', unknown: false, none: false, source: 'mapbox-maxspeed' },
        { speed: 64, unit: 'km/h', unknown: false, none: false, source: 'mapbox-maxspeed' },
        { speed: null, unit: null, unknown: true, none: false, source: 'mapbox-maxspeed' },
        { speed: 70, unit: 'mph', unknown: false, none: false, source: 'mapbox-maxspeed' },
      ],
    });

    const firstSegment = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9996 },
      route: withLimits,
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: null,
      gpsHeading: 90,
      speedMps: 9,
      accuracyMeters: 5,
      fixTimestampMs: 1_000,
      nowMs: 1_100,
    });
    expect(firstSegment.currentSpeedLimitMph).toBe(30);
    expect(firstSegment.speedLimitSource).toBe('mapbox-maxspeed');

    const converted = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9985 },
      route: withLimits,
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: firstSegment,
      gpsHeading: 90,
      speedMps: 9,
      accuracyMeters: 5,
      fixTimestampMs: 2_000,
      nowMs: 2_100,
    });
    expect(converted.currentSpeedLimitMph).toBe(40);
    expect(converted.speedLimitSource).toBe('mapbox-maxspeed');

    const unknown = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9975 },
      route: withLimits,
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: converted,
      gpsHeading: 90,
      speedMps: 9,
      accuracyMeters: 5,
      fixTimestampMs: 3_000,
      nowMs: 3_100,
    });
    expect(unknown.currentSpeedLimitMph).toBeNull();
    expect(unknown.speedLimitSource).toBe('unavailable');
  });

  it('does not invent speed limits when Mapbox omits maxspeed data', () => {
    const progress = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9995 },
      route: route({ maxspeeds: null }),
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: null,
      gpsHeading: 90,
      speedMps: 8,
      accuracyMeters: 5,
      fixTimestampMs: 1_000,
      nowMs: 1_100,
    });

    expect(progress.currentSpeedLimitMph).toBeNull();
    expect(progress.speedLimitSource).toBe('unavailable');
  });

  it('uses geometry segment indexes for speed limits, not step indexes', () => {
    const sparseStepRoute = route({
      steps: [step(0), step(4)],
      maxspeeds: [
        { speed: 20, unit: 'mph', unknown: false, none: false, source: 'mapbox-maxspeed' },
        { speed: 30, unit: 'mph', unknown: false, none: false, source: 'mapbox-maxspeed' },
        { speed: 40, unit: 'mph', unknown: false, none: false, source: 'mapbox-maxspeed' },
        { speed: 50, unit: 'mph', unknown: false, none: false, source: 'mapbox-maxspeed' },
      ],
    });

    const progress = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9975 },
      route: sparseStepRoute,
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: null,
      gpsHeading: 90,
      speedMps: 9,
      accuracyMeters: 5,
      fixTimestampMs: 1_000,
      nowMs: 1_100,
    });

    expect(progress.currentStepIndex).toBe(1);
    expect(progress.segmentIndex).toBe(2);
    expect(progress.currentSpeedLimitMph).toBe(40);
  });

  it('clears stale speed limits when the route revision has no maxspeed data', () => {
    const previous = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9995 },
      route: route({
        maxspeeds: [
          { speed: 30, unit: 'mph', unknown: false, none: false, source: 'mapbox-maxspeed' },
          { speed: 30, unit: 'mph', unknown: false, none: false, source: 'mapbox-maxspeed' },
          { speed: 30, unit: 'mph', unknown: false, none: false, source: 'mapbox-maxspeed' },
          { speed: 30, unit: 'mph', unknown: false, none: false, source: 'mapbox-maxspeed' },
        ],
      }),
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: null,
      gpsHeading: 90,
      speedMps: 8,
      accuracyMeters: 5,
      fixTimestampMs: 1_000,
      nowMs: 1_100,
    });

    const reset = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9995 },
      route: route({ maxspeeds: null }),
      routeRevision: 'r2',
      routeIsCurrent: true,
      previous,
      gpsHeading: 90,
      speedMps: 8,
      accuracyMeters: 5,
      fixTimestampMs: 2_000,
      nowMs: 2_100,
    });

    expect(previous.currentSpeedLimitMph).toBe(30);
    expect(reset.currentSpeedLimitMph).toBeNull();
    expect(reset.speedLimitSource).toBe('unavailable');
  });

  it('does not show a speed limit when the driver is outside the trusted route corridor', () => {
    const progress = buildNavigationProgress({
      rawLocation: { lat: 55.01, lng: -3.9995 },
      route: route({
        maxspeeds: [
          { speed: 30, unit: 'mph', unknown: false, none: false, source: 'mapbox-maxspeed' },
          { speed: 40, unit: 'mph', unknown: false, none: false, source: 'mapbox-maxspeed' },
          { speed: 50, unit: 'mph', unknown: false, none: false, source: 'mapbox-maxspeed' },
          { speed: 60, unit: 'mph', unknown: false, none: false, source: 'mapbox-maxspeed' },
        ],
      }),
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: null,
      gpsHeading: 90,
      speedMps: 8,
      accuracyMeters: 5,
      fixTimestampMs: 1_000,
      nowMs: 1_100,
    });

    expect(progress.displayMode).toBe('raw');
    expect(progress.currentSpeedLimitMph).toBeNull();
    expect(progress.speedLimitSource).toBe('unavailable');
  });

  it('shows lane guidance only from Mapbox lane metadata near the maneuver', () => {
    const routeWithLanes = route({
      steps: [
        step(0),
        step(2, {
          lanes: [
            { valid: false, active: false, validIndication: null, indications: ['left'] },
            { valid: true, active: true, validIndication: 'right', indications: ['straight', 'right'] },
            { valid: true, active: false, validIndication: 'right', indications: ['right'] },
          ],
          roadClass: 'primary',
        }),
        step(4),
      ],
    });

    const approaching = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9992 },
      route: routeWithLanes,
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: null,
      gpsHeading: 90,
      speedMps: 12,
      accuracyMeters: 5,
      fixTimestampMs: 1_000,
      nowMs: 1_100,
    });
    expect(approaching.laneGuidance?.lanes).toHaveLength(3);
    expect(approaching.laneGuidance?.lanes[1].active).toBe(true);

    const afterManeuver = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9974 },
      route: routeWithLanes,
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: approaching,
      gpsHeading: 90,
      speedMps: 12,
      accuracyMeters: 5,
      fixTimestampMs: 2_000,
      nowMs: 2_100,
    });
    expect(afterManeuver.laneGuidance).toBeNull();
  });

  it('preserves Mapbox lane order and clears lanes on route revision change', () => {
    const routeWithLanes = route({
      steps: [
        step(0),
        step(2, {
          lanes: [
            { valid: true, active: true, validIndication: 'left', indications: ['left'] },
            { valid: true, active: false, validIndication: 'straight', indications: ['straight'] },
            { valid: false, active: false, validIndication: null, indications: ['right'] },
          ],
        }),
        step(4),
      ],
    });
    const previous = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9992 },
      route: routeWithLanes,
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: null,
      gpsHeading: 90,
      speedMps: 10,
      accuracyMeters: 5,
      fixTimestampMs: 1_000,
      nowMs: 1_100,
    });
    expect(previous.laneGuidance?.lanes.map((lane) => lane.indications[0])).toEqual([
      'left',
      'straight',
      'right',
    ]);

    const reset = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9992 },
      route: route(),
      routeRevision: 'r2',
      routeIsCurrent: true,
      previous,
      gpsHeading: 90,
      speedMps: 10,
      accuracyMeters: 5,
      fixTimestampMs: 2_000,
      nowMs: 2_100,
    });
    expect(reset.laneGuidance).toBeNull();
  });

  it('carries roundabout exit numbers from the active maneuver', () => {
    const roundaboutRoute = route({
      steps: [
        step(0),
        step(2, { maneuverType: 'roundabout', exit: 3 }),
        step(4),
      ],
    });

    const progress = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9992 },
      route: roundaboutRoute,
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: null,
      gpsHeading: 90,
      speedMps: 10,
      accuracyMeters: 5,
      fixTimestampMs: 1_000,
      nowMs: 1_100,
    });

    expect(progress.roundaboutExitNumber).toBe(3);
  });

  it('does not invent missing roundabout exit numbers', () => {
    const progress = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9992 },
      route: route({
        steps: [step(0), step(2, { maneuverType: 'roundabout', exit: null }), step(4)],
      }),
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: null,
      gpsHeading: 90,
      speedMps: 10,
      accuracyMeters: 5,
      fixTimestampMs: 1_000,
      nowMs: 1_100,
    });

    expect(progress.roundaboutExitNumber).toBeNull();
  });

  it('maps maneuver warning phases by road class, speed, and GPS trust', () => {
    const base = {
      speedMps: null,
      roadClass: 'street',
      maneuverType: 'turn',
      accuracy: 5,
      isStale: false,
      isOffRoute: false,
    };

    expect(getManeuverWarningPhase({ ...base, distanceToManeuverMetres: 180 })).toBe('prepare');
    expect(getManeuverWarningPhase({ ...base, distanceToManeuverMetres: 45 })).toBe('imminent');
    expect(getManeuverWarningPhase({ ...base, distanceToManeuverMetres: 12 })).toBe('executing');
    expect(getManeuverWarningPhase({ ...base, distanceToManeuverMetres: -25 })).toBe('passed');
    expect(
      getManeuverWarningPhase({
        ...base,
        distanceToManeuverMetres: 1_000,
        roadClass: 'motorway',
        maneuverType: 'off ramp',
      }),
    ).toBe('prepare');
    expect(
      getManeuverWarningPhase({
        ...base,
        distanceToManeuverMetres: 12,
        isStale: true,
      }),
    ).toBe('early');
  });

  it('maps maneuver shimmer categories and pauses for reduced motion or background state', () => {
    const right = getManeuverShimmerSpec({
      maneuverType: 'turn',
      maneuverModifier: 'right',
      drivingSide: 'left',
      reducedMotion: false,
      appState: 'active',
    });
    expect(right.category).toBe('right');
    expect(right.mode).toBe('diagonal');
    expect(right.translateX).toEqual([-18, 30]);

    const roundabout = getManeuverShimmerSpec({
      maneuverType: 'roundabout',
      maneuverModifier: null,
      drivingSide: 'left',
      reducedMotion: false,
      appState: 'active',
    });
    expect(roundabout.category).toBe('roundabout-right');
    expect(roundabout.mode).toBe('circular');

    const paused = getManeuverShimmerSpec({
      maneuverType: 'arrive',
      maneuverModifier: null,
      drivingSide: 'left',
      reducedMotion: true,
      appState: 'background',
    });
    expect(paused.paused).toBe(true);
    expect(paused.mode).toBe('none');
    expect(paused.scale).toEqual([1, 1]);
  });

  it('selects reroute origins from trusted matched progress before raw GPS', () => {
    const progress = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9995 },
      route: route(),
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: null,
      gpsHeading: 90,
      speedMps: 8,
      accuracyMeters: 5,
      fixTimestampMs: 1_000,
      nowMs: 1_100,
    });

    const matched = selectRerouteOrigin({
      progress,
      rawLocation: { lat: 55.0001, lng: -3.9995 },
      rawLocationTimestamp: 1_050,
      routeRevision: 'r1',
      maxSnapDistanceMeters: 75,
    });
    expect(matched?.source).toBe('matched');
    expect(matched?.coordinate).toEqual(progress.matchedLocation);
    expect(matched?.segmentIndex).toBe(progress.matchedSegmentIndex);
    expect(matched?.confidence).toBeGreaterThan(0.95);

    const rawFallback = selectRerouteOrigin({
      progress,
      rawLocation: { lat: 55.0001, lng: -3.9995 },
      rawLocationTimestamp: 2_000,
      routeRevision: 'r2',
      maxSnapDistanceMeters: 75,
    });
    expect(rawFallback).toEqual({
      coordinate: { lat: 55.0001, lng: -3.9995 },
      source: 'raw',
      routeRevision: 'r2',
      locationTimestamp: 2_000,
      segmentIndex: null,
      confidence: null,
    });

    expect(
      selectRerouteOrigin({
        progress: null,
        rawLocation: null,
        rawLocationTimestamp: null,
        routeRevision: 'r1',
      }),
    ).toBeNull();
  });

  it('does not render lane guidance or warning escalation from stale route progress', () => {
    const routeWithLanes = route({
      steps: [
        step(0),
        step(2, {
          lanes: [
            { valid: true, active: true, validIndication: 'right', indications: ['right'] },
          ],
          roadClass: 'primary',
        }),
        step(4),
      ],
    });

    const stale = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9992 },
      route: routeWithLanes,
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous: null,
      gpsHeading: 90,
      speedMps: 12,
      accuracyMeters: 5,
      fixTimestampMs: 1_000,
      nowMs: 30_000,
    });

    expect(stale.isLocationStale).toBe(true);
    expect(stale.laneGuidance).toBeNull();
    expect(stale.maneuverWarningPhase).toBe('early');
  });

  it('keeps travelled geometry monotonic and bounded to the matched position', () => {
    const progress = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9974 },
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

    expect(progress.travelledGeometry).not.toBeNull();
    expect(progress.travelledGeometry?.length).toBeLessThanOrEqual((progress.segmentIndex ?? 0) + 2);
    const last = progress.travelledGeometry?.[progress.travelledGeometry.length - 1];
    expect(last).toEqual([progress.matchedLocation?.lng, progress.matchedLocation?.lat]);
  });

  it('does not extend the passed-route overlay from an untrusted off-route fix', () => {
    const previous = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9974 },
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

    const offRoute = buildNavigationProgress({
      rawLocation: { lat: 55.01, lng: -3.9965 },
      route: route(),
      routeRevision: 'r1',
      routeIsCurrent: true,
      previous,
      gpsHeading: 90,
      speedMps: 10,
      accuracyMeters: 5,
      fixTimestampMs: 2_000,
      nowMs: 2_100,
    });

    expect(offRoute.displayMode).toBe('raw');
    expect(offRoute.travelledGeometry).toBeNull();
    expect(offRoute.remainingDistanceMeters).toBeCloseTo(previous.remainingDistanceMeters ?? 0);
  });

  it('resets travelled geometry instead of carrying an old route shape across revisions', () => {
    const previous = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9974 },
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

    const reset = buildNavigationProgress({
      rawLocation: { lat: 55, lng: -3.9998 },
      route: route({
        geometry: [
          [-4, 55],
          [-3.9995, 55],
          [-3.999, 55],
        ],
        distanceMeters: 80,
        durationSeconds: 30,
        steps: [step(0), step(1, { location: [-3.9995, 55] }), step(2, { location: [-3.999, 55] })],
      }),
      routeRevision: 'r2',
      routeIsCurrent: true,
      previous,
      gpsHeading: 90,
      speedMps: 6,
      accuracyMeters: 5,
      fixTimestampMs: 2_000,
      nowMs: 2_100,
    });

    expect(previous.travelledGeometry?.some((coord) => coord[0] > -3.998)).toBe(true);
    expect(reset.travelledGeometry?.some((coord) => coord[0] > -3.998)).not.toBe(true);
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
