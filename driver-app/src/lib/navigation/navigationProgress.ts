import {
  bearingDegrees,
  haversineMeters,
  isValidCoord,
  type Coordinates,
  type DirectionsRoute,
  type LngLat,
  type RouteStep,
} from '../../services/directions';

const METERS_PER_SECOND_TO_MPH = 2.2369362921;
const DEFAULT_MAX_SNAP_METERS = 75;
const DEFAULT_STALE_MS = 12_000;
const MAX_BACKTRACK_METERS = 35;
const MAX_PLAUSIBLE_SPEED_MPS = 75;
const CONFIRMED_REVERSE_MAX_BACKTRACK_METERS = 500;

const routeMetricsCache = new WeakMap<LngLat[], RouteMetrics>();

export type DriverDisplayMode = 'snapped' | 'raw';

export interface RouteGeometryValidation {
  ok: boolean;
  reason: string | null;
  geometryMeters: number;
  maxSegmentMeters: number;
  startGapMeters: number | null;
  endGapMeters: number | null;
}

export interface NavigationRouteMatch {
  rawLocation: Coordinates;
  snappedLocation: Coordinates | null;
  displayLocation: Coordinates;
  displayMode: DriverDisplayMode;
  distanceFromRouteMeters: number | null;
  segmentIndex: number | null;
  segmentFraction: number;
  distanceAlongMeters: number | null;
  routeHeading: number | null;
  trusted: boolean;
}

export interface NavigationProgress {
  routeRevision: string;
  rawLocation: Coordinates | null;
  snappedLocation: Coordinates | null;
  displayLocation: Coordinates | null;
  displayMode: DriverDisplayMode;
  distanceFromRouteMeters: number | null;
  segmentIndex: number | null;
  distanceAlongMeters: number | null;
  routeHeading: number | null;
  displayHeading: number | null;
  speedMps: number | null;
  speedMph: number | null;
  speedDisplayReliable: boolean;
  remainingDistanceMeters: number | null;
  remainingDurationSeconds: number | null;
  currentStepIndex: number;
  currentStep: RouteStep | null;
  nextStep: RouteStep | null;
  distanceToManeuverMeters: number | null;
  travelledGeometry: LngLat[] | null;
  fixTimestampMs: number | null;
  animationDurationMs: number;
  forceSnap: boolean;
  stale: boolean;
}

export interface NavigationProgressInput {
  rawLocation: Coordinates | null;
  route: DirectionsRoute | null;
  routeRevision: string;
  routeIsCurrent: boolean;
  previous: NavigationProgress | null;
  gpsHeading: number | null;
  speedMps: number | null;
  accuracyMeters: number | null;
  fixTimestampMs: number | null;
  nowMs: number;
  maxSnapDistanceMeters?: number;
  staleAfterMs?: number;
  fallbackStepIndex?: number;
}

type SegmentProjection = {
  point: Coordinates;
  distanceMeters: number;
  segmentIndex: number;
  segmentFraction: number;
  distanceAlongMeters: number;
  routeHeading: number | null;
  score: number;
};

type RouteMetrics = {
  cumulative: number[];
  lengths: number[];
  totalMeters: number;
  maxSegmentMeters: number;
};

export function metersPerSecondToMph(speedMps: number | null | undefined): number | null {
  if (typeof speedMps !== 'number' || !Number.isFinite(speedMps) || speedMps < 0) {
    return null;
  }
  return speedMps * METERS_PER_SECOND_TO_MPH;
}

export function normaliseDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function shortestAngleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export function smoothCircularHeading(
  previous: number | null | undefined,
  target: number | null | undefined,
  alpha = 0.35,
): number | null {
  if (typeof target !== 'number' || !Number.isFinite(target)) {
    return typeof previous === 'number' && Number.isFinite(previous)
      ? normaliseDegrees(previous)
      : null;
  }
  if (typeof previous !== 'number' || !Number.isFinite(previous)) {
    return normaliseDegrees(target);
  }
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return normaliseDegrees(previous + shortestAngleDelta(previous, target) * clampedAlpha);
}

export function smoothSpeedMps(
  previous: number | null | undefined,
  current: number | null | undefined,
  alpha = 0.45,
): number | null {
  if (typeof current !== 'number' || !Number.isFinite(current) || current < 0) {
    return typeof previous === 'number' && Number.isFinite(previous) && previous >= 0
      ? previous
      : null;
  }
  if (typeof previous !== 'number' || !Number.isFinite(previous) || previous < 0) {
    return current;
  }
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return previous + (current - previous) * clampedAlpha;
}

export function splitInstructionRoadName(
  instruction: string,
  roadName: string | null | undefined,
): { before: string; road: string; after: string } | null {
  const road = roadName?.trim();
  if (!instruction || !road) return null;
  const index = instruction.indexOf(road);
  if (index < 0) return null;
  return {
    before: instruction.slice(0, index),
    road,
    after: instruction.slice(index + road.length),
  };
}

function lngLatToCoordinates(coord: LngLat | null | undefined): Coordinates | null {
  if (!coord || coord.length < 2) return null;
  const c = { lng: coord[0], lat: coord[1] };
  return isValidCoord(c) ? c : null;
}

function calculateRouteMetrics(geometry: LngLat[]): RouteMetrics {
  const cumulative = [0];
  const lengths: number[] = [];
  let totalMeters = 0;
  let maxSegmentMeters = 0;
  for (let i = 0; i < geometry.length - 1; i += 1) {
    const start = lngLatToCoordinates(geometry[i]);
    const end = lngLatToCoordinates(geometry[i + 1]);
    const length = start && end ? haversineMeters(start, end) : 0;
    lengths.push(length);
    totalMeters += length;
    maxSegmentMeters = Math.max(maxSegmentMeters, length);
    cumulative.push(totalMeters);
  }
  return { cumulative, lengths, totalMeters, maxSegmentMeters };
}

function getRouteMetrics(geometry: LngLat[]): RouteMetrics {
  const cached = routeMetricsCache.get(geometry);
  if (cached) return cached;
  const metrics = calculateRouteMetrics(geometry);
  routeMetricsCache.set(geometry, metrics);
  return metrics;
}

function projectedPointOnSegment(
  raw: Coordinates,
  start: Coordinates,
  end: Coordinates,
): { point: Coordinates; t: number; distanceMeters: number } {
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng =
    111_320 * Math.max(Math.cos((raw.lat * Math.PI) / 180), 0.2);
  const px = raw.lng * metersPerDegreeLng;
  const py = raw.lat * metersPerDegreeLat;
  const ax = start.lng * metersPerDegreeLng;
  const ay = start.lat * metersPerDegreeLat;
  const bx = end.lng * metersPerDegreeLng;
  const by = end.lat * metersPerDegreeLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const unclamped = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  const t = Math.max(0, Math.min(1, unclamped));
  return {
    t,
    point: {
      lng: start.lng + (end.lng - start.lng) * t,
      lat: start.lat + (end.lat - start.lat) * t,
    },
    distanceMeters: Math.hypot(px - (ax + dx * t), py - (ay + dy * t)),
  };
}

function isFiniteLngLat(coord: LngLat | null | undefined): coord is LngLat {
  return (
    Array.isArray(coord) &&
    coord.length >= 2 &&
    Number.isFinite(coord[0]) &&
    Number.isFinite(coord[1]) &&
    Math.abs(coord[0]) <= 180 &&
    Math.abs(coord[1]) <= 90
  );
}

function measureCoordinateAlongRoute(
  point: Coordinates,
  geometry: LngLat[],
  metrics: RouteMetrics,
): SegmentProjection | null {
  return matchLocationToRoute({
    rawLocation: point,
    geometry,
    metrics,
    previous: null,
    routeRevision: '',
    headingDegrees: null,
    speedMps: null,
    maxSnapDistanceMeters: Number.POSITIVE_INFINITY,
  });
}

export function validateRouteGeometry(params: {
  route: DirectionsRoute;
  origin: Coordinates;
  destination: Coordinates;
  maxEndpointGapMeters?: number;
  maxSegmentMeters?: number;
}): RouteGeometryValidation {
  const { route, origin, destination } = params;
  const endpointGap = params.maxEndpointGapMeters ?? 3_000;
  const maxSegmentLimit = params.maxSegmentMeters ?? 20_000;
  const geometry = route.geometry;

  if (!isValidCoord(origin) || !isValidCoord(destination)) {
    return {
      ok: false,
      reason: 'invalid-endpoint',
      geometryMeters: 0,
      maxSegmentMeters: 0,
      startGapMeters: null,
      endGapMeters: null,
    };
  }
  if (!Array.isArray(geometry) || geometry.length < 2 || !geometry.every(isFiniteLngLat)) {
    return {
      ok: false,
      reason: 'invalid-geometry',
      geometryMeters: 0,
      maxSegmentMeters: 0,
      startGapMeters: null,
      endGapMeters: null,
    };
  }

  const first = lngLatToCoordinates(geometry[0]);
  const last = lngLatToCoordinates(geometry[geometry.length - 1]);
  const metrics = getRouteMetrics(geometry);
  const startGapMeters = first ? haversineMeters(origin, first) : null;
  const endGapMeters = last ? haversineMeters(destination, last) : null;
  const directMeters = haversineMeters(origin, destination);

  let reason: string | null = null;
  if (metrics.totalMeters <= 10 || route.distanceMeters <= 10 || route.durationSeconds <= 0) {
    reason = 'empty-route';
  } else if (startGapMeters == null || startGapMeters > endpointGap) {
    reason = 'origin-mismatch';
  } else if (endGapMeters == null || endGapMeters > endpointGap) {
    reason = 'destination-mismatch';
  } else if (metrics.maxSegmentMeters > maxSegmentLimit) {
    reason = 'segment-jump';
  } else if (directMeters > 1_000 && route.distanceMeters < directMeters * 0.45) {
    reason = 'distance-too-short';
  } else if (directMeters > 1_000 && route.distanceMeters > directMeters * 5 + 10_000) {
    reason = 'distance-too-long';
  }

  return {
    ok: reason == null,
    reason,
    geometryMeters: metrics.totalMeters,
    maxSegmentMeters: metrics.maxSegmentMeters,
    startGapMeters,
    endGapMeters,
  };
}

export function matchLocationToRoute(params: {
  rawLocation: Coordinates;
  geometry: LngLat[];
  metrics?: RouteMetrics;
  previous: NavigationProgress | null;
  routeRevision: string;
  headingDegrees: number | null;
  speedMps: number | null;
  maxSnapDistanceMeters?: number;
}): SegmentProjection | null {
  const {
    rawLocation,
    geometry,
    previous,
    routeRevision,
    headingDegrees,
    speedMps,
  } = params;
  if (!isValidCoord(rawLocation) || !Array.isArray(geometry) || geometry.length < 2) {
    return null;
  }
  const metrics = params.metrics ?? getRouteMetrics(geometry);
  const previousMatchesRoute =
    previous?.routeRevision === routeRevision &&
    typeof previous.segmentIndex === 'number' &&
    typeof previous.distanceAlongMeters === 'number';
  const segmentCount = geometry.length - 1;
  const startIndex = previousMatchesRoute
    ? Math.max(0, (previous.segmentIndex ?? 0) - 8)
    : 0;
  const endIndex = previousMatchesRoute
    ? Math.min(segmentCount - 1, (previous.segmentIndex ?? 0) + 120)
    : segmentCount - 1;

  const findBest = (allowBacktrack: boolean): SegmentProjection | null => {
    let best: SegmentProjection | null = null;
    for (let i = startIndex; i <= endIndex; i += 1) {
      const start = lngLatToCoordinates(geometry[i]);
      const end = lngLatToCoordinates(geometry[i + 1]);
      if (!start || !end) continue;
      const projected = projectedPointOnSegment(rawLocation, start, end);
      const segmentLength = metrics.lengths[i] ?? haversineMeters(start, end);
      const distanceAlongMeters = metrics.cumulative[i] + segmentLength * projected.t;
      const backtrackMeters =
        previousMatchesRoute && previous?.distanceAlongMeters != null
          ? previous.distanceAlongMeters - distanceAlongMeters
          : 0;
      const routeHeading = segmentLength > 1 ? bearingDegrees(start, end) : null;
      const moving = typeof speedMps === 'number' && speedMps > 1;
      const reverseHeading =
        moving &&
        typeof headingDegrees === 'number' &&
        routeHeading != null &&
        Math.abs(shortestAngleDelta(headingDegrees, routeHeading)) > 135;
      const confirmedReverse =
        reverseHeading &&
        projected.distanceMeters <= (params.maxSnapDistanceMeters ?? DEFAULT_MAX_SNAP_METERS) &&
        backtrackMeters <= CONFIRMED_REVERSE_MAX_BACKTRACK_METERS;
      if (
        !allowBacktrack &&
        backtrackMeters > MAX_BACKTRACK_METERS &&
        !confirmedReverse
      ) {
        continue;
      }

      const headingPenalty =
        moving && typeof headingDegrees === 'number' && routeHeading != null
          ? (reverseHeading ? 4 : Math.abs(shortestAngleDelta(headingDegrees, routeHeading)) / 180 * 18)
          : 0;
      const backtrackPenalty =
        backtrackMeters > 0 ? backtrackMeters * (confirmedReverse ? 0.05 : 0.4) : 0;
      const score = projected.distanceMeters + headingPenalty + backtrackPenalty;

      if (!best || score < best.score) {
        best = {
          point: projected.point,
          distanceMeters: projected.distanceMeters,
          segmentIndex: i,
          segmentFraction: projected.t,
          distanceAlongMeters,
          routeHeading,
          score,
        };
      }
    }
    return best;
  };

  const best = findBest(false) ?? findBest(true);
  if (!best) return null;
  return best;
}

function buildTravelledGeometry(
  geometry: LngLat[],
  match: SegmentProjection | null,
): LngLat[] | null {
  if (!match || match.segmentIndex == null || match.segmentIndex < 0) return null;
  if (match.segmentIndex === 0 && match.segmentFraction <= 0.01) return null;
  const travelled = geometry.slice(0, match.segmentIndex + 1);
  const snapped: LngLat = [match.point.lng, match.point.lat];
  const last = travelled[travelled.length - 1];
  if (!last || haversineMeters({ lng: last[0], lat: last[1] }, match.point) > 1) {
    travelled.push(snapped);
  }
  return travelled.length >= 2 ? travelled : null;
}

function stepIndexForProgress(params: {
  steps: RouteStep[];
  geometry: LngLat[];
  metrics: RouteMetrics;
  distanceAlongMeters: number | null;
  fallbackStepIndex: number;
  speedMps: number | null;
}): { index: number; distanceToManeuverMeters: number | null } {
  const { steps, geometry, metrics, distanceAlongMeters, fallbackStepIndex, speedMps } =
    params;
  if (steps.length === 0) return { index: 0, distanceToManeuverMeters: null };
  if (steps.length === 1 || distanceAlongMeters == null) {
    return {
      index: Math.min(Math.max(0, fallbackStepIndex), steps.length - 1),
      distanceToManeuverMeters: null,
    };
  }

  const advanceBufferMeters = Math.max(8, Math.min(35, (speedMps ?? 0) * 1.2 + 8));
  let selected = steps.length - 1;
  let selectedDistance: number | null = null;

  for (let i = 1; i < steps.length; i += 1) {
    const stepCoord = lngLatToCoordinates(steps[i].location);
    if (!stepCoord) continue;
    const measure = measureCoordinateAlongRoute(stepCoord, geometry, metrics);
    if (!measure) continue;
    const distanceToStep = measure.distanceAlongMeters - distanceAlongMeters;
    if (distanceToStep >= -advanceBufferMeters) {
      selected = i;
      selectedDistance = Math.max(0, distanceToStep);
      break;
    }
  }

  return { index: selected, distanceToManeuverMeters: selectedDistance };
}

export function buildNavigationProgress(input: NavigationProgressInput): NavigationProgress {
  const {
    rawLocation,
    route,
    routeRevision,
    routeIsCurrent,
    previous,
    gpsHeading,
    accuracyMeters,
    fixTimestampMs,
    nowMs,
  } = input;
  const maxSnapDistanceMeters = input.maxSnapDistanceMeters ?? DEFAULT_MAX_SNAP_METERS;
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_STALE_MS;
  const previousForRoute = previous?.routeRevision === routeRevision ? previous : null;
  const speedMps = smoothSpeedMps(previousForRoute?.speedMps, input.speedMps);
  const speedMph = metersPerSecondToMph(speedMps);
  const stale =
    fixTimestampMs == null || !Number.isFinite(fixTimestampMs)
      ? true
      : nowMs - fixTimestampMs > staleAfterMs;

  const empty: NavigationProgress = {
    routeRevision,
    rawLocation: rawLocation && isValidCoord(rawLocation) ? rawLocation : null,
    snappedLocation: null,
    displayLocation: rawLocation && isValidCoord(rawLocation) ? rawLocation : null,
    displayMode: 'raw',
    distanceFromRouteMeters: null,
    segmentIndex: null,
    distanceAlongMeters: null,
    routeHeading: null,
    displayHeading: smoothCircularHeading(previousForRoute?.displayHeading, gpsHeading),
    speedMps,
    speedMph,
    speedDisplayReliable: !stale && speedMph != null,
    remainingDistanceMeters: routeIsCurrent ? route?.distanceMeters ?? null : null,
    remainingDurationSeconds: routeIsCurrent ? route?.durationSeconds ?? null : null,
    currentStepIndex: input.fallbackStepIndex ?? 0,
    currentStep: null,
    nextStep: null,
    distanceToManeuverMeters: null,
    travelledGeometry: null,
    fixTimestampMs,
    animationDurationMs: 700,
    forceSnap: previous?.routeRevision !== routeRevision || stale,
    stale,
  };

  if (!rawLocation || !isValidCoord(rawLocation) || !routeIsCurrent || !route) {
    return empty;
  }

  if (
    previousForRoute != null &&
    previousForRoute.fixTimestampMs != null &&
    fixTimestampMs != null &&
    fixTimestampMs <= previousForRoute.fixTimestampMs
  ) {
    return {
      ...previousForRoute,
      routeRevision,
      rawLocation,
      speedMps,
      speedMph,
      speedDisplayReliable: !stale && speedMph != null,
      fixTimestampMs: previousForRoute.fixTimestampMs,
      animationDurationMs: 0,
      forceSnap: false,
    };
  }

  if (
    previousForRoute != null &&
    previousForRoute.displayLocation != null &&
    previousForRoute.fixTimestampMs != null &&
    fixTimestampMs != null &&
    fixTimestampMs > previousForRoute.fixTimestampMs
  ) {
    const elapsedSec = (fixTimestampMs - previousForRoute.fixTimestampMs) / 1000;
    const accurate =
      typeof accuracyMeters === 'number' &&
      Number.isFinite(accuracyMeters) &&
      accuracyMeters >= 0 &&
      accuracyMeters <= 30;
    if (elapsedSec > 0) {
      const impliedSpeed = haversineMeters(previousForRoute.displayLocation, rawLocation) / elapsedSec;
      if (impliedSpeed > MAX_PLAUSIBLE_SPEED_MPS && !accurate) {
        return {
          ...previousForRoute,
          routeRevision,
          rawLocation,
          speedMps,
          speedMph,
          speedDisplayReliable: !stale && speedMph != null,
          fixTimestampMs: previousForRoute.fixTimestampMs,
          animationDurationMs: 0,
          forceSnap: false,
        };
      }
    }
  }

  const geometry = route.geometry;
  if (!Array.isArray(geometry) || geometry.length < 2) {
    return empty;
  }

  const metrics = getRouteMetrics(geometry);
  const match = matchLocationToRoute({
    rawLocation,
    geometry,
    metrics,
    previous: previousForRoute,
    routeRevision,
    headingDegrees: gpsHeading,
    speedMps,
    maxSnapDistanceMeters,
  });
  if (!match) return empty;

  const trusted = match.distanceMeters <= maxSnapDistanceMeters;
  const snappedLocation = trusted ? match.point : null;
  const displayLocation = trusted ? match.point : rawLocation;
  const displayMode: DriverDisplayMode = trusted ? 'snapped' : 'raw';
  const targetHeading = trusted && match.routeHeading != null ? match.routeHeading : gpsHeading;
  const headingAlpha = speedMps != null && speedMps > 8 ? 0.45 : 0.28;
  const displayHeading = smoothCircularHeading(
    previousForRoute?.displayHeading,
    targetHeading,
    headingAlpha,
  );

  const routeDistance = route.distanceMeters > 0 ? route.distanceMeters : metrics.totalMeters;
  const routeDuration = route.durationSeconds > 0 ? route.durationSeconds : 0;
  const travelledRatio =
    metrics.totalMeters > 0
      ? Math.max(0, Math.min(1, match.distanceAlongMeters / metrics.totalMeters))
      : 0;
  const remainingDistanceMeters = Math.max(0, routeDistance * (1 - travelledRatio));
  const remainingDurationSeconds = Math.max(0, routeDuration * (1 - travelledRatio));
  const stepProgress = stepIndexForProgress({
    steps: route.steps,
    geometry,
    metrics,
    distanceAlongMeters: match.distanceAlongMeters,
    fallbackStepIndex: input.fallbackStepIndex ?? previousForRoute?.currentStepIndex ?? 0,
    speedMps,
  });
  const currentStep = route.steps[stepProgress.index] ?? null;
  const nextStep = route.steps[stepProgress.index + 1] ?? null;

  const previousTimestamp = previousForRoute?.fixTimestampMs;
  const elapsedMs =
    typeof fixTimestampMs === 'number' &&
    typeof previousTimestamp === 'number' &&
    fixTimestampMs > previousTimestamp
      ? fixTimestampMs - previousTimestamp
      : 900;
  const previousPoint = previousForRoute?.displayLocation;
  const jumpMeters = previousPoint ? haversineMeters(previousPoint, displayLocation) : 0;
  const revisionChanged = previous?.routeRevision !== routeRevision;
  const forceSnap = revisionChanged || stale || elapsedMs > 6_000 || jumpMeters > 160;

  return {
    routeRevision,
    rawLocation,
    snappedLocation,
    displayLocation,
    displayMode,
    distanceFromRouteMeters: match.distanceMeters,
    segmentIndex: match.segmentIndex,
    distanceAlongMeters: match.distanceAlongMeters,
    routeHeading: trusted ? match.routeHeading : null,
    displayHeading,
    speedMps,
    speedMph,
    speedDisplayReliable: !stale && speedMph != null,
    remainingDistanceMeters,
    remainingDurationSeconds,
    currentStepIndex: stepProgress.index,
    currentStep,
    nextStep,
    distanceToManeuverMeters: stepProgress.distanceToManeuverMeters,
    travelledGeometry: buildTravelledGeometry(geometry, match),
    fixTimestampMs,
    animationDurationMs: Math.max(250, Math.min(1_400, elapsedMs * 0.85)),
    forceSnap,
    stale,
  };
}

export function isNewerNavigationPayload(
  current: { routeRevision: string; fixTimestampMs: number | null } | null,
  incoming: { routeRevision: string; fixTimestampMs: number | null },
): boolean {
  if (!current) return true;
  if (incoming.routeRevision !== current.routeRevision) return true;
  if (incoming.fixTimestampMs == null) return true;
  if (current.fixTimestampMs == null) return true;
  return incoming.fixTimestampMs >= current.fixTimestampMs;
}
