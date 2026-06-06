/**
 * Mapbox Directions client (driver app, in-app navigation).
 *
 * Phase 4 decision: the driver app already ships a PUBLIC Mapbox token
 * (EXPO_PUBLIC_MAPBOX_TOKEN, `pk.…`) which is used to render the map. The
 * existing backend `/api/driver/jobs/[ref]/route` endpoint returns no
 * turn-by-turn steps and currently degrades to a haversine straight line, so
 * it cannot drive Uber-style guidance. The Mapbox Directions API works with a
 * `pk` token, therefore we fetch the road route directly from the client using
 * the SAME public token. No secret token is ever placed in the client.
 */

// `driving-traffic` is required for live congestion annotations and is the
// profile that returns the most realistic ETAs. It also supports alternatives.
const MAPBOX_DIRECTIONS_URL =
  'https://api.mapbox.com/directions/v5/mapbox/driving-traffic';
const REQUEST_TIMEOUT_MS = 10_000;
/** Maximum number of routes (primary + alternatives) surfaced to the driver. */
const MAX_ROUTES = 3;

function getToken(): string {
  return (process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '').trim();
}

// ── Public types ──────────────────────────────────────────────────────────

/** A geographic point in the {lat,lng} convention used across the app. */
export interface Coordinates {
  lat: number;
  lng: number;
}

/** Mapbox/GeoJSON ordering: [longitude, latitude]. */
export type LngLat = [number, number];

/**
 * Live traffic level for a single route segment, derived from Mapbox's
 * `congestion` (or `congestion_numeric`) annotation. `unknown` means Mapbox
 * returned no usable congestion data for that segment — it is NEVER faked.
 */
export type CongestionLevel = 'unknown' | 'low' | 'moderate' | 'heavy' | 'severe';

/**
 * Which destination the driver is currently routing to. This tyre-rescue
 * service has a single customer destination (the dropoff), so `to_pickup` is
 * reserved for completeness/future multi-stop jobs and is not emitted at
 * runtime today. `preview` is used before a live GPS fix exists.
 */
export type NavigationPhase = 'to_pickup' | 'to_dropoff' | 'preview';

/** One parsed turn-by-turn step. */
export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  name: string | null;
  maneuverType: string;
  maneuverModifier: string | null;
  /** Side of the road for this segment, when Mapbox reports it. */
  drivingSide: 'left' | 'right' | null;
  /** Roundabout/rotary exit number, when present. */
  exit: number | null;
  location: LngLat;
}

/** A successfully parsed road route. */
export interface DirectionsRoute {
  geometry: LngLat[];
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
  /**
   * Per-segment congestion (length = geometry.length - 1) when Mapbox returns
   * real annotation data, otherwise null. Never synthesised.
   */
  congestion: CongestionLevel[] | null;
  /**
   * The coordinate Mapbox snapped the destination waypoint to (the true route
   * endpoint). May differ from the customer pin by a few metres when the
   * building sits off the road network. null when not reported.
   */
  destinationSnap: LngLat | null;
}

/** Lightweight summary of one alternative route for the cockpit chips. */
export interface RouteAlternative {
  index: number;
  distanceMeters: number;
  durationSeconds: number;
}

export type RouteErrorKind =
  | 'invalid-coords'
  | 'network'
  | 'no-route'
  | 'api'
  | 'aborted';

export interface RouteError {
  kind: RouteErrorKind;
  message: string;
}

export type RouteSource = 'mapbox' | 'fallback' | 'none';

/**
 * Translator signature (matches the app i18n `t`). Passed into the human
 * guidance helpers so every driver-facing string is localized at the call site
 * (the service itself stays framework-free and holds no locale state).
 */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** UI-facing route state rendered by the navigation screen. */
export interface RouteState {
  source: RouteSource;
  /**
   * All routes returned by Mapbox (primary at index 0, then alternatives), or
   * a single synthetic entry for the straight-line fallback. Empty when none.
   */
  routes: DirectionsRoute[];
  /** Index into {@link routes} of the route the driver is actively following. */
  selectedIndex: number;
  // ── Convenience mirrors of the SELECTED route (kept so render code stays flat) ──
  geometry: LngLat[] | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  steps: RouteStep[];
  congestion: CongestionLevel[] | null;
  destinationSnap: LngLat | null;
  error: RouteError | null;
  loading: boolean;
}

export type FetchDirectionsResult =
  | { routes: DirectionsRoute[] }
  | { error: RouteError };

// ── Raw Mapbox Directions response subset (only fields we read) ────────────

interface MapboxManeuver {
  instruction?: string;
  type?: string;
  modifier?: string;
  exit?: number;
  location: [number, number];
}

interface MapboxStep {
  distance: number;
  duration: number;
  name?: string;
  driving_side?: string;
  maneuver: MapboxManeuver;
}

interface MapboxAnnotation {
  congestion?: (string | null)[];
  congestion_numeric?: (number | null)[];
}

interface MapboxLeg {
  steps?: MapboxStep[];
  annotation?: MapboxAnnotation;
}

interface MapboxRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs?: MapboxLeg[];
}

interface MapboxWaypoint {
  location?: [number, number];
}

interface MapboxDirectionsResponse {
  code?: string;
  message?: string;
  routes?: MapboxRoute[];
  waypoints?: MapboxWaypoint[];
}

// ── Validation ─────────────────────────────────────────────────────────────

export function isValidCoord(c: Coordinates | null | undefined): c is Coordinates {
  return (
    !!c &&
    typeof c.lat === 'number' &&
    typeof c.lng === 'number' &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    Math.abs(c.lat) <= 90 &&
    Math.abs(c.lng) <= 180 &&
    !(c.lat === 0 && c.lng === 0)
  );
}

// ── Geometry helpers (used for reroute / off-route detection) ──────────────

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in metres between two points. */
export function haversineMeters(a: Coordinates, b: Coordinates): number {
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Compass bearing (degrees, 0..360, clockwise from true north) from point `a`
 * to point `b`. Used as a fallback heading when the GPS course is missing or
 * unreliable (driver moving slowly / stationary jitter).
 */
export function bearingDegrees(a: Coordinates, b: Coordinates): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

function pointSegmentMeters(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Shortest distance in metres from a point to a polyline. Uses a local
 * equirectangular projection (accurate at city scale) so we can do a fast
 * point-to-segment test for off-route detection.
 */
export function distanceToRouteMeters(p: Coordinates, line: LngLat[]): number {
  if (!line || line.length === 0) return Number.POSITIVE_INFINITY;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos(toRad(p.lat));
  if (line.length === 1) {
    return haversineMeters(p, { lng: line[0][0], lat: line[0][1] });
  }
  const px = p.lng * mPerDegLng;
  const py = p.lat * mPerDegLat;
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < line.length - 1; i += 1) {
    const ax = line[i][0] * mPerDegLng;
    const ay = line[i][1] * mPerDegLat;
    const bx = line[i + 1][0] * mPerDegLng;
    const by = line[i + 1][1] * mPerDegLat;
    const d = pointSegmentMeters(px, py, ax, ay, bx, by);
    if (d < min) min = d;
  }
  return min;
}

/** Live progress along the selected route from the driver's current position. */
export interface RemainingRouteProgress {
  /** Distance still to travel along the route, in metres. */
  remainingDistanceMeters: number;
  /** Estimated time still to travel, in seconds (proportional to distance). */
  remainingDurationSeconds: number;
  /** Index of the geometry segment the driver is currently nearest to. */
  nearestRouteIndex: number;
  /** Perpendicular distance from the driver to the route, in metres. */
  distanceToRouteMeters: number;
}

/**
 * Compute how much of the selected route is LEFT from the driver's current GPS
 * position. The driver is projected onto the nearest segment; the remaining
 * distance is the partial remainder of that segment plus every later segment.
 * Remaining duration is scaled proportionally from the route's total duration.
 *
 * Returns null when there is no usable GPS fix or the geometry is too short —
 * callers fall back to the full route totals in that case. Never mutates the
 * supplied geometry.
 */
export function getRemainingRouteProgress(params: {
  driver: Coordinates;
  geometry: LngLat[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
}): RemainingRouteProgress | null {
  const { driver, geometry, totalDistanceMeters, totalDurationSeconds } = params;
  if (!isValidCoord(driver) || !geometry || geometry.length < 2) return null;

  // Local equirectangular projection (accurate at city scale) for the nearest
  // point search — same approach as distanceToRouteMeters.
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos(toRad(driver.lat));
  const px = driver.lng * mPerDegLng;
  const py = driver.lat * mPerDegLat;

  let bestIdx = 0;
  let bestPerp = Number.POSITIVE_INFINITY;
  let bestT = 0;
  for (let i = 0; i < geometry.length - 1; i += 1) {
    const ax = geometry[i][0] * mPerDegLng;
    const ay = geometry[i][1] * mPerDegLat;
    const bx = geometry[i + 1][0] * mPerDegLng;
    const by = geometry[i + 1][1] * mPerDegLat;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let tt = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
    tt = Math.max(0, Math.min(1, tt));
    const cx = ax + tt * dx;
    const cy = ay + tt * dy;
    const perp = Math.hypot(px - cx, py - cy);
    if (perp < bestPerp) {
      bestPerp = perp;
      bestIdx = i;
      bestT = tt;
    }
  }

  // True ground length of a geometry segment.
  const segLen = (i: number): number =>
    haversineMeters(
      { lng: geometry[i][0], lat: geometry[i][1] },
      { lng: geometry[i + 1][0], lat: geometry[i + 1][1] },
    );

  let remaining = (1 - bestT) * segLen(bestIdx);
  for (let i = bestIdx + 1; i < geometry.length - 1; i += 1) {
    remaining += segLen(i);
  }

  const total =
    Number.isFinite(totalDistanceMeters) && totalDistanceMeters > 0
      ? totalDistanceMeters
      : null;
  const remainingDistanceMeters =
    total != null ? Math.min(remaining, total) : remaining;
  const fraction =
    total != null ? Math.max(0, Math.min(1, remainingDistanceMeters / total)) : 1;
  const remainingDurationSeconds =
    Number.isFinite(totalDurationSeconds) && totalDurationSeconds > 0
      ? totalDurationSeconds * fraction
      : 0;

  return {
    remainingDistanceMeters,
    remainingDurationSeconds,
    nearestRouteIndex: bestIdx,
    distanceToRouteMeters: bestPerp,
  };
}

/** Result of projecting a GPS fix onto the route polyline. */
export interface RouteSnap {
  /** Closest point ON the route as [lng, lat]. */
  point: LngLat;
  /** Perpendicular drift from the raw GPS fix to the route, in metres. */
  distanceMeters: number;
}

/**
 * Project a raw GPS position onto the nearest point of the route polyline and
 * report the perpendicular drift in metres. The caller decides whether to use
 * the snapped point (only when the drift is small — genuine GPS jitter on the
 * road) or keep the raw fix (when the driver is truly off the route). Uses the
 * same local equirectangular projection as {@link distanceToRouteMeters} for an
 * accurate, fast point-to-segment test at city scale. Never mutates `line`.
 */
export function snapToRoute(p: Coordinates, line: LngLat[]): RouteSnap | null {
  if (!isValidCoord(p) || !line || line.length < 2) return null;
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos(toRad(p.lat));
  const px = p.lng * mPerDegLng;
  const py = p.lat * mPerDegLat;
  let bestDist = Number.POSITIVE_INFINITY;
  let bestPoint: LngLat | null = null;
  for (let i = 0; i < line.length - 1; i += 1) {
    const ax = line[i][0] * mPerDegLng;
    const ay = line[i][1] * mPerDegLat;
    const bx = line[i + 1][0] * mPerDegLng;
    const by = line[i + 1][1] * mPerDegLat;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let tt = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
    tt = Math.max(0, Math.min(1, tt));
    const cx = ax + tt * dx;
    const cy = ay + tt * dy;
    const perp = Math.hypot(px - cx, py - cy);
    if (perp < bestDist) {
      bestDist = perp;
      // Interpolate the snapped point in lng/lat space (tt is identical in both
      // the metric and angular parameterisations of the same segment).
      const lng = line[i][0] + tt * (line[i + 1][0] - line[i][0]);
      const lat = line[i][1] + tt * (line[i + 1][1] - line[i][1]);
      bestPoint = [lng, lat];
    }
  }
  if (bestPoint == null) return null;
  return { point: bestPoint, distanceMeters: bestDist };
}

// ── Unit conversions ───────────────────────────────────────────────────────

export function metersToMiles(meters: number): number {
  return meters * 0.000621371;
}

export function secondsToMinutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

// ── Fetch ──────────────────────────────────────────────────────────────────

/** Normalise a Mapbox `congestion` string into our typed level. */
function normalizeCongestion(raw: string | null): CongestionLevel {
  switch (raw) {
    case 'low':
      return 'low';
    case 'moderate':
      return 'moderate';
    case 'heavy':
      return 'heavy';
    case 'severe':
      return 'severe';
    default:
      return 'unknown';
  }
}

/** Map a 0–100 `congestion_numeric` value to a typed level. */
function numericToCongestion(value: number | null): CongestionLevel {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value < 40) return 'low';
  if (value < 60) return 'moderate';
  if (value < 80) return 'heavy';
  return 'severe';
}

/**
 * Extract per-segment congestion from a leg's annotation. Returns null when no
 * real data exists so the UI can honestly say "traffic data unavailable".
 */
function parseCongestion(leg: MapboxLeg | undefined): CongestionLevel[] | null {
  const ann = leg?.annotation;
  if (!ann) return null;
  if (Array.isArray(ann.congestion) && ann.congestion.length > 0) {
    const levels = ann.congestion.map(normalizeCongestion);
    // If Mapbox returned all-unknown, treat as no data.
    return levels.some((l) => l !== 'unknown') ? levels : null;
  }
  if (Array.isArray(ann.congestion_numeric) && ann.congestion_numeric.length > 0) {
    const levels = ann.congestion_numeric.map(numericToCongestion);
    return levels.some((l) => l !== 'unknown') ? levels : null;
  }
  return null;
}

function parseRoute(raw: MapboxRoute, destinationSnap: LngLat | null): DirectionsRoute {
  const coords = Array.isArray(raw.geometry?.coordinates)
    ? raw.geometry.coordinates.filter(
        (c): c is LngLat =>
          Array.isArray(c) &&
          c.length >= 2 &&
          Number.isFinite(c[0]) &&
          Number.isFinite(c[1]),
      )
    : [];

  const rawSteps = raw.legs?.[0]?.steps ?? [];
  const steps: RouteStep[] = rawSteps
    .filter(
      (s) =>
        s &&
        s.maneuver &&
        Array.isArray(s.maneuver.location) &&
        Number.isFinite(s.maneuver.location[0]) &&
        Number.isFinite(s.maneuver.location[1]),
    )
    .map((s) => ({
      instruction:
        (s.maneuver.instruction && s.maneuver.instruction.trim()) ||
        (s.name ? `Continue on ${s.name}` : 'Continue'),
      distanceMeters: Number.isFinite(s.distance) ? s.distance : 0,
      durationSeconds: Number.isFinite(s.duration) ? s.duration : 0,
      name: s.name && s.name.trim() ? s.name.trim() : null,
      maneuverType: s.maneuver.type ?? 'continue',
      maneuverModifier: s.maneuver.modifier ?? null,
      drivingSide:
        s.driving_side === 'left' || s.driving_side === 'right'
          ? s.driving_side
          : null,
      exit: typeof s.maneuver.exit === 'number' ? s.maneuver.exit : null,
      location: [s.maneuver.location[0], s.maneuver.location[1]],
    }));

  return {
    geometry: coords,
    distanceMeters: Number.isFinite(raw.distance) ? raw.distance : 0,
    durationSeconds: Number.isFinite(raw.duration) ? raw.duration : 0,
    steps,
    congestion: parseCongestion(raw.legs?.[0]),
    destinationSnap,
  };
}

/**
 * Fetch a road-following driving route between two points.
 * - longitude,latitude ordering enforced.
 * - coordinates validated before the request.
 * - aborts on the caller's signal and on a hard 10s timeout.
 * - never throws; returns a typed result.
 */
export async function fetchDirections(
  origin: Coordinates,
  destination: Coordinates,
  externalSignal?: AbortSignal,
  language: 'en' | 'ar' = 'en',
): Promise<FetchDirectionsResult> {
  const token = getToken();
  if (!token) {
    return { error: { kind: 'api', message: 'Missing Mapbox token' } };
  }
  if (!isValidCoord(origin) || !isValidCoord(destination)) {
    return { error: { kind: 'invalid-coords', message: 'Invalid coordinates' } };
  }

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort);
  }
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const params = new URLSearchParams({
    geometries: 'geojson',
    steps: 'true',
    overview: 'full',
    alternatives: 'true',
    // `congestion` (and the finer `congestion_numeric`) require the
    // driving-traffic profile and overview=full to align with the geometry.
    annotations: 'congestion,congestion_numeric,distance,duration,speed',
    language,
    access_token: token,
  });
  const url = `${MAPBOX_DIRECTIONS_URL}/${coords}?${params.toString()}`;

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return {
        error: { kind: 'api', message: `Directions API ${res.status}` },
      };
    }
    const data = (await res.json()) as MapboxDirectionsResponse;
    if (data.code && data.code !== 'Ok') {
      return {
        error: { kind: 'no-route', message: data.message ?? data.code },
      };
    }
    const rawRoutes = Array.isArray(data.routes) ? data.routes : [];
    if (rawRoutes.length === 0) {
      return { error: { kind: 'no-route', message: 'No route found' } };
    }
    // The destination waypoint is the LAST entry; its snapped location is the
    // true route endpoint (used to detect "route ends short of the door").
    const wps = data.waypoints;
    const snapRaw =
      Array.isArray(wps) && wps.length > 0 ? wps[wps.length - 1]?.location : undefined;
    const destinationSnap: LngLat | null =
      Array.isArray(snapRaw) &&
      Number.isFinite(snapRaw[0]) &&
      Number.isFinite(snapRaw[1])
        ? [snapRaw[0], snapRaw[1]]
        : null;

    const routes: DirectionsRoute[] = [];
    for (const raw of rawRoutes.slice(0, MAX_ROUTES)) {
      if (!Array.isArray(raw.geometry?.coordinates)) continue;
      const parsed = parseRoute(raw, destinationSnap);
      if (parsed.geometry.length >= 2) routes.push(parsed);
    }
    if (routes.length === 0) {
      return { error: { kind: 'no-route', message: 'Empty route geometry' } };
    }
    return { routes };
  } catch (err) {
    if (externalSignal?.aborted) {
      return { error: { kind: 'aborted', message: 'Request aborted' } };
    }
    // Internal timeout abort surfaces here too.
    const message =
      err instanceof Error ? err.message : 'Network request failed';
    return { error: { kind: 'network', message } };
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}

// ── Human-readable guidance ─────────────────────────────────────────────────

/**
 * Distance band thresholds for arrival messaging (metres). The driver always
 * confirms arrival manually — these only change the on-screen wording.
 */
export const ARRIVAL_VERY_CLOSE_M = 100;
export const ARRIVAL_PREPARE_M = 50;
export const ARRIVAL_HERE_M = 25;

/** Format a distance for spoken-style guidance ("400 m", "1.2 miles"). */
export function formatGuidanceDistance(meters: number, t: Translate): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) {
    const rounded = Math.max(10, Math.round(meters / 10) * 10);
    return t('guidance.metres', { value: rounded });
  }
  const miles = metersToMiles(meters);
  const isPlural = miles >= 1.05 || miles < 0.95;
  return t(isPlural ? 'guidance.miles' : 'guidance.mile', { value: miles.toFixed(1) });
}

/** Turn a maneuver modifier into a localized direction phrase. */
function modifierPhrase(modifier: string | null, t: Translate): string {
  switch (modifier) {
    case 'left':
      return t('guidance.turnLeft');
    case 'right':
      return t('guidance.turnRight');
    case 'slight left':
      return t('guidance.bearLeft');
    case 'slight right':
      return t('guidance.bearRight');
    case 'sharp left':
      return t('guidance.sharpLeft');
    case 'sharp right':
      return t('guidance.sharpRight');
    case 'uturn':
      return t('guidance.uTurn');
    case 'straight':
      return t('guidance.continueStraight');
    default:
      return t('guidance.continue');
  }
}

/**
 * Produce a clean, human-readable instruction for a step. Prefers Mapbox's own
 * banner text when it reads well (Mapbox returns it already localized via the
 * `language` request param); otherwise builds a localized phrase from the
 * maneuver type/modifier/road name so the driver is never shown robotic or
 * empty text.
 */
export function humanizeInstruction(step: RouteStep, t: Translate): string {
  const road = step.name && step.name.trim() ? step.name.trim() : null;

  if (step.maneuverType === 'arrive') {
    return t('guidance.arrivingAtCustomer');
  }
  if (step.maneuverType === 'depart') {
    return road
      ? t('guidance.headOffAlong', { road })
      : t('guidance.startDrivingToCustomer');
  }
  if (step.maneuverType === 'roundabout' || step.maneuverType === 'rotary') {
    if (step.exit && step.exit >= 1) {
      return road
        ? t('guidance.roundaboutExitOnto', { exit: step.exit, road })
        : t('guidance.roundaboutExit', { exit: step.exit });
    }
    return t('guidance.takeRoundabout');
  }
  if (step.maneuverType === 'merge') {
    return road ? t('guidance.mergeOnto', { road }) : t('guidance.mergeWithTraffic');
  }
  if (step.maneuverType === 'on ramp' || step.maneuverType === 'off ramp') {
    return step.maneuverType === 'off ramp'
      ? t('guidance.takeNextExit')
      : road
        ? t('guidance.takeSlipRoadOnto', { road })
        : t('guidance.takeSlipRoad');
  }

  // Trust a good Mapbox banner instruction when one exists (already localized).
  const banner = step.instruction?.trim();
  if (banner && banner.length > 0 && banner.toLowerCase() !== 'continue') {
    return banner;
  }

  const phrase = modifierPhrase(step.maneuverModifier, t);
  return road ? t('guidance.phraseOnto', { phrase, road }) : phrase;
}

/**
 * Arrival-aware wording based on straight-line distance to the customer.
 * Returns null when the driver is still far enough that normal turn guidance
 * should be shown instead. Never auto-confirms arrival.
 */
export function arrivalPhrase(
  metersToCustomer: number | null,
  t: Translate,
): string | null {
  if (metersToCustomer == null || !Number.isFinite(metersToCustomer)) return null;
  if (metersToCustomer <= ARRIVAL_HERE_M) return t('guidance.arrivedAtCustomer');
  if (metersToCustomer <= ARRIVAL_PREPARE_M) return t('guidance.prepareToStop');
  if (metersToCustomer <= ARRIVAL_VERY_CLOSE_M) return t('guidance.customerVeryClose');
  return null;
}

/**
 * Human fallback headline when no Mapbox step is available (route still
 * loading, on a fallback straight line, or steps exhausted). `metersToCustomer`
 * lets us escalate the message as the driver nears the destination.
 */
export function fallbackGuidance(
  metersToCustomer: number | null,
  t: Translate,
): string {
  const arrival = arrivalPhrase(metersToCustomer, t);
  if (arrival) return arrival;
  return t('guidance.continueTowardsCustomer');
}
