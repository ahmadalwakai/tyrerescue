import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { drivers, users, bookings } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { shouldDriverAppearOnline, canDriverReceiveNewBooking } from '@/lib/driver-presence';

/**
 * GET /api/driver/status/available
 * 
 * Public endpoint to check if any driver is currently available.
 * Used by the booking wizard to show driver availability status.
 *
 * Uses the backend presence evaluator instead of raw isOnline flag.
 */
export async function GET() {
  try {
    // Fetch all drivers that have ever gone online (isOnline=true OR have locationAt)
    const allDrivers = await db
      .select({
        id: drivers.id,
        name: users.name,
        isOnline: drivers.isOnline,
        locationAt: drivers.locationAt,
        status: drivers.status,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id))
      .limit(20);

    // Fetch active bookings for all drivers in one query
    const activeBookings = await db
      .select({
        driverId: bookings.driverId,
        status: bookings.status,
      })
      .from(bookings)
      .where(
        inArray(bookings.status, ['driver_assigned', 'en_route', 'arrived', 'in_progress'])
      );

    const activeBookingMap = new Map<string, { status: string }>();
    for (const ab of activeBookings) {
      if (ab.driverId) activeBookingMap.set(ab.driverId, { status: ab.status });
    }

    // Use presence evaluator to determine truly available drivers
    const availableDrivers = allDrivers.filter(d => {
      const activeBooking = activeBookingMap.get(d.id) ?? null;
      return canDriverReceiveNewBooking(
        { isOnline: d.isOnline ?? false, locationAt: d.locationAt, status: d.status },
        activeBooking,
      );
    });

    return NextResponse.json({
      available: availableDrivers.length > 0,
      count: availableDrivers.length,
      message: availableDrivers.length > 0
        ? `${availableDrivers.length} driver${availableDrivers.length > 1 ? 's' : ''} available now`
        : 'No drivers available at the moment',
    });
  } catch (error) {
    console.error('Error checking driver availability:', error);
    return NextResponse.json(
      { available: false, count: 0, message: 'Unable to check availability' },
      { status: 500 }
    );
  }
}
