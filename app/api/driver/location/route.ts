import { NextResponse } from 'next/server';
import { requireDriverMobile } from '@/lib/auth';
import { db, drivers, driverLocationHistory, bookings } from '@/lib/db';
import { eq, and, inArray } from 'drizzle-orm';

export async function POST(request: Request) {
  try {
    const { driverId } = await requireDriverMobile(request);
    const { lat, lng } = await request.json();

    // Validate coordinates
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return NextResponse.json(
        { error: 'lat and lng must be numbers' },
        { status: 400 }
      );
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: 'Invalid coordinates' },
        { status: 400 }
      );
    }

    // Get driver record
    const [driver] = await db
      .select({ id: drivers.id, isOnline: drivers.isOnline })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);

    if (!driver) {
      return NextResponse.json(
        { error: 'Driver record not found' },
        { status: 404 }
      );
    }

    // Accept location updates even if the driver toggled offline.
    // The heartbeat keeps locationAt fresh which the backend presence
    // evaluator uses for staleness calculations.
    // If the driver explicitly went offline AND has no active booking,
    // we still record the update — it's harmless and keeps data fresh.
    // The presence evaluator (lib/driver-presence.ts) decides the
    // effective state.

    // Update driver location
    await db
      .update(drivers)
      .set({
        currentLat: lat.toString(),
        currentLng: lng.toString(),
        locationAt: new Date(),
      })
      .where(eq(drivers.id, driver.id));

    // Record location history (find active booking if any)
    const [activeBooking] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.driverId, driver.id),
          inArray(bookings.status, ['driver_assigned', 'en_route', 'arrived', 'in_progress'])
        )
      )
      .limit(1);

    await db.insert(driverLocationHistory).values({
      driverId: driver.id,
      bookingId: activeBooking?.id ?? null,
      lat: lat.toString(),
      lng: lng.toString(),
    });

    return NextResponse.json({
      success: true,
      lat,
      lng,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error updating driver location:', error);
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'Driver access required' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update location' },
      { status: 500 }
    );
  }
}
