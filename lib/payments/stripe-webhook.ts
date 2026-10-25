import type Stripe from 'stripe';

export const STRIPE_PAYMENT_PROJECT = 'tyrerescue';
export const STRIPE_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
] as const;

export type StripePaymentPurpose = 'full' | 'deposit' | 'admin_link';

export interface StripePaymentIdentity {
  bookingId: string;
  refNumber: string;
  project?: string;
  source?: string;
  paymentIntentId: string | null;
  sessionId: string | null;
  amountPence: number;
  currency: string;
  purpose: StripePaymentPurpose;
}

export interface BookingPaymentTarget {
  id: string;
  refNumber: string;
  totalAmount: string | number;
  depositAmountPence: number | null;
  stripePiId: string | null;
  stripeDepositPiId?: string | null;
  outstandingPence?: number;
}

export interface StoredPaymentAttempt {
  paymentIntentId: string | null;
  sessionId: string | null;
  amountPence: number;
  currency: string;
}

/** Metadata alone never establishes ownership of a shared-account payment. */
export function validateStripePaymentMatch(
  payment: StripePaymentIdentity,
  booking: BookingPaymentTarget,
  attempts: StoredPaymentAttempt[] = [],
): { valid: true; expectedAmountPence: number } | { valid: false; reason: string } {
  if (payment.project && payment.project !== STRIPE_PAYMENT_PROJECT) {
    return { valid: false, reason: 'different_project' };
  }
  if (payment.bookingId !== booking.id || payment.refNumber !== booking.refNumber) {
    return { valid: false, reason: 'booking_identity_mismatch' };
  }
  if (payment.currency.toLowerCase() !== 'gbp') {
    return { valid: false, reason: 'currency_mismatch' };
  }
  const matchingAttempts = attempts.filter((attempt) =>
    Boolean(payment.paymentIntentId && attempt.paymentIntentId === payment.paymentIntentId)
      || Boolean(payment.sessionId && attempt.sessionId === payment.sessionId),
  );
  const storedIds = payment.purpose === 'deposit'
    ? [booking.stripeDepositPiId]
    : [booking.stripePiId];
  const bookingMatches = storedIds.some((id) =>
    Boolean(id && (id === payment.paymentIntentId || id === payment.sessionId)),
  );
  if (!bookingMatches && matchingAttempts.length === 0) {
    return { valid: false, reason: 'unregistered_payment' };
  }
  if (matchingAttempts.some((attempt) => attempt.currency.toLowerCase() !== payment.currency.toLowerCase()
    || attempt.amountPence !== payment.amountPence)) {
    return { valid: false, reason: 'stored_payment_mismatch' };
  }
  const expectedAmountPence = payment.purpose === 'deposit'
    ? booking.depositAmountPence
    : payment.purpose === 'admin_link'
      ? (matchingAttempts[0]?.amountPence ?? null)
      : Math.round(Number(booking.totalAmount) * 100);
  if (!Number.isSafeInteger(expectedAmountPence) || expectedAmountPence == null
    || expectedAmountPence <= 0 || expectedAmountPence !== payment.amountPence) {
    return { valid: false, reason: 'amount_mismatch' };
  }
  if (payment.purpose === 'admin_link' && booking.outstandingPence != null
    && booking.outstandingPence !== expectedAmountPence) {
    return { valid: false, reason: 'outstanding_balance_mismatch' };
  }
  return { valid: true, expectedAmountPence };
}

export function stripeObjectId(object: string | { id: string } | null | undefined): string | null {
  return typeof object === 'string' ? object : object?.id ?? null;
}

export function stripePaymentIdentity(
  object: Stripe.PaymentIntent | Stripe.Checkout.Session,
  sessionId?: string | null,
): StripePaymentIdentity | null {
  const metadata = object.metadata;
  if (!metadata?.bookingId || !metadata.refNumber
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(metadata.bookingId)) {
    return null;
  }
  if (metadata.project && metadata.project !== STRIPE_PAYMENT_PROJECT) return null;
  if (metadata.type && !['full', 'deposit', 'admin_link'].includes(metadata.type)) return null;
  const isSession = object.object === 'checkout.session';
  const amount = isSession ? object.amount_total : object.amount;
  if (amount == null || !Number.isSafeInteger(amount) || amount <= 0) return null;
  return {
    bookingId: metadata.bookingId,
    refNumber: metadata.refNumber,
    project: metadata.project,
    source: metadata.source,
    paymentIntentId: isSession ? stripeObjectId(object.payment_intent) : object.id,
    sessionId: isSession ? object.id : sessionId ?? null,
    amountPence: amount,
    currency: object.currency?.toLowerCase() ?? '',
    purpose: (metadata.type as StripePaymentPurpose | undefined) ?? 'full',
  };
}

export function checkoutAndIntentAgree(
  session: StripePaymentIdentity,
  intent: StripePaymentIdentity,
): boolean {
  return session.paymentIntentId === intent.paymentIntentId
    && session.bookingId === intent.bookingId
    && session.refNumber === intent.refNumber
    && session.purpose === intent.purpose
    && session.amountPence === intent.amountPence
    && session.currency === intent.currency;
}
