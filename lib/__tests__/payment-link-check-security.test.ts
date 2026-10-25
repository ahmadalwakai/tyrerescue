import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[][],
  auth: vi.fn(),
  retrieveIntent: vi.fn(),
  retrieveSession: vi.fn(),
  summary: vi.fn(),
  event: vi.fn(),
  commit: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  persist: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ requireAdminMobile: mocks.auth }));
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema');
  return {
    ...schema,
    db: {
      select: () => ({ from: () => ({ where: () => ({
        limit: async () => mocks.rows.shift() ?? [],
        orderBy: async () => mocks.rows.shift() ?? [],
      }) }) }),
      update: mocks.update,
      insert: mocks.insert,
    },
  };
});
vi.mock('@/lib/stripe', () => ({ stripe: {
  paymentIntents: { retrieve: mocks.retrieveIntent },
  checkout: { sessions: { retrieve: mocks.retrieveSession } },
} }));
vi.mock('@/lib/payments/payment-summary', () => ({
  getBookingPaymentSummary: mocks.summary, recordPaymentEvent: mocks.event,
}));
vi.mock('@/lib/inventory/stock-service', () => ({ commitReservationsForBooking: mocks.commit }));
vi.mock('@/lib/notifications/driver-push', () => ({ notifyDriverPaymentReceived: vi.fn() }));
vi.mock('@/lib/payments/stripe-webhook-store', () => ({ persistStripeWebhook: mocks.persist }));

import { PATCH } from '@/app/api/admin/bookings/[ref]/payment-link/check/route';

const booking = {
  id: '00000000-0000-4000-8000-000000000002', refNumber: 'TR-CHECK-TEST',
  totalAmount: '150.00', status: 'awaiting_payment', stripePiId: 'pi_check_test',
  stripeDepositPiId: null, depositAmountPence: null, driverId: null,
};
const payment = {
  id: 'attempt-check', bookingId: booking.id, stripePiId: 'pi_check_test',
  amount: '150.00', currency: 'gbp', status: 'pending', stripePayload: {},
};
const intent = {
  id: 'pi_check_test', object: 'payment_intent', status: 'succeeded',
  amount: 15000, amount_received: 15000, currency: 'gbp',
  metadata: { bookingId: booking.id, refNumber: booking.refNumber, project: 'tyrerescue' },
};
const pendingSummary = {
  state: 'pending', linkStatus: 'sent', amountToCollectPence: 15000,
  totalPence: 15000, paidPence: null,
};

async function check() {
  return PATCH(new Request('http://localhost/api/admin/bookings/TR-CHECK-TEST/payment-link/check', {
    method: 'PATCH',
  }), { params: Promise.resolve({ ref: booking.refNumber }) });
}

describe('protected Assisted Chat Stripe checker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = [[{ ...booking }], [{ ...payment }], [{ ...booking }]];
    mocks.auth.mockResolvedValue({ user: { id: 'operator-isolated-test' } });
    mocks.retrieveIntent.mockResolvedValue({ ...intent, metadata: { ...intent.metadata } });
    mocks.summary.mockResolvedValue(pendingSummary);
    mocks.commit.mockResolvedValue({ success: true });
    mocks.persist.mockResolvedValue({ state: 'applied', bookingId: booking.id });
    mocks.update.mockImplementation(() => ({ set: () => ({ where: async () => [] }) }));
    mocks.insert.mockImplementation(() => ({ values: async () => [] }));
  });

  it('requires a protected operator session before looking up bookings or Stripe', async () => {
    mocks.auth.mockRejectedValue(new Error('Unauthorized'));
    expect((await check()).status).toBe(401);
    expect(mocks.retrieveIntent).not.toHaveBeenCalled();
    expect(mocks.rows).toHaveLength(3);
  });

  it.each([
    { currency: 'usd' },
    { amount_received: 14999 },
    { amount: 14999, amount_received: 14999 },
    { metadata: { ...intent.metadata, project: 'another-site' } },
    { metadata: { ...intent.metadata, refNumber: 'OTHER-BOOKING' } },
  ])('does not mutate payment, inventory or booking for mismatched Stripe data: %j', async (changes) => {
    mocks.retrieveIntent.mockResolvedValue({ ...intent, ...changes });
    const response = await check();
    expect((await response.json()).checked).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('saves a matching server-verified payment and commits inventory once', async () => {
    mocks.summary.mockResolvedValueOnce(pendingSummary).mockResolvedValue({
      ...pendingSummary, state: 'paid', amountToCollectPence: 0, paidPence: 15000,
    });
    const response = await check();
    expect(await response.json()).toMatchObject({ status: 'paid', checkStatus: 'paid' });
    expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({
      source: 'system', outcome: 'succeeded',
      payment: expect.objectContaining({
        bookingId: booking.id, amountPence: 15000, currency: 'gbp', paymentIntentId: intent.id,
      }),
    }));
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });

  it('returns an already settled server summary without new ledger or inventory writes', async () => {
    mocks.summary.mockResolvedValue({
      ...pendingSummary, state: 'paid', amountToCollectPence: 0, paidPence: 15000,
    });
    expect((await (await check()).json()).checkStatus).toBe('paid');
    expect(mocks.retrieveIntent).not.toHaveBeenCalled();
    expect(mocks.event).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});
