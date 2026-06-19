import { NextRequest, NextResponse } from 'next/server';
import { auth, requireAdminMobile } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { stripe } from '@/lib/stripe';
import { getAppOrigin } from '@/lib/config/site';
import { recordPaymentEvent } from '@/lib/payments/payment-summary';

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
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

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

    if (booking.status !== 'awaiting_payment') {
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
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: booking.customerEmail !== 'phone-booking@tyrerescue.uk'
          ? booking.customerEmail
          : undefined,
        line_items: [
          {
            price_data: {
              currency: 'gbp',
              unit_amount: depositAmountPence,
              product_data: {
                name: `Tyre Rescue deposit — ${booking.refNumber}`,
                description: `Deposit payment. Balance due on-site: £${(remainingBalancePence / 100).toFixed(2)}`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          bookingId,
          refNumber: booking.refNumber,
          type: 'deposit',
        },
        payment_intent_data: {
          metadata: {
            bookingId,
            refNumber: booking.refNumber,
            type: 'deposit',
            customerEmail: booking.customerEmail,
          },
        },
        success_url: `${baseUrl}/admin/bookings/${booking.refNumber}?deposit=success`,
        cancel_url: `${baseUrl}/admin/bookings/${booking.refNumber}?deposit=cancelled`,
      });

      const paymentIntentId =
        typeof session.payment_intent === 'string' ? session.payment_intent : null;

      await db
        .update(bookings)
        .set({
          stripeDepositPiId: paymentIntentId,
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
        stripeSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        stripeCheckoutUrl: session.url,
        source: 'admin',
        status: 'pending',
        expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
        metadata: { kind: 'deposit_checkout', remainingBalancePence },
      });

      return NextResponse.json({
        checkoutUrl: session.url,
        sessionId: session.id,
        paymentIntentId,
        depositAmountPence,
        remainingBalancePence,
        depositAmount: depositAmountPence / 100,
        remainingBalance: remainingBalancePence / 100,
      });
    }

    // Create PaymentIntent with idempotency key to prevent duplicates
    const idempotencyKey = `deposit_${bookingId}`;
    
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: depositAmountPence,
        currency: 'gbp',
        metadata: {
          bookingId,
          refNumber: booking.refNumber,
          type: 'deposit',
          customerEmail: booking.customerEmail,
        },
        automatic_payment_methods: {
          enabled: true,
        },
      },
      {
        idempotencyKey,
      }
    );

    // Store the PaymentIntent ID on the booking
    await db
      .update(bookings)
      .set({
        stripeDepositPiId: paymentIntent.id,
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
      stripePaymentIntentId: paymentIntent.id,
      source: 'admin',
      status: paymentIntent.status,
      metadata: { kind: 'deposit_payment_intent', mode: 'elements', remainingBalancePence },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      depositAmountPence,
      remainingBalancePence,
      depositAmount: depositAmountPence / 100,
      remainingBalance: remainingBalancePence / 100,
    });
  } catch (error) {
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
