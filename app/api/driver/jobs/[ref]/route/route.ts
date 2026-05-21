import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { requireDriverMobile } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import {
  getDirections,
  haversineDistanceMiles,
  metersToMiles,
  secondsToMinutes,
} from '@/lib/mapbox';

const ACTIVE_STATUSES = [
  'driver_assigned',
  'en_route',
  'arrived',
  'in_progress',
] as const;

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ref: string }> },
) {
  let driverId: string;
  try {
    ({ driverId } = await requireDriverMobile(request));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ref } = await context.params;
  if (!ref) {
    return NextResponse.json({ error: 'Missing ref' }, { status: 400 });
  }

  const [row] = await db
    .select({
      bookingRef: bookings.refNumber,
      status: bookings.status,
      addressLine: bookings.addressLine,
      customerLat: bookings.lat,
      customerLng: bookings.lng,
      driverId: bookings.driverId,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.refNumber, ref),
        inArray(bookings.status, [...ACTIVE_STATUSES]),
      ),
    )
    .limit(1);

  if (!row || row.driverId !== driverId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const customerLat = toNumber(row.customerLat);
  const customerLng = toNumber(row.customerLng);

  // The driver app passes its own latest GPS in the query string so we can
  // build a fresh route without forcing another /api/driver/location round
  // trip. We accept the request even when GPS is missing — the client will
  // only render markers in that case.
  const url = new URL(request.url);
  const driverLat = toNumber(url.searchParams.get('lat'));
  const driverLng = toNumber(url.searchParams.get('lng'));

  const result = {
    bookingRef: row.bookingRef,
    status: row.status,
    customerLocation:
      customerLat != null && customerLng != null
        ? {
            lat: customerLat,
            lng: customerLng,
            address: row.addressLine ?? null,
          }
        : null,
    driverLocation:
      driverLat != null && driverLng != null
        ? { lat: driverLat, lng: driverLng }
        : null,
    distanceMiles: null as number | null,
    durationMinutes: null as number | null,
    geometry: null as { type: 'LineString'; coordinates: [number, number][] } | null,
    source: 'none' as 'mapbox' | 'haversine' | 'none',
    lastUpdatedAt: new Date().toISOString(),
  };

  if (
    customerLat != null &&
    customerLng != null &&
    driverLat != null &&
    driverLng != null
  ) {
    let directions: Awaited<ReturnType<typeof getDirections>> = null;
    try {
      directions = await getDirections(
        { lat: driverLat, lng: driverLng },
        { lat: customerLat, lng: customerLng },
      );
    } catch (err) {
      console.warn('[driver/jobs/route] Mapbox directions failed', err);
    }

    if (directions) {
      result.distanceMiles = Math.round(metersToMiles(directions.distance) * 100) / 100;
      result.durationMinutes = secondsToMinutes(directions.duration);
      result.geometry = {
        type: 'LineString',
        coordinates: directions.geometry.coordinates,
      };
      result.source = 'mapbox';
    } else {
      const miles = haversineDistanceMiles(
        { lat: driverLat, lng: driverLng },
        { lat: customerLat, lng: customerLng },
      );
      result.distanceMiles = Math.round(miles * 10) / 10;
      result.durationMinutes = Math.max(1, Math.round((miles / 25) * 60));
      result.geometry = {
        type: 'LineString',
        coordinates: [
          [driverLng, driverLat],
          [customerLng, customerLat],
        ],
      };
      result.source = 'haversine';
    }
  }

  return NextResponse.json(result);
}
