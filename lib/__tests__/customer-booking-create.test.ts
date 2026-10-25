import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; role: string } }, auth: vi.fn(),
  quote: {} as Record<string, unknown>, existing: null as null | Record<string, unknown>,
  inserted: [] as { table: unknown; values: Record<string, unknown> }[], queries: [] as string[],
  payment: vi.fn(async () => ({ clientSecret: 'isolated-client-secret', paymentIntentId: 'pi_isolated', amountInPence: 10000 })),
}));
vi.mock('@/lib/auth', () => ({ authMobile: async (request: Request) => { state.auth(request); return state.session; } }));
vi.mock('@/lib/security', () => ({ getClientIp: () => 'isolated', checkRateLimit: async () => ({ ok: true }),
  RATE_LIMITS: { bookingCreate: {} }, logSecurityRejection: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ createAdminNotification: vi.fn() }));
vi.mock('@/lib/notifications/urgent-booking-push', () => ({ sendUrgentBookingTopicPush: vi.fn() }));
vi.mock('@/lib/stripe', () => ({ createPaymentIntent: state.payment, StripePaymentConflict: class extends Error {} }));
vi.mock('@/lib/utils', () => ({ generateRefNumber: () => 'TYR-ISOLATED-CREATE' }));
vi.mock('@/lib/availability', () => ({ validateScheduledSlotForBooking: vi.fn() }));
vi.mock('@/lib/payments/payment-summary', () => ({ recordPaymentEvent: vi.fn() }));
vi.mock('@/lib/quote-snapshot', () => ({ parseQuoteTyreSelectionsSnapshot: () => ({ ok: true, data: [
  { tyreId: '30000000-0000-4000-8000-000000000001', quantity: 1, unitPrice: 100, service: 'fit', isPreOrder: true },
] }) }));
vi.mock('next/server', async (original) => ({ ...await original<typeof import('next/server')>(), after: vi.fn() }));
vi.mock('@neondatabase/serverless', () => ({ Pool: class {
  async connect() { return { query: async (sql: string) => {
    state.queries.push(sql); return { rows: sql.includes('SELECT * FROM quotes') ? [state.quote] : [] };
  }, release() {} }; }
  async end() {}
} }));
vi.mock('drizzle-orm/neon-serverless', async () => {
  const { bookings } = await import('../db/schema');
  return { drizzle: () => ({
    select: () => ({ from: (table: unknown) => ({ where: () => ({
      limit: async () => table === bookings && state.existing ? [state.existing] : [],
      for: async () => [{ id: '30000000-0000-4000-8000-000000000001', stockNew: 1 }],
    }) }) }),
    insert: (table: unknown) => ({ values: async (values: Record<string, unknown>) => { state.inserted.push({ table, values }); } }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  }) };
});

import { bookings, bookingStatusHistory } from '../db/schema';
import { POST } from '@/app/api/bookings/create/route';
import { signCustomerBookingAccessToken, verifyCustomerBookingAccessToken } from '../customer-booking-access';

const quoteId = '10000000-0000-4000-8000-000000000001';
function request(token?: string) {
  return new NextRequest('https://isolated.invalid/api/bookings/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer isolated-session', ...(token ? { 'X-Booking-Access': token } : {}) },
    body: JSON.stringify({ quoteId, customerName: 'Synthetic Customer', customerEmail: 'customer@isolated.invalid', customerPhone: '07000000000' }),
  });
}
beforeEach(() => {
  vi.stubEnv('CUSTOMER_BOOKING_ACCESS_SECRET', 'isolated-create-booking-secret-key-only');
  state.auth.mockClear(); state.payment.mockClear(); state.session = null; state.existing = null; state.inserted = []; state.queries = [];
  state.quote = { used: false, metadata: {}, booking_type: 'emergency', service_type: 'fit', expires_at: new Date(Date.now() + 3600000).toISOString(),
    breakdown: { subtotal: 100, vatAmount: 0, total: 100 }, address_line: 'Synthetic address', lat: 55.86, lng: -4.25, distance_miles: 1 };
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('mobile and guest checkout ownership', () => {
  it('passes the incoming Bearer request into authMobile and binds a new booking to its customer', async () => {
    state.session = { user: { id: 'customer-owner', role: 'customer' } };
    const req = request(); const response = await POST(req);
    expect(response.status).toBe(200); expect(state.auth).toHaveBeenCalledExactlyOnceWith(req);
    expect(state.inserted.find((entry) => entry.table === bookings)?.values.userId).toBe('customer-owner');
    expect(state.inserted.find((entry) => entry.table === bookingStatusHistory)?.values.actorUserId).toBe('customer-owner');
    const body = await response.json();
    expect(await verifyCustomerBookingAccessToken(body.bookingAccessToken, { id: body.bookingId, refNumber: body.refNumber })).toBe(true);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  });

  it('keeps guest checkout available with an exactly scoped capability', async () => {
    const response = await POST(request()); const body = await response.json();
    expect(response.status).toBe(200);
    expect(state.inserted.find((entry) => entry.table === bookings)?.values.userId).toBeNull();
    expect(await verifyCustomerBookingAccessToken(body.bookingAccessToken, { id: body.bookingId, refNumber: body.refNumber })).toBe(true);
  });

  it('will not expose a customer payment secret when a different account tries to resume its quote', async () => {
    state.quote.used = true; state.quote.metadata = { bookingId: '20000000-0000-4000-8000-000000000001' };
    state.existing = { id: '20000000-0000-4000-8000-000000000001', refNumber: 'TYR-ISOLATED-RESUME', userId: 'original-owner',
      customerEmail: 'customer@isolated.invalid', customerPhone: '07000000000', status: 'awaiting_payment', totalAmount: '100' };
    state.session = { user: { id: 'different-customer', role: 'customer' } };
    const denied = await POST(request());
    expect(denied.status).toBe(403); expect(state.payment).not.toHaveBeenCalled();
    expect((await denied.json()).bookingAccessToken).toBeUndefined();
    expect(state.queries).toContain('ROLLBACK');
    const token = await signCustomerBookingAccessToken({ bookingId: state.existing.id as string, refNumber: state.existing.refNumber as string });
    expect((await POST(request(token))).status).toBe(200);
  });
});
