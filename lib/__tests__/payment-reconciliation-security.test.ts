import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[], retrieveIntent: vi.fn(), retrieveSession: vi.fn(),
  persist: vi.fn(), commit: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => mocks.rows }) }) }),
} }));
vi.mock('@/lib/stripe', () => ({ stripe: {
  paymentIntents: { retrieve: mocks.retrieveIntent },
  checkout: { sessions: { retrieve: mocks.retrieveSession } },
} }));
vi.mock('@/lib/payments/stripe-webhook-store', () => ({ persistStripeWebhook: mocks.persist }));
vi.mock('@/lib/inventory/stock-service', () => ({ commitReservationsForBooking: mocks.commit }));
import { GET } from '@/app/api/cron/reconcile-payments/route';

const bookingId = '00000000-0000-4000-8000-000000000003';
const metadata = { bookingId, refNumber: 'TR-CRON-TEST', project: 'tyrerescue' };
const intent = { object: 'payment_intent', id: 'pi_cron_test', status: 'succeeded',
  amount: 15000, amount_received: 15000, currency: 'gbp', metadata };
const request = () => new Request('http://localhost/api/cron/reconcile-payments', {
  headers: { Authorization: 'Bearer isolated-cron-secret' },
});

describe('server scheduled Stripe reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'isolated-cron-secret');
    mocks.rows = [{ bookingId, stripePiId: intent.id }];
    mocks.retrieveIntent.mockResolvedValue(intent);
    mocks.persist.mockResolvedValue({ state: 'applied', bookingId });
    mocks.commit.mockResolvedValue({ success: true });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('rejects an undefined cron secret even if a caller sends Bearer undefined', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const response = await GET(new Request('http://localhost/api/cron/reconcile-payments', {
      headers: { Authorization: 'Bearer undefined' },
    }));
    expect(response.status).toBe(401);
    expect(mocks.retrieveIntent).not.toHaveBeenCalled();
  });

  it('uses the shared atomic reconciliation and inventory commitment for succeeded payments', async () => {
    expect(await (await GET(request())).json()).toEqual({ reconciled: 1, skipped: 0, failed: 0 });
    expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({
      source: 'system', outcome: 'succeeded',
      payment: expect.objectContaining({ bookingId, paymentIntentId: intent.id, amountPence: 15000 }),
    }));
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });

  it.each([
    { amount_received: 100 },
    { metadata: { ...metadata, project: 'other-site' } },
    { metadata: { ...metadata, bookingId: '00000000-0000-4000-8000-000000000009' } },
    { status: 'processing' },
  ])('ignores incomplete or mismatched payment proof: %j', async (changes) => {
    mocks.retrieveIntent.mockResolvedValue({ ...intent, ...changes });
    expect(await (await GET(request())).json()).toEqual({ reconciled: 0, skipped: 1, failed: 0 });
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('reconciles expired Checkout sessions without creating a payment or consuming inventory', async () => {
    mocks.rows = [{ bookingId, stripePiId: 'cs_cron_test' }];
    mocks.retrieveSession.mockResolvedValue({ object: 'checkout.session', id: 'cs_cron_test',
      amount_total: 15000, currency: 'gbp', payment_intent: null,
      status: 'expired', payment_status: 'unpaid', metadata, expires_at: 1800000000 });
    expect(await (await GET(request())).json()).toEqual({ reconciled: 1, skipped: 0, failed: 0 });
    expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({
      source: 'system', outcome: 'expired', payment: expect.objectContaining({ sessionId: 'cs_cron_test' }),
    }));
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});
