import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  bookings,
  bookingStatusHistory,
  payments,
  inventoryReservations,
  inventoryMovements,
  tyreProducts,
  bookingTyres,
} from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { constructWebhookEvent, stripe } from '@/lib/stripe';
import { createNotificationAndSend } from '@/lib/email/resend';
import {
  bookingConfirmed,
  paymentReceipt,
  adminNewBooking,
} from '@/lib/email/templates';
import { v4 as uuidv4 } from 'uuid';
import type Stripe from 'stripe';

// Disable body parsing - we need the raw body for signature verification
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Stripe Webhook Handler
 * 
 * Handles:
 * - payment_intent.succeeded: Update booking status, record payment, send emails
 * - payment_intent.payment_failed: Update payment status to failed
 * 
 * All handlers are idempotent - duplicate webhooks won't cause issues.
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      console.error('Webhook error: Missing stripe-signature header');
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = constructWebhookEvent(body, signature);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    // Still return 200 to prevent Stripe from retrying
    // We log the error for investigation
    return NextResponse.json({ received: true, error: 'Processing error logged' });
  }
}

/**
 * Handle payment_intent.succeeded event
 * 
 * This is idempotent - checking if payment already exists before processing.
 */
async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const paymentIntentId = paymentIntent.id;
  const bookingId = paymentIntent.metadata?.bookingId;
  const refNumber = paymentIntent.metadata?.refNumber;

  console.log(`Processing payment success for ${paymentIntentId}, booking ${bookingId}`);

  if (!bookingId) {
    console.error('Payment intent missing bookingId metadata:', paymentIntentId);
    return;
  }

  // Idempotency check: Check if payment already recorded
  const [existingPayment] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripePiId, paymentIntentId))
    .limit(1);

  if (existingPayment && existingPayment.status === 'succeeded') {
    console.log(`Payment ${paymentIntentId} already processed, skipping`);
    return;
  }

  // Get the booking
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) {
    console.error('Booking not found for payment:', bookingId);
    return;
  }

  // Only process if booking is awaiting payment
  if (booking.status !== 'awaiting_payment') {
    console.log(`Booking ${bookingId} not awaiting payment (status: ${booking.status}), skipping`);
    return;
  }

  // Record payment
  if (existingPayment) {
    // Update existing payment record
    await db
      .update(payments)
      .set({
        status: 'succeeded',
        stripePayload: paymentIntent as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, existingPayment.id));
  } else {
    // Create new payment record
    await db.insert(payments).values({
      id: uuidv4(),
      bookingId,
      stripePiId: paymentIntentId,
      amount: (paymentIntent.amount / 100).toString(),
      currency: paymentIntent.currency,
      status: 'succeeded',
      stripePayload: paymentIntent as unknown as Record<string, unknown>,
    });
  }

  // Update booking status to paid
  await db
    .update(bookings)
    .set({
      status: 'paid',
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId));

  // Record status history
  await db.insert(bookingStatusHistory).values({
    id: uuidv4(),
    bookingId,
    fromStatus: 'awaiting_payment',
    toStatus: 'paid',
    actorUserId: null,
    actorRole: 'system',
    note: `Payment confirmed via Stripe (${paymentIntentId})`,
  });

  // Mark inventory reservations as permanent (no longer soft-reserved)
  // The stock was already decremented during quote creation
  await db
    .update(inventoryReservations)
    .set({ released: false })
    .where(
      and(
        eq(inventoryReservations.bookingId, bookingId),
        eq(inventoryReservations.released, false)
      )
    );

  // Record inventory movements for audit
  const tyresInBooking = await db
    .select()
    .from(bookingTyres)
    .where(eq(bookingTyres.bookingId, bookingId));

  for (const bookingTyre of tyresInBooking) {
    const [tyre] = await db
      .select()
      .from(tyreProducts)
      .where(eq(tyreProducts.id, bookingTyre.tyreId!))
      .limit(1);

    if (tyre) {
      const stockAfter = bookingTyre.condition === 'new'
        ? (tyre.stockNew ?? 0)
        : (tyre.stockUsed ?? 0);

      await db.insert(inventoryMovements).values({
        id: uuidv4(),
        tyreId: bookingTyre.tyreId,
        bookingId,
        condition: bookingTyre.condition,
        movementType: 'sale',
        quantityDelta: -bookingTyre.quantity,
        stockAfter,
        actorUserId: null,
        note: `Sold via booking ${refNumber}`,
      });
    }
  }

  // Build tyre summary for email
  const tyreSummary = tyresInBooking.length > 0
    ? await buildTyreSummary(tyresInBooking[0].tyreId!)
    : 'Tyre service';

  // Get tyre details for admin email
  let tyreSizeDisplay = 'N/A';
  let tyreCondition: 'new' | 'used' = 'new';
  if (tyresInBooking.length > 0 && tyresInBooking[0].tyreId) {
    const [tyre] = await db
      .select()
      .from(tyreProducts)
      .where(eq(tyreProducts.id, tyresInBooking[0].tyreId))
      .limit(1);
    if (tyre) {
      tyreSizeDisplay = tyre.sizeDisplay;
    }
    if (tyresInBooking[0].condition) {
      tyreCondition = tyresInBooking[0].condition as 'new' | 'used';
    }
  }

  // Parse price snapshot
  const priceSnapshot = booking.priceSnapshot as {
    subtotal: number;
    vatAmount: number;
    total: number;
  };
  const trackingUrl = `${process.env.NEXTAUTH_URL || 'https://tyrerescue.uk'}/tracking/${refNumber}`;
  const baseUrl = process.env.NEXTAUTH_URL || 'https://tyrerescue.uk';

  // Send booking confirmation email to customer
  try {
    const confirmedEmail = bookingConfirmed({
      customerName: booking.customerName,
      refNumber: booking.refNumber,
      bookingType: booking.bookingType as 'emergency' | 'scheduled',
      serviceType: booking.serviceType,
      scheduledAt: booking.scheduledAt || undefined,
      address: booking.addressLine,
      tyreSummary,
      quantity: booking.quantity,
      trackingUrl,
    });

    await createNotificationAndSend({
      to: booking.customerEmail,
      subject: confirmedEmail.subject,
      html: confirmedEmail.html,
      type: 'booking-confirmed',
      userId: booking.userId,
      bookingId,
    });

    console.log(`Booking confirmation email sent for ${refNumber}`);
  } catch (emailError) {
    console.error('Failed to send booking confirmation email:', emailError);
  }

  // Send payment receipt email to customer
  try {
    const receiptEmail = paymentReceipt({
      customerName: booking.customerName,
      refNumber: booking.refNumber,
      invoiceDate: new Date(),
      lineItems: [{
        description: `${tyreSummary} x${booking.quantity}`,
        quantity: booking.quantity,
        unitPrice: priceSnapshot.subtotal / booking.quantity,
        total: priceSnapshot.subtotal,
      }],
      subtotal: priceSnapshot.subtotal,
      vatAmount: priceSnapshot.vatAmount,
      total: priceSnapshot.total,
    });

    await createNotificationAndSend({
      to: booking.customerEmail,
      subject: receiptEmail.subject,
      html: receiptEmail.html,
      type: 'payment-receipt',
      userId: booking.userId,
      bookingId,
    });

    console.log(`Payment receipt email sent for ${refNumber}`);
  } catch (emailError) {
    console.error('Failed to send payment receipt email:', emailError);
  }

  // Send admin notification email
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    try {
      const adminNotification = adminNewBooking(
        {
          refNumber: booking.refNumber,
          bookingType: booking.bookingType as 'emergency' | 'scheduled',
          serviceType: booking.serviceType,
          customerName: booking.customerName,
          customerPhone: booking.customerPhone,
          customerEmail: booking.customerEmail,
          address: booking.addressLine,
          lat: parseFloat(booking.lat),
          lng: parseFloat(booking.lng),
          tyreSizeDisplay,
          tyreCondition,
          quantity: booking.quantity,
          total: priceSnapshot.total,
          scheduledAt: booking.scheduledAt || undefined,
        },
        `${baseUrl}/admin/bookings/${booking.id}`
      );

      await createNotificationAndSend({
        to: adminEmail,
        subject: adminNotification.subject,
        html: adminNotification.html,
        type: 'admin-new-booking',
        bookingId,
      });

      console.log(`Admin notification sent for ${refNumber}`);
    } catch (adminEmailError) {
      console.error('Failed to send admin notification:', adminEmailError);
    }
  }

  console.log(`Payment ${paymentIntentId} processed successfully for booking ${refNumber}`);
}

/**
 * Handle payment_intent.payment_failed event
 */
async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const paymentIntentId = paymentIntent.id;
  const bookingId = paymentIntent.metadata?.bookingId;

  console.log(`Processing payment failure for ${paymentIntentId}, booking ${bookingId}`);

  if (!bookingId) {
    console.error('Payment intent missing bookingId metadata:', paymentIntentId);
    return;
  }

  // Record or update payment as failed
  const [existingPayment] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripePiId, paymentIntentId))
    .limit(1);

  if (existingPayment) {
    await db
      .update(payments)
      .set({
        status: 'failed',
        stripePayload: paymentIntent as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, existingPayment.id));
  } else {
    await db.insert(payments).values({
      id: uuidv4(),
      bookingId,
      stripePiId: paymentIntentId,
      amount: (paymentIntent.amount / 100).toString(),
      currency: paymentIntent.currency,
      status: 'failed',
      stripePayload: paymentIntent as unknown as Record<string, unknown>,
    });
  }

  // Get booking to check status
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (booking && booking.status === 'awaiting_payment') {
    // Update booking status to payment_failed
    await db
      .update(bookings)
      .set({
        status: 'payment_failed',
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId));

    // Record status history
    await db.insert(bookingStatusHistory).values({
      id: uuidv4(),
      bookingId,
      fromStatus: 'awaiting_payment',
      toStatus: 'payment_failed',
      actorUserId: null,
      actorRole: 'system',
      note: `Payment failed: ${paymentIntent.last_payment_error?.message || 'Unknown error'}`,
    });
  }

  console.log(`Payment failure recorded for ${paymentIntentId}`);
}

/**
 * Build a tyre summary string from a tyre ID
 */
async function buildTyreSummary(tyreId: string): Promise<string> {
  const [tyre] = await db
    .select()
    .from(tyreProducts)
    .where(eq(tyreProducts.id, tyreId))
    .limit(1);

  if (tyre) {
    return `${tyre.brand} ${tyre.pattern} ${tyre.sizeDisplay}`;
  }

  return 'Tyre service';
}
