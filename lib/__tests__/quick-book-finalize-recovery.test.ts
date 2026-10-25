// Real disposable PostgreSQL; no production credentials, Stripe or messages.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';

const state = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema>, reads: 0, writes: 0, auth: vi.fn(), pricing: vi.fn(), stripe: vi.fn(), lock: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: new Proxy({}, { get: (_, key) => {
  const value = Reflect.get(state.db, key);
  if (key === 'select') return (...args: unknown[]) => { state.reads += 1; return Reflect.apply(value, state.db, args); };
  if (['insert', 'update', 'delete', 'transaction'].includes(String(key))) return () => { state.writes += 1; throw new Error('Recovery must not write'); };
  return value;
} }) }));
vi.mock('@/lib/auth', () => ({ requireAdminMobile: state.auth }));
vi.mock('@/lib/config/site', () => ({ getAppOrigin: vi.fn(), getOutboundUrl: vi.fn() }));
vi.mock('@/lib/quick-book-pricing', () => ({ calculateQuickBookPricing: state.pricing }));
vi.mock('@/lib/stripe', () => ({ createCheckoutSession: state.stripe }));
vi.mock('@/lib/notifications', () => ({ createAdminNotification: vi.fn() }));
vi.mock('@/lib/notifications/urgent-booking-push', () => ({ sendUrgentBookingTopicPush: vi.fn() }));
vi.mock('@/lib/mapbox', () => ({ resolveDistance: vi.fn() }));
vi.mock('@/lib/quick-book-distance', () => ({ resolveQuickBookDistance: vi.fn(), distanceResultToKm: vi.fn() }));
vi.mock('@/lib/driver-distance-candidates', () => ({ loadAvailableDriverDistanceCandidates: vi.fn() }));
vi.mock('@/lib/garage', () => ({ GARAGE_ADDRESS: 'Synthetic garage' }));
vi.mock('@/lib/inventory/stock-service', () => ({ commitReservationsForBooking: vi.fn() }));
vi.mock('@/lib/tracking-session', () => ({ ensureTrackingSession: vi.fn() }));
vi.mock('@/lib/weather', () => ({ getWeatherPricingContext: vi.fn() }));
vi.mock('@/lib/email/validate-recipient', () => ({ validateRecipientEmail: vi.fn() }));
vi.mock('@/lib/email/resend', () => ({ sendBookingEmailOnce: vi.fn() }));
vi.mock('@/lib/email/templates', () => ({ bookingConfirmed: vi.fn() }));
vi.mock('@/lib/payments/payment-summary', () => ({ recordPaymentEvent: vi.fn() }));
vi.mock('@/lib/payments/stripe-payment-lock', () => ({ withStripePaymentLock: state.lock }));
vi.mock('drizzle-orm/neon-serverless', () => ({ drizzle: vi.fn() }));

import { GET } from '../../app/api/admin/quick-book/[id]/finalize/route';
import { PATCH } from '../../app/api/admin/quick-book/[id]/route';

const pg = new PGlite();
const quickId = '01000000-0000-4000-8000-000000000001';
const bookingId = '02000000-0000-4000-8000-000000000001';
const context = (id = quickId) => ({ params: Promise.resolve({ id }) });
const get = (id = quickId) => GET(new Request(`https://isolated.invalid/api/admin/quick-book/${id}/finalize`), context(id));

beforeAll(async () => {
  const dialect = new PgDialect();
  for (const table of [schema.quickBookings, schema.bookings]) {
    const { name, columns } = getTableConfig(table);
    const definitions = columns.map((column) => {
      let defaultSql = '';
      if (column.default !== undefined) defaultSql = ` DEFAULT ${typeof column.default === 'object'
        ? dialect.sqlToQuery(column.default as Parameters<PgDialect['sqlToQuery']>[0]).sql
        : typeof column.default === 'string' ? `'${column.default}'` : column.default}`;
      return `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}${column.notNull ? ' NOT NULL' : ''}${defaultSql}`;
    });
    await pg.exec(`CREATE TABLE "${name}" (${definitions.join(',')})`);
  }
  state.db = drizzle(pg, { schema });
}, 30_000);

beforeEach(async () => {
  vi.clearAllMocks(); state.reads = 0; state.writes = 0;
  state.auth.mockResolvedValue({ user: { id: 'admin-isolated', role: 'admin' } });
  state.lock.mockImplementation(async (_key, work) => work({}));
  await pg.exec('SET default_transaction_read_only = off');
  await pg.exec('TRUNCATE quick_bookings,bookings');
  await state.db.insert(schema.quickBookings).values({ id: quickId, adminId: '03000000-0000-4000-8000-000000000001', customerName: 'Synthetic customer', customerPhone: '0000000000', serviceType: 'assess' });
});
afterAll(async () => { await pg.close(); });

async function finalizeFixture(changes: Partial<typeof schema.bookings.$inferInsert> = {}) {
  await state.db.insert(schema.bookings).values({ id: bookingId, refNumber: 'ISOLATED-RECOVER', status: 'awaiting_payment', bookingType: 'emergency', serviceType: 'locking_nut_removal', addressLine: 'Synthetic address', lat: '55', lng: '-4', customerName: 'Synthetic customer', customerEmail: 'customer@isolated.invalid', customerPhone: '0000000000',
    paymentType: 'deposit', depositAmountPence: 2400, remainingBalancePence: 9600,
    subtotal: '100.00', vatAmount: '20.00', totalAmount: '120.00',
    priceSnapshot: { subtotal: 999, vatAmount: 999, total: 999, lineItems: [{ label: 'Synthetic service', amount: 120, type: 'service' }] }, ...changes });
  await state.db.update(schema.quickBookings).set({ bookingId, status: 'finalized' }).where(eq(schema.quickBookings.id, quickId));
}

describe('read-only Assisted Chat finalization recovery', () => {
  it('rejects an unauthorized recovery before reading booking data', async () => {
    state.auth.mockRejectedValue(new Error('Unauthorized'));
    const response = await get();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(state.reads).toBe(0); expect(state.writes).toBe(0);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('validates the quick-book ID and distinguishes a missing session from an unfinalized one', async () => {
    expect((await get('invalid-id')).status).toBe(400);
    expect(state.reads).toBe(0);
    expect(await (await get()).json()).toEqual({ finalized: false });
    const missing = await get('09000000-0000-4000-8000-000000000001');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: 'QUICK_BOOKING_NOT_FOUND' });
    expect(state.writes).toBe(0);
  });
  it('recovers IDs, canonical payment method and stored amounts with the database in read-only mode', async () => {
    await finalizeFixture();
    await pg.exec('SET default_transaction_read_only = on');
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ finalized: true, canCollectPayment: true, response: {
      bookingId, refNumber: 'ISOLATED-RECOVER', paymentMethod: 'deposit', paymentUrl: null,
      depositAmountPence: 2400, remainingBalancePence: 9600,
      breakdown: { subtotal: 100, vatAmount: 20, total: 120 },
    } });
    expect(state.writes).toBe(0); expect(state.pricing).not.toHaveBeenCalled(); expect(state.stripe).not.toHaveBeenCalled();
  });
  it.each([
    { status: 'paid' }, { status: 'cancelled' }, { status: 'completed' }, { status: 'awaiting_payment', depositPaidAt: new Date() },
  ])('does not allow another payment collection for %j', async (changes) => {
    await finalizeFixture(changes);
    expect(await (await get()).json()).toMatchObject({ finalized: true, canCollectPayment: false });
    expect(state.writes).toBe(0); expect(state.stripe).not.toHaveBeenCalled();
  });
  it('normalizes the historical full payment type without creating or reading Stripe sessions', async () => {
    await finalizeFixture({ paymentType: 'full', depositAmountPence: null, remainingBalancePence: null });
    expect(await (await get()).json()).toMatchObject({ finalized: true, response: { paymentMethod: 'stripe', paymentUrl: null } });
    expect(state.stripe).not.toHaveBeenCalled(); expect(state.writes).toBe(0);
  });
  it('refuses dangling or unsupported finalized records instead of treating them as a fresh booking', async () => {
    await state.db.update(schema.quickBookings).set({ bookingId }).where(eq(schema.quickBookings.id, quickId));
    expect((await get()).status).toBe(409);
    await finalizeFixture({ paymentType: 'unknown' });
    const result = await get();
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({ code: 'FINALIZED_BOOKING_NEEDS_REVIEW' });
    expect(state.writes).toBe(0);
  });
  it('an authenticated stale PATCH returns the existing identity before pricing or any write', async () => {
    await finalizeFixture();
    const response = await PATCH(new Request(`https://isolated.invalid/api/admin/quick-book/${quickId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerName: 'Attempted replacement', adminAdjustmentAmount: 999 }),
    }), context());
    expect(response.status).toBe(409);
    expect(state.lock).toHaveBeenCalledWith(`quick-book:${quickId}`, expect.any(Function));
    expect(await response.json()).toMatchObject({ error: 'Already finalized', bookingId });
    expect(state.writes).toBe(0); expect(state.pricing).not.toHaveBeenCalled();
    expect((await state.db.select().from(schema.bookings))[0].totalAmount).toBe('120.00');
    expect((await state.db.select().from(schema.quickBookings))[0].customerName).toBe('Synthetic customer');
  });
  it('rejects an unauthorized PATCH before reading or returning the existing identity', async () => {
    state.auth.mockRejectedValue(new Error('Unauthorized'));
    const response = await PATCH(new Request(`https://isolated.invalid/api/admin/quick-book/${quickId}`, { method: 'PATCH', body: '{}' }), context());
    expect(response.status).toBe(401); expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(state.reads).toBe(0); expect(state.writes).toBe(0);
  });
});
