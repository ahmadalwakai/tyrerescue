/**
 * Mapbox service utilities
 * Server-side geocoding and directions APIs
 */

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
  distanceSource: 'driver' | 'service_area' | 'service_center';
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  distanceMeters: number | null;
  durationSeconds: number | null;
  fallbackReason: string | null;
  selectedDriverId: string | null;
  selectedServiceAreaId: string | null;
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
 * Get driving directions and distance between two points
 */
export async function getDirections(
  origin: { lng: number; lat: number },
  destination: { lng: number; lat: number }
): Promise<DirectionsResult | null> {
  const token = process.env.MAPBOX_SECRET_TOKEN;
  if (!token) {
    throw new Error('Missing MAPBOX_SECRET_TOKEN environment variable');
  }

  const url = `${MAPBOX_BASE_URL}/directions/v5/mapbox/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?access_token=${token}&geometries=geojson&overview=full`;

  const response = await fetch(url);

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
 *   2. Nearest active service area center (by driving time)
 *   3. SERVICE_CENTER (Duke Street Tyres, Glasgow)
 *
 * Within each phase, candidates are pre-sorted by haversine (cheap) and
 * only the closest N are checked via Mapbox to limit API calls.
 * If all Mapbox calls within a phase fail, haversine × 1.3 is used.
 */
export async function resolveDistance(
  customer: { lat: number; lng: number },
  driverCandidates: Array<{ id: string; lat: number; lng: number }>,
  serviceAreaCandidates: Array<{ id: string; lat: number; lng: number }>,
): Promise<DistanceResult> {
  // --- Phase 1: Try drivers ---
  const sortedDrivers = [...driverCandidates]
    .sort((a, b) =>
      haversineDistanceMiles(a, customer) - haversineDistanceMiles(b, customer)
    )
    .slice(0, MAX_MAPBOX_CANDIDATES);

  let bestDriver: DistanceResult | null = null;
  for (const d of sortedDrivers) {
    const dirs = await getDirections(
      { lng: d.lng, lat: d.lat },
      { lng: customer.lng, lat: customer.lat },
    );
    if (dirs) {
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
          selectedServiceAreaId: null,
        };
      }
    }
  }
  if (bestDriver) return bestDriver;

  // Haversine fallback for nearest driver
  if (sortedDrivers.length > 0) {
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
      selectedServiceAreaId: null,
    };
  }

  // --- Phase 2: Try service areas ---
  const sortedAreas = [...serviceAreaCandidates]
    .sort((a, b) =>
      haversineDistanceMiles(a, customer) - haversineDistanceMiles(b, customer)
    )
    .slice(0, MAX_MAPBOX_CANDIDATES);

  let bestArea: DistanceResult | null = null;
  for (const a of sortedAreas) {
    const dirs = await getDirections(
      { lng: a.lng, lat: a.lat },
      { lng: customer.lng, lat: customer.lat },
    );
    if (dirs) {
      const miles = Math.round(metersToMiles(dirs.distance) * 100) / 100;
      const mins = secondsToMinutes(dirs.duration);
      if (!bestArea || mins < (bestArea.durationMinutes ?? Infinity)) {
        bestArea = {
          distanceMiles: miles,
          durationMinutes: mins,
          distanceProvider: 'mapbox',
          distanceSource: 'service_area',
          originLat: a.lat,
          originLng: a.lng,
          destLat: customer.lat,
          destLng: customer.lng,
          distanceMeters: dirs.distance,
          durationSeconds: dirs.duration,
          fallbackReason: null,
          selectedDriverId: null,
          selectedServiceAreaId: a.id,
        };
      }
    }
  }
  if (bestArea) return bestArea;

  // Haversine fallback for nearest service area
  if (sortedAreas.length > 0) {
    const a = sortedAreas[0];
    const hvDist = haversineDistanceMiles(a, customer) * 1.3;
    return {
      distanceMiles: Math.round(hvDist * 100) / 100,
      durationMinutes: null,
      distanceProvider: 'haversine',
      distanceSource: 'service_area',
      originLat: a.lat,
      originLng: a.lng,
      destLat: customer.lat,
      destLng: customer.lng,
      distanceMeters: null,
      durationSeconds: null,
      fallbackReason: 'Mapbox directions unavailable for service areas',
      selectedDriverId: null,
      selectedServiceAreaId: a.id,
    };
  }

  // --- Phase 3: SERVICE_CENTER fallback ---
  const scDirs = await getDirections(
    { lng: SERVICE_CENTER.lng, lat: SERVICE_CENTER.lat },
    { lng: customer.lng, lat: customer.lat },
  );
  if (scDirs) {
    return {
      distanceMiles: Math.round(metersToMiles(scDirs.distance) * 100) / 100,
      durationMinutes: secondsToMinutes(scDirs.duration),
      distanceProvider: 'mapbox',
      distanceSource: 'service_center',
      originLat: SERVICE_CENTER.lat,
      originLng: SERVICE_CENTER.lng,
      destLat: customer.lat,
      destLng: customer.lng,
      distanceMeters: scDirs.distance,
      durationSeconds: scDirs.duration,
      fallbackReason: 'No drivers or service areas available',
      selectedDriverId: null,
      selectedServiceAreaId: null,
    };
  }

  // Absolute last resort: haversine from SERVICE_CENTER
  const hvDist = haversineDistanceMiles(SERVICE_CENTER, customer) * 1.3;
  return {
    distanceMiles: Math.round(hvDist * 100) / 100,
    durationMinutes: null,
    distanceProvider: 'haversine',
    distanceSource: 'service_center',
    originLat: SERVICE_CENTER.lat,
    originLng: SERVICE_CENTER.lng,
    destLat: customer.lat,
    destLng: customer.lng,
    distanceMeters: null,
    durationSeconds: null,
    fallbackReason: 'All Mapbox calls failed, haversine from SERVICE_CENTER',
    selectedDriverId: null,
    selectedServiceAreaId: null,
  };
}

// Service area center (Duke Street Tyres)
export const SERVICE_CENTER = {
  lat: 55.8547,
  lng: -4.2206,
};
