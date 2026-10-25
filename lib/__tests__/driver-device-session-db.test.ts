// Real, disposable PostgreSQL. Synthetic users only; never reads DATABASE_URL.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import { SignJWT } from 'jose';
import * as schema from '../db/schema';
const state = vi.hoisted(() => {
  process.env.NEXTAUTH_SECRET = 'isolated-driver-device-regression-key';
  return { db: null as unknown as PgliteDatabase<typeof schema> };
});
vi.mock('@/lib/db', async () => ({ ...await import('../db/schema'),
  db: new Proxy({}, { get: (_, key) => Reflect.get(state.db, key) }) }));
vi.mock('next-auth', () => ({ default: () => ({ handlers: {}, auth: async () => null, signIn: vi.fn(), signOut: vi.fn() }) }));
vi.mock('@/lib/security', () => ({ getClientIp: () => 'isolated', checkRateLimit: async () => ({ ok: true }), RATE_LIMITS: { login: {} }, logSecurityRejection: vi.fn() }));
vi.mock('bcryptjs', () => ({ default: { compare: async (password: string) => password === 'isolated-password' } }));
import { createDriverDeviceSession, verifyDriverDeviceSession, revokeDriverDeviceSession } from '../auth/driver-device-sessions';
import { signMobileToken, verifyMobileToken, requireDriverMobile, requireAdminMobile } from '../auth';
import { POST as login } from '../../app/api/driver/auth/login/route';
import { POST as upgrade } from '../../app/api/driver/auth/session/route';
import { POST as logout } from '../../app/api/driver/auth/logout/route';
const pg = new PGlite();
const driverUser = '10000000-0000-4000-8000-000000000001';
const otherUser = '20000000-0000-4000-8000-000000000002';
const driverId = '30000000-0000-4000-8000-000000000003';
const otherDriverId = '40000000-0000-4000-8000-000000000004';
function request(body?: unknown, token?: string) {
  return new Request('https://isolated.invalid/api/driver/auth/session', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeAll(async () => {
  const dialect = new PgDialect();
  for (const table of [schema.users, schema.drivers]) {
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
  const migration = readFileSync('drizzle/migrations/0033_driver_device_sessions.sql', 'utf8');
  await pg.exec(migration); await pg.exec(migration);
  state.db = drizzle(pg, { schema });
}, 30_000);
beforeEach(async () => {
  vi.useRealTimers();
  await pg.exec('TRUNCATE driver_device_sessions,drivers,users CASCADE');
  await state.db.insert(schema.users).values([
    { id: driverUser, email: 'driver@isolated.invalid', name: 'Synthetic driver', role: 'driver', emailVerified: true, passwordHash: 'isolated-hash' },
    { id: otherUser, email: 'other@isolated.invalid', name: 'Other driver', role: 'driver', emailVerified: true, passwordHash: 'isolated-hash' },
  ]);
  await state.db.insert(schema.drivers).values([{ id: driverId, userId: driverUser }, { id: otherDriverId, userId: otherUser }]);
});
afterAll(async () => { vi.useRealTimers(); await pg.close(); });

describe('persistent driver sessions with actual PostgreSQL and HTTP routes', () => {
  it('adds an idempotent driver-only table, hashes secrets, and has no expiry column', async () => {
    const token = await createDriverDeviceSession(driverUser, { deviceName: 'Driver iPhone', platform: 'ios' }, true);
    const [row] = await state.db.select().from(schema.driverDeviceSessions);
    expect(row.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.lastLoginAt).toBeInstanceOf(Date);
    const columns = await pg.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name='driver_device_sessions'");
    expect(columns.rows.map((column) => column.column_name)).not.toContain('expires_at');
    expect((await verifyMobileToken(token)).driverId).toBe(driverId);
  });
  it('retains sign-in after arbitrary inactivity and account email/name updates', async () => {
    const token = await createDriverDeviceSession(driverUser);
    await pg.exec("UPDATE driver_device_sessions SET created_at='2000-01-01',last_seen_at='2000-01-01'");
    await state.db.update(schema.users).set({ name: 'Updated live name' }).where(eq(schema.users.id, driverUser));
    expect((await verifyDriverDeviceSession(token)).name).toBe('Updated live name');
  });
  it('only opts in after valid password and maintains legacy login for other clients', async () => {
    const invalid = await login(request({ email: 'driver@isolated.invalid', password: 'wrong', persistentSession: true }));
    expect(invalid.status).toBe(401);
    expect(await state.db.select().from(schema.driverDeviceSessions)).toHaveLength(0);
    const valid = await login(request({ email: 'driver@isolated.invalid', password: 'isolated-password', persistentSession: true }));
    expect(valid.status).toBe(200); expect(valid.headers.get('cache-control')).toContain('no-store');
    expect((await valid.json()).token).toMatch(/^dcs_v1\./);
    const legacy = await login(request({ email: 'driver@isolated.invalid', password: 'isolated-password' }));
    expect((await legacy.json()).token).not.toMatch(/^dcs_v1\./);
  });
  it('upgrades only a valid driver JWT, uses current identity, and never rotates an existing persistent session', async () => {
    const legacy = await signMobileToken({ id: driverUser, email: 'old@isolated.invalid', name: 'Old', role: 'driver', driverId });
    const first = await upgrade(request({ device: { platform: 'ios' } }, legacy));
    expect(first.status).toBe(200);
    const { token, user } = await first.json();
    expect(token).toMatch(/^dcs_v1\./); expect(user.name).toBe('Synthetic driver'); expect(user.sub).toBeUndefined();
    expect((await (await upgrade(request(undefined, token))).json()).token).toBe(token);
    expect(await state.db.select().from(schema.driverDeviceSessions)).toHaveLength(1);
  });
  it('does not upgrade expired/wrong-role/mismatched-driver tokens or unsigned cookies', async () => {
    const expired = await new SignJWT({ id: driverUser, role: 'driver', driverId }).setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(946684800).sign(new TextEncoder().encode(process.env.NEXTAUTH_SECRET));
    const admin = await signMobileToken({ id: driverUser, email: 'driver@isolated.invalid', name: 'Driver', role: 'admin' });
    const mismatched = await signMobileToken({ id: driverUser, email: 'driver@isolated.invalid', name: 'Driver', role: 'driver', driverId: otherDriverId });
    for (const token of [expired, admin, mismatched, 'invalid', undefined]) expect((await upgrade(request(undefined, token))).status).toBe(401);
    expect(await state.db.select().from(schema.driverDeviceSessions)).toHaveLength(0);
  });
  it('revokes only the matching device id and secret, idempotently', async () => {
    const first = await createDriverDeviceSession(driverUser);
    const second = await createDriverDeviceSession(driverUser);
    const other = await createDriverDeviceSession(otherUser);
    const forged = `dcs_v1.${second.split('.')[1]}.${first.split('.')[2]}`;
    await expect(verifyDriverDeviceSession(forged)).rejects.toThrow('Unauthorized');
    expect(await revokeDriverDeviceSession(forged)).toBe(false);
    expect((await logout(request(undefined, first))).status).toBe(200);
    expect((await logout(request(undefined, first))).status).toBe(200);
    const removed = await upgrade(request(undefined, first));
    expect(removed.status).toBe(401); expect((await removed.json()).code).toBe('SESSION_REVOKED');
    await expect(requireDriverMobile(request(undefined, first))).rejects.toThrow('Unauthorized');
    expect((await verifyDriverDeviceSession(second)).id).toBe(driverUser);
    expect((await verifyDriverDeviceSession(other)).id).toBe(otherUser);
  });
  it('checks current verified role and driver profile on every use, and cannot become admin', async () => {
    const token = await createDriverDeviceSession(driverUser);
    await expect(requireAdminMobile(request(undefined, token))).rejects.toThrow('Unauthorized');
    await state.db.update(schema.users).set({ role: 'customer' }).where(eq(schema.users.id, driverUser));
    await expect(verifyDriverDeviceSession(token)).rejects.toThrow('Unauthorized');
    await state.db.update(schema.users).set({ role: 'driver', emailVerified: false }).where(eq(schema.users.id, driverUser));
    await expect(verifyDriverDeviceSession(token)).rejects.toThrow('Unauthorized');
    await state.db.update(schema.users).set({ emailVerified: true }).where(eq(schema.users.id, driverUser));
    await state.db.delete(schema.drivers).where(eq(schema.drivers.id, driverId));
    await expect(verifyDriverDeviceSession(token)).rejects.toThrow('Unauthorized');
    expect(await revokeDriverDeviceSession(token)).toBe(true);
  });
  it('returns retryable service failure without leaking SQL or deleting sessions', async () => {
    const token = await createDriverDeviceSession(driverUser);
    await pg.exec('ALTER TABLE driver_device_sessions RENAME TO isolated_temporarily_unavailable');
    try {
      const response = await upgrade(request(undefined, token));
      expect(response.status).toBe(503);
      expect(JSON.stringify(await response.json())).not.toMatch(/SELECT|token_hash|isolated_temporarily/);
    } finally { await pg.exec('ALTER TABLE isolated_temporarily_unavailable RENAME TO driver_device_sessions'); }
    expect((await verifyDriverDeviceSession(token)).id).toBe(driverUser);
  });
  it('deleting the account cascades only its device sessions', async () => {
    const token = await createDriverDeviceSession(driverUser);
    const other = await createDriverDeviceSession(otherUser);
    await state.db.delete(schema.users).where(eq(schema.users.id, driverUser));
    await expect(verifyDriverDeviceSession(token)).rejects.toThrow('Unauthorized');
    expect((await verifyDriverDeviceSession(other)).id).toBe(otherUser);
  });
});
