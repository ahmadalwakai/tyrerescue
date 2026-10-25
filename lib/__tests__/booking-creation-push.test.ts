import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  callbacks: [] as Array<() => Promise<void>>,
  trace: [] as string[],
  query: vi.fn(),
  release: vi.fn(),
  end: vi.fn(),
  values: vi.fn(),
  stock: vi.fn(),
  existing: vi.fn(),
  update: vi.fn(),
  push: vi.fn(),
  internal: vi.fn(),
  paymentIntent: vi.fn(),
  paymentEvent: vi.fn(),
  slot: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...await importOriginal<typeof import('next/server')>(),
  after: (callback: () => Promise<void>) => {
    mocks.trace.push('after');
    mocks.callbacks.push(callback);
  },
}));
vi.mock('@neondatabase/serverless', () => ({
  Pool: class {
    async connect() { return { query: mocks.query, release: mocks.release }; }
    end = mocks.end;
  },
}));
vi.mock('drizzle-orm/neon-serverless', () => ({
  drizzle: () => ({
    select: () => ({ from: () => ({ where: () => ({ for: mocks.stock, limit: mocks.existing }) }) }),
    insert: () => ({ values: mocks.values }),
    update: () => ({ set: () => ({ where: mocks.update }) }),
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: async () => null }));
vi.mock('@/lib/utils', () => ({ generateRefNumber: () => 'TR-ISOLATED-BOOKING' }));
vi.mock('@/lib/stripe', () => ({ createPaymentIntent: mocks.paymentIntent, StripePaymentConflict: class extends Error {} }));
vi.mock('@/lib/availability', () => ({ validateScheduledSlotForBooking: mocks.slot }));
vi.mock('@/lib/security', () => ({
  checkRateLimit: () => ({ ok: true }), getClientIp: () => '127.0.0.1',
  RATE_LIMITS: { bookingCreate: {} }, logSecurityRejection: vi.fn(), rateLimitedResponse: vi.fn(),
}));
vi.mock('@/lib/config/site', () => ({ getSourceAppForRequest: () => 'tyre_rescue' }));
vi.mock('@/lib/notifications', () => ({ createAdminNotification: mocks.internal }));
vi.mock('@/lib/notifications/urgent-booking-push', () => ({ sendUrgentBookingTopicPush: mocks.push }));
vi.mock('@/lib/payments/payment-summary', () => ({ recordPaymentEvent: mocks.paymentEvent }));

import { POST } from '@/app/api/bookings/create/route';

const quoteId = '11111111-1111-4111-8111-111111111111';
const tyreId = '22222222-2222-4222-8222-222222222222';
const customer = { customerName: 'Isolated Test', customerEmail: 'isolated@example.invalid', customerPhone: '07700900123' };
const scheduledAt = '2027-01-20T12:00:00.000Z';

function quote(bookingType = 'emergency', overrides: Record<string, unknown> = {}) {
  return {
    id: quoteId, used: false, expires_at: new Date(Date.now() + 600_000).toISOString(),
    booking_type: bookingType, service_type: 'replacement', scheduled_at: bookingType === 'scheduled' ? scheduledAt : null,
    tyre_selections: [{ tyreId, quantity: 1, unitPrice: 100, service: 'fit' }],
    breakdown: { subtotal: 100, vatAmount: 20, total: 120 },
    lat: 55.86, lng: -4.25, distance_miles: 3, address_line: 'Isolated test address', metadata: {}, ...overrides,
  };
}

function request(extra: Record<string, unknown> = {}) {
  return new NextRequest('https://www.tyrerescue.uk/api/bookings/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteId, ...customer, ...extra }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.callbacks.length = 0;
  mocks.trace.length = 0;
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql === 'COMMIT') mocks.trace.push('commit');
    return { rows: sql.includes('SELECT * FROM quotes') ? [quote()] : [] };
  });
  mocks.stock.mockResolvedValue([{ id: tyreId, stockNew: 5, brand: 'Fixture', pattern: 'Fixture' }]);
  mocks.values.mockResolvedValue(undefined);
  mocks.update.mockResolvedValue(undefined);
  mocks.end.mockResolvedValue(undefined);
  mocks.slot.mockResolvedValue({ ok: true, slot: { id: quoteId } });
  mocks.paymentIntent.mockResolvedValue({ clientSecret: 'isolated_client_secret', paymentIntentId: 'pi_isolated', amountInPence: 12000 });
  mocks.paymentEvent.mockResolvedValue(undefined);
  mocks.push.mockResolvedValue(undefined);
  mocks.internal.mockResolvedValue({ id: 'isolated_notification' });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('website booking creation alerts (isolated database, Stripe and notifications)', () => {
  it.each(['emergency', 'scheduled'])('alerts externally and internally for an unpaid %s booking after commit', async (bookingType) => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql === 'COMMIT') mocks.trace.push('commit');
      return { rows: sql.includes('SELECT * FROM quotes') ? [quote(bookingType)] : [] };
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    const booking = await response.json();
    expect(mocks.callbacks).toHaveLength(1);
    expect(mocks.trace).toEqual(['commit', 'after']);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.internal).not.toHaveBeenCalled();
    expect(mocks.values.mock.calls[0][0]).toMatchObject({ status: 'awaiting_payment', totalAmount: '120', bookingType });

    await mocks.callbacks[0]();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      bookingId: booking.bookingId, refNumber: booking.refNumber, bookingType,
      sourceApp: 'tyre_rescue', urgent: bookingType === 'emergency',
      title: bookingType === 'emergency' ? 'Emergency booking received' : 'Scheduled booking received',
      body: expect.stringContaining('awaiting payment'),
      scheduledAt: bookingType === 'scheduled' ? scheduledAt : null,
    }));
    expect(mocks.internal).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      type: 'booking.created', entityId: booking.bookingId,
      title: bookingType === 'emergency' ? 'New Emergency Booking' : 'New Scheduled Booking',
      metadata: expect.objectContaining({ bookingType }),
    }));
  });

  it('keeps the after task alive until both notification channels finish', async () => {
    let finishPush!: () => void;
    let finishInternal!: () => void;
    mocks.push.mockReturnValue(new Promise<void>((resolve) => { finishPush = resolve; }));
    mocks.internal.mockReturnValue(new Promise<void>((resolve) => { finishInternal = resolve; }));
    await POST(request());
    let finished = false;
    const task = mocks.callbacks[0]().then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    finishPush();
    await Promise.resolve();
    expect(finished).toBe(false);
    finishInternal();
    await task;
    expect(finished).toBe(true);
  });

  it('still attempts external push if creating the internal notification fails', async () => {
    mocks.internal.mockRejectedValue(new Error('isolated internal failure'));
    await POST(request());
    await expect(mocks.callbacks[0]()).resolves.toBeUndefined();
    expect(mocks.push).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith('[booking:create] notification failed', expect.objectContaining({ channel: 'internal' }));
  });

  it('keeps the notification registered when a post-commit payment event write fails', async () => {
    mocks.paymentEvent.mockRejectedValue(new Error('isolated ledger failure'));
    expect((await POST(request())).status).toBe(500);
    expect(mocks.trace).toEqual(['commit', 'after']);
    await mocks.callbacks[0]();
    expect(mocks.push).toHaveBeenCalledOnce();
    expect(mocks.internal).toHaveBeenCalledOnce();
  });

  it('does not notify again when retrying checkout with the same saved quote', async () => {
    const existing = { id: quoteId, refNumber: 'TR-EXISTING', ...customer, status: 'awaiting_payment', totalAmount: '120', stripePiId: 'pi_existing' };
    mocks.existing.mockResolvedValue([existing]);
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('SELECT * FROM quotes') ? [quote('emergency', { used: true, metadata: { bookingId: quoteId } })] : [] }));
    expect((await POST(request())).status).toBe(200);
    expect(mocks.callbacks).toHaveLength(0);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.internal).not.toHaveBeenCalled();
    expect(mocks.values).not.toHaveBeenCalled();
  });

  it('does not schedule alerts for a booking that fails before commit', async () => {
    mocks.stock.mockResolvedValue([{ id: tyreId, stockNew: 0 }]);
    expect((await POST(request())).status).toBe(400);
    expect(mocks.callbacks).toHaveLength(0);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('retains the existing integrated-project alert identity and urgency', async () => {
    expect((await POST(request({ sourceApp: 'caledonia_tyres', externalReference: 'CT-ISOLATED' }))).status).toBe(200);
    await mocks.callbacks[0]();
    expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({
      sourceApp: 'caledonia_tyres', urgent: true, title: 'New project booking received', body: expect.stringContaining('CT-ISOLATED'),
    }));
    expect(mocks.internal).toHaveBeenCalledWith(expect.objectContaining({ title: 'New Booking' }));
  });
});
