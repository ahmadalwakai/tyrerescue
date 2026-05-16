import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, drivers, users } from '@/lib/db/schema';
import { getTrackingSessionByCustomerToken, toPublicState } from '@/lib/tracking-session';

/**
 * Public read endpoint for the customer tracking page. Exposes the
 * driver's latest location plus the customer's drop-off so the map can
 * draw both pins. No tokens are returned.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const session = await getTrackingSessionByCustomerToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Tracking link not found or expired' }, { status: 404 });
  }

  const [booking] = await db
    .select({
      refNumber: bookings.refNumber,
      addressLine: bookings.addressLine,
      lat: bookings.lat,
      lng: bookings.lng,
      driverId: bookings.driverId,
    })
    .from(bookings)
    .where(eq(bookings.id, session.bookingId))
    .limit(1);

  let driverName: string | null = null;
  if (booking?.driverId) {
    const [driver] = await db
      .select({ name: users.name })
      .from(drivers)
      .innerJoin(users, eq(users.id, drivers.userId))
      .where(eq(drivers.id, booking.driverId))
      .limit(1);
    driverName = driver?.name ?? null;
  }

  return NextResponse.json({
    refNumber: booking?.refNumber ?? null,
    customerAddress: booking?.addressLine ?? null,
    customerLat: booking?.lat != null ? Number(booking.lat) : null,
    customerLng: booking?.lng != null ? Number(booking.lng) : null,
    driverName,
    state: toPublicState(session),
  });
}
