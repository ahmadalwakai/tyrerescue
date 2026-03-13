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

// Service area center (Duke Street Tyres)
export const SERVICE_CENTER = {
  lat: 55.8547,
  lng: -4.2206,
};
