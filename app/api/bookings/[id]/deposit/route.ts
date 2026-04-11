import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { stripe } from '@/lib/stripe';

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
    
    // Check admin auth
    const session = await auth();
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
