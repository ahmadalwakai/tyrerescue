import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, drivers, users, bookings } from '@/lib/db';
import { eq, and, inArray } from 'drizzle-orm';
import { GARAGE_LOCATION } from '@/lib/garage';
import { haversineDistanceMiles } from '@/lib/mapbox';
import {
  ACTIVE_DRIVER_SITUATION_STATUSES,
  calculateDriverSituation,
  estimateUrbanDriveMinutesFromMiles,
} from '@/lib/admin/driverSituation';

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function estimateDriveMinutes(
  from: { lat: number | null; lng: number | null },
  to: { lat: number | null; lng: number | null },
): number | null {
  if (from.lat == null || from.lng == null || to.lat == null || to.lng == null) return null;
  return estimateUrbanDriveMinutesFromMiles(
    haversineDistanceMiles(
      { lat: from.lat, lng: from.lng },
      { lat: to.lat, lng: to.lng },
    ),
  );
}

/**
 * GET /api/admin/drivers/locations
 * Returns all drivers with their live location + presence state.
 * Used by admin to see driver positions on map before/after assignment.
 */
export async function GET() {
  try {
    await requireAdmin();

    const rows = await db
      .select({
        id: drivers.id,
        name: users.name,
        phone: users.phone,
        isOnline: drivers.isOnline,
        status: drivers.status,
        currentLat: drivers.currentLat,
        currentLng: drivers.currentLng,
        locationAt: drivers.locationAt,
        locationSource: drivers.locationSource,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id));

    // Find active bookings per driver
    const driverIds = rows.map((r) => r.id);

    const activeBookings = driverIds.length
      ? await db
          .select({
            driverId: bookings.driverId,
            refNumber: bookings.refNumber,
            status: bookings.status,
            serviceType: bookings.serviceType,
            quantity: bookings.quantity,
            paymentType: bookings.paymentType,
            customerName: bookings.customerName,
            addressLine: bookings.addressLine,
            lat: bookings.lat,
            lng: bookings.lng,
          })
          .from(bookings)
          .where(
            and(
              inArray(bookings.driverId, driverIds),
              inArray(bookings.status, [...ACTIVE_DRIVER_SITUATION_STATUSES]),
            ),
          )
      : [];

    const bookingsByDriver = new Map<string, typeof activeBookings>();
    for (const b of activeBookings) {
      if (!b.driverId) continue;
      const arr = bookingsByDriver.get(b.driverId) ?? [];
      arr.push(b);
      bookingsByDriver.set(b.driverId, arr);
    }

    const result = rows.map((d) => {
      const driverLat = toNumber(d.currentLat);
      const driverLng = toNumber(d.currentLng);
      const activeForDriver = bookingsByDriver.get(d.id) ?? [];
      const activeBookingsWithSituation = activeForDriver.map((b) => {
        const customerLat = toNumber(b.lat);
        const customerLng = toNumber(b.lng);
        const outboundMinutes = estimateDriveMinutes(
          { lat: driverLat, lng: driverLng },
          { lat: customerLat, lng: customerLng },
        );
        const returnMinutes = estimateDriveMinutes(
          { lat: customerLat, lng: customerLng },
          GARAGE_LOCATION,
        );
        const driverSituation = calculateDriverSituation({
          jobRef: b.refNumber,
          driverId: d.id,
          bookingStatus: b.status,
          driverIsOnline: d.isOnline,
          driverStatus: d.status,
          lastLocationAt: d.locationAt,
          outboundMinutes,
          returnMinutes,
          serviceType: b.serviceType,
          tyreCount: b.quantity,
          paymentStatus: b.paymentType,
          returnEstimateAvailable: returnMinutes != null,
          routeAvailable: outboundMinutes != null,
          garageConfigured: true,
        });

        return {
          refNumber: b.refNumber,
          status: b.status,
          customerName: b.customerName,
          addressLine: b.addressLine,
          lat: b.lat?.toString() ?? null,
          lng: b.lng?.toString() ?? null,
          driverSituation,
        };
      });

      return {
        id: d.id,
        name: d.name,
        phone: d.phone,
        isOnline: d.isOnline,
        status: d.status,
        currentLat: d.currentLat?.toString() ?? null,
        currentLng: d.currentLng?.toString() ?? null,
        locationAt: d.locationAt?.toISOString() ?? null,
        locationSource: d.locationSource,
        driverSituation: activeBookingsWithSituation[0]?.driverSituation ?? null,
        activeBookings: activeBookingsWithSituation,
      };
    });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
