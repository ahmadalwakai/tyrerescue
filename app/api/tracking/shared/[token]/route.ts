import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookings, drivers, users } from '@/lib/db/schema';
import { getTrackingSessionByBookingId } from '@/lib/tracking-session';
import { sharedTrackingBookingId, verifySharedTrackingToken } from '@/lib/tracking/shared-access';
import { latestDriverLocation } from '@/lib/tracking/location-sample';

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bookingId = sharedTrackingBookingId(token);
  const session = bookingId ? await getTrackingSessionByBookingId(bookingId) : null;
  if (!session || !(await verifySharedTrackingToken(token, session))) return NextResponse.json({ error: 'This tracking link has expired or was revoked.' }, { status: 404 });
  const [booking] = await db.select({ status: bookings.status, lat: bookings.lat, lng: bookings.lng, driverId: bookings.driverId }).from(bookings).where(eq(bookings.id, session.bookingId)).limit(1);
  if (!booking) return NextResponse.json({ error: 'Tracking is unavailable.' }, { status: 404 });
  const live = !['completed', 'cancelled', 'cancelled_refund_pending', 'refunded', 'refunded_partial'].includes(booking.status);
  const [driver] = booking.driverId && live ? await db.select({ lat: drivers.currentLat, lng: drivers.currentLng, locationAt: drivers.locationAt, name: users.name }).from(drivers).innerJoin(users, eq(users.id, drivers.userId)).where(eq(drivers.id, booking.driverId)).limit(1) : [];
  const location = live ? latestDriverLocation([
    { lat: session.lastLatitude, lng: session.lastLongitude, updatedAt: session.lastUpdatedAt },
    { lat: driver?.lat, lng: driver?.lng, updatedAt: driver?.locationAt },
  ]) : null;
  const updatedAt = location?.updatedAt ?? null;
  const fresh = live && updatedAt && Date.now() - updatedAt.getTime() <= 180_000;
  // Family links expose only location/status. No booking reference, contact,
  // address, invoice, conversation, or internal dispatch notes are included.
  return NextResponse.json({ status: booking.status, customerLat: Number(booking.lat), customerLng: Number(booking.lng),
    driverLat: fresh ? location?.lat ?? null : null,
    driverLng: fresh ? location?.lng ?? null : null,
    driverName: driver?.name?.split(' ')[0] ?? null, driverLocationAt: updatedAt?.toISOString() ?? null,
  }, { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
}
