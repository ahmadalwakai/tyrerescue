import 'server-only';
import Stripe from 'stripe';
import { getAppOrigin } from '@/lib/config/site';

let _stripe: Stripe | undefined;

function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('Missing STRIPE_SECRET_KEY environment variable');
    }

    // Strip whitespace, surrounding quotes, and any non-printable/non-ASCII chars
    // that would otherwise break the Authorization header.
    const key = process.env.STRIPE_SECRET_KEY
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/[^\x20-\x7E]/g, '');

    if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(key)) {
      throw new Error(
        'STRIPE_SECRET_KEY is malformed (expected "sk_test_..." or "sk_live_..." with no whitespace or non-ASCII characters)'
      );
    }

    _stripe = new Stripe(key, { apiVersion: '2026-02-25.clover', typescript: true });
  }
  return _stripe;
}

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_, prop: string | symbol) {
    return Reflect.get(getStripe(), prop);
  },
});

export type StripePaymentSource = 'website' | 'assisted_chat' | 'admin';
export type BookingPaymentMetadata = {
  bookingId: string;
  refNumber: string;
  customerEmail: string;
  source?: StripePaymentSource;
  type?: 'full' | 'deposit' | 'admin_link';
};

export class StripePaymentConflict extends Error {
  readonly code = 'PAYMENT_REQUIRES_CHECK';
}

export function getStripePaymentSource(request: Request): 'assisted_chat' | 'admin' {
  return request.headers.get('authorization')?.startsWith('Bearer ')
    ? 'assisted_chat'
    : 'admin';
}

function paymentAmount(amount: number): number {
  const pence = Math.round(amount * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(pence) || pence < 30) {
    throw new Error('Payment amount must be at least 30 pence');
  }
  return pence;
}

function bookingMetadata(metadata: BookingPaymentMetadata, amountPence: number) {
  return {
    project: 'tyrerescue',
    source: metadata.source ?? 'website',
    type: metadata.type ?? 'full',
    bookingId: metadata.bookingId,
    refNumber: metadata.refNumber,
    amountPence: String(amountPence),
    currency: 'gbp',
  };
}

function verifyExistingPayment(
  actual: { amount: number | null; currency: string | null; metadata: Stripe.Metadata | null },
  expected: BookingPaymentMetadata,
  amountPence: number,
) {
  if (actual.amount !== amountPence || actual.currency !== 'gbp' ||
      actual.metadata?.bookingId !== expected.bookingId ||
      actual.metadata?.refNumber !== expected.refNumber ||
      ((expected.type === 'deposit') !== (actual.metadata?.type === 'deposit')) ||
      (actual.metadata.project && actual.metadata.project !== 'tyrerescue')) {
    throw new StripePaymentConflict('The saved payment does not match the booking. Check it before collecting another payment.');
  }
}

/** Check the configured key/account before creating a new payable object. */
async function assertPaymentAccountReady() {
  const account = await stripe.accounts.retrieve();
  if (!account.charges_enabled) {
    throw new Error('Stripe account is not ready to accept payments');
  }
}

async function checkoutForReference(reference?: string | null) {
  if (!reference) return null;
  if (reference.startsWith('cs_')) return stripe.checkout.sessions.retrieve(reference);
  if (reference.startsWith('pi_')) {
    const sessions = await stripe.checkout.sessions.list({ payment_intent: reference, limit: 2 });
    if (sessions.data.length > 1) throw new StripePaymentConflict('Multiple payment sessions require checking.');
    return sessions.data[0] ?? null;
  }
  throw new StripePaymentConflict('Unrecognized saved Stripe payment reference.');
}

/**
 * Create a Payment Intent for a booking
 */
export async function createPaymentIntent(
  amount: number,
  metadata: BookingPaymentMetadata,
  options?: { existingStripeRef?: string | null },
) {
  // Amount is in pounds, Stripe expects pence
  const amountInPence = paymentAmount(amount);
  const previous = options?.existingStripeRef ?? null;
  if (previous?.startsWith('cs_')) {
    const session = await checkoutForReference(previous);
    if (session) {
      verifyExistingPayment({ amount: session.amount_total, currency: session.currency, metadata: session.metadata }, metadata, amountInPence);
      if (session.status === 'complete' || session.payment_status === 'paid') {
        throw new StripePaymentConflict('Payment was submitted. Wait for server confirmation.');
      }
      if (session.status === 'open') await stripe.checkout.sessions.expire(session.id);
    }
  } else if (previous?.startsWith('pi_')) {
    const intent = await stripe.paymentIntents.retrieve(previous);
    verifyExistingPayment(intent, metadata, amountInPence);
    if (['succeeded', 'processing', 'requires_capture'].includes(intent.status)) {
      throw new StripePaymentConflict('Payment was submitted. Wait for server confirmation.');
    }
    if (intent.status !== 'canceled') {
      return { clientSecret: intent.client_secret, paymentIntentId: intent.id, amountInPence };
    }
  } else if (previous) {
    throw new StripePaymentConflict('Unrecognized saved Stripe payment reference.');
  }
  await assertPaymentAccountReady();

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInPence,
    currency: 'gbp',
    metadata: { ...bookingMetadata(metadata, amountInPence), customerEmail: metadata.customerEmail },
    automatic_payment_methods: {
      enabled: true,
    },
  }, { idempotencyKey: `tyrerescue:pi:${metadata.bookingId}:${metadata.type ?? 'full'}:${amountInPence}:${previous ?? 'initial'}` });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amountInPence,
  };
}

/**
 * Retrieve a Payment Intent
 */
export async function getPaymentIntent(paymentIntentId: string) {
  return stripe.paymentIntents.retrieve(paymentIntentId);
}

/**
 * Create a Stripe Checkout Session for a booking.
 * Returns the hosted checkout URL (checkout.stripe.com).
 */
export async function createCheckoutSession(
  amount: number,
  metadata: BookingPaymentMetadata,
  options?: {
    successUrl?: string;
    cancelUrl?: string;
    /**
     * Payment purpose carried in metadata. The Stripe webhook routes on this
     * value: 'admin_link' updates an existing job's payment without touching
     * its lifecycle status; anything else is treated as a full booking payment
     * (awaiting_payment -> paid). Omit for the default full-booking flow.
     */
    purpose?: 'admin_link' | 'deposit';
    existingStripeRef?: string | null;
    /** Extra Stripe metadata for auditing/routing details. */
    metadata?: Record<string, string>;
    /** Optional human-readable line description shown on the Stripe page. */
    description?: string;
  }
) {
  const amountInPence = paymentAmount(amount);
  const baseUrl = getAppOrigin();
  const previous = options?.existingStripeRef ?? null;
  const existingSession = await checkoutForReference(previous);
  if (existingSession) {
    verifyExistingPayment({ amount: existingSession.amount_total, currency: existingSession.currency, metadata: existingSession.metadata }, metadata, amountInPence);
    if (existingSession.payment_status === 'paid' || existingSession.status === 'complete') {
      throw new StripePaymentConflict('Payment was submitted. Wait for server confirmation.');
    }
    if (existingSession.status === 'open' && existingSession.url) {
      return {
        sessionId: existingSession.id,
        checkoutUrl: existingSession.url,
        paymentIntentId: typeof existingSession.payment_intent === 'string' ? existingSession.payment_intent : existingSession.payment_intent?.id ?? null,
        expiresAt: new Date(existingSession.expires_at * 1000),
        amountInPence,
      };
    }
  } else if (previous?.startsWith('pi_')) {
    const intent = await stripe.paymentIntents.retrieve(previous);
    verifyExistingPayment(intent, metadata, amountInPence);
    if (['succeeded', 'processing', 'requires_capture'].includes(intent.status)) {
      throw new StripePaymentConflict('Payment was submitted. Wait for server confirmation.');
    }
    if (intent.status !== 'canceled') await stripe.paymentIntents.cancel(intent.id);
  }
  await assertPaymentAccountReady();

  // Metadata is set on BOTH the Checkout Session and the underlying
  // PaymentIntent. Stripe does NOT copy session metadata onto the PI, so
  // without `payment_intent_data.metadata` the `payment_intent.succeeded`
  // webhook would arrive with no bookingId and silently no-op.
  const sharedMetadata: Record<string, string> = {
    ...(options?.metadata ?? {}),
    ...bookingMetadata(metadata, amountInPence),
  };
  if (options?.purpose) {
    sharedMetadata.type = options.purpose;
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    client_reference_id: metadata.refNumber,
    customer_email: metadata.customerEmail !== 'phone-booking@tyrerescue.uk'
      ? metadata.customerEmail
      : undefined,
    line_items: [
      {
        price_data: {
          currency: 'gbp',
          unit_amount: amountInPence,
          product_data: {
            name: `Tyre Rescue — ${metadata.refNumber}`,
            description: options?.description ?? 'Mobile tyre service',
          },
        },
        quantity: 1,
      },
    ],
    metadata: sharedMetadata,
    payment_intent_data: {
      metadata: { ...sharedMetadata, customerEmail: metadata.customerEmail },
    },
    success_url: options?.successUrl ?? `${baseUrl}/success/${metadata.refNumber}`,
    cancel_url: options?.cancelUrl ?? `${baseUrl}/book?ref=${metadata.refNumber}`,
  }, { idempotencyKey: `tyrerescue:checkout:${metadata.bookingId}:${options?.purpose === 'deposit' ? 'deposit' : 'full'}:${amountInPence}:${existingSession?.id ?? previous ?? 'initial'}` });

  return {
    sessionId: session.id,
    checkoutUrl: session.url,
    paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
    amountInPence,
  };
}

/** Retire unpaid links before a booking is reset, so an old URL cannot charge. */
export async function retireBookingStripePayment(
  reference: string | null,
  amount: number,
  metadata: BookingPaymentMetadata,
) {
  if (!reference) return;
  const amountPence = paymentAmount(amount);
  const session = await checkoutForReference(reference);
  if (session) {
    verifyExistingPayment({ amount: session.amount_total, currency: session.currency, metadata: session.metadata }, metadata, amountPence);
    if (session.status === 'complete' || session.payment_status === 'paid') {
      throw new StripePaymentConflict('Payment was submitted. Wait for server confirmation before canceling.');
    }
    if (session.status === 'open') await stripe.checkout.sessions.expire(session.id);
    return;
  }
  const intent = await stripe.paymentIntents.retrieve(reference);
  verifyExistingPayment(intent, metadata, amountPence);
  if (['succeeded', 'processing', 'requires_capture'].includes(intent.status)) {
    throw new StripePaymentConflict('Payment was submitted. Wait for server confirmation before canceling.');
  }
  if (intent.status !== 'canceled') await stripe.paymentIntents.cancel(intent.id);
}

/**
 * Create a refund
 */
export async function createRefund(
  paymentIntentId: string,
  amount?: number,
  reason?: string
) {
  const refundData: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
    reason: 'requested_by_customer',
  };

  // If partial refund, specify amount in pence
  if (amount !== undefined) {
    refundData.amount = Math.round(amount * 100);
  }

  if (reason) {
    refundData.metadata = { reason };
  }

  return stripe.refunds.create(refundData);
}

/**
 * Verify Stripe webhook signature
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Missing STRIPE_WEBHOOK_SECRET environment variable');
  }

  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}
