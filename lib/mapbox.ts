/**
 * Mapbox service utilities
 * Server-side geocoding and directions APIs
 */

import { GARAGE_LOCATION } from '@/lib/garage';

const MAPBOX_BASE_URL = 'https://api.mapbox.com';

interface GeocodingResult {
  center: [number, number]; // [longitude, latitude]
  placeName: string;
  text: string;
  context: Array<{
    id: string;
    text: string;
  }>;
}

interface DirectionsResult {
  distance: number; // meters
  duration: number; // seconds
  geometry: {
    coordinates: Array<[number, number]>;
  };
}

/**
 * Structured distance result with full metadata for auditability.
 * Records which provider was used, which origin point, and why.
 */
export interface DistanceResult {
  distanceMiles: number;
  durationMinutes: number | null;
  distanceProvider: 'mapbox' | 'haversine';
  distanceSource: 'driver' | 'garage';
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  distanceMeters: number | null;
  durationSeconds: number | null;
  fallbackReason: string | null;
  selectedDriverId: string | null;
}

/**
 * Forward geocoding - address to coordinates
 */
export async function geocodeAddress(
  address: string
): Promise<GeocodingResult | null> {
  const token = process.env.MAPBOX_SECRET_TOKEN;
  if (!token) {
    throw new Error('Missing MAPBOX_SECRET_TOKEN environment variable');
  }

  const encodedAddress = encodeURIComponent(address);
  const url = `${MAPBOX_BASE_URL}/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${token}&country=GB&limit=1`;

  const response = await fetch(url);

  if (!response.ok) {
    console.error('Geocoding failed:', response.statusText);
    return null;
  }

  const data = await response.json();

  if (!data.features || data.features.length === 0) {
    return null;
  }

  const feature = data.features[0];
  return {
    center: feature.center,
    placeName: feature.place_name,
    text: feature.text,
    context: feature.context || [],
  };
}

/**
 * Reverse geocoding - coordinates to address
 */
export async function reverseGeocode(
  lng: number,
  lat: number
): Promise<GeocodingResult | null> {
  const token = process.env.MAPBOX_SECRET_TOKEN;
  if (!token) {
    throw new Error('Missing MAPBOX_SECRET_TOKEN environment variable');
  }

  const url = `${MAPBOX_BASE_URL}/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&country=GB&limit=1`;

  const response = await fetch(url);

  if (!response.ok) {
    console.error('Reverse geocoding failed:', response.statusText);
    return null;
  }

  const data = await response.json();

  if (!data.features || data.features.length === 0) {
    return null;
  }

  const feature = data.features[0];
  return {
    center: feature.center,
    placeName: feature.place_name,
    text: feature.text,
    context: feature.context || [],
  };
}

/**
 * Get driving directions and distance between two points.
 * Hard 8-second timeout prevents the quote API from hanging on Mapbox.
 */
const MAPBOX_TIMEOUT_MS = 8_000;

/** Warn once if token looks like a placeholder */
let _tokenWarned = false;
function warnIfPlaceholderToken(token: string) {
  if (_tokenWarned) return;
  if (token.length < 20 || /^sk\.x+$/i.test(token)) {
    console.warn('[MAPBOX] Secret token appears to be a placeholder — directions will fail, falling back to haversine');
    _tokenWarned = true;
  }
}

export async function getDirections(
  origin: { lng: number; lat: number },
  destination: { lng: number; lat: number }
): Promise<DirectionsResult | null> {
  const token = process.env.MAPBOX_SECRET_TOKEN;
  if (!token) {
    throw new Error('Missing MAPBOX_SECRET_TOKEN environment variable');
  }
  warnIfPlaceholderToken(token);

  const url = `${MAPBOX_BASE_URL}/directions/v5/mapbox/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?access_token=${token}&geometries=geojson&overview=full`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MAPBOX_TIMEOUT_MS);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('Directions request failed:', response.statusText);
      return null;
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      return null;
    }

    const route = data.routes[0];
    return {
      distance: route.distance,
      duration: route.duration,
      geometry: route.geometry,
    };
  } catch (err) {
    console.error('Directions request failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Convert meters to miles
 */
export function metersToMiles(meters: number): number {
  return meters * 0.000621371;
}

/**
 * Convert seconds to minutes
 */
export function secondsToMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}

/**
 * Calculate driving distance in miles between two points
 */
export async function getDrivingDistanceMiles(
  origin: { lng: number; lat: number },
  destination: { lng: number; lat: number }
): Promise<{ distanceMiles: number; durationMinutes: number } | null> {
  const directions = await getDirections(origin, destination);

  if (!directions) {
    return null;
  }

  return {
    distanceMiles: Math.round(metersToMiles(directions.distance) * 100) / 100,
    durationMinutes: secondsToMinutes(directions.duration),
  };
}

/**
 * Calculate straight-line distance (Haversine formula)
 * Used as a fallback when directions API is unavailable
 */
export function haversineDistanceMiles(
  point1: { lat: number; lng: number },
  point2: { lat: number; lng: number }
): number {
  const R = 3959; // Earth's radius in miles

  const dLat = ((point2.lat - point1.lat) * Math.PI) / 180;
  const dLng = ((point2.lng - point1.lng) * Math.PI) / 180;

  const lat1Rad = (point1.lat * Math.PI) / 180;
  const lat2Rad = (point2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c * 100) / 100;
}

/** Maximum candidates per type to try via Mapbox directions API */
const MAX_MAPBOX_CANDIDATES = 3;

/**
 * Resolve the best origin-to-customer distance using the fallback chain:
 *   1. Nearest online driver (by driving time)
 *   2. Garage fallback (3, 10 Gateside St, Glasgow G31 1PD)
 *
 * Driver candidates are pre-sorted by haversine (cheap) and
 * only the closest N are checked via Mapbox **in parallel** to keep
 * worst-case latency to a single timeout window (~8s) instead of N × 8s.
 * If all Mapbox calls fail for available drivers, haversine × 1.3 is used.
 * If no drivers are available, the garage origin is used.
 */
export async function resolveDistance(
  customer: { lat: number; lng: number },
  driverCandidates: Array<{ id: string; lat: number; lng: number }>,
): Promise<DistanceResult> {
  // --- Phase 1: Try drivers (parallel) ---
  const sortedDrivers = [...driverCandidates]
    .sort((a, b) =>
      haversineDistanceMiles(a, customer) - haversineDistanceMiles(b, customer)
    )
    .slice(0, MAX_MAPBOX_CANDIDATES);

  if (sortedDrivers.length > 0) {
    const results = await Promise.allSettled(
      sortedDrivers.map(d =>
        getDirections(
          { lng: d.lng, lat: d.lat },
          { lng: customer.lng, lat: customer.lat },
        ).then(dirs => dirs ? { driver: d, dirs } : null),
      ),
    );

    let bestDriver: DistanceResult | null = null;
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const { driver: d, dirs } = r.value;
      const miles = Math.round(metersToMiles(dirs.distance) * 100) / 100;
      const mins = secondsToMinutes(dirs.duration);
      if (!bestDriver || mins < (bestDriver.durationMinutes ?? Infinity)) {
        bestDriver = {
          distanceMiles: miles,
          durationMinutes: mins,
          distanceProvider: 'mapbox',
          distanceSource: 'driver',
          originLat: d.lat,
          originLng: d.lng,
          destLat: customer.lat,
          destLng: customer.lng,
          distanceMeters: dirs.distance,
          durationSeconds: dirs.duration,
          fallbackReason: null,
          selectedDriverId: d.id,
        };
      }
    }
    if (bestDriver) return bestDriver;

    // Haversine fallback for nearest driver
    const d = sortedDrivers[0];
    const hvDist = haversineDistanceMiles(d, customer) * 1.3;
    return {
      distanceMiles: Math.round(hvDist * 100) / 100,
      durationMinutes: null,
      distanceProvider: 'haversine',
      distanceSource: 'driver',
      originLat: d.lat,
      originLng: d.lng,
      destLat: customer.lat,
      destLng: customer.lng,
      distanceMeters: null,
      durationSeconds: null,
      fallbackReason: 'Mapbox directions unavailable for drivers',
      selectedDriverId: d.id,
    };
  }

  // --- Phase 2: Garage fallback ---
  let garageDirections: DirectionsResult | null = null;
  try {
    garageDirections = await getDirections(
      { lng: GARAGE_LOCATION.lng, lat: GARAGE_LOCATION.lat },
      { lng: customer.lng, lat: customer.lat },
    );
  } catch {
    garageDirections = null;
  }

  if (garageDirections) {
    return {
      distanceMiles: Math.round(metersToMiles(garageDirections.distance) * 100) / 100,
      durationMinutes: secondsToMinutes(garageDirections.duration),
      distanceProvider: 'mapbox',
      distanceSource: 'garage',
      originLat: GARAGE_LOCATION.lat,
      originLng: GARAGE_LOCATION.lng,
      destLat: customer.lat,
      destLng: customer.lng,
      distanceMeters: garageDirections.distance,
      durationSeconds: garageDirections.duration,
      fallbackReason: 'No available drivers; using garage fallback',
      selectedDriverId: null,
    };
  }

  // Absolute last resort: haversine from garage
  const hvDist = haversineDistanceMiles(GARAGE_LOCATION, customer) * 1.3;
  return {
    distanceMiles: Math.round(hvDist * 100) / 100,
    durationMinutes: null,
    distanceProvider: 'haversine',
    distanceSource: 'garage',
    originLat: GARAGE_LOCATION.lat,
    originLng: GARAGE_LOCATION.lng,
    destLat: customer.lat,
    destLng: customer.lng,
    distanceMeters: null,
    durationSeconds: null,
    fallbackReason: 'No available drivers; mapbox unavailable, using haversine from garage',
    selectedDriverId: null,
  };
}
