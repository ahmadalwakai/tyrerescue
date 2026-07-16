import {
  bearingDegrees,
  haversineMeters,
  isValidCoord,
  type Coordinates,
  type DirectionsRoute,
  type LngLat,
  type RouteLane,
  type RouteStep,
  type SpeedLimitAnnotation,
} from '../../services/directions';

const METERS_PER_SECOND_TO_MPH = 2.2369362921;
const DEFAULT_MAX_SNAP_METERS = 75;
const DEFAULT_MAX_DISPLAY_SNAP_METERS = 35;
const DEFAULT_STALE_MS = 12_000;
const MAX_BACKTRACK_METERS = 35;
const MAX_PLAUSIBLE_SPEED_MPS = 75;
const CONFIRMED_REVERSE_MAX_BACKTRACK_METERS = 500;
const MPH_PER_KMH = 0.621371;
const MOTORWAY_LANE_GUIDANCE_M = 950;
const FAST_ROAD_LANE_GUIDANCE_M = 650;
const LOCAL_LANE_GUIDANCE_M = 260;
const MAX_TRAVELLED_GEOMETRY_POINTS = 5_000;
const MAX_TRAVELLED_SEGMENT_METERS = 20_000;

const routeMetricsCache = new WeakMap<LngLat[], RouteMetrics>();

export type DriverDisplayMode = 'snapped' | 'raw';
export type ManeuverWarningPhase = 'early' | 'prepare' | 'imminent' | 'executing' | 'passed';
export type ManeuverShimmerCategory =
  | 'slight-left'
  | 'left'
  | 'sharp-left'
  | 'slight-right'
  | 'right'
  | 'sharp-right'
  | 'straight'
  | 'u-turn-left'
  | 'u-turn-right'
  | 'roundabout-left'
  | 'roundabout-right'
  | 'exit-left'
  | 'exit-right'
  | 'fork-left'
  | 'fork-right'
  | 'merge-left'
  | 'merge-right'
  | 'arrive';
export type ManeuverShimmerMode = 'none' | 'linear' | 'diagonal' | 'circular' | 'pulse';

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
  acceptedLocation: Coordinates | null;
  snappedLocation: Coordinates | null;
  matchedLocation: Coordinates | null;
  displayLocation: Coordinates | null;
  displayMode: DriverDisplayMode;
  locationTimestamp: number | null;
  distanceFromRouteMeters: number | null;
  segmentIndex: number | null;
  matchedSegmentIndex: number | null;
  distanceAlongMeters: number | null;
  distanceAlongRouteMetres: number | null;
  routeHeading: number | null;
  rawHeading: number | null;
  displayHeading: number | null;
  speedMps: number | null;
  speedMph: number | null;
  speedDisplayReliable: boolean;
  accuracy: number | null;
  currentRoadName: string | null;
  currentRoadClass: string | null;
  currentSpeedLimitMph: number | null;
  speedLimitSource: 'mapbox-maxspeed' | 'unavailable';
  remainingDistanceMeters: number | null;
  distanceRemainingMetres: number | null;
  remainingDurationSeconds: number | null;
  durationRemainingSeconds: number | null;
  currentStepIndex: number;
  currentStep: RouteStep | null;
  currentManeuver: RouteStep | null;
  nextStep: RouteStep | null;
  nextManeuver: RouteStep | null;
  distanceToManeuverMeters: number | null;
  maneuverWarningPhase: ManeuverWarningPhase;
  laneGuidance: NavigationLaneGuidance | null;
  roundaboutExitNumber: number | null;
  isOffRoute: boolean;
  isRecalculating: boolean;
  cameraMode: 'following' | 'free-pan' | 'overview';
  isLocationStale: boolean;
  travelledGeometry: LngLat[] | null;
  fixTimestampMs: number | null;
  animationDurationMs: number;
  forceSnap: boolean;
  stale: boolean;
}

export interface NavigationLaneGuidance {
  stepIndex: number;
  lanes: RouteLane[];
  distanceToManeuverMeters: number | null;
  roadName: string | null;
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
  isRecalculating?: boolean;
  cameraMode?: 'following' | 'free-pan' | 'overview';
  maxSnapDistanceMeters?: number;
  maxDisplaySnapDistanceMeters?: number;
  staleAfterMs?: number;
  fallbackStepIndex?: number;
}

export interface RerouteOrigin {
  coordinate: Coordinates;
  source: 'matched' | 'display' | 'raw';
  routeRevision: string;
  locationTimestamp: number;
  segmentIndex: number | null;
  confidence: number | null;
}

export interface RerouteOriginInput {
  progress: NavigationProgress | null;
  rawLocation: Coordinates | null;
  rawLocationTimestamp: number | null;
  routeRevision: string;
  maxSnapDistanceMeters?: number;
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

export interface ManeuverWarningPhaseInput {
  distanceToManeuverMetres: number | null;
  speedMps: number | null;
  roadClass: string | null;
  maneuverType: string | null;
  isRoundabout?: boolean;
  isExit?: boolean;
  accuracy: number | null;
  isStale: boolean;
  isOffRoute?: boolean;
}

export interface ManeuverShimmerInput {
  maneuverType: string | null;
  maneuverModifier: string | null;
  drivingSide?: 'left' | 'right' | null;
  reducedMotion: boolean;
  appState: 'active' | 'background' | 'inactive';
}

export interface ManeuverShimmerSpec {
  category: ManeuverShimmerCategory;
  mode: ManeuverShimmerMode;
  paused: boolean;
  translateX: [number, number];
  translateY: [number, number];
  rotate: [string, string];
  scale: [number, number];
}

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

function speedLimitMphFromAnnotation(
  annotation: SpeedLimitAnnotation | null | undefined,
): number | null {
  if (
    !annotation ||
    annotation.unknown ||
    annotation.none ||
    typeof annotation.speed !== 'number' ||
    !Number.isFinite(annotation.speed) ||
    annotation.speed <= 0 ||
    annotation.unit == null
  ) {
    return null;
  }
  const mph =
    annotation.unit === 'mph'
      ? annotation.speed
      : annotation.speed * MPH_PER_KMH;
  return Math.max(1, Math.round(mph));
}

function speedLimitForSegment(
  route: DirectionsRoute,
  segmentIndex: number | null,
): { mph: number | null; source: NavigationProgress['speedLimitSource'] } {
  if (
    segmentIndex == null ||
    segmentIndex < 0 ||
    !Array.isArray(route.maxspeeds) ||
    route.maxspeeds.length === 0
  ) {
    return { mph: null, source: 'unavailable' };
  }
  const mph = speedLimitMphFromAnnotation(route.maxspeeds[segmentIndex]);
  return mph == null
    ? { mph: null, source: 'unavailable' }
    : { mph, source: 'mapbox-maxspeed' };
}

function isFastRoadClass(roadClass: string | null | undefined): boolean {
  if (!roadClass) return false;
  return /motorway|trunk|primary/.test(roadClass);
}

function isMotorwayRoadClass(roadClass: string | null | undefined): boolean {
  if (!roadClass) return false;
  return /motorway|trunk/.test(roadClass);
}

function isExitLikeManeuver(maneuverType: string | null | undefined): boolean {
  if (!maneuverType) return false;
  return /exit|ramp|fork|merge/.test(maneuverType);
}

function isRoundaboutManeuver(maneuverType: string | null | undefined): boolean {
  if (!maneuverType) return false;
  return /roundabout|rotary/.test(maneuverType);
}

function maneuverSpeedScale(speedMps: number | null): number {
  if (speedMps == null || !Number.isFinite(speedMps) || speedMps < 0) return 1;
  if (speedMps <= 5) return 0.72;
  if (speedMps <= 10) return 0.86;
  if (speedMps <= 18) return 1;
  return Math.min(1.75, 1 + (speedMps - 18) * 0.035);
}

function maneuverThresholds(params: ManeuverWarningPhaseInput): {
  prepare: number;
  imminent: number;
  executing: number;
  passedMargin: number;
} {
  const roadClass = params.roadClass;
  const motorway = isMotorwayRoadClass(roadClass);
  const fastRoad = motorway || isFastRoadClass(roadClass);
  const roundabout = params.isRoundabout === true || isRoundaboutManeuver(params.maneuverType);
  const exitLike = params.isExit === true || isExitLikeManeuver(params.maneuverType);
  const scale = maneuverSpeedScale(params.speedMps);

  let prepare = 220;
  let imminent = 55;
  let executing = 16;
  let passedMargin = 18;

  if (roundabout) {
    prepare = 420;
    imminent = 95;
    executing = 24;
    passedMargin = 24;
  } else if (motorway && exitLike) {
    prepare = 1_250;
    imminent = 260;
    executing = 80;
    passedMargin = 35;
  } else if (fastRoad && exitLike) {
    prepare = 800;
    imminent = 180;
    executing = 55;
    passedMargin = 30;
  } else if (exitLike) {
    prepare = 420;
    imminent = 95;
    executing = 28;
    passedMargin = 24;
  } else if (fastRoad) {
    prepare = 520;
    imminent = 130;
    executing = 35;
    passedMargin = 25;
  }

  return {
    prepare: Math.round(Math.max(120, Math.min(1_600, prepare * scale))),
    imminent: Math.round(Math.max(35, Math.min(360, imminent * scale))),
    executing: Math.round(Math.max(10, Math.min(95, executing * Math.min(scale, 1.25)))),
    passedMargin,
  };
}

export function getManeuverWarningPhase(
  params: ManeuverWarningPhaseInput,
): ManeuverWarningPhase {
  const distance = params.distanceToManeuverMetres;
  if (typeof distance !== 'number' || !Number.isFinite(distance)) return 'early';
  const locationUntrusted =
    params.isStale ||
    params.isOffRoute === true ||
    (typeof params.accuracy === 'number' &&
      Number.isFinite(params.accuracy) &&
      params.accuracy > DEFAULT_MAX_SNAP_METERS);
  if (locationUntrusted && distance >= 0) return 'early';

  const thresholds = maneuverThresholds(params);
  if (distance < -thresholds.passedMargin) return 'passed';
  if (distance <= thresholds.executing) return 'executing';
  if (distance <= thresholds.imminent) return 'imminent';
  if (distance <= thresholds.prepare) return 'prepare';
  return 'early';
}

function sideFromModifier(modifier: string | null | undefined): 'left' | 'right' | null {
  const mod = modifier ?? '';
  if (mod.includes('left')) return 'left';
  if (mod.includes('right')) return 'right';
  return null;
}

function categoryForManeuver(params: ManeuverShimmerInput): ManeuverShimmerCategory {
  const type = params.maneuverType ?? '';
  const mod = params.maneuverModifier ?? '';
  const side = sideFromModifier(mod);
  if (type === 'arrive') return 'arrive';
  if (mod.includes('uturn') || mod.includes('u-turn')) {
    return side === 'right' ? 'u-turn-right' : 'u-turn-left';
  }
  if (isRoundaboutManeuver(type)) {
    const circulationSide = side ?? (params.drivingSide === 'left' ? 'right' : 'left');
    return circulationSide === 'left' ? 'roundabout-left' : 'roundabout-right';
  }
  if (type.includes('exit') || type.includes('ramp')) {
    return side === 'left' ? 'exit-left' : 'exit-right';
  }
  if (type === 'fork') {
    return side === 'left' ? 'fork-left' : 'fork-right';
  }
  if (type === 'merge') {
    return side === 'left' ? 'merge-left' : 'merge-right';
  }
  if (mod.includes('slight left')) return 'slight-left';
  if (mod.includes('sharp left')) return 'sharp-left';
  if (mod.includes('left')) return 'left';
  if (mod.includes('slight right')) return 'slight-right';
  if (mod.includes('sharp right')) return 'sharp-right';
  if (mod.includes('right')) return 'right';
  return 'straight';
}

export function getManeuverShimmerSpec(params: ManeuverShimmerInput): ManeuverShimmerSpec {
  const category = categoryForManeuver(params);
  const paused = params.reducedMotion || params.appState !== 'active';
  if (paused) {
    return {
      category,
      mode: 'none',
      paused: true,
      translateX: [0, 0],
      translateY: [0, 0],
      rotate: ['0deg', '0deg'],
      scale: [1, 1],
    };
  }

  switch (category) {
    case 'arrive':
      return { category, mode: 'pulse', paused: false, translateX: [0, 0], translateY: [0, 0], rotate: ['0deg', '0deg'], scale: [0.9, 1.12] };
    case 'straight':
      return { category, mode: 'linear', paused: false, translateX: [0, 0], translateY: [24, -28], rotate: ['0deg', '0deg'], scale: [1, 1] };
    case 'left':
    case 'slight-left':
    case 'sharp-left':
    case 'u-turn-left':
      return { category, mode: category.startsWith('u-turn') ? 'circular' : 'diagonal', paused: false, translateX: [18, -30], translateY: [14, -10], rotate: ['0deg', '-180deg'], scale: [1, 1] };
    case 'right':
    case 'slight-right':
    case 'sharp-right':
    case 'u-turn-right':
      return { category, mode: category.startsWith('u-turn') ? 'circular' : 'diagonal', paused: false, translateX: [-18, 30], translateY: [14, -10], rotate: ['0deg', '180deg'], scale: [1, 1] };
    case 'roundabout-left':
      return { category, mode: 'circular', paused: false, translateX: [12, -12], translateY: [14, -14], rotate: ['90deg', '-270deg'], scale: [1, 1] };
    case 'roundabout-right':
      return { category, mode: 'circular', paused: false, translateX: [-12, 12], translateY: [14, -14], rotate: ['-90deg', '270deg'], scale: [1, 1] };
    case 'exit-left':
    case 'fork-left':
    case 'merge-left':
      return { category, mode: 'diagonal', paused: false, translateX: [16, -32], translateY: [20, -16], rotate: ['0deg', '0deg'], scale: [1, 1] };
    case 'exit-right':
    case 'fork-right':
    case 'merge-right':
      return { category, mode: 'diagonal', paused: false, translateX: [-16, 32], translateY: [20, -16], rotate: ['0deg', '0deg'], scale: [1, 1] };
    default:
      return { category, mode: 'linear', paused: false, translateX: [0, 0], translateY: [24, -28], rotate: ['0deg', '0deg'], scale: [1, 1] };
  }
}

function matchConfidence(distanceFromRouteMeters: number | null, maxSnapDistanceMeters: number): number | null {
  if (
    typeof distanceFromRouteMeters !== 'number' ||
    !Number.isFinite(distanceFromRouteMeters) ||
    distanceFromRouteMeters < 0
  ) {
    return null;
  }
  return Math.max(0, Math.min(1, 1 - distanceFromRouteMeters / maxSnapDistanceMeters));
}

export function selectRerouteOrigin(input: RerouteOriginInput): RerouteOrigin | null {
  const maxSnapDistanceMeters = input.maxSnapDistanceMeters ?? DEFAULT_MAX_SNAP_METERS;
  const progress = input.progress;
  const progressFresh =
    progress != null &&
    progress.routeRevision === input.routeRevision &&
    progress.fixTimestampMs != null &&
    progress.stale !== true &&
    progress.isLocationStale !== true;
  const confidence = progressFresh
    ? matchConfidence(progress.distanceFromRouteMeters, maxSnapDistanceMeters)
    : null;
  const trustedProgress =
    progressFresh &&
    progress.displayMode === 'snapped' &&
    confidence != null &&
    confidence >= 0.4;

  if (
    trustedProgress &&
    progress?.matchedLocation &&
    isValidCoord(progress.matchedLocation) &&
    progress.fixTimestampMs != null
  ) {
    return {
      coordinate: progress.matchedLocation,
      source: 'matched',
      routeRevision: input.routeRevision,
      locationTimestamp: progress.fixTimestampMs,
      segmentIndex: progress.matchedSegmentIndex,
      confidence,
    };
  }

  if (
    trustedProgress &&
    progress?.displayLocation &&
    isValidCoord(progress.displayLocation) &&
    progress.fixTimestampMs != null
  ) {
    return {
      coordinate: progress.displayLocation,
      source: 'display',
      routeRevision: input.routeRevision,
      locationTimestamp: progress.fixTimestampMs,
      segmentIndex: progress.segmentIndex,
      confidence,
    };
  }

  if (
    input.rawLocation &&
    isValidCoord(input.rawLocation) &&
    typeof input.rawLocationTimestamp === 'number' &&
    Number.isFinite(input.rawLocationTimestamp)
  ) {
    return {
      coordinate: input.rawLocation,
      source: 'raw',
      routeRevision: input.routeRevision,
      locationTimestamp: input.rawLocationTimestamp,
      segmentIndex: null,
      confidence: null,
    };
  }

  return null;
}

function laneGuidanceThresholdMeters(
  step: RouteStep | null,
  speedMps: number | null,
  route: DirectionsRoute,
): number {
  if (isMotorwayRoadClass(step?.roadClass) || route.roadClasses.motorways) {
    return MOTORWAY_LANE_GUIDANCE_M;
  }
  if (isFastRoadClass(step?.roadClass) || (speedMps != null && speedMps >= 18)) {
    return FAST_ROAD_LANE_GUIDANCE_M;
  }
  return LOCAL_LANE_GUIDANCE_M;
}

function laneGuidanceForStep(params: {
  step: RouteStep | null;
  stepIndex: number;
  distanceToManeuverMeters: number | null;
  speedMps: number | null;
  route: DirectionsRoute;
}): NavigationLaneGuidance | null {
  const { step, distanceToManeuverMeters, speedMps, route, stepIndex } = params;
  if (!step || step.lanes.length === 0 || distanceToManeuverMeters == null) return null;
  const threshold = laneGuidanceThresholdMeters(step, speedMps, route);
  if (distanceToManeuverMeters > threshold) return null;
  return {
    stepIndex,
    lanes: step.lanes,
    distanceToManeuverMeters,
    roadName: step.name,
  };
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
  if (match.segmentIndex >= geometry.length - 1) return null;
  if (match.segmentIndex === 0 && match.segmentFraction <= 0.01) return null;
  const travelled = geometry.slice(0, match.segmentIndex + 1);
  if (travelled.length > MAX_TRAVELLED_GEOMETRY_POINTS) return null;
  if (!travelled.every(isFiniteLngLat)) return null;
  for (let i = 0; i < travelled.length - 1; i += 1) {
    const start = lngLatToCoordinates(travelled[i]);
    const end = lngLatToCoordinates(travelled[i + 1]);
    if (!start || !end || haversineMeters(start, end) > MAX_TRAVELLED_SEGMENT_METERS) {
      return null;
    }
  }
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
  const maxDisplaySnapDistanceMeters = Math.max(
    0,
    Math.min(
      maxSnapDistanceMeters,
      input.maxDisplaySnapDistanceMeters ?? DEFAULT_MAX_DISPLAY_SNAP_METERS,
    ),
  );
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_STALE_MS;
  const previousForRoute = previous?.routeRevision === routeRevision ? previous : null;
  const speedMps = smoothSpeedMps(previousForRoute?.speedMps, input.speedMps);
  const speedMph = metersPerSecondToMph(speedMps);
  const cameraMode = input.cameraMode ?? 'following';
  const isRecalculating = input.isRecalculating === true;
  const stale =
    fixTimestampMs == null || !Number.isFinite(fixTimestampMs)
      ? true
      : nowMs - fixTimestampMs > staleAfterMs;

  const empty: NavigationProgress = {
    routeRevision,
    rawLocation: rawLocation && isValidCoord(rawLocation) ? rawLocation : null,
    acceptedLocation: rawLocation && isValidCoord(rawLocation) ? rawLocation : null,
    snappedLocation: null,
    matchedLocation: null,
    displayLocation: rawLocation && isValidCoord(rawLocation) ? rawLocation : null,
    displayMode: 'raw',
    locationTimestamp: fixTimestampMs,
    distanceFromRouteMeters: null,
    segmentIndex: null,
    matchedSegmentIndex: null,
    distanceAlongMeters: null,
    distanceAlongRouteMetres: null,
    routeHeading: null,
    rawHeading: gpsHeading,
    displayHeading: smoothCircularHeading(previousForRoute?.displayHeading, gpsHeading),
    speedMps,
    speedMph,
    speedDisplayReliable: !stale && speedMph != null,
    accuracy: accuracyMeters,
    currentRoadName: null,
    currentRoadClass: null,
    currentSpeedLimitMph: null,
    speedLimitSource: 'unavailable',
    remainingDistanceMeters: routeIsCurrent ? route?.distanceMeters ?? null : null,
    distanceRemainingMetres: routeIsCurrent ? route?.distanceMeters ?? null : null,
    remainingDurationSeconds: routeIsCurrent ? route?.durationSeconds ?? null : null,
    durationRemainingSeconds: routeIsCurrent ? route?.durationSeconds ?? null : null,
    currentStepIndex: input.fallbackStepIndex ?? 0,
    currentStep: null,
    currentManeuver: null,
    nextStep: null,
    nextManeuver: null,
    distanceToManeuverMeters: null,
    maneuverWarningPhase: 'early',
    laneGuidance: null,
    roundaboutExitNumber: null,
    isOffRoute: false,
    isRecalculating,
    cameraMode,
    isLocationStale: stale,
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
      rawHeading: gpsHeading,
      accuracy: accuracyMeters,
      isRecalculating,
      cameraMode,
      isLocationStale: stale,
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
          rawHeading: gpsHeading,
          accuracy: accuracyMeters,
          isRecalculating,
          cameraMode,
          isLocationStale: stale,
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

  const trustedRouteCorridor = match.distanceMeters <= maxSnapDistanceMeters;
  const trustedDisplaySnap = match.distanceMeters <= maxDisplaySnapDistanceMeters;
  const retainedSnappedLocation =
    !trustedDisplaySnap &&
    trustedRouteCorridor &&
    previousForRoute?.displayMode === 'snapped' &&
    previousForRoute.displayLocation != null &&
    previousForRoute.distanceAlongMeters != null
      ? previousForRoute.snappedLocation ?? previousForRoute.matchedLocation ?? previousForRoute.displayLocation
      : null;
  const progressTrusted = trustedDisplaySnap || retainedSnappedLocation != null;
  const authoritativeDistanceAlongMeters =
    trustedDisplaySnap
      ? match.distanceAlongMeters
      : retainedSnappedLocation != null && previousForRoute?.distanceAlongMeters != null
        ? previousForRoute.distanceAlongMeters
        : trustedRouteCorridor
          ? previousForRoute?.distanceAlongMeters ?? match.distanceAlongMeters
          : previousForRoute?.distanceAlongMeters ?? match.distanceAlongMeters;
  const snappedLocation = trustedDisplaySnap ? match.point : retainedSnappedLocation;
  const displayLocation = snappedLocation ?? rawLocation;
  const displayMode: DriverDisplayMode = snappedLocation ? 'snapped' : 'raw';
  const movingForHeading =
    typeof input.speedMps === 'number' && Number.isFinite(input.speedMps)
      ? input.speedMps > 1
      : speedMps != null && speedMps > 1;
  const rawHeadingReliable =
    movingForHeading && typeof gpsHeading === 'number' && Number.isFinite(gpsHeading);
  const matchedHeadingReliable =
    trustedDisplaySnap &&
    match.routeHeading != null &&
    match.distanceMeters <= Math.min(20, maxDisplaySnapDistanceMeters * 0.6);
  const targetHeading = rawHeadingReliable
    ? gpsHeading
    : matchedHeadingReliable
      ? match.routeHeading
      : progressTrusted
        ? previousForRoute?.displayHeading ?? match.routeHeading ?? gpsHeading
        : gpsHeading;
  const headingAlpha = movingForHeading ? 0.42 : 0.18;
  const displayHeading = smoothCircularHeading(
    previousForRoute?.displayHeading,
    targetHeading,
    headingAlpha,
  );

  const routeDistance = route.distanceMeters > 0 ? route.distanceMeters : metrics.totalMeters;
  const routeDuration = route.durationSeconds > 0 ? route.durationSeconds : 0;
  const travelledRatio =
    metrics.totalMeters > 0
      ? Math.max(0, Math.min(1, authoritativeDistanceAlongMeters / metrics.totalMeters))
      : 0;
  const remainingDistanceMeters = Math.max(0, routeDistance * (1 - travelledRatio));
  const remainingDurationSeconds = Math.max(0, routeDuration * (1 - travelledRatio));
  const stepProgress = stepIndexForProgress({
    steps: route.steps,
    geometry,
    metrics,
    distanceAlongMeters: authoritativeDistanceAlongMeters,
    fallbackStepIndex: input.fallbackStepIndex ?? previousForRoute?.currentStepIndex ?? 0,
    speedMps,
  });
  const currentStep = route.steps[stepProgress.index] ?? null;
  const nextStep = route.steps[stepProgress.index + 1] ?? null;
  const trustedSegmentIndex =
    trustedDisplaySnap
      ? match.segmentIndex
      : retainedSnappedLocation != null
        ? previousForRoute?.segmentIndex ?? previousForRoute?.matchedSegmentIndex ?? match.segmentIndex
        : match.segmentIndex;
  const speedLimit = progressTrusted
    ? speedLimitForSegment(route, trustedSegmentIndex)
    : { mph: null, source: 'unavailable' as const };
  const maneuverWarningPhase = getManeuverWarningPhase({
    distanceToManeuverMetres: stepProgress.distanceToManeuverMeters,
    speedMps,
    roadClass: currentStep?.roadClass ?? null,
    maneuverType: currentStep?.maneuverType ?? null,
    isRoundabout: isRoundaboutManeuver(currentStep?.maneuverType),
    isExit: isExitLikeManeuver(currentStep?.maneuverType),
    accuracy: accuracyMeters,
    isStale: stale,
    isOffRoute: !trustedRouteCorridor,
  });
  const laneGuidance =
    progressTrusted && !stale && !isRecalculating
      ? laneGuidanceForStep({
          step: currentStep,
          stepIndex: stepProgress.index,
          distanceToManeuverMeters: stepProgress.distanceToManeuverMeters,
          speedMps,
          route,
        })
      : null;

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
    acceptedLocation: rawLocation,
    snappedLocation,
    matchedLocation: progressTrusted ? snappedLocation : null,
    displayLocation,
    displayMode,
    locationTimestamp: fixTimestampMs,
    distanceFromRouteMeters: match.distanceMeters,
    segmentIndex: trustedSegmentIndex,
    matchedSegmentIndex: trustedSegmentIndex,
    distanceAlongMeters: authoritativeDistanceAlongMeters,
    distanceAlongRouteMetres: authoritativeDistanceAlongMeters,
    routeHeading: trustedDisplaySnap
      ? match.routeHeading
      : retainedSnappedLocation != null
        ? previousForRoute?.routeHeading ?? null
        : null,
    rawHeading: gpsHeading,
    displayHeading,
    speedMps,
    speedMph,
    speedDisplayReliable: !stale && speedMph != null,
    accuracy: accuracyMeters,
    currentRoadName: currentStep?.name ?? null,
    currentRoadClass: currentStep?.roadClass ?? null,
    currentSpeedLimitMph: speedLimit.mph,
    speedLimitSource: speedLimit.source,
    remainingDistanceMeters,
    distanceRemainingMetres: remainingDistanceMeters,
    remainingDurationSeconds,
    durationRemainingSeconds: remainingDurationSeconds,
    currentStepIndex: stepProgress.index,
    currentStep,
    currentManeuver: currentStep,
    nextStep,
    nextManeuver: nextStep,
    distanceToManeuverMeters: stepProgress.distanceToManeuverMeters,
    maneuverWarningPhase,
    laneGuidance,
    roundaboutExitNumber: currentStep?.exit ?? null,
    isOffRoute: !trustedRouteCorridor,
    isRecalculating,
    cameraMode,
    isLocationStale: stale,
    travelledGeometry: trustedDisplaySnap
      ? buildTravelledGeometry(geometry, match)
      : retainedSnappedLocation != null
        ? previousForRoute?.travelledGeometry ?? null
        : null,
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
