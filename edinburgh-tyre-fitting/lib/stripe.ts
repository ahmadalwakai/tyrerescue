import Stripe from 'stripe';

function readStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY
    ?.trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[^\x20-\x7E]/g, '');

  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(key)) {
    throw new Error('STRIPE_SECRET_KEY is malformed');
  }

  return key;
}

export function getStripeConfigStatus() {
  try {
    readStripeSecretKey();
    return { configured: true as const };
  } catch (error) {
    return {
      configured: false as const,
      message: error instanceof Error ? error.message : 'STRIPE_SECRET_KEY is not configured',
    };
  }
}

let stripeClient: Stripe | null = null;

function getStripeClient() {
  stripeClient ??= new Stripe(readStripeSecretKey(), {
    apiVersion: '2026-02-25.clover',
    typescript: true,
  });

  return stripeClient;
}

export async function createBookingCheckoutSession(input: {
  amount: number;
  bookingId: string;
  refNumber: string;
  customerEmail: string;
  customerName: string;
  requestReference: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const amountInPence = Math.round(input.amount * 100);
  const metadata = {
    bookingId: input.bookingId,
    refNumber: input.refNumber,
    source: 'edinburgh_tyre_fitting',
    requestReference: input.requestReference,
  };

  const session = await getStripeClient().checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    client_reference_id: input.refNumber,
    customer_email: input.customerEmail,
    line_items: [
      {
        price_data: {
          currency: 'gbp',
          unit_amount: amountInPence,
          product_data: {
            name: `Edinburgh Tyre Fitting - ${input.refNumber}`,
            description: 'Mobile tyre service booking',
          },
        },
        quantity: 1,
      },
    ],
    metadata,
    payment_intent_data: {
      metadata: {
        ...metadata,
        customerEmail: input.customerEmail,
        customerName: input.customerName,
      },
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
    paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    amountInPence,
  };
}
