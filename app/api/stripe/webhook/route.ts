import { NextRequest, NextResponse } from 'next/server';
import { getOutboundUrl } from '@/lib/config/site';
import { db } from '@/lib/db';
import {
  bookings,
  bookingStatusHistory,
  payments,
  tyreProducts,
  bookingTyres,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { constructWebhookEvent } from '@/lib/stripe';
import { sendBookingEmailOnce } from '@/lib/email/resend';
import {
  bookingConfirmed,
  paymentReceipt,
  adminNewBooking,
} from '@/lib/email/templates';
import { v4 as uuidv4 } from 'uuid';
import type Stripe from 'stripe';
import { releaseReservations, commitReservationsForBooking } from '@/lib/inventory/stock-service';
import { createAdminNotification } from '@/lib/notifications';
import { ensureTrackingSession } from '@/lib/tracking-session';
import { sendAdminExpoPush } from '@/lib/notifications/expo-admin-push';
import { notifyDriverPaymentReceived } from '@/lib/notifications/driver-push';
import { computeDriverPaymentSummary } from '@/lib/payments/driver-payment';

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
  // If webhook secret is not configured, acknowledge but skip processing.
  // The /api/bookings/confirm route handles primary payment confirmation.
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn('STRIPE_WEBHOOK_SECRET not set — webhook processing skipped');
    return NextResponse.json({ received: true });
  }

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
  const paymentType = paymentIntent.metadata?.type;

  console.log(`Processing payment success for ${paymentIntentId}, booking ${bookingId}, type: ${paymentType || 'full'}`);

  if (!bookingId) {
    console.error('Payment intent missing bookingId metadata:', paymentIntentId);
    return;
  }

  // Handle deposit payments separately
  if (paymentType === 'deposit') {
    await handleDepositPaymentSucceeded(paymentIntent);
    return;
  }

  // Handle admin-created payment links separately. These collect the
  // outstanding balance of an EXISTING (possibly already-assigned) job, so we
  // must NOT require `awaiting_payment` nor clobber the job lifecycle status.
  if (paymentType === 'admin_link') {
    await handleAdminLinkPaymentSucceeded(paymentIntent);
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

  const expectedAmountPence = Math.round(Number(booking.totalAmount) * 100);
  if (paymentIntent.amount !== expectedAmountPence) {
    console.error('[webhook] PAYMENT_AMOUNT_MISMATCH', {
      refNumber: booking.refNumber,
      paymentIntentId,
      expectedAmountPence,
      actualAmountPence: paymentIntent.amount,
    });
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

  // Update booking status to paid (full payment)
  await db
    .update(bookings)
    .set({
      status: 'paid',
      paymentType: 'full',
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

  // Ensure a tracking session exists for this booking — fire-and-forget.
  // If it fails, the booking itself is unaffected.
  ensureTrackingSession(bookingId).catch((err) =>
    console.error('[webhook] ensureTracking failed:', err),
  );

  // Atomically deduct physical stock and consume reservations.
  // Idempotent: if /api/bookings/confirm already processed this booking,
  // commitReservationsForBooking returns alreadyCommitted=true and stock
  // is unchanged. Replayed Stripe events are therefore safe.
  const commitResult = await commitReservationsForBooking({
    bookingId,
    actor: 'webhook',
    note: `Stripe webhook: ${paymentIntentId}`,
  });
  if (!commitResult.success) {
    console.error(
      `[webhook] stock commit failed for booking ${bookingId}:`,
      commitResult.error,
    );
  } else if (commitResult.alreadyCommitted) {
    console.log(`[webhook] stock already committed for booking ${bookingId}`);
  }

  // Load booking tyres for downstream email rendering.
  const tyresInBooking = await db
    .select()
    .from(bookingTyres)
    .where(eq(bookingTyres.bookingId, bookingId));

  // Build tyre summary for email
  const tyreSummary = tyresInBooking.length > 0
    ? await buildTyreSummary(tyresInBooking[0].tyreId!)
    : 'Tyre service';

  // Get tyre details for admin email
  let tyreSizeDisplay = 'N/A';
  if (tyresInBooking.length > 0 && tyresInBooking[0].tyreId) {
    const [tyre] = await db
      .select()
      .from(tyreProducts)
      .where(eq(tyreProducts.id, tyresInBooking[0].tyreId))
      .limit(1);
    if (tyre) {
      tyreSizeDisplay = tyre.sizeDisplay;
    }
  }

  // Parse price snapshot
  const priceSnapshot = booking.priceSnapshot as {
    subtotal: number;
    vatAmount: number;
    total: number;
  };
  const siteUrl = getOutboundUrl();
  const trackingUrl = `${siteUrl}/tracking/${refNumber}`;

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

    await sendBookingEmailOnce({
      to: booking.customerEmail,
      subject: confirmedEmail.subject,
      html: confirmedEmail.html,
      type: 'booking-confirmed',
      userId: booking.userId,
      bookingId,
    });

    console.log(`Booking confirmation email dispatch attempted for ${refNumber}`);
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
      vatRegistered: false,
      vatNumber: '',
    });

    await sendBookingEmailOnce({
      to: booking.customerEmail,
      subject: receiptEmail.subject,
      html: receiptEmail.html,
      type: 'payment-receipt',
      userId: booking.userId,
      bookingId,
    });

    console.log(`Payment receipt email dispatch attempted for ${refNumber}`);
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
          quantity: booking.quantity,
          total: priceSnapshot.total,
          scheduledAt: booking.scheduledAt || undefined,
        },
        `${siteUrl}/admin/bookings/${booking.id}`
      );

      await sendBookingEmailOnce({
        to: adminEmail,
        subject: adminNotification.subject,
        html: adminNotification.html,
        type: 'admin-new-booking',
        bookingId,
      });

      console.log(`Admin notification dispatch attempted for ${refNumber}`);
    } catch (adminEmailError) {
      console.error('Failed to send admin notification:', adminEmailError);
    }
  }

  console.log(`Payment ${paymentIntentId} processed successfully for booking ${refNumber}`);

  // Admin notification
  await createAdminNotification({
    type: 'payment.received',
    title: 'Payment Received',
    body: `£${(paymentIntent.amount / 100).toFixed(2)} from ${booking.customerEmail} — ${refNumber}`,
    entityType: 'payment',
    entityId: paymentIntentId,
    link: `/admin/bookings/${refNumber}`,
    severity: 'success',
    metadata: { stripeId: paymentIntentId, amount: paymentIntent.amount, currency: paymentIntent.currency },
  });

  // Payment-received notification (fire-and-forget).
  // The urgent booking push was already sent at booking creation time
  // (POST /api/bookings/create), so we never resend it here to avoid
  // duplicate alerts for the same emergency booking.
  void sendAdminExpoPush({
    title: 'Payment received',
    body: `${booking.customerName ?? 'Customer'} \u2014 \u00a3${(paymentIntent.amount / 100).toFixed(2)} \u00b7 ${refNumber}`,
    data: { refNumber, screen: 'bookings' },
  });

  // Notify the assigned driver (normal, non-urgent push) so their payment
  // badge context is up to date. The job lifecycle status is unchanged.
  if (booking.driverId) {
    void notifyDriverPaymentReceived(
      booking.driverId,
      booking.refNumber,
      paymentIntent.amount,
      booking.id,
    ).catch((err) => console.error('[webhook] driver payment push failed:', err));
  }
}

/**
 * Handle an admin-created payment link completing.
 *
 * Unlike the new-booking flow, this collects the outstanding balance of an
 * EXISTING job. It is idempotent (keyed on payments.stripePiId), updates the
 * payment record + booking payment fields, and notifies admin + driver WITHOUT
 * altering the job's lifecycle status (en_route/arrived/etc. are preserved).
 */
async function handleAdminLinkPaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const paymentIntentId = paymentIntent.id;
  const bookingId = paymentIntent.metadata?.bookingId;

  console.log(`Processing admin-link payment success for ${paymentIntentId}, booking ${bookingId}`);

  if (!bookingId) {
    console.error('Admin-link payment intent missing bookingId metadata:', paymentIntentId);
    return;
  }

  // Idempotency: skip if we already recorded this payment as succeeded.
  const [existingPayment] = await db
    .select()
    .from(payments)
    .where(eq(payments.stripePiId, paymentIntentId))
    .limit(1);

  if (existingPayment && existingPayment.status === 'succeeded') {
    console.log(`Admin-link payment ${paymentIntentId} already processed, skipping`);
    return;
  }

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) {
    console.error('Booking not found for admin-link payment:', bookingId);
    return;
  }

  const outstandingBeforePayment = computeDriverPaymentSummary({
    paymentType: booking.paymentType,
    totalAmount: booking.totalAmount?.toString() ?? null,
    subtotal: booking.subtotal?.toString() ?? null,
    vatAmount: booking.vatAmount?.toString() ?? null,
    depositAmountPence: booking.depositAmountPence,
    remainingBalancePence: booking.remainingBalancePence,
    depositPaidAt: booking.depositPaidAt,
    stripePiId: booking.stripePiId,
  }).amountToCollectPence;

  if (paymentIntent.amount !== outstandingBeforePayment) {
    console.warn('[webhook:admin-link] PAYMENT_AMOUNT_MISMATCH', {
      refNumber: booking.refNumber,
      paymentIntentId,
      expectedAmountPence: outstandingBeforePayment,
      actualAmountPence: paymentIntent.amount,
    });
    await db.insert(bookingStatusHistory).values({
      id: uuidv4(),
      bookingId,
      fromStatus: booking.status,
      toStatus: booking.status,
      actorUserId: null,
      actorRole: 'system',
      note: `PAYMENT_AMOUNT_MISMATCH: online payment amount did not equal the saved outstanding balance.`,
    });
    return;
  }

  // Record / update the payment row to succeeded.
  if (existingPayment) {
    await db
      .update(payments)
      .set({
        status: 'succeeded',
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
      status: 'succeeded',
      stripePayload: paymentIntent as unknown as Record<string, unknown>,
    });
  }

  if (outstandingBeforePayment <= 0) {
    console.warn(
      `[webhook:admin-link] payment ${paymentIntentId} received but booking ${booking.refNumber} has no outstanding balance; booking payment state left unchanged`,
    );
    return;
  }

  // Mark the outstanding balance as settled WITHOUT changing the job's
  // lifecycle status. paymentType 'full' makes the driver payment summary
  // resolve to paid / nothing-to-collect on the next poll.
  const alreadyFull = booking.paymentType === 'full';
  await db
    .update(bookings)
    .set({
      paymentType: 'full',
      stripePiId: paymentIntentId,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId));

  await db.insert(bookingStatusHistory).values({
    id: uuidv4(),
    bookingId,
    fromStatus: booking.status,
    toStatus: booking.status,
    actorUserId: null,
    actorRole: 'system',
    note: `Online payment received via admin link (${paymentIntentId})`,
  });

  // Deduct physical stock if not already committed (idempotent marker).
  const commitResult = await commitReservationsForBooking({
    bookingId,
    actor: 'webhook',
    note: `Stripe admin-link payment: ${paymentIntentId}`,
  });
  if (!commitResult.success) {
    console.error(
      `[webhook:admin-link] stock commit failed for booking ${bookingId}:`,
      commitResult.error,
    );
  }

  // Admin notification (skip duplicate noise if booking was already 'full').
  if (!alreadyFull) {
    await createAdminNotification({
      type: 'payment.received',
      title: 'Payment Received',
      body: `£${(paymentIntent.amount / 100).toFixed(2)} from ${booking.customerEmail} — ${booking.refNumber}`,
      entityType: 'payment',
      entityId: paymentIntentId,
      link: `/admin/bookings/${booking.refNumber}`,
      severity: 'success',
      metadata: { stripeId: paymentIntentId, amount: paymentIntent.amount, currency: paymentIntent.currency, source: 'admin_link' },
    });

    void sendAdminExpoPush({
      title: 'Payment received',
      body: `${booking.customerName ?? 'Customer'} \u2014 \u00a3${(paymentIntent.amount / 100).toFixed(2)} \u00b7 ${booking.refNumber}`,
      data: { refNumber: booking.refNumber, screen: 'bookings' },
    });

    if (booking.driverId) {
      void notifyDriverPaymentReceived(
        booking.driverId,
        booking.refNumber,
        paymentIntent.amount,
        booking.id,
      ).catch((err) => console.error('[webhook:admin-link] driver payment push failed:', err));
    }
  }

  console.log(`Admin-link payment ${paymentIntentId} processed for booking ${booking.refNumber}`);
}
async function handleDepositPaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const paymentIntentId = paymentIntent.id;
  const bookingId = paymentIntent.metadata?.bookingId;
  const refNumber = paymentIntent.metadata?.refNumber;

  console.log(`Processing deposit payment success for ${paymentIntentId}, booking ${bookingId}`);

  if (!bookingId) {
    console.error('Deposit payment intent missing bookingId metadata:', paymentIntentId);
    return;
  }

  // Get the booking
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) {
    console.error('Booking not found for deposit payment:', bookingId);
    return;
  }

  // Idempotency: skip if deposit already marked as paid
  if (booking.depositPaidAt) {
    console.log(`Deposit for booking ${bookingId} already processed, skipping`);
    return;
  }

  // Calculate remaining balance
  const totalInPence = Math.round(Number(booking.totalAmount) * 100);
  const expectedDepositAmountPence = booking.depositAmountPence ?? Math.round(totalInPence * 0.20);
  if (paymentIntent.amount !== expectedDepositAmountPence) {
    console.error('[webhook:deposit] PAYMENT_AMOUNT_MISMATCH', {
      refNumber: booking.refNumber,
      paymentIntentId,
      expectedAmountPence: expectedDepositAmountPence,
      actualAmountPence: paymentIntent.amount,
    });
    return;
  }
  const depositAmountPence = paymentIntent.amount;
  const remainingBalancePence = totalInPence - depositAmountPence;

  // Update booking with deposit info
  await db
    .update(bookings)
    .set({
      status: 'deposit_paid',
      paymentType: 'deposit',
      depositAmountPence,
      depositPaidAt: new Date(),
      remainingBalancePence,
      stripeDepositPiId: paymentIntentId,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId));

  // Record payment
  await db.insert(payments).values({
    id: uuidv4(),
    bookingId,
    stripePiId: paymentIntentId,
    amount: (depositAmountPence / 100).toString(),
    currency: paymentIntent.currency,
    status: 'succeeded',
    stripePayload: paymentIntent as unknown as Record<string, unknown>,
  });

  // Record status history
  await db.insert(bookingStatusHistory).values({
    id: uuidv4(),
    bookingId,
    fromStatus: 'awaiting_payment',
    toStatus: 'deposit_paid',
    actorUserId: null,
    actorRole: 'system',
    note: `Deposit of £${(depositAmountPence / 100).toFixed(2)} paid via Stripe (${paymentIntentId}). Balance due on-site: £${(remainingBalancePence / 100).toFixed(2)}`,
  });

  console.log(`Deposit ${paymentIntentId} processed successfully for booking ${refNumber || bookingId}`);

  // Deposit also confirms the booking — deduct physical stock now.
  // Customer has paid (partially) and the tyre is committed to them.
  const commitResult = await commitReservationsForBooking({
    bookingId,
    actor: 'webhook',
    note: `Stripe webhook deposit: ${paymentIntentId}`,
  });
  if (!commitResult.success) {
    console.error(
      `[webhook:deposit] stock commit failed for booking ${bookingId}:`,
      commitResult.error,
    );
  }

  // Admin notification
  await createAdminNotification({
    type: 'payment.received',
    title: 'Deposit Received',
    body: `£${(depositAmountPence / 100).toFixed(2)} deposit from ${booking.customerEmail} — ${refNumber || booking.refNumber}. Balance due: £${(remainingBalancePence / 100).toFixed(2)}`,
    entityType: 'payment',
    entityId: paymentIntentId,
    link: `/admin/bookings/${refNumber || booking.refNumber}`,
    severity: 'success',
    metadata: {
      stripeId: paymentIntentId,
      depositAmount: depositAmountPence,
      remainingBalance: remainingBalancePence,
      currency: paymentIntent.currency,
    },
  });
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

    // Release reserved stock — physical stock was never deducted at quote
    // time, so we only mark the reservation rows as released (no restore).
    try {
      const releaseResult = await releaseReservations({
        bookingId,
        restoreStock: false,
        reason: 'quote-release',
        actor: 'webhook',
        note: `Payment failed for ${paymentIntentId}`,
      });
      if (releaseResult.success) {
        console.log(`Released ${releaseResult.releasedCount} reservations for failed payment ${paymentIntentId}`);
      } else {
        console.error(`Failed to release reservations for ${bookingId}:`, releaseResult.error);
      }
    } catch (releaseError) {
      console.error(`Error releasing reservations for ${bookingId}:`, releaseError);
    }
  }

  console.log(`Payment failure recorded for ${paymentIntentId}`);

  // Admin notification for failed payment
  if (booking) {
    await createAdminNotification({
      type: 'payment.failed',
      title: '❌ Payment Failed',
      body: `£${(paymentIntent.amount / 100).toFixed(2)} failed for ${booking.refNumber} — ${paymentIntent.last_payment_error?.message || 'Unknown error'}`,
      entityType: 'payment',
      entityId: paymentIntentId,
      link: `/admin/bookings/${booking.refNumber}`,
      severity: 'critical',
      metadata: { stripeId: paymentIntentId, error: paymentIntent.last_payment_error?.message },
    });
  }
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
