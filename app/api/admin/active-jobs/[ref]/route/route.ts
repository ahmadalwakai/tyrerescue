import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { requireAdminMobile } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookings, drivers, users } from '@/lib/db/schema';
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

interface RouteResponse {
  bookingRef: string;
  status: string;
  driver: {
    id: string;
    name: string | null;
    phone: string | null;
  } | null;
  driverLocation: {
    lat: number;
    lng: number;
    locationAt: string | null;
    isStale: boolean;
  } | null;
  customer: {
    name: string | null;
    phone: string | null;
  } | null;
  customerLocation: {
    lat: number;
    lng: number;
    address: string | null;
  } | null;
  distanceMiles: number | null;
  durationMinutes: number | null;
  geometry:
    | {
        type: 'LineString';
        coordinates: [number, number][];
      }
    | null;
  source: 'mapbox' | 'haversine' | 'none';
  lastUpdatedAt: string;
}

const STALE_AFTER_SECONDS = 90;

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ref: string }> },
) {
  try {
    await requireAdminMobile(request);
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
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
      customerLat: bookings.lat,
      customerLng: bookings.lng,
      driverId: drivers.id,
      driverName: users.name,
      driverPhone: users.phone,
      driverLat: drivers.currentLat,
      driverLng: drivers.currentLng,
      driverLocationAt: drivers.locationAt,
    })
    .from(bookings)
    .innerJoin(drivers, eq(drivers.id, bookings.driverId))
    .innerJoin(users, eq(users.id, drivers.userId))
    .where(
      and(
        eq(bookings.refNumber, ref),
        inArray(bookings.status, [...ACTIVE_STATUSES]),
      ),
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const customerLat = toNumber(row.customerLat);
  const customerLng = toNumber(row.customerLng);
  const driverLat = toNumber(row.driverLat);
  const driverLng = toNumber(row.driverLng);

  const now = Date.now();
  const driverLocationAtIso = row.driverLocationAt
    ? new Date(row.driverLocationAt).toISOString()
    : null;
  const isStale =
    !row.driverLocationAt ||
    (now - new Date(row.driverLocationAt).getTime()) / 1000 > STALE_AFTER_SECONDS;

  const response: RouteResponse = {
    bookingRef: row.bookingRef,
    status: row.status,
    driver: {
      id: row.driverId,
      name: row.driverName ?? null,
      phone: row.driverPhone ?? null,
    },
    driverLocation:
      driverLat != null && driverLng != null
        ? {
            lat: driverLat,
            lng: driverLng,
            locationAt: driverLocationAtIso,
            isStale,
          }
        : null,
    customer: {
      name: row.customerName ?? null,
      phone: row.customerPhone ?? null,
    },
    customerLocation:
      customerLat != null && customerLng != null
        ? {
            lat: customerLat,
            lng: customerLng,
            address: row.addressLine ?? null,
          }
        : null,
    distanceMiles: null,
    durationMinutes: null,
    geometry: null,
    source: 'none',
    lastUpdatedAt: new Date(now).toISOString(),
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
      console.warn('[admin/active-jobs/route] Mapbox directions failed', err);
    }

    if (directions) {
      response.distanceMiles =
        Math.round(metersToMiles(directions.distance) * 100) / 100;
      response.durationMinutes = secondsToMinutes(directions.duration);
      response.geometry = {
        type: 'LineString',
        coordinates: directions.geometry.coordinates,
      };
      response.source = 'mapbox';
    } else {
      const miles = haversineDistanceMiles(
        { lat: driverLat, lng: driverLng },
        { lat: customerLat, lng: customerLng },
      );
      response.distanceMiles = Math.round(miles * 10) / 10;
      response.durationMinutes = Math.max(1, Math.round((miles / 25) * 60));
      response.geometry = {
        type: 'LineString',
        coordinates: [
          [driverLng, driverLat],
          [customerLng, customerLat],
        ],
      };
      response.source = 'haversine';
    }
  }

  return NextResponse.json(response);
}
