import { NextResponse } from 'next/server';
import { getAppOrigin } from '@/lib/config/site';
import { requireAdminMobile } from '@/lib/auth';
import { db } from '@/lib/db';
import { quickBookings, bookings, payments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { createCheckoutSession } from '@/lib/stripe';

/**
 * POST /api/admin/quick-book/[id]/checkout-session
 *
 * Regenerates a fresh Stripe Checkout URL for a finalized quick booking that
 * is still awaiting full Stripe payment. Used when the admin cancels Stripe
 * Checkout and clicks "Retry Stripe Payment".
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await requireAdminMobile(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [qb] = await db
    .select()
    .from(quickBookings)
    .where(eq(quickBookings.id, id))
    .limit(1);

  if (!qb || !qb.bookingId) {
    return NextResponse.json({ error: 'Quick booking not finalized' }, { status: 404 });
  }

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, qb.bookingId))
    .limit(1);

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  if (booking.paymentType !== 'full' && booking.paymentType !== 'stripe') {
    return NextResponse.json(
      { error: `Booking is not configured for full Stripe payment (paymentType: ${booking.paymentType})` },
      { status: 400 }
    );
  }

  if (booking.status !== 'awaiting_payment') {
    return NextResponse.json(
      { error: `Cannot retry payment in status: ${booking.status}` },
      { status: 409 }
    );
  }

  const baseUrl = getAppOrigin();
  const customerEmail = booking.customerEmail || 'phone-booking@tyrerescue.uk';

  const checkout = await createCheckoutSession(
    Number(booking.totalAmount),
    {
      bookingId: booking.id,
      refNumber: booking.refNumber,
      customerEmail,
    },
    {
      successUrl: `${baseUrl}/admin/bookings/${booking.refNumber}?stripe=success`,
      cancelUrl: `${baseUrl}/admin/bookings/${booking.refNumber}?stripe=cancelled`,
    }
  );
  const expectedAmountPence = Math.round(Number(booking.totalAmount) * 100);
  if (checkout.amountInPence !== expectedAmountPence) {
    return NextResponse.json(
      {
        error: 'Payment amount mismatch',
        code: 'PAYMENT_AMOUNT_MISMATCH',
      },
      { status: 500 },
    );
  }

  await db
    .update(bookings)
    .set({ stripePiId: checkout.paymentIntentId || checkout.sessionId })
    .where(eq(bookings.id, booking.id));

  await db.insert(payments).values({
    id: uuidv4(),
    bookingId: booking.id,
    stripePiId: checkout.paymentIntentId || checkout.sessionId,
    amount: Number(booking.totalAmount).toFixed(2),
    currency: 'gbp',
    status: 'pending',
  });

  return NextResponse.json({
    checkoutUrl: checkout.checkoutUrl,
    sessionId: checkout.sessionId,
  });
}
