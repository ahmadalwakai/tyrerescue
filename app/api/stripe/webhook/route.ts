import { buildCustomerBookingTrackingUrl } from '@/lib/customer-booking-access';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { getOutboundUrl } from '@/lib/config/site';
import { db, bookings, bookingTyres, tyreProducts } from '@/lib/db';
import { constructWebhookEvent, stripe } from '@/lib/stripe';
import { sendBookingEmailOnce } from '@/lib/email/resend';
import { bookingConfirmed, paymentReceipt, adminNewBooking } from '@/lib/email/templates';
import { commitReservationsForBooking } from '@/lib/inventory/stock-service';
import { createAdminNotification } from '@/lib/notifications';
import { ensureTrackingSession } from '@/lib/tracking-session';
import { sendAdminExpoPush } from '@/lib/notifications/expo-admin-push';
import { notifyDriverPaymentReceived } from '@/lib/notifications/driver-push';
import {
  checkoutAndIntentAgree,
  stripePaymentIdentity,
  stripeObjectId,
  STRIPE_WEBHOOK_EVENTS,
  type StripePaymentIdentity,
} from '@/lib/payments/stripe-webhook';
import { persistStripeWebhook, type VerifiedStripePayment } from '@/lib/payments/stripe-webhook-store';
import { formatTyreDisplayLine, resolveBookingTyreDisplay, totalTyreLineQuantity } from '@/lib/bookings/tyre-line-display';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Verify raw bytes before parsing or accessing any booking/payment state. */
export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) {
    console.error('[stripe-webhook] server Stripe configuration is incomplete');
    return NextResponse.json({ error: 'Webhook unavailable' }, { status: 503 });
  }
  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(await request.text(), signature);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
  if (!(STRIPE_WEBHOOK_EVENTS as readonly string[]).includes(event.type)) {
    return NextResponse.json({ received: true, ignored: true });
  }
  // A live destination must never apply sandbox payment evidence, or vice versa.
  const configuredLiveMode = process.env.STRIPE_SECRET_KEY?.trim().replace(/^["']|["']$/g, '').startsWith('sk_live_');
  if (configuredLiveMode !== event.livemode) {
    return NextResponse.json({ received: true, ignored: true });
  }
  try {
    const verified = await verifiedPaymentEvent(event);
    if (!verified) return NextResponse.json({ received: true, ignored: true });
    const saved = await persistStripeWebhook(verified);
    if (saved.state === 'ignored' || saved.state === 'needs_checking') {
      console.warn('[stripe-webhook] event requires no fulfillment', { eventId: event.id, reason: saved.reason });
      return NextResponse.json({ received: true, ignored: saved.state === 'ignored' });
    }
    if (verified.outcome === 'succeeded') {
      // This idempotent operation is also attempted on a replay. If a worker
      // stopped after the DB commit, Stripe's retry still completes inventory.
      const stock = await commitReservationsForBooking({
        bookingId: verified.payment.bookingId,
        actor: 'webhook',
        note: `Stripe webhook: ${verified.payment.paymentIntentId}`,
      });
      if (!stock.success) throw new Error('Inventory commitment requires retry');
      await notifySuccessfulPayment(verified.payment, saved.state === 'applied').catch(() => {
        console.error('[stripe-webhook] payment saved; notification delivery failed');
      });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    // Returning 5xx is essential: Stripe must retry transient database/API errors.
    // Never log an SDK error object: request/response details may contain secrets.
    console.error('[stripe-webhook] processing failed', {
      eventId: event.id,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function verifiedPaymentEvent(event: Stripe.Event): Promise<VerifiedStripePayment | null> {
  const base = { eventId: event.id, eventType: event.type, createdAt: new Date(event.created * 1000) };
  if (event.type.startsWith('checkout.session.')) {
    const session = event.data.object as Stripe.Checkout.Session;
    const payment = stripePaymentIdentity(session);
    if (!payment || session.mode !== 'payment') return null;
    if (event.type === 'checkout.session.expired') {
      if (session.status !== 'expired' || session.payment_status === 'paid') return null;
      return { ...base, payment, outcome: 'expired', expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null };
    }
    if (event.type === 'checkout.session.async_payment_failed') {
      if (!payment.paymentIntentId || session.payment_status === 'paid') return null;
      const latest = await stripe.paymentIntents.retrieve(payment.paymentIntentId);
      const intentIdentity = stripePaymentIdentity(latest, session.id);
      if (!intentIdentity || !checkoutAndIntentAgree(payment, intentIdentity) || latest.status === 'succeeded') return null;
      return { ...base, payment, outcome: 'failed', errorCode: latest.last_payment_error?.code };
    }
    // Checkout completion can precede settlement for delayed payment methods.
    if (session.payment_status !== 'paid' || session.status !== 'complete' || !payment.paymentIntentId) return null;
    const intent = await stripe.paymentIntents.retrieve(payment.paymentIntentId);
    const intentIdentity = stripePaymentIdentity(intent, session.id);
    if (!intentIdentity || !checkoutAndIntentAgree(payment, intentIdentity)
      || intent.status !== 'succeeded' || intent.amount_received !== payment.amountPence) return null;
    return { ...base, payment, outcome: 'succeeded' };
  }
  const intent = event.data.object as Stripe.PaymentIntent;
  const payment = stripePaymentIdentity(intent);
  if (!payment) return null;
  const succeeded = event.type === 'payment_intent.succeeded';
  if (succeeded && (intent.status !== 'succeeded' || intent.amount_received !== payment.amountPence)) return null;
  if (!succeeded && intent.status === 'succeeded') return null;
  // Checkout creates its intent after the server saves the session ID. Resolve
  // the Stripe-owned relation so either event order can match that saved ID.
  const sessions = await stripe.checkout.sessions.list({ payment_intent: intent.id, limit: 2 });
  if (sessions.data.length > 1) return null;
  const session = sessions.data[0];
  if (session) {
    const sessionIdentity = stripePaymentIdentity(session);
    if (!sessionIdentity || stripeObjectId(session.payment_intent) !== intent.id
      || !checkoutAndIntentAgree(sessionIdentity, payment)) return null;
    payment.sessionId = session.id;
  }
  return { ...base, payment, outcome: succeeded ? 'succeeded' : 'failed', errorCode: intent.last_payment_error?.code };
}

async function notifySuccessfulPayment(payment: StripePaymentIdentity, isNew: boolean) {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, payment.bookingId)).limit(1);
  if (!booking) return;
  await ensureTrackingSession(booking.id);
  if (payment.purpose === 'full') await sendFullPaymentEmails(booking);
  if (!isNew) return;
  const deposit = payment.purpose === 'deposit';
  await createAdminNotification({
    type: 'payment.received',
    title: deposit ? 'Deposit Received' : 'Payment Received',
    body: `£${(payment.amountPence / 100).toFixed(2)} from ${booking.customerEmail} — ${booking.refNumber}`,
    entityType: 'payment', entityId: payment.paymentIntentId!,
    link: `/admin/bookings/${booking.refNumber}`, severity: 'success',
    metadata: { stripeId: payment.paymentIntentId, amount: payment.amountPence, currency: payment.currency },
  });
  await sendAdminExpoPush({
    title: deposit ? 'Deposit received' : 'Payment received',
    body: `${booking.customerName} — £${(payment.amountPence / 100).toFixed(2)} · ${booking.refNumber}`,
    data: { refNumber: booking.refNumber, screen: 'bookings' },
  });
  if (booking.driverId) await notifyDriverPaymentReceived(booking.driverId, booking.refNumber, payment.amountPence, booking.id);
}

async function sendFullPaymentEmails(booking: typeof bookings.$inferSelect) {
  const bookingId = booking.id;
  const refNumber = booking.refNumber;
  // Load booking tyres for downstream email rendering.
  const tyresInBooking = await db
    .select()
    .from(bookingTyres)
    .where(eq(bookingTyres.bookingId, bookingId));

  const tyreDisplay = await buildBookingTyreEmailDisplay(booking, tyresInBooking);

  // Parse price snapshot
  const priceSnapshot = booking.priceSnapshot as {
    subtotal: number;
    vatAmount: number;
    total: number;
  };
  const customerSiteUrl = getOutboundUrl(booking.sourceApp);
  const adminSiteUrl = getOutboundUrl();
  const trackingUrl = await buildCustomerBookingTrackingUrl(customerSiteUrl, booking);

  // Send booking confirmation email to customer
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
        description: tyreDisplay.receiptDescription,
        quantity: 1,
        unitPrice: priceSnapshot.subtotal,
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
          tyreSizeDisplay: tyreDisplay.tyreSizeDisplay,
          quantity: tyreDisplay.totalQuantity,
          tyreLines: tyreDisplay.tyreDisplayLines,
          totalTyreQuantity: tyreDisplay.totalQuantity,
          total: priceSnapshot.total,
          scheduledAt: booking.scheduledAt || undefined,
        },
      `${adminSiteUrl}/admin/bookings/${booking.id}`
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


}

interface BookingTyreEmailDisplay {
  tyreSummary: string;
  tyreSizeDisplay: string;
  tyreDisplayLines: string[];
  totalQuantity: number;
  receiptDescription: string;
}

async function buildBookingTyreEmailDisplay(
  booking: typeof bookings.$inferSelect,
  tyresInBooking: (typeof bookingTyres.$inferSelect)[],
): Promise<BookingTyreEmailDisplay> {
  const tyreIds = tyresInBooking
    .map((row) => row.tyreId)
    .filter((tyreId): tyreId is string => Boolean(tyreId));
  const productById = new Map<string, typeof tyreProducts.$inferSelect>();

  for (const tyreId of tyreIds) {
    const [tyre] = await db
      .select()
      .from(tyreProducts)
      .where(eq(tyreProducts.id, tyreId))
      .limit(1);
    if (tyre) productById.set(tyreId, tyre);
  }

  const tyreRows = tyresInBooking.map((row) => {
    const tyre = row.tyreId ? productById.get(row.tyreId) : null;
    return {
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      service: row.service,
      brand: tyre?.brand ?? null,
      pattern: tyre?.pattern ?? null,
      sizeDisplay: tyre?.sizeDisplay ?? null,
      width: tyre?.width ?? null,
      aspect: tyre?.aspect ?? null,
      rim: tyre?.rim ?? null,
    };
  });

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
