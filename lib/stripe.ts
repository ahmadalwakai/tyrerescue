import Stripe from 'stripe';
import { getAppOrigin } from '@/lib/config/site';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}

// Strip whitespace, surrounding quotes, and any non-printable/non-ASCII chars
// that would otherwise break the Authorization header.
const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  .trim()
  .replace(/^["']|["']$/g, '')
  .replace(/[^\x20-\x7E]/g, '');

if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(stripeSecretKey)) {
  throw new Error(
    'STRIPE_SECRET_KEY is malformed (expected "sk_test_..." or "sk_live_..." with no whitespace or non-ASCII characters)'
  );
}

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2026-02-25.clover',
  typescript: true,
});

/**
 * Create a Payment Intent for a booking
 */
export async function createPaymentIntent(
  amount: number,
  metadata: {
    bookingId: string;
    refNumber: string;
    customerEmail: string;
  }
) {
  // Amount is in pounds, Stripe expects pence
  const amountInPence = Math.round(amount * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInPence,
    currency: 'gbp',
    metadata,
    automatic_payment_methods: {
      enabled: true,
    },
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
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
  metadata: {
    bookingId: string;
    refNumber: string;
    customerEmail: string;
  },
  options?: {
    successUrl?: string;
    cancelUrl?: string;
    /**
     * Payment purpose carried in metadata. The Stripe webhook routes on this
     * value: 'admin_link' updates an existing job's payment without touching
     * its lifecycle status; anything else is treated as a full booking payment
     * (awaiting_payment -> paid). Omit for the default full-booking flow.
     */
    purpose?: 'admin_link';
    /** Extra Stripe metadata for auditing/routing details. */
    metadata?: Record<string, string>;
    /** Optional human-readable line description shown on the Stripe page. */
    description?: string;
  }
) {
  const amountInPence = Math.round(amount * 100);
  const baseUrl = getAppOrigin();

  // Metadata is set on BOTH the Checkout Session and the underlying
  // PaymentIntent. Stripe does NOT copy session metadata onto the PI, so
  // without `payment_intent_data.metadata` the `payment_intent.succeeded`
  // webhook would arrive with no bookingId and silently no-op.
  const sharedMetadata: Record<string, string> = {
    ...(options?.metadata ?? {}),
    bookingId: metadata.bookingId,
    refNumber: metadata.refNumber,
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
  });

  return {
    sessionId: session.id,
    checkoutUrl: session.url,
    paymentIntentId: (session.payment_intent as string) || null,
  };
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
