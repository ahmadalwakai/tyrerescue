import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  booking: null as Record<string, unknown> | null,
  session: null as null | { user: { id: string; role: string } },
  retrieve: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => state.booking ? [state.booking] : [] }) }) }) } }));
vi.mock('@/lib/auth', () => ({ authMobile: async () => state.session }));
vi.mock('@/lib/stripe', () => ({ getPaymentIntent: state.retrieve }));

import { GET } from '@/app/api/mobile/customer/bookings/[ref]/payment/route';
import { signCustomerBookingAccessToken } from '../customer-booking-access';

const booking = { id: '10000000-0000-4000-8000-000000000001', refNumber: 'TYR-ISOLATED-RECOVERY', userId: 'customer-owner',
  status: 'awaiting_payment', totalAmount: '150.00', stripePiId: 'pi_Recovery123', stripeDepositPiId: null, depositAmountPence: null };
const intent = { object: 'payment_intent', id: booking.stripePiId, status: 'requires_payment_method', amount: 15000,
  amount_received: 0, currency: 'gbp', client_secret: `${booking.stripePiId}_secret_isolated`,
  metadata: { bookingId: booking.id, refNumber: booking.refNumber, type: 'full', project: 'tyrerescue' } };
function recover(accessToken?: string) {
  return GET(new Request(`https://isolated.invalid/api/mobile/customer/bookings/${booking.refNumber}/payment`, {
    headers: accessToken ? { 'X-Booking-Access': accessToken } : {},
  }), { params: Promise.resolve({ ref: booking.refNumber }) });
}
beforeEach(() => {
  vi.stubEnv('CUSTOMER_BOOKING_ACCESS_SECRET', 'isolated-payment-recovery-signing-key-only');
  state.booking = { ...booking }; state.session = { user: { id: booking.userId, role: 'customer' } };
  state.retrieve.mockReset(); state.retrieve.mockResolvedValue({ ...intent, metadata: { ...intent.metadata } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('existing customer payment recovery', () => {
  it.each(['requires_payment_method', 'requires_confirmation', 'requires_action'])(
    'lets the owner resume a verified %s intent, without creating a new payment', async (status) => {
      state.retrieve.mockResolvedValue({ ...intent, status });
      const response = await recover();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ paymentIntentId: intent.id, status, canResume: true, amountPence: 15000, currency: 'gbp', clientSecret: intent.client_secret });
      expect(state.retrieve).toHaveBeenCalledExactlyOnceWith(booking.stripePiId);
      expect(response.headers.get('cache-control')).toContain('no-store');
    },
  );

  it('accepts a scoped guest capability but rejects another booking capability', async () => {
    state.session = null;
    const valid = await signCustomerBookingAccessToken({ bookingId: booking.id, refNumber: booking.refNumber });
    expect((await recover(valid)).status).toBe(200);
    const other = await signCustomerBookingAccessToken({ bookingId: 'another-booking', refNumber: booking.refNumber });
    state.retrieve.mockClear();
    expect((await recover(other)).status).toBe(401); expect(state.retrieve).not.toHaveBeenCalled();
  });

  it.each([null, { user: { id: 'other-customer', role: 'customer' } }, { user: { id: booking.userId, role: 'driver' } }])(
    'never exposes or retrieves a payment for an unauthorized visitor: %j', async (session) => {
      state.session = session;
      const response = await recover();
      expect(response.status).toBe(401); expect(await response.json()).not.toHaveProperty('clientSecret');
      expect(state.retrieve).not.toHaveBeenCalled();
    },
  );

  it.each([
    { id: 'pi_Different123' }, { amount: 14999 }, { currency: 'usd' },
    { metadata: { ...intent.metadata, bookingId: '10000000-0000-4000-8000-000000000002' } },
    { metadata: { ...intent.metadata, refNumber: 'TYR-OTHER-BOOKING' } },
    { metadata: { ...intent.metadata, type: 'deposit' } },
    { metadata: { ...intent.metadata, project: 'other-project' } },
  ])('denies mismatched payment evidence before revealing a client secret: %j', async (changes) => {
    state.retrieve.mockResolvedValue({ ...intent, ...changes });
    const response = await recover();
    expect(response.status).toBe(409); expect(await response.json()).not.toHaveProperty('clientSecret');
  });

  it.each(['succeeded', 'processing', 'canceled', 'requires_capture'])(
    'does not offer checkout again for a %s intent', async (status) => {
      state.retrieve.mockResolvedValue({ ...intent, status, amount_received: status === 'succeeded' ? 15000 : 0 });
      const response = await recover();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ paymentIntentId: intent.id, status, canResume: false, amountPence: 15000, currency: 'gbp' });
    },
  );

  it.each(['paid', 'driver_assigned', 'completed', 'cancelled', 'refunded', 'cancelled_refund_pending'])(
    'does not resume a %s booking even if Stripe still appears to request a payment method', async (status) => {
      state.booking!.status = status;
      const response = await recover();
      expect(await response.json()).toMatchObject({ canResume: false });
    },
  );

  it('refuses a succeeded intent with incomplete funds and a partially received resumable intent', async () => {
    state.retrieve.mockResolvedValue({ ...intent, status: 'succeeded', amount_received: 14999 });
    expect((await recover()).status).toBe(409);
    state.retrieve.mockResolvedValue({ ...intent, amount_received: 1 });
    expect(await (await recover()).json()).toEqual({ paymentIntentId: intent.id, status: intent.status, canResume: false, amountPence: 15000, currency: 'gbp' });
  });

  it('never returns a secret for another intent or falls back to creating one for legacy checkout', async () => {
    state.retrieve.mockResolvedValue({ ...intent, client_secret: 'pi_Another_secret_private' });
    expect(await (await recover()).json()).toMatchObject({ canResume: false });
    state.booking!.stripePiId = 'cs_legacyCheckout'; state.retrieve.mockClear();
    expect((await recover()).status).toBe(409); expect(state.retrieve).not.toHaveBeenCalled();
  });

  it('does not substitute the current stored intent for a different payment attempt on the device', async () => {
    const response = await GET(new Request(`https://isolated.invalid/api/mobile/customer/bookings/${booking.refNumber}/payment?paymentIntentId=pi_Previous123`),
      { params: Promise.resolve({ ref: booking.refNumber }) });
    expect(response.status).toBe(409); expect(await response.json()).not.toHaveProperty('clientSecret');
    expect(state.retrieve).not.toHaveBeenCalled();
  });
});
