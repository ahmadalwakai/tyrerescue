import { MAPBOX_TOKEN } from './config';
import type { MapboxFeature } from './types';

const PROXIMITY = '-4.2518,55.8617';
export const MAPBOX_DARK_STYLE_URL = 'mapbox://styles/mapbox/dark-v11';
const STATIC_MAP_WIDTH = 700;
const STATIC_MAP_HEIGHT = 340;
const SINGLE_LOCATION_ZOOM = 13;
const ROUTE_ZOOM = 10;
const MAPBOX_TILE_SIZE = 512;
export const DRIVER_PIN_COLOR = '#F97316';
export const CUSTOMER_PIN_COLOR = '#22C55E';
export const ROUTE_LINE_COLOR = '#F97316';

export type MapCoordinate = [number, number];

export interface LiveMapMarker {
  id: string;
  coordinate: MapCoordinate;
  color: string;
}

export interface StaticMapMarker {
  id: string;
  xPercent: number;
  yPercent: number;
  color: string;
}

export async function searchAddress(query: string): Promise<MapboxFeature[]> {
  const term = query.trim();
  if (!MAPBOX_TOKEN || term.length < 2) return [];

  const params = new URLSearchParams({
    country: 'gb',
    types: 'address,postcode,place',
    proximity: PROXIMITY,
    language: 'en',
    limit: '6',
    access_token: MAPBOX_TOKEN,
  });

  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(term)}.json?${params}`,
  );
  const data = await res.json();
  return Array.isArray(data.features) ? data.features : [];
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  if (!MAPBOX_TOKEN) return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  const params = new URLSearchParams({
    country: 'gb',
    language: 'en',
    limit: '1',
    access_token: MAPBOX_TOKEN,
  });

  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params}`,
  );
  const data = await res.json();
  return data.features?.[0]?.place_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

export function staticMapUrl(lat: number, lng: number, options?: { width?: number; height?: number }) {
  if (!MAPBOX_TOKEN) return null;
  const width = options?.width ?? STATIC_MAP_WIDTH;
  const height = options?.height ?? STATIC_MAP_HEIGHT;
  const pin = `pin-s+${DRIVER_PIN_COLOR.slice(1)}(${lng},${lat})`;
  return (
    `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/` +
    `${pin}/${lng},${lat},${SINGLE_LOCATION_ZOOM},0/${width}x${height}@2x?access_token=${MAPBOX_TOKEN}`
  );
}

export function staticMapMarkers(color = DRIVER_PIN_COLOR): StaticMapMarker[] {
  return [{ id: 'location', xPercent: 50, yPercent: 50, color }];
}

export function liveLocationMarkers(lat: number, lng: number, color = DRIVER_PIN_COLOR): LiveMapMarker[] {
  return [{ id: 'location', coordinate: [lng, lat], color }];
}

export function routeStaticMapUrl(params: {
  customerLat: number;
  customerLng: number;
  driverLat?: number | null;
  driverLng?: number | null;
  routePolyline?: string | null;
}) {
  if (!MAPBOX_TOKEN) return null;
  const customer = `pin-s+${CUSTOMER_PIN_COLOR.slice(1)}(${params.customerLng},${params.customerLat})`;
  if (params.driverLat == null || params.driverLng == null) {
    return staticMapUrl(params.customerLat, params.customerLng);
  }
  const driver = `pin-s+${DRIVER_PIN_COLOR.slice(1)}(${params.driverLng},${params.driverLat})`;
  const routeLine = routePathOverlay({
    customerLat: params.customerLat,
    customerLng: params.customerLng,
    driverLat: params.driverLat,
    driverLng: params.driverLng,
    routePolyline: params.routePolyline,
  });
  const midLng = (params.customerLng + params.driverLng) / 2;
  const midLat = (params.customerLat + params.driverLat) / 2;
  return (
    `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/` +
    `${routeLine},${driver},${customer}/${midLng},${midLat},${ROUTE_ZOOM},0/${STATIC_MAP_WIDTH}x${STATIC_MAP_HEIGHT}@2x?access_token=${MAPBOX_TOKEN}`
  );
}

export async function getDrivingRoutePolyline(params: {
  customerLat: number;
  customerLng: number;
  driverLat?: number | null;
  driverLng?: number | null;
}) {
  if (!MAPBOX_TOKEN || params.driverLat == null || params.driverLng == null) return null;

  const coordinates =
    `${params.driverLng},${params.driverLat};${params.customerLng},${params.customerLat}`;
  const query = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    alternatives: 'false',
    geometries: 'polyline',
    overview: 'full',
    steps: 'false',
  });
  const res = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}?${query}`,
  );
  if (!res.ok) return null;

  const data = await res.json();
  const geometry = data.routes?.[0]?.geometry;
  return typeof geometry === 'string' && geometry.length > 0 ? geometry : null;
}

export async function getDrivingRouteCoordinates(params: {
  customerLat: number;
  customerLng: number;
  driverLat?: number | null;
  driverLng?: number | null;
}) {
  if (!MAPBOX_TOKEN || params.driverLat == null || params.driverLng == null) return null;

  const coordinates =
    `${params.driverLng},${params.driverLat};${params.customerLng},${params.customerLat}`;
  const query = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    alternatives: 'false',
    geometries: 'geojson',
    overview: 'full',
    steps: 'false',
  });
  const res = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}?${query}`,
  );
  if (!res.ok) return null;

  const data = await res.json();
  const routeCoordinates = data.routes?.[0]?.geometry?.coordinates;
  return normalizeMapCoordinates(routeCoordinates);
}

export function fallbackRouteCoordinates(params: {
  customerLat: number;
  customerLng: number;
  driverLat?: number | null;
  driverLng?: number | null;
}): MapCoordinate[] {
  if (params.driverLat == null || params.driverLng == null) {
    return [];
  }

  return [
    [params.driverLng, params.driverLat],
    [params.customerLng, params.customerLat],
  ];
}

function routePathOverlay(params: {
  customerLat: number;
  customerLng: number;
  driverLat: number;
  driverLng: number;
  routePolyline?: string | null;
}) {
  const routePolyline =
    params.routePolyline ||
    encodePolyline([
      [params.driverLat, params.driverLng],
      [params.customerLat, params.customerLng],
    ]);

  return `path-5+${ROUTE_LINE_COLOR.slice(1)}-0.95(${encodeURIComponent(routePolyline)})`;
}

export function routeStaticMapMarkers(params: {
  customerLat: number;
  customerLng: number;
  driverLat?: number | null;
  driverLng?: number | null;
}): StaticMapMarker[] {
  if (params.driverLat == null || params.driverLng == null) {
    return staticMapMarkers(DRIVER_PIN_COLOR);
  }

  const center = {
    lat: (params.customerLat + params.driverLat) / 2,
    lng: (params.customerLng + params.driverLng) / 2,
  };

  return [
    {
      id: 'driver',
      ...projectStaticMarker(params.driverLat, params.driverLng, center, ROUTE_ZOOM),
      color: DRIVER_PIN_COLOR,
    },
    {
      id: 'customer',
      ...projectStaticMarker(params.customerLat, params.customerLng, center, ROUTE_ZOOM),
      color: CUSTOMER_PIN_COLOR,
    },
  ];
}

export function routeLiveMapMarkers(params: {
  customerLat: number;
  customerLng: number;
  driverLat?: number | null;
  driverLng?: number | null;
}): LiveMapMarker[] {
  if (params.driverLat == null || params.driverLng == null) {
    return liveLocationMarkers(params.customerLat, params.customerLng, CUSTOMER_PIN_COLOR);
  }

  return [
    {
      id: 'driver',
      coordinate: [params.driverLng, params.driverLat],
      color: DRIVER_PIN_COLOR,
    },
    {
      id: 'customer',
      coordinate: [params.customerLng, params.customerLat],
      color: CUSTOMER_PIN_COLOR,
    },
  ];
}

function projectStaticMarker(
  lat: number,
  lng: number,
  center: { lat: number; lng: number },
  zoom: number,
) {
  const worldSize = MAPBOX_TILE_SIZE * 2 ** zoom;
  const point = projectLngLat(lat, lng, worldSize);
  const centerPoint = projectLngLat(center.lat, center.lng, worldSize);
  const x = STATIC_MAP_WIDTH / 2 + point.x - centerPoint.x;
  const y = STATIC_MAP_HEIGHT / 2 + point.y - centerPoint.y;

  return {
    xPercent: (x / STATIC_MAP_WIDTH) * 100,
    yPercent: (y / STATIC_MAP_HEIGHT) * 100,
  };
}

function projectLngLat(lat: number, lng: number, worldSize: number) {
  const clampedLat = Math.max(Math.min(lat, 85.05112878), -85.05112878);
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);

  return {
    x: ((lng + 180) / 360) * worldSize,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize,
  };
}

function normalizeMapCoordinates(value: unknown): MapCoordinate[] | null {
  if (!Array.isArray(value)) return null;
  const coordinates = value.filter(isMapCoordinate);
  return coordinates.length > 1 ? coordinates : null;
}

function isMapCoordinate(value: unknown): value is MapCoordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function encodePolyline(points: [number, number][]) {
  let lastLat = 0;
  let lastLng = 0;
  let result = '';

  for (const [lat, lng] of points) {
    const nextLat = Math.round(lat * 1e5);
    const nextLng = Math.round(lng * 1e5);
    result += encodePolylineValue(nextLat - lastLat);
    result += encodePolylineValue(nextLng - lastLng);
    lastLat = nextLat;
    lastLng = nextLng;
  }

  return result;
}

function encodePolylineValue(value: number) {
  let nextValue = value < 0 ? ~(value << 1) : value << 1;
  let result = '';

  while (nextValue >= 0x20) {
    result += String.fromCharCode((0x20 | (nextValue & 0x1f)) + 63);
    nextValue >>= 5;
  }

  result += String.fromCharCode(nextValue + 63);
  return result;
}
