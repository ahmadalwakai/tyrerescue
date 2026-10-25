import { eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeCustomerBooking } from '@/lib/customer-booking-access';
import { db } from '@/lib/db';
import { bookings, trackingSessions } from '@/lib/db/schema';
import { getOutboundUrl } from '@/lib/config/site';
import { ensureTrackingSession } from '@/lib/tracking-session';
import { signSharedTrackingToken } from '@/lib/tracking/shared-access';

async function accessibleBooking(request: NextRequest, ref: string) {
  const [booking] = await db.select({ id: bookings.id, refNumber: bookings.refNumber, userId: bookings.userId, sourceApp: bookings.sourceApp })
    .from(bookings).where(eq(bookings.refNumber, ref)).limit(1);
  return booking && await authorizeCustomerBooking(request, booking) ? booking : null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const booking = await accessibleBooking(request, (await params).ref);
  if (!booking) return NextResponse.json({ error: 'Booking access is required' }, { status: 403 });
  const session = await ensureTrackingSession(booking.id);
  const token = await signSharedTrackingToken(session);
  return NextResponse.json({ url: `${getOutboundUrl(booking.sourceApp)}/track/shared/${encodeURIComponent(token)}`, expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString() }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const booking = await accessibleBooking(request, (await params).ref);
  if (!booking) return NextResponse.json({ error: 'Booking access is required' }, { status: 403 });
  await db.update(trackingSessions).set({ shareVersion: sql`${trackingSessions.shareVersion} + 1`, updatedAt: new Date() }).where(eq(trackingSessions.bookingId, booking.id));
  return NextResponse.json({ ok: true });
}
