import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { desc, eq } from 'drizzle-orm';
import { requireAdminMobile } from '@/lib/auth';
import { db, bookings, payments } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { commitReservationsForBooking } from '@/lib/inventory/stock-service';
import { notifyDriverPaymentReceived } from '@/lib/notifications/driver-push';
import { getBookingPaymentSummary, recordPaymentEvent } from '@/lib/payments/payment-summary';
import { persistStripeWebhook } from '@/lib/payments/stripe-webhook-store';
import {
  checkoutAndIntentAgree,
  stripePaymentIdentity,
  validateStripePaymentMatch,
  type StoredPaymentAttempt,
} from '@/lib/payments/stripe-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ ref: string }>;
}

type StripeCheckState = 'paid' | 'failed' | 'expired' | 'pending' | 'needs_checking';

interface StripeCheckResult {
  state: StripeCheckState;
  sessionId: string | null;
  paymentIntent: Stripe.PaymentIntent | null;
  amountPence: number | null;
  currency: string | null;
  checkoutUrl: string | null;
  expiresAt: Date | null;
  detail: string;
  checkoutSession?: Stripe.Checkout.Session;
}

function payloadRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function payloadString(value: unknown, key: string): string | null {
  const record = payloadRecord(value);
  const direct = record?.[key];
  return typeof direct === 'string' && direct.trim() ? direct.trim() : null;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}

function paymentIntentFromSession(session: Stripe.Checkout.Session): Stripe.PaymentIntent | null {
  if (!session.payment_intent || typeof session.payment_intent === 'string') return null;
  return session.payment_intent as Stripe.PaymentIntent;
}

async function retrieveStripeState(ref: string): Promise<StripeCheckResult | null> {
  if (ref.startsWith('cs_')) {
    const session = await stripe.checkout.sessions.retrieve(ref, {
      expand: ['payment_intent'],
    });
    const expandedIntent = paymentIntentFromSession(session);
    const intent =
      expandedIntent ??
      (typeof session.payment_intent === 'string'
        ? await stripe.paymentIntents.retrieve(session.payment_intent)
        : null);
    const expiresAt = session.expires_at ? new Date(session.expires_at * 1000) : null;

    if (session.payment_status === 'paid' && intent?.status === 'succeeded') {
      return {
        state: 'paid',
        checkoutSession: session,
        sessionId: session.id,
        paymentIntent: intent,
        amountPence: intent.amount_received || intent.amount,
        currency: intent.currency,
        checkoutUrl: session.url,
        expiresAt,
        detail: 'Stripe checkout session is paid.',
      };
    }

    if (intent?.status === 'canceled') {
      return {
        state: 'failed',
        checkoutSession: session,
        sessionId: session.id,
        paymentIntent: intent,
        amountPence: intent.amount,
        currency: intent.currency,
        checkoutUrl: session.url,
        expiresAt,
        detail: 'Stripe payment intent was canceled.',
      };
    }

    if (session.status === 'expired') {
      return {
        state: 'expired',
        checkoutSession: session,
        sessionId: session.id,
        paymentIntent: intent,
        amountPence: session.amount_total,
        currency: session.currency,
        checkoutUrl: session.url,
        expiresAt,
        detail: 'Stripe checkout session expired.',
      };
    }

    if (session.payment_status === 'paid' && !intent) {
      return {
        state: 'needs_checking',
        checkoutSession: session,
        sessionId: session.id,
        paymentIntent: null,
        amountPence: session.amount_total,
        currency: session.currency,
        checkoutUrl: session.url,
        expiresAt,
        detail: 'Stripe says the checkout is paid but no payment intent is attached yet.',
      };
    }

    return {
      state: 'pending',
      checkoutSession: session,
      sessionId: session.id,
      paymentIntent: intent,
      amountPence: session.amount_total,
      currency: session.currency,
      checkoutUrl: session.url,
      expiresAt,
      detail: 'Stripe checkout is still awaiting payment.',
    };
  }

  if (ref.startsWith('pi_')) {
    const intent = await stripe.paymentIntents.retrieve(ref);
    if (intent.status === 'succeeded') {
      return {
        state: 'paid',
        sessionId: null,
        paymentIntent: intent,
        amountPence: intent.amount_received || intent.amount,
        currency: intent.currency,
        checkoutUrl: null,
        expiresAt: null,
        detail: 'Stripe payment intent succeeded.',
      };
    }
    if (intent.status === 'canceled') {
      return {
        state: 'failed',
        sessionId: null,
        paymentIntent: intent,
        amountPence: intent.amount,
        currency: intent.currency,
        checkoutUrl: null,
        expiresAt: null,
        detail: 'Stripe payment intent was canceled.',
      };
    }
    return {
      state: 'pending',
      sessionId: null,
      paymentIntent: intent,
      amountPence: intent.amount,
      currency: intent.currency,
      checkoutUrl: null,
      expiresAt: null,
      detail: `Stripe payment intent is ${intent.status}.`,
    };
  }

  return null;
}

function isDepositPayment(booking: typeof bookings.$inferSelect, result: StripeCheckResult): boolean {
  const intentType = result.paymentIntent?.metadata?.type;
  return (
    intentType === 'deposit' ||
    (result.paymentIntent?.id != null && result.paymentIntent.id === booking.stripeDepositPiId)
  );
}

async function paymentSummaryFor(booking: typeof bookings.$inferSelect) {
  return getBookingPaymentSummary({
    id: booking.id,
    refNumber: booking.refNumber,
    status: booking.status,
    paymentType: booking.paymentType,
    totalAmount: booking.totalAmount?.toString() ?? null,
    subtotal: booking.subtotal?.toString() ?? null,
    vatAmount: booking.vatAmount?.toString() ?? null,
    depositAmountPence: booking.depositAmountPence ?? null,
    remainingBalancePence: booking.remainingBalancePence ?? null,
    depositPaidAt: booking.depositPaidAt ?? null,
    stripePiId: booking.stripePiId ?? null,
    stripeDepositPiId: booking.stripeDepositPiId ?? null,
  });
}

async function freshBooking(bookingId: string) {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return booking;
}

async function respondWithSummary(
  booking: typeof bookings.$inferSelect,
  extra: Record<string, unknown>,
) {
  const latestBooking = await freshBooking(booking.id);
  const summary = latestBooking ? await paymentSummaryFor(latestBooking) : await paymentSummaryFor(booking);
  return NextResponse.json({
    ok: true,
    status: latestBooking?.status.startsWith('refunded') ? latestBooking.status : summary.state,
    state: summary.state,
    linkStatus: summary.linkStatus,
    amountToCollectPence: summary.amountToCollectPence,
    totalAmountPence: summary.totalPence,
    totalPaidPence: summary.paidPence ?? 0,
    paymentSummary: summary,
    ...extra,
  });
}

export async function PATCH(request: Request, { params }: Props) {
  try {
    await requireAdminMobile(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ref } = await params;
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.refNumber, ref))
    .limit(1);

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.bookingId, booking.id))
    .orderBy(desc(payments.createdAt));

  const candidates = unique([
    booking.stripePiId,
    booking.stripeDepositPiId,
    ...paymentRows.flatMap((payment) => [
      payment.stripePiId,
      payloadString(payment.stripePayload, 'sessionId'),
      payloadString(payment.stripePayload, 'paymentIntentId'),
    ]),
  ]);

  if (candidates.length === 0) {
    return respondWithSummary(booking, {
      checked: false,
      checkStatus: 'no_stripe_reference',
      message: 'No Stripe payment link found for this booking.',
    });
  }

  const summaryBefore = await paymentSummaryFor(booking);
  if (summaryBefore.state === 'paid' || booking.status.startsWith('refunded')) {
    return respondWithSummary(booking, {
      checked: true,
      checkStatus: booking.status.startsWith('refunded') ? 'refunded' : 'paid',
      message: 'The server has already recorded this payment.',
    });
  }
  const attempts: StoredPaymentAttempt[] = paymentRows.map((payment) => ({
    paymentIntentId: payment.stripePiId.startsWith('pi_')
      ? payment.stripePiId : payloadString(payment.stripePayload, 'paymentIntentId'),
    sessionId: payment.stripePiId.startsWith('cs_')
      ? payment.stripePiId : payloadString(payment.stripePayload, 'sessionId'),
    amountPence: Math.round(Number(payment.amount) * 100),
    currency: payment.currency ?? '',
  }));
  const matchingPaymentFor = (result: StripeCheckResult) => paymentRows.find((payment) =>
    Boolean(result.paymentIntent && payment.stripePiId === result.paymentIntent.id) ||
    Boolean(result.sessionId && (payment.stripePiId === result.sessionId ||
      payloadString(payment.stripePayload, 'sessionId') === result.sessionId)),
  );
  const wasRecorded = (result: StripeCheckResult) => matchingPaymentFor(result)?.status === 'succeeded';
  const results: StripeCheckResult[] = [];
  for (const candidate of candidates) {
    try {
      const result = await retrieveStripeState(candidate);
      if (!result) continue;
      const identity = result.paymentIntent
        ? stripePaymentIdentity(result.paymentIntent, result.sessionId)
        : result.checkoutSession ? stripePaymentIdentity(result.checkoutSession) : null;
      const sessionIdentity = result.checkoutSession ? stripePaymentIdentity(result.checkoutSession) : null;
      if (!identity || (result.checkoutSession && (!sessionIdentity ||
        (result.paymentIntent && !checkoutAndIntentAgree(sessionIdentity, identity))))) continue;
      const match = validateStripePaymentMatch(identity, {
        ...booking,
        // An already recorded deposit is compared with its immutable attempt,
        // rather than the now smaller outstanding balance.
        outstandingPence: wasRecorded(result) ? undefined : summaryBefore.amountToCollectPence ?? undefined,
      }, attempts);
      if (!match.valid || (result.state === 'paid' &&
        result.paymentIntent?.amount_received !== match.expectedAmountPence)) continue;
      results.push(result);
    } catch (error) {
      console.error('[payment-link/check] Stripe lookup failed:', {
        ref: booking.refNumber,
        candidate,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  const result =
    results.find((item) => item.state === 'paid' && !wasRecorded(item)) ??
    results[0] ??
    null;

  if (!result) {
    return respondWithSummary(booking, {
      checked: false,
      checkStatus: 'stripe_lookup_failed',
      message: 'Could not read the current Stripe payment status.',
    });
  }

  const paymentIntentId = result.paymentIntent?.id ?? null;
  const amountPence = result.amountPence;
  const currency = result.currency ?? 'gbp';
  const paymentMethod = isDepositPayment(booking, result) ? 'deposit_link' : 'card_link';

  if (result.state === 'pending') {
    return respondWithSummary(booking, {
      checked: true,
      checkStatus: 'pending',
      message: result.detail,
    });
  }

  if (result.state === 'needs_checking') {
    await recordPaymentEvent({
      bookingId: booking.id,
      bookingRef: booking.refNumber,
      eventType: 'payment_needs_checking',
      paymentMethod,
      amountPence,
      currency,
      stripeSessionId: result.sessionId,
      stripePaymentIntentId: paymentIntentId,
      stripeCheckoutUrl: result.checkoutUrl,
      source: 'admin',
      status: 'needs_checking',
      expiresAt: result.expiresAt,
      metadata: { reason: 'manual_stripe_check_needs_review', detail: result.detail },
    });
    return respondWithSummary(booking, {
      checked: true,
      checkStatus: 'needs_checking',
      message: result.detail,
    });
  }

  const identity = result.paymentIntent
    ? stripePaymentIdentity(result.paymentIntent, result.sessionId)
    : result.checkoutSession ? stripePaymentIdentity(result.checkoutSession) : null;
  if (!identity) throw new Error('Validated Stripe payment has no identity');
  const outcome = result.state === 'paid' ? 'succeeded' : result.state;
  const saved = await persistStripeWebhook({
    eventId: `reconcile:admin_check:${identity.paymentIntentId ?? identity.sessionId}:${outcome}`,
    eventType: 'server_reconciliation.stripe_payment',
    source: 'system',
    createdAt: new Date(), outcome, payment: identity,
    expiresAt: result.expiresAt,
  });
  if (saved.state === 'ignored' || saved.state === 'needs_checking') {
    return respondWithSummary(booking, {
      checked: true, checkStatus: 'needs_checking',
      message: 'Payment requires operator review before this booking can be confirmed.',
    });
  }
  if (outcome === 'succeeded') {
    // Both a new confirmation and a repeated check repair inventory safely.
    // Payment, booking and ledger evidence were committed together above.
    const stock = await commitReservationsForBooking({
      bookingId: booking.id, actor: 'admin',
      note: `Verified Stripe payment check: ${identity.paymentIntentId}`,
    });
    if (!stock.success) throw new Error('Inventory commitment requires retry');
    if (saved.state === 'applied' && booking.driverId) {
      void notifyDriverPaymentReceived(
        booking.driverId, booking.refNumber, identity.amountPence, booking.id,
      ).catch(() => console.error('[payment-link/check] driver payment notification failed'));
    }
  }
  return respondWithSummary(booking, {
    checked: true,
    checkStatus: result.state,
    message: result.state === 'paid' ? 'Stripe payment confirmed and saved.' : result.detail,
  });
}
