import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { getOutboundUrl } from '@/lib/config/site';
import { hasZeptoMail } from '@/lib/email';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  bookings,
  bookingStatusHistory,
  payments,
  tyreProducts,
  bookingTyres,
  pricingRules,
} from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getPaymentIntent } from '@/lib/stripe';
import { sendBookingEmailOnce } from '@/lib/email/resend';
import {
  bookingConfirmed,
  paymentReceipt,
  adminNewBooking,
} from '@/lib/email/templates';
import { v4 as uuidv4 } from 'uuid';
import { createAdminNotification } from '@/lib/notifications';
import { sendVoodooSms } from '@/lib/voodoo-sms';
import { buildBookingConfirmationSmsMessage } from '@/lib/quick-book-message-templates';
import { commitReservationsForBooking } from '@/lib/inventory/stock-service';
import { ensureTrackingSession } from '@/lib/tracking-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const confirmSchema = z.object({
  bookingId: z.string().min(1),
  paymentIntentId: z.string().startsWith('pi_'),
  redirectStatus: z.string().optional(),
});

/**
 * POST /api/bookings/confirm
 *
 * Client-side payment confirmation. Called by the success page after Stripe
 * redirects back. Verifies the PaymentIntent directly with Stripe and
 * transitions the booking from awaiting_payment → paid.
 *
 * The webhook is a safety net; this route is the primary confirmation path.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = confirmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { bookingId: refNumber, paymentIntentId } = parsed.data;

    // 1. Look up booking by refNumber
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.refNumber, refNumber))
      .limit(1);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Idempotency: if already paid (or further), return current status
    if (booking.status !== 'awaiting_payment') {
      return NextResponse.json({ status: booking.status });
    }

    // 2. Verify payment with Stripe
    const pi = await getPaymentIntent(paymentIntentId);

    if (pi.status !== 'succeeded') {
      return NextResponse.json(
        { error: `Payment not successful (status: ${pi.status})` },
        { status: 402 },
      );
    }

    // Ensure this PaymentIntent actually belongs to this booking
    if (pi.metadata?.bookingId !== booking.id) {
      return NextResponse.json({ error: 'Payment mismatch' }, { status: 400 });
    }

    // 3. Idempotency: check if payment record already exists
    const [existingPayment] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripePiId, paymentIntentId))
      .limit(1);

    if (existingPayment && existingPayment.status === 'succeeded') {
      // Payment already recorded (by webhook) — make sure booking status is up-to-date
      if (booking.status === 'awaiting_payment') {
        await db
          .update(bookings)
          .set({ status: 'paid', updatedAt: new Date() })
          .where(eq(bookings.id, booking.id));
      }
      return NextResponse.json({ status: 'paid' });
    }

    // 4. Record payment
    if (existingPayment) {
      await db
        .update(payments)
        .set({
          status: 'succeeded',
          stripePayload: pi as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, existingPayment.id));
    } else {
      await db.insert(payments).values({
        id: uuidv4(),
        bookingId: booking.id,
        stripePiId: paymentIntentId,
        amount: (pi.amount / 100).toString(),
        currency: pi.currency,
        status: 'succeeded',
        stripePayload: pi as unknown as Record<string, unknown>,
      });
    }

    // 5. Update booking status
    await db
      .update(bookings)
      .set({ status: 'paid', updatedAt: new Date() })
      .where(eq(bookings.id, booking.id));

    // 6. Record status history
    await db.insert(bookingStatusHistory).values({
      id: uuidv4(),
      bookingId: booking.id,
      fromStatus: 'awaiting_payment',
      toStatus: 'paid',
      actorUserId: null,
      actorRole: 'system',
      note: `Payment confirmed via client-side verification (${paymentIntentId})`,
    });

    // 7. Atomically deduct physical stock and consume reservations.
    //    This is idempotent: if the webhook already committed the same
    //    booking, commitReservationsForBooking returns alreadyCommitted=true
    //    and stock is unchanged.
    const commitResult = await commitReservationsForBooking({
      bookingId: booking.id,
      actor: 'system',
      note: `Confirm route: payment ${paymentIntentId}`,
    });
    if (!commitResult.success) {
      console.error(
        `[confirm] stock commit failed for ${booking.refNumber}:`,
        commitResult.error,
      );
      // Do not fail the request — the booking is paid; alert via logs and
      // let admin reconcile. Returning an error here would prompt the user
      // to retry payment, which would be wrong.
    }

    // 8. Load booking_tyres for downstream email rendering.
    const tyresInBooking = await db
      .select()
      .from(bookingTyres)
      .where(eq(bookingTyres.bookingId, booking.id));

    // Structured visibility for production triage. customerEmail must be
    // present (it's required at booking creation) but log explicitly so a
    // missing/blank value shows up in Vercel logs immediately.
    console.log(
      `[booking-confirm] ref=${booking.refNumber} customerEmailPresent=${Boolean(booking.customerEmail)} customerPhonePresent=${Boolean(booking.customerPhone)} emailProviderConfigured=${hasZeptoMail}`,
    );

    // 9. Send emails after the response is returned. We use `after()` from
    // next/server (rather than fire-and-forget `.catch()`) because on Vercel
    // serverless the function instance can be frozen the moment the response
    // is sent, aborting any in-flight HTTP requests to the email provider —
    // which is exactly why customer confirmation emails were not arriving.
    after(async () => {
      try {
        await sendConfirmationEmails(booking, tyresInBooking);
      } catch (err) {
        console.error('[confirm] Email dispatch error:', err);
      }
    });

    // 9b. Send booking confirmation SMS after response (same reasoning as above).
    // Outbound customer link MUST always be the production URL — using
    // getAppOrigin() here would send `http://localhost:3000/tracking/...`
    // to a real customer phone number when running locally.
    if (booking.customerPhone) {
      const siteUrl = getOutboundUrl();
      after(async () => {
        try {
          await sendVoodooSms({
            to: booking.customerPhone,
            message: buildBookingConfirmationSmsMessage({
              customerName: booking.customerName,
              refNumber: booking.refNumber,
              trackingUrl: `${siteUrl}/tracking/${booking.refNumber}`,
            }),
          });
        } catch (err) {
          console.error('[confirm] Booking confirmation SMS error:', err);
        }
      });
    }

    // 10. Admin notification (after response)
    // Ensure tracking session for this confirmed booking — fire-and-forget.
    // If it fails the booking is unaffected; admin can retry from the tracking card.
    after(() => {
      ensureTrackingSession(booking.id).catch((err) =>
        console.error('[confirm] ensureTracking failed:', err),
      );
    });

    after(async () => {

      try {
        await createAdminNotification({
          type: 'payment.received',
          title: 'Payment Received',
          body: `£${parseFloat(booking.totalAmount?.toString() ?? '0').toFixed(2)} from ${booking.customerName} — ${booking.refNumber}`,
          entityType: 'payment',
          entityId: booking.id,
          link: `/admin/bookings/${booking.refNumber}`,
          severity: 'success',
          metadata: { refNumber: booking.refNumber, amount: booking.totalAmount },
        });
      } catch (err) {
        console.error('[confirm] Admin notification error:', err);
      }
    });

    return NextResponse.json({ status: 'paid' });
  } catch (error) {
    console.error('Confirm route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function sendConfirmationEmails(
  booking: typeof bookings.$inferSelect,
  tyresInBooking: (typeof bookingTyres.$inferSelect)[],
) {
  // Customer-facing email link: must always be the production URL.
  const siteUrl = getOutboundUrl();
  const trackingUrl = `${siteUrl}/tracking/${booking.refNumber}`;

  // Build tyre summary
  let tyreSummary = 'Tyre service';
  let tyreSizeDisplay = 'N/A';
  if (tyresInBooking.length > 0 && tyresInBooking[0].tyreId) {
    const [tyre] = await db
      .select()
      .from(tyreProducts)
      .where(eq(tyreProducts.id, tyresInBooking[0].tyreId))
      .limit(1);
    if (tyre) {
      tyreSummary = `${tyre.brand} ${tyre.pattern} ${tyre.sizeDisplay}`;
      tyreSizeDisplay = tyre.sizeDisplay;
    }
  }

  const priceSnapshot = booking.priceSnapshot as {
    subtotal: number;
    vatAmount: number;
    total: number;
  };

  // Customer: booking confirmation
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
      bookingId: booking.id,
    });
  } catch (e) {
    console.error('Failed to send booking confirmation email:', e);
  }

  // Customer: payment receipt
  try {
    const vatRules = await db
      .select({ key: pricingRules.key, value: pricingRules.value })
      .from(pricingRules)
      .where(inArray(pricingRules.key, ['vat_registered', 'vat_number']));
    const vatMap = new Map(vatRules.map((r) => [r.key, r.value]));

    const receiptEmail = paymentReceipt({
      customerName: booking.customerName,
      refNumber: booking.refNumber,
      invoiceDate: new Date(),
      lineItems: [
        {
          description: `${tyreSummary} x${booking.quantity}`,
          quantity: booking.quantity,
          unitPrice: priceSnapshot.subtotal / booking.quantity,
          total: priceSnapshot.subtotal,
        },
      ],
      subtotal: priceSnapshot.subtotal,
      vatAmount: priceSnapshot.vatAmount,
      total: priceSnapshot.total,
      vatRegistered: vatMap.get('vat_registered') === 'true',
      vatNumber: vatMap.get('vat_number') || '',
    });
    await sendBookingEmailOnce({
      to: booking.customerEmail,
      subject: receiptEmail.subject,
      html: receiptEmail.html,
      type: 'payment-receipt',
      userId: booking.userId,
      bookingId: booking.id,
    });
  } catch (e) {
    console.error('Failed to send payment receipt email:', e);
  }

  // Admin notification
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
        `${siteUrl}/admin/bookings/${booking.id}`,
      );
      await sendBookingEmailOnce({
        to: adminEmail,
        subject: adminNotification.subject,
        html: adminNotification.html,
        type: 'admin-new-booking',
        bookingId: booking.id,
      });
    } catch (e) {
      console.error('Failed to send admin notification:', e);
    }
  }
}
