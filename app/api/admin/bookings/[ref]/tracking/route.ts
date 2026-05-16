import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { requireAdminMobile } from '@/lib/auth';
import { getTrackingSessionByBookingId, toPublicState } from '@/lib/tracking-session';
import { resolveRequestOrigin } from '@/lib/config/site';

export interface AdminTrackingResponse {
  exists: boolean;
  bookingId: string;
  refNumber?: string | null;
  customerAddress?: string | null;
  customerLat?: number | null;
  customerLng?: number | null;
  customerToken?: string;
  driverToken?: string;
  customerUrl?: string;
  driverUrl?: string;
  state?: ReturnType<typeof toPublicState>;
}

/**
 * Admin polling endpoint: returns latest tracking state for a booking
 * including the customer destination so the assisted-chat operator card
 * can render a live map. Returns `{ exists: false }` if no tracking
 * session has been created yet.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ ref: string }> }
): Promise<NextResponse<AdminTrackingResponse | { error: string }>> {
  try {
    await requireAdminMobile(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ref: bookingId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) {
    return NextResponse.json({ error: 'Invalid booking id' }, { status: 400 });
  }

  const session = await getTrackingSessionByBookingId(bookingId);
  if (!session) {
    return NextResponse.json({ exists: false, bookingId });
  }

  const [booking] = await db
    .select({
      refNumber: bookings.refNumber,
      addressLine: bookings.addressLine,
      lat: bookings.lat,
      lng: bookings.lng,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  const siteUrl = resolveRequestOrigin(request);
  return NextResponse.json({
    exists: true,
    bookingId,
    refNumber: booking?.refNumber ?? null,
    customerAddress: booking?.addressLine ?? null,
    customerLat: booking?.lat != null ? Number(booking.lat) : null,
    customerLng: booking?.lng != null ? Number(booking.lng) : null,
    customerToken: session.customerToken,
    driverToken: session.driverToken,
    customerUrl: `${siteUrl}/track/customer/${session.customerToken}`,
    driverUrl: `${siteUrl}/track/driver/${session.driverToken}`,
    state: toPublicState(session),
  });
}
