export interface MapboxFeature {
  id: string;
  place_name: string;
  center: [number, number];
  context?: Array<{ id?: string; text?: string }>;
}

interface MapboxResponse {
  features?: MapboxFeature[];
}

export function getMapboxToken(): string | null {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN?.trim();
  return token || null;
}

export async function searchMapboxAddress(query: string): Promise<MapboxFeature[]> {
  const token = getMapboxToken();
  if (!token || query.trim().length < 3) return [];

  const encoded = encodeURIComponent(query.trim());
  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json` +
      `?country=gb&types=address,postcode,place&proximity=-4.2518,55.8617&language=en&limit=6` +
      `&access_token=${encodeURIComponent(token)}`,
  );

  if (!response.ok) return [];
  const data = (await response.json()) as MapboxResponse;
  return data.features ?? [];
}

export function extractPostcode(feature: MapboxFeature): string | null {
  const postcode = feature.context?.find((entry) => entry.id?.startsWith('postcode'))?.text;
  return postcode ?? null;
}