import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { desc, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { requireAdminMobile } from '@/lib/auth';
import { db, bookings, bookingStatusHistory, payments } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { commitReservationsForBooking } from '@/lib/inventory/stock-service';
import { notifyDriverPaymentReceived } from '@/lib/notifications/driver-push';
import { getBookingPaymentSummary, recordPaymentEvent } from '@/lib/payments/payment-summary';

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
    booking.paymentType === 'deposit' ||
    (result.paymentIntent?.id != null && result.paymentIntent.id === booking.stripeDepositPiId)
  );
}

function expectedAmountPence(
  booking: typeof bookings.$inferSelect,
  result: StripeCheckResult,
  amountToCollectPence: number | null,
): number | null {
  if (isDepositPayment(booking, result)) {
    return booking.depositAmountPence ?? null;
  }
  return amountToCollectPence;
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
    status: summary.state,
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
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
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
  const results: StripeCheckResult[] = [];
  for (const candidate of candidates) {
    try {
      const result = await retrieveStripeState(candidate);
      if (result) results.push(result);
    } catch (error) {
      console.error('[payment-link/check] Stripe lookup failed:', {
        ref: booking.refNumber,
        candidate,
        error,
      });
    }
  }

  const result =
    results.find((item) => item.state === 'paid') ??
    results.find((item) => item.state === 'failed') ??
    results.find((item) => item.state === 'expired') ??
    results.find((item) => item.state === 'needs_checking') ??
    results.find((item) => item.state === 'pending') ??
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

  if (result.state === 'expired') {
    await recordPaymentEvent({
      bookingId: booking.id,
      bookingRef: booking.refNumber,
      eventType: 'link_expired',
      paymentMethod,
      linkStatus: 'expired',
      amountPence,
      currency,
      stripeSessionId: result.sessionId,
      stripePaymentIntentId: paymentIntentId,
      stripeCheckoutUrl: result.checkoutUrl,
      source: 'admin',
      status: 'expired',
      expiresAt: result.expiresAt,
      metadata: { reason: 'manual_stripe_check_expired' },
    });
    return respondWithSummary(booking, {
      checked: true,
      checkStatus: 'expired',
      message: result.detail,
    });
  }

  if (result.state === 'failed') {
    const matchingPayment = paymentRows.find((payment) =>
      payment.stripePiId === paymentIntentId ||
      payment.stripePiId === result.sessionId ||
      payloadString(payment.stripePayload, 'sessionId') === result.sessionId,
    );
    if (matchingPayment) {
      await db
        .update(payments)
        .set({
          status: 'failed',
          stripePayload: result.paymentIntent ?? { sessionId: result.sessionId, status: 'failed' },
          updatedAt: new Date(),
        })
        .where(eq(payments.id, matchingPayment.id));
    }
    await recordPaymentEvent({
      bookingId: booking.id,
      bookingRef: booking.refNumber,
      eventType: 'payment_failed',
      paymentMethod,
      linkStatus: 'failed',
      amountPence,
      currency,
      stripeSessionId: result.sessionId,
      stripePaymentIntentId: paymentIntentId,
      stripeCheckoutUrl: result.checkoutUrl,
      source: 'admin',
      status: 'failed',
      metadata: { reason: 'manual_stripe_check_failed', detail: result.detail },
    });
    if (booking.status === 'awaiting_payment') {
      await db
        .update(bookings)
        .set({ status: 'payment_failed', updatedAt: new Date() })
        .where(eq(bookings.id, booking.id));
    }
    return respondWithSummary(booking, {
      checked: true,
      checkStatus: 'failed',
      message: result.detail,
    });
  }

  const expected = expectedAmountPence(booking, result, summaryBefore.amountToCollectPence);
  if (amountPence == null || expected == null || amountPence !== expected) {
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
      status: 'amount_mismatch',
      metadata: {
        reason: 'manual_stripe_check_amount_mismatch',
        expectedAmountPence: expected,
        actualAmountPence: amountPence,
      },
    });
    return respondWithSummary(booking, {
      checked: true,
      checkStatus: 'needs_checking',
      message: 'Stripe payment amount does not match the outstanding booking balance.',
    });
  }

  const matchingPayment = paymentRows.find((payment) =>
    payment.stripePiId === paymentIntentId ||
    payment.stripePiId === result.sessionId ||
    payloadString(payment.stripePayload, 'sessionId') === result.sessionId,
  );

  if (matchingPayment) {
    await db
      .update(payments)
      .set({
        status: 'succeeded',
        stripePayload: result.paymentIntent as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, matchingPayment.id));
  } else if (paymentIntentId) {
    await db.insert(payments).values({
      id: uuidv4(),
      bookingId: booking.id,
      stripePiId: paymentIntentId,
      amount: (amountPence / 100).toString(),
      currency,
      status: 'succeeded',
      stripePayload: result.paymentIntent as unknown as Record<string, unknown>,
    });
  }

  if (isDepositPayment(booking, result)) {
    const totalPence = summaryBefore.totalPence ?? Math.round(Number(booking.totalAmount) * 100);
    const remainingBalancePence = Math.max(0, totalPence - amountPence);
    await db
      .update(bookings)
      .set({
        status: booking.status === 'awaiting_payment' ? 'deposit_paid' : booking.status,
        paymentType: 'deposit',
        depositAmountPence: amountPence,
        depositPaidAt: booking.depositPaidAt ?? new Date(),
        remainingBalancePence,
        stripeDepositPiId: paymentIntentId ?? booking.stripeDepositPiId,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id));
    await recordPaymentEvent({
      bookingId: booking.id,
      bookingRef: booking.refNumber,
      eventType: 'deposit_succeeded',
      paymentMethod: 'deposit_link',
      paidVia: 'payment_link',
      linkStatus: 'paid',
      amountPence,
      currency,
      stripeSessionId: result.sessionId,
      stripePaymentIntentId: paymentIntentId,
      stripeCheckoutUrl: result.checkoutUrl,
      source: 'admin',
      status: 'succeeded',
      metadata: { reason: 'manual_stripe_check', remainingBalancePence },
    });
  } else {
    await db
      .update(bookings)
      .set({
        status: booking.status === 'awaiting_payment' || booking.status === 'payment_failed'
          ? 'paid'
          : booking.status,
        paymentType: 'full',
        stripePiId: paymentIntentId ?? booking.stripePiId,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id));
    await recordPaymentEvent({
      bookingId: booking.id,
      bookingRef: booking.refNumber,
      eventType: 'payment_succeeded',
      paymentMethod: 'card_link',
      paidVia: 'payment_link',
      linkStatus: 'paid',
      amountPence,
      currency,
      stripeSessionId: result.sessionId,
      stripePaymentIntentId: paymentIntentId,
      stripeCheckoutUrl: result.checkoutUrl,
      source: 'admin',
      status: 'succeeded',
      metadata: { reason: 'manual_stripe_check' },
    });
  }

  await db.insert(bookingStatusHistory).values({
    id: uuidv4(),
    bookingId: booking.id,
    fromStatus: booking.status,
    toStatus: booking.status,
    actorUserId: session.user.id,
    actorRole: 'admin',
    note: `Stripe payment checked manually: ${result.detail}`,
  });

  const commitResult = await commitReservationsForBooking({
    bookingId: booking.id,
    actor: 'admin',
    note: `Manual Stripe payment check: ${paymentIntentId ?? result.sessionId ?? booking.refNumber}`,
  });
  if (!commitResult.success) {
    console.error('[payment-link/check] stock commit failed:', commitResult.error);
  }

  if (booking.driverId) {
    void notifyDriverPaymentReceived(
      booking.driverId,
      booking.refNumber,
      amountPence,
      booking.id,
    ).catch((error) => console.error('[payment-link/check] driver payment push failed:', error));
  }

  return respondWithSummary(booking, {
    checked: true,
    checkStatus: 'paid',
    message: 'Stripe payment confirmed and saved.',
  });
}
