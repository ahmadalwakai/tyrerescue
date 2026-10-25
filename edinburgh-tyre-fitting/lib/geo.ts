import { siteConfig } from './site';

const EARTH_RADIUS_MILES = 3958.8;

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface GeocodeResult {
  coordinates: Coordinates;
  label: string;
  distanceMiles: number;
  source: 'mapbox' | 'postcode' | 'fallback';
  confidence: 'verified' | 'manual_review';
}

interface MapboxFeature {
  center?: [number, number];
  place_name?: string;
  place_name_en?: string;
  text?: string;
  text_en?: string;
  geometry?: { coordinates?: [number, number] };
  properties?: { full_address?: string; name?: string; place_formatted?: string };
}

interface PostcodeLookupResult {
  postcode?: string;
  latitude?: number;
  longitude?: number;
  admin_district?: string;
  region?: string;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceMiles(from: Coordinates, to: Coordinates): number {
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return 2 * EARTH_RADIUS_MILES * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeUkPostcode(query: string): Promise<GeocodeResult | null> {
  const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(query)}`, {
    cache: 'no-store',
  });

  if (!response.ok) return null;

  const data = (await response.json().catch(() => null)) as
    | {
        result?: {
          postcode?: string;
          latitude?: number;
          longitude?: number;
          admin_district?: string;
          region?: string;
        };
      }
    | null;

  const result = data?.result;
  if (!result || typeof result.latitude !== 'number' || typeof result.longitude !== 'number') {
    return null;
  }

  const coordinates = { lat: result.latitude, lng: result.longitude };
  const label = [
    result.postcode,
    result.admin_district,
    result.region,
    'UK',
  ].filter(Boolean).join(', ');

  return {
    coordinates,
    label,
    distanceMiles: distanceMiles(siteConfig.center, coordinates),
    source: 'postcode',
    confidence: 'verified',
  };
}

function formatMapboxLabel(feature: MapboxFeature | undefined, fallback: string): string {
  if (!feature) return fallback;

  return (
    feature.properties?.full_address ||
    feature.place_name_en ||
    feature.place_name ||
    [feature.properties?.name, feature.properties?.place_formatted].filter(Boolean).join(', ') ||
    feature.text_en ||
    feature.text ||
    fallback
  );
}

function formatPostcodeLabel(result: PostcodeLookupResult | undefined, fallback: string): string {
  if (!result) return fallback;

  return [
    result.postcode,
    result.admin_district,
    result.region,
    'UK',
  ].filter(Boolean).join(', ') || fallback;
}

async function reverseGeocodePostcode(coordinates: Coordinates): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({
    lon: String(coordinates.lng),
    lat: String(coordinates.lat),
    limit: '1',
    radius: '2000',
  });
  const response = await fetch(`https://api.postcodes.io/postcodes?${params.toString()}`, {
    cache: 'no-store',
  });

  if (!response.ok) return null;

  const data = (await response.json().catch(() => null)) as
    | {
        result?: PostcodeLookupResult[] | null;
      }
    | null;
  const result = data?.result?.[0];
  if (!result) return null;

  return {
    coordinates,
    label: formatPostcodeLabel(result, `Current location (${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)})`),
    distanceMiles: distanceMiles(siteConfig.center, coordinates),
    source: 'postcode',
    confidence: 'verified',
  };
}

export async function reverseGeocodeEdinburghCoordinates(coordinates: Coordinates): Promise<GeocodeResult> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_SECRET_TOKEN;
  const fallbackLabel = `Current location (${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)})`;

  if (!token) {
    const postcodeResult = await reverseGeocodePostcode(coordinates);
    if (postcodeResult) return postcodeResult;

    return {
      coordinates,
      label: fallbackLabel,
      distanceMiles: distanceMiles(siteConfig.center, coordinates),
      source: 'fallback',
      confidence: 'manual_review',
    };
  }

  const params = new URLSearchParams({
    access_token: token,
    country: 'gb',
    language: 'en',
    limit: '1',
    types: 'address,postcode,place,locality',
  });
  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${coordinates.lng},${coordinates.lat}.json?${params.toString()}`,
    { cache: 'no-store' },
  );

  if (!response.ok) {
    const postcodeResult = await reverseGeocodePostcode(coordinates);
    if (postcodeResult) return postcodeResult;

    return {
      coordinates,
      label: fallbackLabel,
      distanceMiles: distanceMiles(siteConfig.center, coordinates),
      source: 'fallback',
      confidence: 'manual_review',
    };
  }

  const data = (await response.json().catch(() => null)) as { features?: MapboxFeature[] } | null;
  const feature = data?.features?.[0];

  return {
    coordinates,
    label: formatMapboxLabel(feature, fallbackLabel),
    distanceMiles: distanceMiles(siteConfig.center, coordinates),
    source: feature ? 'mapbox' : 'fallback',
    confidence: feature ? 'verified' : 'manual_review',
  };
}

export async function geocodeEdinburghAddress(address: string): Promise<GeocodeResult> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_SECRET_TOKEN;
  const query = address.trim();

  if (!token) {
    const postcodeResult = await geocodeUkPostcode(query);
    if (postcodeResult) return postcodeResult;

    return {
      coordinates: siteConfig.center,
      label: query,
      distanceMiles: 0,
      source: 'fallback',
      confidence: 'manual_review',
    };
  }

  const params = new URLSearchParams({
    access_token: token,
    country: 'gb',
    language: 'en',
    limit: '1',
    proximity: `${siteConfig.center.lng},${siteConfig.center.lat}`,
    types: 'address,postcode,place,locality',
  });

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`;
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    return {
      coordinates: siteConfig.center,
      label: query,
      distanceMiles: 0,
      source: 'fallback',
      confidence: 'manual_review',
    };
  }

  const data = (await response.json()) as { features?: MapboxFeature[] };

  const feature = data.features?.[0];
  const coordinates = feature?.geometry?.coordinates || feature?.center;

  if (!coordinates) {
    return {
      coordinates: siteConfig.center,
      label: query,
      distanceMiles: 0,
      source: 'fallback',
      confidence: 'manual_review',
    };
  }

  const result = { lng: coordinates[0], lat: coordinates[1] };
  const miles = distanceMiles(siteConfig.center, result);
  const label = formatMapboxLabel(feature, query);

  return {
    coordinates: result,
    label,
    distanceMiles: miles,
    source: 'mapbox',
    confidence: 'verified',
  };
}
