import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  accounts: { retrieve: vi.fn() },
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn(), list: vi.fn(), expire: vi.fn() } },
  paymentIntents: { create: vi.fn(), retrieve: vi.fn(), cancel: vi.fn() },
}));
vi.mock('stripe', () => ({ default: vi.fn(function () { return api; }) }));

import { createCheckoutSession, createPaymentIntent, retireBookingStripePayment, StripePaymentConflict } from '@/lib/stripe';

const booking = { bookingId: 'booking-1', refNumber: 'TR-TEST', customerEmail: 'test@example.com' };
const metadata = { project: 'tyrerescue', bookingId: booking.bookingId, refNumber: booking.refNumber, type: 'full' };
const checkout = (overrides: Record<string, unknown> = {}) => ({
  id: 'cs_test_initial', amount_total: 12500, currency: 'gbp', metadata,
  payment_status: 'unpaid', status: 'open', url: 'https://checkout.stripe.com/c/pay/test',
  expires_at: 2_000_000_000, payment_intent: null, ...overrides,
});
const intent = (overrides: Record<string, unknown> = {}) => ({
  id: 'pi_test_existing', amount: 12500, currency: 'gbp', metadata,
  status: 'requires_payment_method', client_secret: 'test_client_secret', ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = 'sk_test_mockedOnly';
  api.accounts.retrieve.mockResolvedValue({ charges_enabled: true });
  api.checkout.sessions.create.mockResolvedValue(checkout());
  api.checkout.sessions.list.mockResolvedValue({ data: [] });
  api.paymentIntents.create.mockResolvedValue(intent());
});

describe('server Stripe payment attempts', () => {
  it('sets project, source, immutable amount/currency and booking on Checkout and its intent', async () => {
    await createCheckoutSession(125, { ...booking, source: 'assisted_chat' }, {
      purpose: 'admin_link', metadata: { project: 'other-project', amountPence: '1' },
    });
    const [params, options] = api.checkout.sessions.create.mock.calls[0];
    expect(params.metadata).toMatchObject({ project: 'tyrerescue', source: 'assisted_chat',
      type: 'admin_link', amountPence: '12500', currency: 'gbp', bookingId: booking.bookingId });
    expect(params.payment_intent_data.metadata).toMatchObject(params.metadata);
    expect(params.line_items[0].price_data.unit_amount).toBe(12500);
    expect(options.idempotencyKey).toBe('tyrerescue:checkout:booking-1:full:12500:initial');
    expect(api.accounts.retrieve).toHaveBeenCalledOnce();
  });

  it('reuses the open session after cancel/back, without creating another payable payment', async () => {
    api.checkout.sessions.retrieve.mockResolvedValue(checkout());
    const result = await createCheckoutSession(125, booking, { existingStripeRef: 'cs_test_initial' });
    expect(result.sessionId).toBe('cs_test_initial');
    expect(api.checkout.sessions.create).not.toHaveBeenCalled();
    expect(api.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('creates a deterministic successor for an expired session, retaining price and deposit purpose', async () => {
    api.checkout.sessions.retrieve.mockResolvedValue(checkout({ status: 'expired', url: null, metadata: { ...metadata, type: 'deposit' } }));
    await createCheckoutSession(125, { ...booking, type: 'deposit' }, {
      purpose: 'deposit', existingStripeRef: 'cs_test_initial',
    });
    const [params, options] = api.checkout.sessions.create.mock.calls[0];
    expect(options.idempotencyKey).toBe('tyrerescue:checkout:booking-1:deposit:12500:cs_test_initial');
    expect(params.metadata.type).toBe('deposit');
    expect(params.line_items[0].price_data.unit_amount).toBe(12500);
  });

  it.each(['complete', 'paid'])('does not create a new charge after submitted Checkout (%s)', async (state) => {
    api.checkout.sessions.retrieve.mockResolvedValue(checkout(state === 'complete' ? { status: state } : { payment_status: state }));
    await expect(createCheckoutSession(125, booking, { existingStripeRef: 'cs_test_initial' })).rejects.toBeInstanceOf(StripePaymentConflict);
    expect(api.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it.each([
    { amount_total: 12499 }, { currency: 'usd' },
    { metadata: { ...metadata, bookingId: 'other-booking' } },
    { metadata: { ...metadata, refNumber: 'OTHER' } },
    { metadata: { ...metadata, project: 'another-site' } },
  ])('rejects a previous session that no longer matches saved server payment terms: %j', async (changes) => {
    api.checkout.sessions.retrieve.mockResolvedValue(checkout(changes));
    await expect(createCheckoutSession(125, booking, { existingStripeRef: 'cs_test_initial' })).rejects.toBeInstanceOf(StripePaymentConflict);
    expect(api.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('reuses a failed/retryable PaymentIntent', async () => {
    api.paymentIntents.retrieve.mockResolvedValue(intent());
    const result = await createPaymentIntent(125, booking, { existingStripeRef: 'pi_test_existing' });
    expect(result.paymentIntentId).toBe('pi_test_existing');
    expect(api.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('replaces a canceled intent with a deterministic successor', async () => {
    api.paymentIntents.retrieve.mockResolvedValue(intent({ status: 'canceled' }));
    await createPaymentIntent(125, booking, { existingStripeRef: 'pi_test_existing' });
    expect(api.paymentIntents.create.mock.calls[0][1].idempotencyKey).toBe('tyrerescue:pi:booking-1:full:12500:pi_test_existing');
    expect(api.paymentIntents.create.mock.calls[0][0].metadata).toMatchObject({ project: 'tyrerescue', source: 'website', amountPence: '12500' });
  });

  it.each(['succeeded', 'processing', 'requires_capture'])('blocks another payment while an intent is %s', async (status) => {
    api.paymentIntents.retrieve.mockResolvedValue(intent({ status }));
    await expect(createPaymentIntent(125, booking, { existingStripeRef: 'pi_test_existing' })).rejects.toBeInstanceOf(StripePaymentConflict);
    await expect(createCheckoutSession(125, booking, { existingStripeRef: 'pi_test_existing' })).rejects.toBeInstanceOf(StripePaymentConflict);
    expect(api.paymentIntents.create).not.toHaveBeenCalled();
    expect(api.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('cancels an unconfirmed direct intent before changing to hosted Checkout', async () => {
    api.paymentIntents.retrieve.mockResolvedValue(intent());
    await createCheckoutSession(125, booking, { existingStripeRef: 'pi_test_existing' });
    expect(api.paymentIntents.cancel).toHaveBeenCalledWith('pi_test_existing');
    expect(api.checkout.sessions.create).toHaveBeenCalledOnce();
  });

  it('expires an unpaid checkout before resetting a booking', async () => {
    api.checkout.sessions.retrieve.mockResolvedValue(checkout());
    await retireBookingStripePayment('cs_test_initial', 125, booking);
    expect(api.checkout.sessions.expire).toHaveBeenCalledWith('cs_test_initial');
  });

  it('refuses a booking reset when payment is already complete', async () => {
    api.checkout.sessions.retrieve.mockResolvedValue(checkout({ status: 'complete', payment_status: 'paid' }));
    await expect(retireBookingStripePayment('cs_test_initial', 125, booking)).rejects.toBeInstanceOf(StripePaymentConflict);
    expect(api.checkout.sessions.expire).not.toHaveBeenCalled();
  });

  it('refuses a different project before expiring its checkout', async () => {
    api.checkout.sessions.retrieve.mockResolvedValue(checkout({ metadata: { ...metadata, project: 'another-site' } }));
    await expect(retireBookingStripePayment('cs_test_initial', 125, booking)).rejects.toBeInstanceOf(StripePaymentConflict);
    expect(api.checkout.sessions.expire).not.toHaveBeenCalled();
  });

  it('refuses new Checkout or PaymentIntent when the account cannot accept payments', async () => {
    api.accounts.retrieve.mockResolvedValue({ charges_enabled: false });
    await expect(createCheckoutSession(125, booking)).rejects.toThrow('not ready');
    await expect(createPaymentIntent(125, booking)).rejects.toThrow('not ready');
    expect(api.checkout.sessions.create).not.toHaveBeenCalled();
    expect(api.paymentIntents.create).not.toHaveBeenCalled();
  });

  it.each([NaN, Infinity, -1, 0, 0.1])('rejects invalid amount %s before accessing Stripe', async (amount) => {
    await expect(createCheckoutSession(amount, booking)).rejects.toThrow();
    expect(api.accounts.retrieve).not.toHaveBeenCalled();
    expect(api.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
