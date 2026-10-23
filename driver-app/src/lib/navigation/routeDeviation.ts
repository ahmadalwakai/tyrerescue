import {
  bearingDegrees, haversineDistanceMeters, nearestPointOnSegment, snapPointToRoute,
  type LngLat, type NavigationPoint,
} from './routeGeometry';

export const REROUTE_COOLDOWN_MS = 15_000;
const FRESH_FIX_MS = 12_000;

export interface RouteDeviationState {
  revision: string;
  since: number | null;
  samples: number;
  lastFixAt: number;
  lastCoordinate: NavigationPoint | null;
  reason: 'distance' | 'wrong-way' | null;
}

export function emptyRouteDeviation(revision = ''): RouteDeviationState {
  return { revision, since: null, samples: 0, lastFixAt: 0, lastCoordinate: null, reason: null };
}

/** Uses distinct accurate fixes for confirmation; a timer may finish the debounce,
 * but cannot turn one GPS outlier into multiple confirmation samples. */
export function evaluateRouteDeviation(input: {
  revision: string;
  geometry: LngLat[];
  coordinate: NavigationPoint;
  fixAt: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  now: number;
  previous: RouteDeviationState;
  loading: boolean;
  networkAllowed: boolean;
  lastRerouteAt: number;
}) {
  let state = input.previous.revision === input.revision
    ? input.previous : emptyRouteDeviation(input.revision);
  const age = input.now - input.fixAt;
  const usable = Number.isFinite(age) && age >= 0 && age <= FRESH_FIX_MS &&
    input.accuracy != null && Number.isFinite(input.accuracy) &&
    input.accuracy >= 0 && input.accuracy <= 50;
  const snap = snapPointToRoute(input.coordinate, input.geometry);
  const distance = snap?.distanceMeters ?? Number.POSITIVE_INFINITY;
  const threshold = Math.max(35, (input.accuracy ?? 50) * 1.5);
  const isNewFix = input.fixAt > state.lastFixAt;
  const segment = snap?.segmentIndex ?? -1;
  const a = input.geometry[segment];
  const b = input.geometry[segment + 1];
  const routeHeading = a && b && haversineDistanceMeters({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] }) > 3
    ? bearingDegrees({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] }) : null;
  const difference = routeHeading != null && input.heading != null && Number.isFinite(input.heading)
    ? Math.abs(((input.heading - routeHeading + 540) % 360) - 180) : 0;
  // Course is meaningful only while moving. Ignore tiny GPS movements on turns.
  const reverseCourse = distance <= threshold && input.speed != null && input.speed >= 2.5 &&
    input.accuracy != null && input.accuracy <= 25 && difference > 135 &&
    (!isNewFix || state.lastCoordinate == null ||
      haversineDistanceMeters(state.lastCoordinate, input.coordinate) >= 3);
  // An out-and-back route can occupy the same road in both directions. Do not
  // mistake the first equally near (outbound) segment for the return leg.
  const nearbyForwardSegment = reverseCourse && input.geometry.some((point, index) => {
    const end = input.geometry[index + 1];
    if (!end || index === segment) return false;
    const startPoint = { lng: point[0], lat: point[1] };
    const endPoint = { lng: end[0], lat: end[1] };
    if (haversineDistanceMeters(startPoint, endPoint) <= 3) return false;
    const candidate = nearestPointOnSegment(input.coordinate, startPoint, endPoint);
    if (!candidate || candidate.distanceMeters > distance + Math.max(10, input.accuracy ?? 0)) return false;
    const heading = bearingDegrees(startPoint, endPoint);
    return Math.abs((((input.heading ?? 0) - heading + 540) % 360) - 180) <= 90;
  });
  const wrongWay = reverseCourse && !nearbyForwardSegment;
  const reason = distance > threshold ? 'distance' : wrongWay ? 'wrong-way' : null;
  if (!usable || !snap || input.fixAt < state.lastFixAt || reason == null) {
    state = { ...emptyRouteDeviation(input.revision), lastFixAt: input.fixAt, lastCoordinate: input.coordinate };
    return { state, distance, threshold, confirmed: false, shouldReroute: false, suspected: false };
  }
  if (state.reason !== reason || (isNewFix && input.fixAt - state.lastFixAt > FRESH_FIX_MS)) {
    state = { ...emptyRouteDeviation(input.revision), reason };
  }
  if (input.fixAt > state.lastFixAt) {
    state = { ...state, since: state.since ?? input.fixAt, samples: state.samples + 1,
      lastFixAt: input.fixAt, lastCoordinate: input.coordinate, reason };
  }
  const debounce = input.speed != null && input.speed >= 13 ? 1_800 : 4_500;
  const confirmed = state.samples >= 2 && state.since != null && input.now - state.since >= debounce;
  const cooldownReady = input.lastRerouteAt === 0 || input.now - input.lastRerouteAt >= REROUTE_COOLDOWN_MS;
  return { state, distance, threshold, confirmed, suspected: true,
    shouldReroute: confirmed && !input.loading && input.networkAllowed && cooldownReady };
}
