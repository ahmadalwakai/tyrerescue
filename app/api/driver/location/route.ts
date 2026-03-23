import { NextResponse } from 'next/server';
import { db, drivers, driverLocationHistory, bookings } from '@/lib/db';
import { eq, and, inArray } from 'drizzle-orm';
import { requireDriverMobile } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    // Determine authentication source — mobile JWT vs web session
    const authHeader = request.headers.get('authorization');
    const isMobileApp = !!(authHeader?.startsWith('Bearer '));

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

    const locationSource = isMobileApp ? 'mobile_app' : 'web_portal';

    // Get driver record
    const [driver] = await db
      .select({
        id: drivers.id,
        isOnline: drivers.isOnline,
        locationSource: drivers.locationSource,
        locationAt: drivers.locationAt,
      })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);

    if (!driver) {
      return NextResponse.json(
        { error: 'Driver record not found' },
        { status: 404 }
      );
    }

    // Web portal must NOT overwrite fresh mobile app location.
    // If the last source was mobile_app and it's less than 5 minutes old,
    // silently accept the web update for history but don't overwrite the
    // authoritative mobile location.
    const mobileLocationIsFresh =
      driver.locationSource === 'mobile_app' &&
      driver.locationAt &&
      (Date.now() - new Date(driver.locationAt).getTime()) < 5 * 60 * 1000;

    const shouldUpdatePrimary = isMobileApp || !mobileLocationIsFresh;

    if (shouldUpdatePrimary) {
      await db
        .update(drivers)
        .set({
          currentLat: lat.toString(),
          currentLng: lng.toString(),
          locationAt: new Date(),
          locationSource,
        })
        .where(eq(drivers.id, driver.id));
    }

    // Always record location history regardless of source
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
      source: locationSource,
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
