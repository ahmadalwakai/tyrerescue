import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { getOutboundUrl } from '@/lib/config/site';
import { hasZeptoMail } from '@/lib/email';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  bookings,
  payments,
  tyreProducts,
  bookingTyres,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPaymentIntent } from '@/lib/stripe';
import { sendBookingEmailOnce } from '@/lib/email/resend';
import {
  bookingConfirmed,
  paymentReceipt,
  adminNewBooking,
} from '@/lib/email/templates';
import { createAdminNotification } from '@/lib/notifications';
import { sendVoodooSms } from '@/lib/voodoo-sms';
import { buildBookingConfirmationSmsMessage } from '@/lib/quick-book-message-templates';
import { commitReservationsForBooking } from '@/lib/inventory/stock-service';
import { ensureTrackingSession } from '@/lib/tracking-session';
import { signCustomerInvoiceToken } from '@/app/api/mobile/customer/_lib';
import { notifyCustomerBookingStatus } from '@/lib/notifications/customer-push';
import {
  formatTyreDisplayLine,
  resolveBookingTyreDisplay,
  totalTyreLineQuantity,
} from '@/lib/bookings/tyre-line-display';
import {
  buildBookingConversionPayload,
  type BookingConversionPaymentRecord,
} from '@/lib/analytics/booking-conversion';
import { stripePaymentIdentity, validateStripePaymentMatch } from '@/lib/payments/stripe-webhook';
import { persistStripeWebhook } from '@/lib/payments/stripe-webhook-store';
import { buildCustomerBookingTrackingUrl, setCustomerBookingAccessCookie, signCustomerBookingAccessToken } from '@/lib/customer-booking-access';

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
 * Server verification fallback after a Stripe redirect. The browser provides
 * an identifier; only Stripe plus the server's stored payment attempt can
 * establish that the booking has been paid. Webhooks also confirm payments
 * when the customer closes the browser before returning.
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

    // 2. Verify payment with Stripe
    const pi = await getPaymentIntent(paymentIntentId);

    if (pi.status !== 'succeeded') {
      return NextResponse.json(
        { error: `Payment not successful (status: ${pi.status})` },
        { status: 402 },
      );
    }

    // 3. Idempotency: check if payment record already exists
    const [existingPayment] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripePiId, paymentIntentId))
      .limit(1);

    const identity = stripePaymentIdentity(pi);
    const match = identity?.purpose === 'full' && pi.id === paymentIntentId
      ? validateStripePaymentMatch(identity, booking,
        existingPayment?.bookingId === booking.id ? [{
          paymentIntentId: existingPayment.stripePiId,
          sessionId: null,
          amountPence: Math.round(Number(existingPayment.amount) * 100),
          currency: existingPayment.currency ?? '',
        }] : [])
      : { valid: false as const, reason: 'payment_identity_mismatch' };
    if (!match.valid || pi.amount_received !== match.expectedAmountPence ||
      (existingPayment && existingPayment.bookingId !== booking.id)) {
      return NextResponse.json({ error: 'Payment mismatch', code: 'PAYMENT_MISMATCH' }, { status: 400 });
    }
    const closedStatuses = ['cancelled', 'cancelled_refund_pending', 'refunded', 'refunded_partial'];
    if (closedStatuses.includes(booking.status)) {
      return NextResponse.json({ error: 'Booking requires operator review', paymentConfirmed: false }, { status: 409 });
    }

    // The same locked transaction as webhooks saves the receipt, payment and
    // booking together. A process crash can never leave half a confirmation.
    if (!identity) throw new Error('Validated payment has no identity');
    const saved = await persistStripeWebhook({
      eventId: `reconcile:confirm:${pi.id}:succeeded`,
      eventType: 'server_reconciliation.payment_intent.succeeded',
      source: 'system',
      createdAt: new Date(), outcome: 'succeeded', payment: identity,
    });
    if (saved.state === 'ignored' || saved.state === 'needs_checking') {
      return NextResponse.json({ error: 'Payment requires operator review', paymentConfirmed: false }, { status: 409 });
    }

    const recordedPayment: BookingConversionPaymentRecord = {
      amount: (pi.amount / 100).toString(),
      currency: pi.currency,
      status: 'succeeded',
      stripePiId: paymentIntentId,
    };

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

    const confirmedStatus = ['awaiting_payment', 'payment_failed', 'draft'].includes(booking.status)
      ? 'paid' : booking.status;
    if (saved.state === 'duplicate') {
      const bookingAccessToken = await signCustomerBookingAccessToken({ bookingId: booking.id, refNumber: booking.refNumber });
      return setCustomerBookingAccessCookie(NextResponse.json({
        status: confirmedStatus, paymentConfirmed: true,
        bookingAccessToken,
        invoiceDownloadToken: await signCustomerInvoiceToken({
          bookingId: booking.id, refNumber: booking.refNumber, email: booking.customerEmail,
        }),
        conversion: buildBookingConversionPayload({
          refNumber: booking.refNumber, customerEmail: booking.customerEmail, payment: recordedPayment,
        }),
      }), booking.refNumber, bookingAccessToken);
    }

    // 8. Resolve all booking tyres for downstream email rendering.
    const tyreDisplay = await loadBookingTyreDisplay(booking);

    // Structured visibility for production triage. customerEmail must be
    // present (it's required at booking creation) but log explicitly so a
    // missing/blank value shows up in Vercel logs immediately.
    console.log(
      `[booking-confirm] ref=${booking.refNumber} customerEmailPresent=${Boolean(booking.customerEmail)} customerPhonePresent=${Boolean(booking.customerPhone)} emailProviderConfigured=${hasZeptoMail}`,
    );

    after(() =>
      notifyCustomerBookingStatus({
        bookingId: booking.id,
        status: 'paid',
      }),
    );

    // 9. Send emails after the response is returned. We use `after()` from
    // next/server (rather than fire-and-forget `.catch()`) because on Vercel
    // serverless the function instance can be frozen the moment the response
    // is sent, aborting any in-flight HTTP requests to the email provider —
    // which is exactly why customer confirmation emails were not arriving.
    after(async () => {
      try {
        await sendConfirmationEmails(booking, tyreDisplay);
      } catch (err) {
        console.error('[confirm] Email dispatch error:', err);
      }
    });

    // 9b. Send booking confirmation SMS after response (same reasoning as above).
    // Outbound customer link MUST always be the production URL — using
    // getAppOrigin() here would send `http://localhost:3002/tracking/...`
    // to a real customer phone number when running locally.
    if (booking.customerPhone) {
      const siteUrl = getOutboundUrl(booking.sourceApp);
      after(async () => {
        try {
          await sendVoodooSms({
            to: booking.customerPhone,
            message: buildBookingConfirmationSmsMessage({
              customerName: booking.customerName,
              refNumber: booking.refNumber,
              trackingUrl: await buildCustomerBookingTrackingUrl(siteUrl, booking),
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

    const bookingAccessToken = await signCustomerBookingAccessToken({ bookingId: booking.id, refNumber: booking.refNumber });
    return setCustomerBookingAccessCookie(NextResponse.json({
      status: confirmedStatus,
      paymentConfirmed: true,
      bookingAccessToken,
      invoiceDownloadToken: await signCustomerInvoiceToken({
        bookingId: booking.id,
        refNumber: booking.refNumber,
        email: booking.customerEmail,
      }),
      conversion: buildBookingConversionPayload({
        refNumber: booking.refNumber,
        customerEmail: booking.customerEmail,
        payment: recordedPayment,
      }),
    }), booking.refNumber, bookingAccessToken);
  } catch (error) {
    console.error('Confirm route failed:', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface BookingTyreEmailDisplay {
  tyreSummary: string;
  tyreSizeDisplay: string;
  tyreDisplayLines: string[];
  totalQuantity: number;
  receiptDescription: string;
}

async function loadBookingTyreDisplay(booking: typeof bookings.$inferSelect): Promise<BookingTyreEmailDisplay> {
  const tyreRows = await db
    .select({
      quantity: bookingTyres.quantity,
      unitPrice: bookingTyres.unitPrice,
      service: bookingTyres.service,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      sizeDisplay: tyreProducts.sizeDisplay,
      width: tyreProducts.width,
      aspect: tyreProducts.aspect,
      rim: tyreProducts.rim,
    })
    .from(bookingTyres)
    .leftJoin(tyreProducts, eq(bookingTyres.tyreId, tyreProducts.id))
    .where(eq(bookingTyres.bookingId, booking.id));

  const resolved = resolveBookingTyreDisplay({
    priceSnapshot: booking.priceSnapshot,
    tyreRows,
    tyreSizeDisplay: booking.tyreSizeDisplay,
    quantity: booking.quantity,
  });
  const tyreDisplayLines = resolved.lines.map(formatTyreDisplayLine);
  const totalQuantity = totalTyreLineQuantity(resolved.lines) || booking.quantity;
  const receiptDescription = tyreDisplayLines.length > 0 ? tyreDisplayLines.join('; ') : 'Tyre service';

  return {
    tyreSummary: tyreDisplayLines.length > 0 ? tyreDisplayLines.join(', ') : 'Tyre service',
    tyreSizeDisplay: resolved.lines[0]?.size ?? booking.tyreSizeDisplay ?? 'N/A',
    tyreDisplayLines,
    totalQuantity,
    receiptDescription,
  };
}

async function sendConfirmationEmails(
  booking: typeof bookings.$inferSelect,
  tyreDisplay: BookingTyreEmailDisplay,
) {
  // Customer-facing email link: must always be the production URL.
  const customerSiteUrl = getOutboundUrl(booking.sourceApp);
  const adminSiteUrl = getOutboundUrl();
  const trackingUrl = await buildCustomerBookingTrackingUrl(customerSiteUrl, booking);

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
      tyreSummary: tyreDisplay.tyreSummary,
      quantity: tyreDisplay.totalQuantity,
      tyreLines: tyreDisplay.tyreDisplayLines,
      totalTyreQuantity: tyreDisplay.totalQuantity,
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
    const receiptEmail = paymentReceipt({
      customerName: booking.customerName,
      refNumber: booking.refNumber,
      invoiceDate: new Date(),
      lineItems: [
        {
          description: tyreDisplay.receiptDescription,
          quantity: 1,
          unitPrice: priceSnapshot.subtotal,
          total: priceSnapshot.subtotal,
        },
      ],
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
          tyreSizeDisplay: tyreDisplay.tyreSizeDisplay,
          quantity: tyreDisplay.totalQuantity,
          tyreLines: tyreDisplay.tyreDisplayLines,
          totalTyreQuantity: tyreDisplay.totalQuantity,
          total: priceSnapshot.total,
          scheduledAt: booking.scheduledAt || undefined,
        },
        `${adminSiteUrl}/admin/bookings/${booking.id}`,
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
