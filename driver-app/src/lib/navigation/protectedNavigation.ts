import { isValidCoord, type Coordinates, type DirectionsRoute, type FetchDirectionsResult } from '../../services/directions';
import { validateRouteGeometry } from './navigationProgress';

/** Reject old haversine estimates, a different booking, or a changed customer. */
export function readProtectedNavigationResponse(
  value: unknown, bookingRef: string, origin: Coordinates, destination: Coordinates,
): FetchDirectionsResult {
  const unavailable: FetchDirectionsResult = { error: {
    kind: 'no-route', message: 'Road guidance is not available for this booking. Retry or open external maps.',
  } };
  try {
    if (!value || typeof value !== 'object') return unavailable;
    const response = value as {
      bookingRef?: unknown; source?: unknown; customerLocation?: Coordinates | null;
      navigation?: { version?: unknown; routes?: DirectionsRoute[] } | null;
    };
    if (response.bookingRef !== bookingRef || response.source !== 'mapbox' ||
      response.navigation?.version !== 1 || !Array.isArray(response.navigation.routes) ||
      !isValidCoord(response.customerLocation) ||
      Math.abs(response.customerLocation.lat - destination.lat) > 0.00001 ||
      Math.abs(response.customerLocation.lng - destination.lng) > 0.00001) return unavailable;
    const routes = response.navigation.routes.slice(0, 3).filter((route) =>
      route && Array.isArray(route.steps) && route.steps.length > 0 &&
      route.steps.every((step) => step && typeof step.instruction === 'string' && step.instruction.trim() &&
        Array.isArray(step.location) && isValidCoord({ lng: step.location[0], lat: step.location[1] })) &&
      validateRouteGeometry({ route, origin, destination }).ok);
    return routes.length ? { routes } : unavailable;
  } catch {
    return unavailable;
  }
}
