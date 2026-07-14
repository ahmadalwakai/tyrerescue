import { NextRequest } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { requireAdminMobile } from '@/lib/auth';
import { expoDevCorsPreflight, jsonWithExpoDevCors } from '@/lib/api/dev-cors';
import { db } from '@/lib/db';
import { bookings, drivers, users } from '@/lib/db/schema';
import {
  getDirections,
  haversineDistanceMiles,
  metersToMiles,
  secondsToMinutes,
} from '@/lib/mapbox';
import { GARAGE_LOCATION } from '@/lib/garage';
import {
  calculateDriverSituation,
  estimateUrbanDriveMinutesFromMiles,
  type DriverSituation,
} from '@/lib/admin/driverSituation';

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
  driverSituation: DriverSituation;
}

const STALE_AFTER_SECONDS = 180;

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
    return jsonWithExpoDevCors(request, { error: 'Unauthorized' }, { status: 401 });
  }

  const { ref } = await context.params;
  if (!ref) {
    return jsonWithExpoDevCors(request, { error: 'Missing ref' }, { status: 400 });
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
      serviceType: bookings.serviceType,
      tyreCount: bookings.quantity,
      paymentType: bookings.paymentType,
      driverId: drivers.id,
      driverName: users.name,
      driverPhone: users.phone,
      driverLat: drivers.currentLat,
      driverLng: drivers.currentLng,
      driverLocationAt: drivers.locationAt,
      driverIsOnline: drivers.isOnline,
      driverStatus: drivers.status,
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
    return jsonWithExpoDevCors(request, { error: 'Not found' }, { status: 404 });
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
    driverSituation: calculateDriverSituation({
      jobRef: row.bookingRef,
      driverId: row.driverId,
      bookingStatus: row.status,
      driverIsOnline: row.driverIsOnline ?? false,
      driverStatus: row.driverStatus ?? null,
      lastLocationAt: row.driverLocationAt ?? null,
      outboundMinutes: null,
      returnMinutes:
        customerLat != null && customerLng != null
          ? estimateUrbanDriveMinutesFromMiles(
              haversineDistanceMiles(
                { lat: customerLat, lng: customerLng },
                { lat: GARAGE_LOCATION.lat, lng: GARAGE_LOCATION.lng },
              ),
            )
          : null,
      trafficDelayMinutes: null,
      serviceType: row.serviceType ?? null,
      tyreCount: row.tyreCount ?? null,
      paymentStatus: row.paymentType ?? null,
      gpsState: isStale ? 'weak' : 'normal',
      returnEstimateAvailable: customerLat != null && customerLng != null,
      routeAvailable: false,
      garageConfigured: true,
    }),
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
      // Do not draw a fake straight route when Mapbox Directions is unavailable.
      // Keep the fallback estimate, but leave geometry empty so clients can show
      // pins/status without implying this is the road path.
      response.geometry = null;
      response.source = 'haversine';
    }

    response.driverSituation = calculateDriverSituation({
      jobRef: row.bookingRef,
      driverId: row.driverId,
      bookingStatus: row.status,
      driverIsOnline: row.driverIsOnline ?? false,
      driverStatus: row.driverStatus ?? null,
      lastLocationAt: row.driverLocationAt ?? null,
      outboundMinutes: response.durationMinutes,
      returnMinutes: estimateUrbanDriveMinutesFromMiles(
        haversineDistanceMiles(
          { lat: customerLat, lng: customerLng },
          { lat: GARAGE_LOCATION.lat, lng: GARAGE_LOCATION.lng },
        ),
      ),
      trafficDelayMinutes: null,
      serviceType: row.serviceType ?? null,
      tyreCount: row.tyreCount ?? null,
      paymentStatus: row.paymentType ?? null,
      gpsState: isStale ? 'weak' : 'normal',
      returnEstimateAvailable: true,
      routeAvailable: response.durationMinutes != null,
      garageConfigured: true,
    });
  }

  return jsonWithExpoDevCors(request, response);
}

export async function OPTIONS(request: NextRequest) {
  return expoDevCorsPreflight(request);
}
