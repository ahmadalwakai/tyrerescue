// Disposable local PostgreSQL only. External payment, password hashing and
// email boundaries are mocked; account and booking authorization SQL is real.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';

const state = vi.hoisted(() => {
  process.env.NEXTAUTH_SECRET = 'isolated-customer-ownership-key-not-production';
  return { db: null as unknown as PgliteDatabase<typeof schema>, emails: vi.fn() };
});
vi.mock('@/lib/db', async () => ({ ...await import('../db/schema'),
  db: new Proxy({}, { get: (_, key) => Reflect.get(state.db, key) }) }));
vi.mock('@/lib/auth', () => ({ authMobile: async () => null, signMobileToken: async () => 'isolated-session' }));
vi.mock('@/lib/security', () => ({ getClientIp: () => 'isolated', checkRateLimit: async () => ({ ok: true }),
  RATE_LIMITS: { register: {}, login: {} }, logSecurityRejection: vi.fn() }));
vi.mock('bcryptjs', () => ({ default: { hash: async () => 'isolated-hash', compare: async (password: string) => password === 'Isolated123' } }));
vi.mock('@/lib/email/resend', () => ({ createNotificationAndSend: state.emails }));
vi.mock('@/lib/email/templates', () => ({ verifyEmail: () => ({ subject: 'test', html: 'test' }), welcome: () => ({ subject: 'test', html: 'test' }) }));
vi.mock('@/lib/payments/payment-summary', () => ({ getBookingPaymentSummary: async () => ({}), isPaymentFullySettledForInvoice: () => false }));

import { POST as register } from '@/app/api/mobile/customer/auth/register/route';
import { POST as login } from '@/app/api/mobile/customer/auth/login/route';
import { POST as claim } from '@/app/api/mobile/customer/auth/claim-booking/route';
import { linkUnclaimedBookingsForEmail } from '@/app/api/mobile/customer/_lib';
import { signCustomerBookingAccessToken } from '../customer-booking-access';

const pg = new PGlite();
const customerId = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
const bookingId = '20000000-0000-4000-8000-000000000001';
const olderId = '20000000-0000-4000-8000-000000000002';
const email = 'customer@isolated.invalid';
function request(body: unknown) {
  return new Request('https://isolated.invalid/api/mobile/customer/auth/claim-booking', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
async function seedUser(overrides: Partial<typeof schema.users.$inferInsert> = {}) {
  await state.db.insert(schema.users).values({ id: customerId, email, name: 'Synthetic Customer',
    role: 'customer', passwordHash: 'isolated-hash', emailVerified: false, ...overrides });
}
async function seedBooking(overrides: Partial<typeof schema.bookings.$inferInsert> = {}) {
  await state.db.insert(schema.bookings).values({ id: bookingId, refNumber: 'TYR-ISOLATED-1', status: 'paid',
    bookingType: 'emergency', serviceType: 'fit', addressLine: 'Synthetic address', lat: '55.86', lng: '-4.25',
    customerName: 'Synthetic Customer', customerEmail: email, customerPhone: '07000000000', quantity: 1,
    priceSnapshot: {}, subtotal: '100', vatAmount: '0', totalAmount: '100', ...overrides });
}
async function bookingOwner(id = bookingId) {
  const [row] = await state.db.select({ userId: schema.bookings.userId }).from(schema.bookings).where(eq(schema.bookings.id, id));
  return row?.userId;
}
beforeAll(async () => {
  const dialect = new PgDialect();
  for (const table of [schema.users, schema.bookings, schema.emailVerificationTokens]) {
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
beforeEach(async () => { state.emails.mockClear(); await pg.exec('TRUNCATE bookings,email_verification_tokens,users'); });
afterAll(async () => { await pg.close(); });

describe('customer ownership and paid guest claims', () => {
  it('does not expose historical bookings when someone registers an unverified email', async () => {
    await seedBooking();
    const response = await register(request({ name: 'New Account', email, password: 'Isolated123' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ created: true, bookings: [], profile: { emailVerified: false } });
    expect(await bookingOwner()).toBeNull();
  });

  it('keeps password sessions usable but never email-links history before verification', async () => {
    await seedUser(); await seedBooking();
    const response = await login(request({ email, password: 'Isolated123' }));
    expect(response.status).toBe(200); expect((await response.json()).bookings).toEqual([]);
    expect(await bookingOwner()).toBeNull();
    await linkUnclaimedBookingsForEmail(customerId, email);
    expect(await bookingOwner()).toBeNull();
  });

  it('links verified email history only to its current customer, preserving other ownership', async () => {
    await seedUser({ emailVerified: true });
    await seedUser({ id: otherId, email: 'other@isolated.invalid', emailVerified: true });
    await seedBooking(); await seedBooking({ id: olderId, refNumber: 'TYR-ISOLATED-2', userId: otherId });
    await linkUnclaimedBookingsForEmail(customerId, 'other@isolated.invalid');
    expect(await bookingOwner()).toBeNull();
    const response = await login(request({ email, password: 'Isolated123' }));
    expect(response.status).toBe(200);
    expect((await response.json()).bookings).toEqual([expect.objectContaining({ bookingId, refNumber: 'TYR-ISOLATED-1' })]);
    expect(await bookingOwner()).toBe(customerId); expect(await bookingOwner(olderId)).toBe(otherId);
  });

  it('requires payment-device proof before creating an account from a known reference and email', async () => {
    await seedBooking();
    const response = await claim(request({ refNumber: 'TYR-ISOLATED-1', email, password: 'Isolated123' }));
    expect(response.status).toBe(403);
    expect(await state.db.select().from(schema.users)).toHaveLength(0);
    expect(await bookingOwner()).toBeNull();
  });

  it('claims only the paid booking represented by a capability, leaving email history private', async () => {
    await seedBooking(); await seedBooking({ id: olderId, refNumber: 'TYR-ISOLATED-2' });
    const bookingAccessToken = await signCustomerBookingAccessToken({ bookingId, refNumber: 'TYR-ISOLATED-1' });
    const response = await claim(request({ refNumber: 'TYR-ISOLATED-1', email, password: 'Isolated123', bookingAccessToken }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.bookings).toEqual([expect.objectContaining({ bookingId })]);
    expect(await bookingOwner()).toBe(payload.profile.id); expect(await bookingOwner(olderId)).toBeNull();
    const replay = await claim(request({ refNumber: 'TYR-ISOLATED-2', email, password: 'Isolated123', bookingAccessToken }));
    expect(replay.status).toBe(403); expect(await bookingOwner(olderId)).toBeNull();
  });

  it('does not overwrite a foreign owner even with a valid capability', async () => {
    await seedUser(); await seedBooking({ userId: otherId });
    const bookingAccessToken = await signCustomerBookingAccessToken({ bookingId, refNumber: 'TYR-ISOLATED-1' });
    const response = await claim(request({ refNumber: 'TYR-ISOLATED-1', email, password: 'Isolated123', bookingAccessToken }));
    expect(response.status).toBe(409); expect(await bookingOwner()).toBe(otherId);
  });

  it.each(['awaiting_payment', 'payment_failed'])('does not claim a %s booking even with checkout proof', async (status) => {
    await seedBooking({ status });
    const bookingAccessToken = await signCustomerBookingAccessToken({ bookingId, refNumber: 'TYR-ISOLATED-1' });
    expect((await claim(request({ refNumber: 'TYR-ISOLATED-1', email, password: 'Isolated123', bookingAccessToken }))).status).toBe(409);
    expect(await state.db.select().from(schema.users)).toHaveLength(0); expect(await bookingOwner()).toBeNull();
  });
});
