import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[][],
  getPaymentIntent: vi.fn(),
  token: vi.fn(async () => 'invoice-test-token'),
  update: vi.fn(),
  insert: vi.fn(),
  persist: vi.fn(),
  commit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => mocks.rows.shift() ?? [] }) }) }),
    update: mocks.update,
    insert: mocks.insert,
  },
}));
vi.mock('@/lib/stripe', () => ({ getPaymentIntent: mocks.getPaymentIntent }));
vi.mock('@/lib/email', () => ({ hasZeptoMail: false }));
vi.mock('@/lib/email/resend', () => ({ sendBookingEmailOnce: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ createAdminNotification: vi.fn() }));
vi.mock('@/lib/voodoo-sms', () => ({ sendVoodooSms: vi.fn() }));
vi.mock('@/lib/inventory/stock-service', () => ({ commitReservationsForBooking: mocks.commit }));
vi.mock('@/lib/payments/stripe-webhook-store', () => ({ persistStripeWebhook: mocks.persist }));
vi.mock('@/lib/tracking-session', () => ({ ensureTrackingSession: vi.fn() }));
vi.mock('@/app/api/mobile/customer/_lib', () => ({ signCustomerInvoiceToken: mocks.token }));
vi.mock('@/lib/notifications/customer-push', () => ({ notifyCustomerBookingStatus: vi.fn() }));

import { POST } from '@/app/api/bookings/confirm/route';
import { verifyCustomerBookingAccessToken } from '../customer-booking-access';

const booking = {
  id: '00000000-0000-4000-8000-000000000001',
  refNumber: 'TR-ISOLATED-TEST',
  totalAmount: '150.00',
  status: 'driver_assigned',
  stripePiId: 'pi_isolated',
  stripeDepositPiId: null,
  depositAmountPence: null,
  customerEmail: 'payment-test@example.invalid',
};
const payment = {
  id: 'stored-attempt', bookingId: booking.id, stripePiId: 'pi_isolated',
  amount: '150.00', currency: 'gbp', status: 'succeeded',
};
const intent = {
  id: 'pi_isolated', object: 'payment_intent', status: 'succeeded',
  amount: 15000, amount_received: 15000, currency: 'gbp',
  metadata: { bookingId: booking.id, refNumber: booking.refNumber, project: 'tyrerescue' },
};

async function confirm() {
  return POST(new NextRequest('http://localhost/api/bookings/confirm', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: booking.refNumber, paymentIntentId: intent.id }),
  }));
}

describe('booking confirmation server payment evidence', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  beforeEach(() => {
    vi.stubEnv('CUSTOMER_BOOKING_ACCESS_SECRET', 'isolated-confirm-capability-key-never-production');
    vi.clearAllMocks();
    mocks.rows = [[{ ...booking }], [{ ...payment }]];
    mocks.getPaymentIntent.mockResolvedValue({ ...intent, metadata: { ...intent.metadata } });
    mocks.persist.mockResolvedValue({ state: 'duplicate', bookingId: booking.id });
    mocks.commit.mockResolvedValue({ success: true });
  });

  it('requires Stripe verification even for a dispatched booking', async () => {
    mocks.getPaymentIntent.mockResolvedValue({ ...intent, metadata: { ...intent.metadata, project: 'another-site' } });
    const response = await confirm();
    expect(response.status).toBe(400);
    expect(mocks.token).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([
    { currency: 'usd' },
    { amount_received: 14999 },
    { metadata: { ...intent.metadata, refNumber: 'ANOTHER-BOOKING' } },
    { metadata: { ...intent.metadata, type: 'deposit' } },
  ])('rejects mismatched payment facts: %j', async (changes) => {
    mocks.getPaymentIntent.mockResolvedValue({ ...intent, ...changes });
    expect((await confirm()).status).toBe(400);
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it('rejects metadata without a server-registered payment attempt', async () => {
    mocks.rows = [[{ ...booking, stripePiId: 'pi_other' }], []];
    expect((await confirm()).status).toBe(400);
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it('does not revive a cancelled booking or issue an invoice token', async () => {
    mocks.rows = [[{ ...booking, status: 'cancelled' }], [{ ...payment }]];
    const response = await confirm();
    expect(response.status).toBe(409);
    expect((await response.json()).paymentConfirmed).toBe(false);
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns confirmed evidence for an already recorded payment without rewriting it', async () => {
    const response = await confirm();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: 'driver_assigned', paymentConfirmed: true, invoiceDownloadToken: 'invoice-test-token',
      conversion: { value: 150, currency: 'GBP', paymentIntentId: 'pi_isolated' },
    });
    expect(await verifyCustomerBookingAccessToken(body.bookingAccessToken, booking)).toBe(true);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(mocks.getPaymentIntent).toHaveBeenCalledExactlyOnceWith('pi_isolated');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({
      source: 'system', outcome: 'succeeded',
      eventId: 'reconcile:confirm:pi_isolated:succeeded',
    }));
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });
});
