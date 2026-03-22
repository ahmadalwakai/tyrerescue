/**
 * Distance and mapping utilities for Tyre Rescue.
 * Haversine + optional Mapbox driving directions.
 */

/** Duke Street Tyres, Glasgow */
export const SHOP_LOCATION = { lat: 55.8547, lng: -4.2206 } as const;

export interface DistanceResult {
  straightLineKm: number;
  straightLineMiles: number;
  drivingKm: number | null;
  drivingMinutes: number | null;
  routeGeoJson: GeoJSON.Geometry | null;
}

/**
 * Haversine distance between two coordinates in km.
 */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

const KM_TO_MILES = 0.621371;

/**
 * Calculate distance from shop (or custom origin) to destination.
 * Uses Mapbox driving directions when MAPBOX_TOKEN is set.
 */
export async function calculateDistance(
  destination: { lat: number; lng: number },
  origin: { lat: number; lng: number } = SHOP_LOCATION
): Promise<DistanceResult> {
  const straightLineKm = haversineKm(origin, destination);
  const straightLineMiles = straightLineKm * KM_TO_MILES;

  const mapboxToken = process.env.MAPBOX_TOKEN;
  if (!mapboxToken) {
    return {
      straightLineKm,
      straightLineMiles,
      drivingKm: straightLineKm * 1.3, // rough road-factor
      drivingMinutes: null,
      routeGeoJson: null,
    };
  }

  try {
    const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${mapboxToken}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return {
        straightLineKm,
        straightLineMiles,
        drivingKm: straightLineKm * 1.3,
        drivingMinutes: null,
        routeGeoJson: null,
      };
    }

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) {
      return {
        straightLineKm,
        straightLineMiles,
        drivingKm: straightLineKm * 1.3,
        drivingMinutes: null,
        routeGeoJson: null,
      };
    }

    return {
      straightLineKm,
      straightLineMiles,
      drivingKm: route.distance / 1000,
      drivingMinutes: Math.round(route.duration / 60),
      routeGeoJson: route.geometry ?? null,
    };
  } catch {
    return {
      straightLineKm,
      straightLineMiles,
      drivingKm: straightLineKm * 1.3,
      drivingMinutes: null,
      routeGeoJson: null,
    };
  }
}
