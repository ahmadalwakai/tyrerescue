import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
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
  }
) {
  const amountInPence = Math.round(amount * 100);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.tyrerescue.uk';

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
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
            description: 'Mobile tyre service',
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      bookingId: metadata.bookingId,
      refNumber: metadata.refNumber,
    },
    success_url: `${baseUrl}/success/${metadata.refNumber}`,
    cancel_url: `${baseUrl}/book?ref=${metadata.refNumber}`,
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
