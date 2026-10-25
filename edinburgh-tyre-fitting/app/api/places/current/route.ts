import { NextResponse } from 'next/server';
import { reverseGeocodeEdinburghCoordinates } from '@/lib/geo';
import { siteConfig } from '@/lib/site';

export const dynamic = 'force-dynamic';

function readCoordinate(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        lat?: unknown;
        lng?: unknown;
        accuracy?: unknown;
      }
    | null;

  const lat = readCoordinate(body?.lat);
  const lng = readCoordinate(body?.lng);
  const accuracy = readCoordinate(body?.accuracy);

  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'Current location could not be read.' }, { status: 400 });
  }

  const geocode = await reverseGeocodeEdinburghCoordinates({ lat, lng });
  const inServiceArea = geocode.distanceMiles <= siteConfig.serviceRadiusMiles;

  return NextResponse.json({
    label: geocode.label,
    distanceMiles: Number(geocode.distanceMiles.toFixed(1)),
    source: geocode.source,
    confidence: geocode.confidence,
    inServiceArea,
    serviceRadiusMiles: siteConfig.serviceRadiusMiles,
    coordinates: geocode.coordinates,
    accuracyMeters: accuracy == null ? null : Math.round(accuracy),
  });
}
