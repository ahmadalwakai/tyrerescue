import 'server-only';
import {
  isValidCoord, parseMapboxDirectionsPayload,
  type Coordinates, type FetchDirectionsOptions, type FetchDirectionsResult,
} from '../driver-app/src/services/directions';
import { validateRouteGeometry } from '../driver-app/src/lib/navigation/navigationProgress';

const TIMEOUT_MS = 8_000;

function navigationProviderToken(): string | null {
  const candidates = [process.env.MAPBOX_SECRET_TOKEN, process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN, process.env.MAPBOX_TOKEN];
  return candidates.map((value) => value?.trim()).find((value): value is string =>
    !!value && /^(?:pk|sk)\./.test(value) && value.length >= 20 && !/your-.*token|\.[x]+$/i.test(value)) ?? null;
}

/** Assigned job navigation only. Provider keys and upstream bodies never leave the server. */
export async function getDriverNavigationDirections(
  origin: Coordinates, destination: Coordinates, options: FetchDirectionsOptions = {},
): Promise<FetchDirectionsResult> {
  if (!isValidCoord(origin) || !isValidCoord(destination)) {
    return { error: { kind: 'invalid-coords', message: 'A valid driver and customer location are required.' } };
  }
  const token = navigationProviderToken();
  if (!token) return { error: { kind: 'api', message: 'Road guidance is temporarily unavailable.' } };
  const avoid = options.avoid ?? {};
  const exclusions = [avoid.motorways ? 'motorway' : null, avoid.tolls ? 'toll' : null, avoid.ferries ? 'ferry' : null].filter(Boolean);
  const params = new URLSearchParams({
    access_token: token, geometries: 'geojson', overview: 'full', steps: 'true',
    alternatives: 'true', roundabout_exits: 'true', language: options.language === 'ar' ? 'ar' : 'en',
    annotations: 'congestion,congestion_numeric,distance,duration,speed,maxspeed',
  });
  if (exclusions.length) params.set('exclude', exclusions.join(','));
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}?${params}`, {
      signal: controller.signal, cache: 'no-store',
    });
    if (!response.ok) return { error: { kind: 'api', message: 'Road guidance is temporarily unavailable.' } };
    const parsed = parseMapboxDirectionsPayload(await response.json());
    if ('error' in parsed) return parsed;
    const routes = parsed.routes.filter((route) => validateRouteGeometry({ route, origin, destination }).ok);
    return routes.length ? { routes } : { error: { kind: 'no-route', message: 'No usable road guidance is available.' } };
  } catch {
    return { error: { kind: 'network', message: 'Unable to load road guidance. Check your connection and retry.' } };
  } finally {
    clearTimeout(timeout);
  }
}
