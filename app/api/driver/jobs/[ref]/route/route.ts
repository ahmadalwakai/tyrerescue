import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { requireDriverMobile } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { getDriverNavigationDirections } from '@/lib/driver-navigation-directions';
import { isValidCoord, type DirectionsRoute } from '@/driver-app/src/services/directions';
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
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
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
        eq(bookings.driverId, driverId),
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
  const originLat = url.searchParams.get('originLat');
  const originLng = url.searchParams.get('originLng');
  const rawLat = originLat ?? url.searchParams.get('lat');
  const rawLng = originLng ?? url.searchParams.get('lng');
  const driverLat = toNumber(rawLat);
  const driverLng = toNumber(rawLng);
  const navigationRequested = url.searchParams.get('navigation') === '1';
  const hasOrigin = rawLat != null || rawLng != null;
  const driverLocation = driverLat != null && driverLng != null
    ? { lat: driverLat, lng: driverLng } : null;
  if ((hasOrigin && !isValidCoord(driverLocation)) || (navigationRequested && !isValidCoord(driverLocation))) {
    return NextResponse.json({ error: 'A valid driver location is required.' }, { status: 400 });
  }
  const customerLocation = customerLat != null && customerLng != null
    ? { lat: customerLat, lng: customerLng } : null;
  if (navigationRequested && !isValidCoord(customerLocation)) {
    return NextResponse.json({ error: 'This booking does not have a valid customer location.' }, { status: 422 });
  }

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
    navigation: null as { version: 1; routes: DirectionsRoute[] } | null,
    lastUpdatedAt: new Date().toISOString(),
  };

  if (navigationRequested && driverLocation && customerLocation) {
    const rate = await checkRateLimit(`driver-navigation:${driverId}`, { limit: 30, windowMs: 60_000 });
    if (!rate.ok) return NextResponse.json({ error: 'Please wait before requesting another route.' }, {
      status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds), 'Cache-Control': 'private, no-store' },
    });
    const directions = await getDriverNavigationDirections(driverLocation, customerLocation, {
      language: url.searchParams.get('language') === 'ar' ? 'ar' : 'en',
      avoid: {
        motorways: url.searchParams.get('motorways') === 'avoid',
        tolls: url.searchParams.get('tolls') === 'avoid',
        ferries: url.searchParams.get('ferries') === 'avoid',
      },
    });
    if ('error' in directions) {
      return NextResponse.json({ error: directions.error.message, code: 'NAVIGATION_UNAVAILABLE' }, {
        status: 503, headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization' },
      });
    }
    const primary = directions.routes[0];
    result.distanceMiles = Math.round(metersToMiles(primary.distanceMeters) * 100) / 100;
    result.durationMinutes = secondsToMinutes(primary.durationSeconds);
    result.geometry = { type: 'LineString', coordinates: primary.geometry };
    result.source = 'mapbox';
    result.navigation = { version: 1, routes: directions.routes };
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization' } });
  }

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
    } catch {
      // The legacy distance estimate remains available; provider details stay private.
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

  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization' } });
}
