import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { getTrackingSessionByDriverToken, toPublicState } from '@/lib/tracking-session';

/**
 * Public read endpoint for the driver web page. The token IS the auth —
 * no admin session required. Returns the public projection plus the
 * customer destination so the driver map can draw both pins and the
 * route between them.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const session = await getTrackingSessionByDriverToken(token);
  if (!session) {
    return NextResponse.json({ error: 'Tracking session not found' }, { status: 404 });
  }
  const [booking] = await db
    .select({
      refNumber: bookings.refNumber,
      addressLine: bookings.addressLine,
      lat: bookings.lat,
      lng: bookings.lng,
      customerPhone: bookings.customerPhone,
    })
    .from(bookings)
    .where(eq(bookings.id, session.bookingId))
    .limit(1);

  return NextResponse.json({
    bookingId: session.bookingId,
    refNumber: booking?.refNumber ?? null,
    customerAddress: booking?.addressLine ?? null,
    customerLat: booking?.lat != null ? Number(booking.lat) : null,
    customerLng: booking?.lng != null ? Number(booking.lng) : null,
    customerPhone: booking?.customerPhone ?? null,
    state: toPublicState(session),
  });
}
