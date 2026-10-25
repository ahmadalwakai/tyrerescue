import Stripe from 'stripe';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkoutAndIntentAgree,
  stripePaymentIdentity,
  validateStripePaymentMatch,
  type StripePaymentIdentity,
} from '@/lib/payments/stripe-webhook';

vi.mock('@/lib/stripe', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/stripe')>(),
  stripe: { paymentIntents: { retrieve: vi.fn() }, checkout: { sessions: { list: vi.fn() } } },
}));
vi.mock('@/lib/payments/stripe-webhook-store', () => ({ persistStripeWebhook: vi.fn() }));
vi.mock('@/lib/inventory/stock-service', () => ({ commitReservationsForBooking: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) },
  bookings: { id: 'id' }, bookingTyres: {}, tyreProducts: {},
}));
vi.mock('@/lib/email/resend', () => ({ sendBookingEmailOnce: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ createAdminNotification: vi.fn() }));
vi.mock('@/lib/tracking-session', () => ({ ensureTrackingSession: vi.fn() }));
vi.mock('@/lib/notifications/expo-admin-push', () => ({ sendAdminExpoPush: vi.fn() }));
vi.mock('@/lib/notifications/driver-push', () => ({ notifyDriverPaymentReceived: vi.fn() }));

import { POST } from '@/app/api/stripe/webhook/route';
import { stripe } from '@/lib/stripe';
import { persistStripeWebhook } from '@/lib/payments/stripe-webhook-store';
import { commitReservationsForBooking } from '@/lib/inventory/stock-service';

const bookingId = '33333333-3333-4333-8333-333333333333';
const metadata = { bookingId, refNumber: 'TR-WEBHOOK-TEST', project: 'tyrerescue', source: 'website' };
const identity: StripePaymentIdentity = {
  bookingId, refNumber: metadata.refNumber, project: metadata.project,
  paymentIntentId: 'pi_test_owned', sessionId: null, amountPence: 12000, currency: 'gbp', purpose: 'full',
};
const booking = {
  id: bookingId, refNumber: metadata.refNumber, totalAmount: '120.00',
  stripePiId: 'pi_test_owned', stripeDepositPiId: 'pi_test_deposit', depositAmountPence: 2400,
};
function intent(overrides: Record<string, unknown> = {}) {
  return { object: 'payment_intent', id: 'pi_test_owned', amount: 12000, amount_received: 12000,
    currency: 'gbp', status: 'succeeded', metadata, ...overrides } as Stripe.PaymentIntent;
}
function session(overrides: Record<string, unknown> = {}) {
  return { object: 'checkout.session', id: 'cs_test_owned', mode: 'payment', status: 'complete',
    payment_status: 'paid', amount_total: 12000, currency: 'gbp', payment_intent: 'pi_test_owned',
    metadata, ...overrides } as Stripe.Checkout.Session;
}

describe('Stripe payment ownership and saved-price checks', () => {
  it('requires saved transaction identity even when all metadata matches', () => {
    expect(validateStripePaymentMatch({ ...identity, paymentIntentId: 'pi_other_site' }, booking))
      .toEqual({ valid: false, reason: 'unregistered_payment' });
  });
  it('isolates projects on the shared Stripe account and checks booking reference', () => {
    expect(validateStripePaymentMatch({ ...identity, project: 'other_site' }, booking).valid).toBe(false);
    expect(validateStripePaymentMatch({ ...identity, refNumber: 'OTHER' }, booking).valid).toBe(false);
  });
  it('accepts a legacy payment only when it has an exact saved binding', () => {
    expect(validateStripePaymentMatch({ ...identity, project: undefined }, booking).valid).toBe(true);
    expect(validateStripePaymentMatch({ ...identity, project: undefined, paymentIntentId: 'pi_other' }, booking).valid).toBe(false);
  });
  it('requires GBP and the immutable full booking total', () => {
    expect(validateStripePaymentMatch({ ...identity, currency: 'usd' }, booking).valid).toBe(false);
    expect(validateStripePaymentMatch({ ...identity, amountPence: 1 }, booking).valid).toBe(false);
    expect(validateStripePaymentMatch(identity, booking)).toEqual({ valid: true, expectedAmountPence: 12000 });
  });
  it('matches Checkout to a server-saved session before the intent ID exists', () => {
    const payment = { ...identity, sessionId: 'cs_test_owned' };
    const saved = { paymentIntentId: null, sessionId: 'cs_test_owned', amountPence: 12000, currency: 'gbp' };
    expect(validateStripePaymentMatch(payment, { ...booking, stripePiId: null }, [saved]).valid).toBe(true);
    expect(validateStripePaymentMatch(payment, booking, [{ ...saved, amountPence: 9999 }]).valid).toBe(false);
  });
  it('requires the saved deposit amount and exact admin outstanding amount', () => {
    expect(validateStripePaymentMatch({ ...identity, paymentIntentId: 'pi_test_deposit', purpose: 'deposit', amountPence: 2400 }, booking).valid).toBe(true);
    expect(validateStripePaymentMatch({ ...identity, paymentIntentId: 'pi_test_deposit', purpose: 'deposit', amountPence: 2400 }, { ...booking, depositAmountPence: null }).valid).toBe(false);
    const attempt = { paymentIntentId: identity.paymentIntentId, sessionId: null, amountPence: 12000, currency: 'gbp' };
    expect(validateStripePaymentMatch({ ...identity, purpose: 'admin_link' }, { ...booking, outstandingPence: 11000 }, [attempt]).valid).toBe(false);
  });
  it('rejects incomplete metadata and mismatched Checkout/intent pairs', () => {
    expect(stripePaymentIdentity(intent({ metadata: { bookingId: 'not-a-uuid', refNumber: 'TR' } }))).toBeNull();
    expect(stripePaymentIdentity(intent({ metadata: { ...metadata, project: 'other' } }))).toBeNull();
    expect(checkoutAndIntentAgree({ ...identity, sessionId: 'cs_test_owned' }, { ...identity, amountPence: 1 })).toBe(false);
  });
});

describe('Stripe webhook raw-body signature and delivery handling (local signing)', () => {
  const localSecret = 'whsec_isolated_local_signature_fixture';
  const signer = new Stripe('sk_test_fixture');
  const previousEnv = { ...process.env };
  let sequence = 0;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_webhookfixture';
    process.env.STRIPE_WEBHOOK_SECRET = localSecret;
    vi.mocked(stripe.checkout.sessions.list).mockResolvedValue({ data: [] } as never);
    vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue(intent() as never);
    vi.mocked(persistStripeWebhook).mockResolvedValue({ state: 'applied', bookingId });
    vi.mocked(commitReservationsForBooking).mockResolvedValue({ success: true, alreadyCommitted: false, committedTyres: [] });
  });
  afterEach(() => { process.env = { ...previousEnv }; });
  function request(type: string, object: unknown, options: { tamper?: boolean; livemode?: boolean } = {}) {
    const payload = JSON.stringify({ id: `evt_local_${++sequence}`, object: 'event', type,
      created: Math.floor(Date.now() / 1000), livemode: options.livemode ?? false, data: { object } });
    const header = signer.webhooks.generateTestHeaderString({ payload, secret: localSecret });
    return new NextRequest('http://localhost/api/stripe/webhook', { method: 'POST',
      body: options.tamper ? `${payload} ` : payload, headers: { 'stripe-signature': header } });
  }
  it('rejects a body changed after signing and missing signatures', async () => {
    expect((await POST(request('payment_intent.succeeded', intent(), { tamper: true }))).status).toBe(400);
    expect((await POST(new NextRequest('http://localhost/api/stripe/webhook', { method: 'POST', body: '{}' }))).status).toBe(400);
    expect(persistStripeWebhook).not.toHaveBeenCalled();
  });
  it('returns 503 when the destination signing secret is absent', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect((await POST(request('payment_intent.succeeded', intent()))).status).toBe(503);
  });
  it('accepts an actually signed raw payload and commits verified server evidence', async () => {
    expect((await POST(request('payment_intent.succeeded', intent()))).status).toBe(200);
    expect(persistStripeWebhook).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'succeeded', payment: expect.objectContaining(identity) }));
    expect(commitReservationsForBooking).toHaveBeenCalledTimes(1);
  });
  it('does not treat Checkout completion with an unpaid asynchronous method as paid', async () => {
    expect((await POST(request('checkout.session.completed', session({ payment_status: 'unpaid' })))).status).toBe(200);
    expect(persistStripeWebhook).not.toHaveBeenCalled();
  });
  it('handles delayed settlement only after a paid session and successful intent agree', async () => {
    expect((await POST(request('checkout.session.async_payment_succeeded', session()))).status).toBe(200);
    expect(persistStripeWebhook).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'succeeded', payment: expect.objectContaining({ sessionId: 'cs_test_owned' }) }));
    vi.mocked(persistStripeWebhook).mockClear();
    vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue(intent({ amount_received: 1 }) as never);
    await POST(request('checkout.session.completed', session()));
    expect(persistStripeWebhook).not.toHaveBeenCalled();
  });
  it('ignores other projects, unsupported events, and test/live crossovers', async () => {
    await POST(request('payment_intent.succeeded', intent({ metadata: { ...metadata, project: 'other_site' } })));
    await POST(request('charge.succeeded', {}));
    await POST(request('payment_intent.succeeded', intent(), { livemode: true }));
    expect(persistStripeWebhook).not.toHaveBeenCalled();
  });
  it('preserves Stripe retries on transient persistence or stock failures', async () => {
    vi.mocked(persistStripeWebhook).mockRejectedValueOnce(new Error('isolated transport error'));
    expect((await POST(request('payment_intent.succeeded', intent()))).status).toBe(500);
    vi.mocked(commitReservationsForBooking).mockResolvedValueOnce({ success: false, error: 'isolated stock failure', code: 'DB_ERROR' });
    expect((await POST(request('payment_intent.succeeded', intent()))).status).toBe(500);
  });
  it('replays fulfillment after an earlier payment commit was interrupted', async () => {
    vi.mocked(persistStripeWebhook).mockResolvedValue({ state: 'duplicate', bookingId });
    expect((await POST(request('payment_intent.succeeded', intent()))).status).toBe(200);
    expect(commitReservationsForBooking).toHaveBeenCalledTimes(1);
  });
  it('records expiry and asynchronous failure without fulfilling inventory', async () => {
    await POST(request('checkout.session.expired', session({ status: 'expired', payment_status: 'unpaid', payment_intent: null })));
    expect(persistStripeWebhook).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: 'expired' }));
    vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue(intent({ status: 'requires_payment_method', amount_received: 0 }) as never);
    await POST(request('checkout.session.async_payment_failed', session({ payment_status: 'unpaid' })));
    expect(persistStripeWebhook).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: 'failed' }));
    expect(commitReservationsForBooking).not.toHaveBeenCalled();
  });
});
