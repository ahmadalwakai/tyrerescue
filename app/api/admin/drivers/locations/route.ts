import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, drivers, users, bookings } from '@/lib/db';
import { eq, and, inArray } from 'drizzle-orm';

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
    const activeStatuses = ['driver_assigned', 'en_route', 'arrived', 'in_progress'];

    const activeBookings = driverIds.length
      ? await db
          .select({
            driverId: bookings.driverId,
            refNumber: bookings.refNumber,
            status: bookings.status,
            customerName: bookings.customerName,
            addressLine: bookings.addressLine,
            lat: bookings.lat,
            lng: bookings.lng,
          })
          .from(bookings)
          .where(
            and(
              inArray(bookings.driverId, driverIds),
              inArray(bookings.status, activeStatuses),
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

    const result = rows.map((d) => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      isOnline: d.isOnline,
      status: d.status,
      currentLat: d.currentLat?.toString() ?? null,
      currentLng: d.currentLng?.toString() ?? null,
      locationAt: d.locationAt?.toISOString() ?? null,
      locationSource: d.locationSource,
      activeBookings: (bookingsByDriver.get(d.id) ?? []).map((b) => ({
        refNumber: b.refNumber,
        status: b.status,
        customerName: b.customerName,
        addressLine: b.addressLine,
        lat: b.lat?.toString() ?? null,
        lng: b.lng?.toString() ?? null,
      })),
    }));

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
