import { NextRequest, NextResponse } from 'next/server';
import { auth, requireAdminMobile } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createCheckoutSession, createPaymentIntent, getStripePaymentSource, StripePaymentConflict } from '@/lib/stripe';
import { getAppOrigin } from '@/lib/config/site';
import { recordPaymentEvent } from '@/lib/payments/payment-summary';
import { withStripePaymentLock } from '@/lib/payments/stripe-payment-lock';

const MIN_STRIPE_CHECKOUT_AMOUNT_PENCE = 30;

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

/**
 * POST /api/bookings/[id]/deposit
 * 
 * Creates a Stripe PaymentIntent for the 20% deposit on a booking.
 * - Validates the booking exists and is in valid state for deposit
 * - Computes deposit = 20% of total in pence
 * - Creates PaymentIntent with idempotency key
 * - Returns clientSecret for Stripe Elements
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: bookingId } = await params;

    // Check admin auth. Web Quick Book uses the NextAuth session; the Expo
    // assisted-chat app uses the existing mobile Bearer token.
    try {
      await requireAdminMobile(request);
    } catch {
      const session = await auth();
      if (!session || session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json().catch(() => ({})) as { mode?: unknown };
    const mode = body.mode === 'checkout' ? 'checkout' : 'elements';

    // Load the booking
    let [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    return await withStripePaymentLock(booking.id, async () => {
    [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

    // Validate booking is in correct state for deposit payment
    if (booking.paymentType !== 'deposit') {
      return NextResponse.json(
        { error: 'Booking is not configured for deposit payment' },
        { status: 400 }
      );
    }

    if (booking.depositPaidAt) {
      return NextResponse.json(
        { error: 'Deposit has already been paid' },
        { status: 400 }
      );
    }

    if (!['awaiting_payment', 'payment_failed'].includes(booking.status)) {
      return NextResponse.json(
        { error: `Cannot collect deposit for booking in status: ${booking.status}` },
        { status: 400 }
      );
    }

    // Calculate deposit if not already stored
    const totalInPence = Math.round(Number(booking.totalAmount) * 100);
    const depositAmountPence = booking.depositAmountPence ?? Math.round(totalInPence * 0.20);
    const remainingBalancePence = totalInPence - depositAmountPence;

    if (depositAmountPence < MIN_STRIPE_CHECKOUT_AMOUNT_PENCE) {
      return NextResponse.json(
        {
          error: `Deposit payment links need a deposit of at least ${formatPence(MIN_STRIPE_CHECKOUT_AMOUNT_PENCE)}. Current deposit is ${formatPence(depositAmountPence)}.`,
          code: 'DEPOSIT_AMOUNT_TOO_LOW',
          amountPence: depositAmountPence,
          minimumAmountPence: MIN_STRIPE_CHECKOUT_AMOUNT_PENCE,
        },
        { status: 400 },
      );
    }

    if (mode === 'checkout') {
      const baseUrl = getAppOrigin();
      const checkout = await createCheckoutSession(
        depositAmountPence / 100,
        {
          bookingId,
          refNumber: booking.refNumber,
          customerEmail: booking.customerEmail,
          source: getStripePaymentSource(request),
          type: 'deposit',
        },
        {
          purpose: 'deposit',
          existingStripeRef: booking.stripeDepositPiId,
          description: `Deposit payment. Balance due on-site: £${(remainingBalancePence / 100).toFixed(2)}`,
          successUrl: `${baseUrl}/admin/bookings/${booking.refNumber}?deposit=success`,
          cancelUrl: `${baseUrl}/admin/bookings/${booking.refNumber}?deposit=cancelled`,
        },
      );

      const paymentIntentId = checkout.paymentIntentId;

      await db
        .update(bookings)
        .set({
          stripeDepositPiId: paymentIntentId ?? checkout.sessionId,
          depositAmountPence,
          remainingBalancePence,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId));

      await recordPaymentEvent({
        bookingId,
        bookingRef: booking.refNumber,
        eventType: 'link_sent',
        paymentMethod: 'deposit_link',
        linkStatus: 'sent',
        amountPence: depositAmountPence,
        currency: 'gbp',
        stripeSessionId: checkout.sessionId,
        stripePaymentIntentId: paymentIntentId,
        stripeCheckoutUrl: checkout.checkoutUrl,
        source: getStripePaymentSource(request),
        status: 'pending',
        expiresAt: checkout.expiresAt,
        metadata: { kind: 'deposit_checkout', type: 'deposit', remainingBalancePence },
      });

      return NextResponse.json({
        checkoutUrl: checkout.checkoutUrl,
        sessionId: checkout.sessionId,
        paymentIntentId,
        depositAmountPence,
        remainingBalancePence,
        depositAmount: depositAmountPence / 100,
        remainingBalance: remainingBalancePence / 100,
      });
    }

    const paymentIntent = await createPaymentIntent(
      depositAmountPence / 100,
      {
          bookingId,
          refNumber: booking.refNumber,
          type: 'deposit',
          customerEmail: booking.customerEmail,
          source: getStripePaymentSource(request),
      },
      { existingStripeRef: booking.stripeDepositPiId },
    );

    // Store the PaymentIntent ID on the booking
    await db
      .update(bookings)
      .set({
        stripeDepositPiId: paymentIntent.paymentIntentId,
        depositAmountPence,
        remainingBalancePence,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId));

    await recordPaymentEvent({
      bookingId,
      bookingRef: booking.refNumber,
      eventType: 'link_created',
      paymentMethod: 'deposit_link',
      linkStatus: 'created',
      amountPence: depositAmountPence,
      currency: 'gbp',
      stripePaymentIntentId: paymentIntent.paymentIntentId,
      source: getStripePaymentSource(request),
      status: 'pending',
      metadata: { kind: 'deposit_payment_intent', type: 'deposit', mode: 'elements', remainingBalancePence },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.clientSecret,
      paymentIntentId: paymentIntent.paymentIntentId,
      depositAmountPence,
      remainingBalancePence,
      depositAmount: depositAmountPence / 100,
      remainingBalance: remainingBalancePence / 100,
    });
    });
  } catch (error) {
    if (error instanceof StripePaymentConflict) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error('[deposit] Error:', error);
    
    // Handle Stripe errors
    if (error instanceof Error && 'type' in error) {
      const stripeError = error as { type: string; message: string };
      if (stripeError.type === 'StripeCardError') {
        return NextResponse.json(
          { error: stripeError.message },
          { status: 402 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to create deposit payment' },
      { status: 500 }
    );
  }
}
