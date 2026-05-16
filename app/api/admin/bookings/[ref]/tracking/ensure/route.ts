import { NextResponse } from 'next/server';
import { requireAdminMobile } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ensureTrackingSession, toPublicState } from '@/lib/tracking-session';
import { resolveRequestOrigin } from '@/lib/config/site';

export interface EnsureTrackingResponse {
  bookingId: string;
  refNumber: string | null;
  customerAddress: string | null;
  customerLat: number | null;
  customerLng: number | null;
  customerToken: string;
  driverToken: string;
  customerUrl: string;
  driverUrl: string;
  state: ReturnType<typeof toPublicState>;
}

/**
 * Idempotently ensure a tracking session exists for the booking and return
 * the public tracking URLs. Safe to call multiple times — tokens are stable.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ ref: string }> }
): Promise<NextResponse<EnsureTrackingResponse | { error: string }>> {
  try {
    await requireAdminMobile(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ref: bookingId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) {
    return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 });
  }

  const [booking] = await db
    .select({
      id: bookings.id,
      refNumber: bookings.refNumber,
      addressLine: bookings.addressLine,
      lat: bookings.lat,
      lng: bookings.lng,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const session = await ensureTrackingSession(bookingId);
  const siteUrl = resolveRequestOrigin(request);

  return NextResponse.json({
    bookingId,
    refNumber: booking.refNumber ?? null,
    customerAddress: booking.addressLine ?? null,
    customerLat: booking.lat != null ? Number(booking.lat) : null,
    customerLng: booking.lng != null ? Number(booking.lng) : null,
    customerToken: session.customerToken,
    driverToken: session.driverToken,
    customerUrl: `${siteUrl}/track/customer/${session.customerToken}`,
    driverUrl: `${siteUrl}/track/driver/${session.driverToken}`,
    state: toPublicState(session),
  });
}
