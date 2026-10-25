// Synthetic data in disposable local PostgreSQL only; never the configured DB.
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';

const state = vi.hoisted(() => {
  process.env.NEXTAUTH_SECRET = 'isolated-account-management-test-only-key';
  return { db: null as unknown as PgliteDatabase<typeof schema>, blocked: false, web: null as null | { user: { id: string; role: string } }, compare: vi.fn(), failDb: false,
    webJwt: null as unknown as (input: { token: Record<string, unknown> }) => Promise<Record<string, unknown> | null> };
});
vi.mock('@/lib/db', async () => ({ ...await import('../db/schema'), db: new Proxy({}, { get: (_, key) => {
  if (state.failDb) throw new Error('Synthetic database interruption');
  return Reflect.get(state.db, key);
} }) }));
vi.mock('next-auth', () => ({ default: (options: { callbacks: { jwt: typeof state.webJwt } }) => { state.webJwt = options.callbacks.jwt; return { auth: async () => state.web, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }; } }));
vi.mock('next-auth/providers/credentials', () => ({ default: () => ({}) }));
vi.mock('next-auth/providers/google', () => ({ default: () => ({}) }));
vi.mock('bcryptjs', () => ({ default: { compare: (...args: unknown[]) => state.compare(...args) } }));
vi.mock('@/lib/security', () => ({ checkRateLimit: async () => ({ ok: !state.blocked }), getClientIp: () => 'synthetic', rateLimitedResponse: () => new Response(null, { status: 429 }) }));
vi.mock('@/lib/email/resend', () => ({ createNotificationAndSend: vi.fn() }));
vi.mock('@/lib/email/templates', () => ({ verifyEmail: vi.fn(), welcome: vi.fn() }));
vi.mock('@/lib/payments/payment-summary', () => ({ getBookingPaymentSummary: async () => ({}), isPaymentFullySettledForInvoice: () => false }));

import { PATCH } from '@/app/api/mobile/customer/profile/route';
import { DELETE } from '@/app/api/mobile/customer/account/route';
import { GET } from '@/app/api/mobile/customer/me/route';
import { authMobile, signMobileToken } from '../auth';

const pg = new PGlite();
const userId = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
const bookingId = '20000000-0000-4000-8000-000000000001';
let token: string;
const personal = ['accounts', 'password_reset_tokens', 'email_verification_tokens', 'conversation_participants', 'message_read_state', 'agent_memory', 'chat_sessions'];
function request(method: string, body?: unknown, bearer = token) {
  return new Request('https://isolated.invalid/api/mobile/customer/account', { method, headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeAll(async () => {
  const dialect = new PgDialect();
  for (const table of [schema.users, schema.bookings]) {
    const { name, columns } = getTableConfig(table);
    const definitions = columns.map((column) => {
      let defaultSql = '';
      if (column.default !== undefined) defaultSql = ` DEFAULT ${typeof column.default === 'object' ? dialect.sqlToQuery(column.default as Parameters<PgDialect['sqlToQuery']>[0]).sql : typeof column.default === 'string' ? `'${column.default}'` : column.default}`;
      return `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}${column.notNull ? ' NOT NULL' : ''}${defaultSql}`;
    });
    await pg.exec(`CREATE TABLE "${name}" (${definitions.join(',')})`);
  }
  await pg.exec('ALTER TABLE bookings ADD FOREIGN KEY (user_id) REFERENCES users(id); CREATE UNIQUE INDEX test_users_email ON users(email);');
  for (const table of personal) await pg.exec(`CREATE TABLE ${table} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id));`);
  await pg.exec(`CREATE TABLE customer_push_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id));
    CREATE TABLE customer_push_subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), push_token_id uuid REFERENCES customer_push_tokens(id) ON DELETE CASCADE, owner_user_id uuid REFERENCES users(id));
    CREATE TABLE retained_invoices (user_id uuid REFERENCES users(id), total numeric, customer_name text);
    CREATE TABLE retained_messages (sender_id uuid REFERENCES users(id), body text);`);
  state.db = drizzle(pg, { schema });
}, 30_000);
beforeEach(async () => {
  state.failDb = false; state.blocked = false; state.web = null; state.compare.mockReset(); state.compare.mockResolvedValue(true);
  await pg.exec(`TRUNCATE users,bookings,${personal.join(',')},customer_push_tokens,customer_push_subscriptions,retained_invoices,retained_messages CASCADE;`);
  await state.db.insert(schema.users).values([
    { id: userId, name: 'Synthetic Customer', email: 'customer@isolated.invalid', phone: '07000000000', role: 'customer', passwordHash: 'synthetic-hash', emailVerified: true },
    { id: otherId, name: 'Other Customer', email: 'other@isolated.invalid', role: 'customer', passwordHash: 'other-hash' },
  ]);
  token = await signMobileToken({ id: userId, name: 'Synthetic Customer', email: 'customer@isolated.invalid', role: 'customer' });
});
afterAll(async () => { await pg.close(); });

describe('customer account management', () => {
  it('updates only the current customer name and phone while retaining verified email', async () => {
    const response = await PATCH(request('PATCH', { name: ' Updated Customer ', phone: '+44 7000 000000' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ profile: { id: userId, name: 'Updated Customer', phone: '+44 7000 000000', email: 'customer@isolated.invalid', emailVerified: true } });
    const [other] = await state.db.select().from(schema.users).where(eq(schema.users.id, otherId));
    expect(other.name).toBe('Other Customer');
    expect((await PATCH(request('PATCH', { name: 'Changed', phone: null, email: 'unsafe@isolated.invalid' }))).status).toBe(400);
    expect((await PATCH(request('PATCH', { name: 'Changed', phone: 'not-a-number' }))).status).toBe(400);
    expect((await PATCH(request('PATCH', { name: 'Changed', phone: null }, ''))).status).toBe(401);
  });

  it('requires explicit confirmation and current password and rate-limits destructive attempts', async () => {
    expect((await DELETE(request('DELETE', { password: 'Synthetic123' }))).status).toBe(400);
    state.compare.mockResolvedValue(false);
    expect((await DELETE(request('DELETE', { password: 'wrong', confirmation: 'DELETE' }))).status).toBe(403);
    expect((await GET(request('GET'))).status).toBe(200);
    state.blocked = true;
    expect((await DELETE(request('DELETE', { password: 'Synthetic123', confirmation: 'DELETE' }))).status).toBe(429);
    expect((await state.db.select().from(schema.users).where(eq(schema.users.id, userId)))[0].role).toBe('customer');
  });

  it('atomically removes account identity and credentials while preserving financial ownership', async () => {
    await state.db.insert(schema.bookings).values({ id: bookingId, userId, refNumber: 'SYNTHETIC-A', status: 'completed', bookingType: 'emergency', serviceType: 'fit', addressLine: 'Synthetic address', lat: '55', lng: '-4', customerName: 'Synthetic Customer', customerEmail: 'customer@isolated.invalid', customerPhone: '07000000000', priceSnapshot: {}, subtotal: '100', vatAmount: '0', totalAmount: '100' });
    for (const table of personal) await pg.query(`INSERT INTO ${table} (user_id) VALUES ($1),($2)`, [userId, otherId]);
    await pg.query('INSERT INTO customer_push_tokens (user_id) VALUES ($1),($2)', [userId, otherId]);
    await pg.query('INSERT INTO customer_push_subscriptions (push_token_id, owner_user_id) SELECT id,user_id FROM customer_push_tokens');
    await pg.query('INSERT INTO retained_invoices VALUES ($1,100,$2);', [userId, 'Synthetic Customer']);
    await pg.query('INSERT INTO retained_messages VALUES ($1,$2);', [userId, 'Synthetic service record']);
    const response = await DELETE(request('DELETE', { password: 'Synthetic123', confirmation: 'DELETE' }));
    expect(response.status).toBe(200);
    const [deleted] = await state.db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(deleted).toMatchObject({ id: userId, name: 'Deleted customer', phone: null, passwordHash: null, emailVerified: false, role: 'deleted_customer' });
    expect(deleted.email).toMatch(/^deleted-.*@account\.invalid$/);
    for (const table of personal) expect((await pg.query(`SELECT user_id FROM ${table}`)).rows).toEqual([{ user_id: otherId }]);
    expect((await pg.query('SELECT user_id FROM customer_push_tokens')).rows).toEqual([{ user_id: otherId }]);
    expect((await pg.query('SELECT owner_user_id FROM customer_push_subscriptions')).rows).toEqual([{ owner_user_id: otherId }]);
    expect((await pg.query('SELECT user_id FROM bookings')).rows).toEqual([{ user_id: userId }]);
    expect((await pg.query('SELECT * FROM retained_invoices')).rows).toEqual([{ user_id: userId, total: '100', customer_name: 'Synthetic Customer' }]);
    expect((await pg.query('SELECT body FROM retained_messages')).rows).toEqual([{ body: 'Synthetic service record' }]);
    expect(await authMobile(request('GET'))).toBeNull();
    expect((await GET(request('GET'))).status).toBe(401);
    state.web = { user: { id: userId, role: 'customer' } };
    expect(await authMobile()).toBeNull();
    expect(await state.webJwt({ token: { id: userId, role: 'customer' } })).toBeNull();
  });

  it('rejects a concurrent password change without partially deleting account data', async () => {
    state.compare.mockImplementation(async () => { await state.db.update(schema.users).set({ passwordHash: 'new-hash' }).where(eq(schema.users.id, userId)); return true; });
    const response = await DELETE(request('DELETE', { password: 'old', confirmation: 'DELETE' }));
    expect(response.status).toBe(401);
    expect((await state.db.select().from(schema.users).where(eq(schema.users.id, userId)))[0]).toMatchObject({ role: 'customer', passwordHash: 'new-hash', name: 'Synthetic Customer' });
  });

  it('treats database failures as server errors for customer and staff tokens alike', async () => {
    state.failDb = true;
    await expect(authMobile(request('GET'))).rejects.toThrow('Synthetic database interruption');
    expect((await PATCH(request('PATCH', { name: 'Updated', phone: null }))).status).toBe(500);
    for (const role of ['admin', 'driver']) {
      // Staff tokens are now re-checked against the database; an outage must
      // surface as a failure, never as a 401 that would sign the app out.
      const staff = await signMobileToken({ id: otherId, name: 'Staff', email: 'staff@isolated.invalid', role });
      await expect(authMobile(request('GET', undefined, staff))).rejects.toThrow('Synthetic database interruption');
      expect(await state.webJwt({ token: { id: otherId, role } })).toEqual({ id: otherId, role });
    }
  });
});
