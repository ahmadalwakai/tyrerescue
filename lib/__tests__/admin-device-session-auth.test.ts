import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type User = { id: string; email: string; name: string; role: string; emailVerified: boolean; passwordHash: string | null };
type Session = { id: string; userId: string; tokenHash: string; createdAt: Date; revokedAt: Date | null;
  lastSeenAt?: Date | null; lastLoginAt?: Date | null; lastActiveAt?: Date | null; deviceName?: string | null;
  modelName?: string | null; platform?: string | null; osVersion?: string | null; appVersion?: string | null;
  userAgent?: string | null; firstIp?: string | null; lastIp?: string | null; revokedBy?: string | null };
type Predicate = { column: string; value: unknown; op?: 'gte' | 'lte' } | { any: Predicate[] } | Predicate[];
const fixture = vi.hoisted(() => {
  process.env.NEXTAUTH_SECRET = 'isolated-session-regression-key-never-a-production-key';
  const usersTable = { id: 'users.id', email: 'users.email', name: 'users.name', role: 'users.role', emailVerified: 'users.emailVerified' };
  const sessionsTable = Object.fromEntries(['id', 'userId', 'tokenHash', 'revokedAt', 'lastSeenAt', 'lastLoginAt', 'lastActiveAt',
    'deviceName', 'modelName', 'platform', 'osVersion', 'appVersion', 'userAgent', 'firstIp', 'lastIp', 'createdAt'].map((key) => [key, `session.${key}`]));
  return { usersTable, sessionsTable, users: [] as User[], sessions: [] as Session[], unavailable: false, telemetryUnavailable: false, seenWrites: 0 };
});
vi.mock('drizzle-orm', () => ({ eq: (column: string, value: unknown) => ({ column, value }), and: (...args: Predicate[]) => args,
  isNull: (column: string) => ({ column, value: null }), or: (...args: Predicate[]) => ({ any: args }),
  lte: (column: string, value: unknown) => ({ column, value, op: 'lte' }), gte: (column: string, value: unknown) => ({ column, value, op: 'gte' }),
  desc: (column: string) => column, sql: (parts: TemplateStringsArray, ...values: unknown[]) => ({ parts, values }) }));
vi.mock('@/lib/db', () => {
  const field = (record: Record<string, Record<string, unknown>>, column: string) => { const [table, key] = column.split('.'); return record[table]?.[key]; };
  const matches = (record: Record<string, Record<string, unknown>>, condition: Predicate): boolean => {
    if (Array.isArray(condition)) return condition.every((item) => matches(record, item));
    if ('any' in condition) return condition.any.some((item) => matches(record, item));
    const actual = field(record, condition.column);
    if (condition.op) return actual instanceof Date && condition.value instanceof Date
      && (condition.op === 'gte' ? actual >= condition.value : actual <= condition.value);
    return actual === condition.value;
  };
  const project = (record: Record<string, Record<string, unknown>>, selection: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(
    Object.entries(selection).map(([key, value]) => [key, typeof value === 'string' ? field(record, value) : project(record, value as Record<string, unknown>)]),
  );
  return { users: fixture.usersTable, adminDeviceSessions: fixture.sessionsTable, accounts: {}, drivers: { id: 'drivers.id', userId: 'drivers.userId' }, db: {
    select: (selection?: Record<string, unknown>) => ({ from: (table: unknown) => {
      let condition: Predicate = [];
      const query = { innerJoin: () => query, orderBy: () => query, where: (predicate: Predicate) => { condition = predicate; return query; },
        limit: async () => {
          if (fixture.unavailable) throw new Error('isolated database failure marker');
          const records = table === fixture.usersTable ? fixture.users.map((user) => ({ users: user }))
            : fixture.sessions.map((session) => ({ session, users: fixture.users.find((user) => user.id === session.userId)! }));
          return records.filter((record) => matches(record as unknown as Record<string, Record<string, unknown>>, condition))
            .map((record) => selection ? project(record as unknown as Record<string, Record<string, unknown>>, selection)
              : table === fixture.usersTable ? record.users : ('session' in record ? record.session : undefined));
        } };
      return query;
    } }),
    insert: () => ({ values: async (session: Omit<Session, 'createdAt' | 'revokedAt'>) => {
      if (fixture.unavailable) throw new Error('isolated database failure marker');
      fixture.sessions.push({ lastActiveAt: null, lastLoginAt: null, lastSeenAt: null, deviceName: null, modelName: null, platform: null,
        osVersion: null, appVersion: null, userAgent: null, firstIp: null, lastIp: null, ...session, createdAt: new Date(), revokedAt: null });
    } }),
    update: () => ({ set: (changes: Partial<Session>) => ({ where: (condition: Predicate) => {
      const result = (async () => {
        if (fixture.unavailable) throw new Error('isolated database failure marker');
        if (fixture.telemetryUnavailable) throw new Error('isolated activity failure marker');
        const rows = fixture.sessions.filter((session) => matches({ session: session as unknown as Record<string, unknown> }, condition));
        rows.forEach((session) => Object.assign(session, changes));
        if (changes.lastSeenAt && rows.length) fixture.seenWrites += 1;
        return rows;
      })();
      return { then: result.then.bind(result), returning: async () => (await result).map((session) => ({ id: session.id })) };
    } }) }),
    execute: async (query: { values: string[] }) => {
      if (fixture.unavailable) throw new Error('isolated database failure marker');
      const [actor, id, owner] = query.values;
      const session = fixture.sessions.find((row) => row.id === id && row.userId === owner);
      if (!session) return { rows: [] };
      session.revokedAt ??= new Date(); session.revokedBy ??= actor;
      return { rows: [{ id: session.id }] };
    },
  } };
});
vi.mock('next-auth', () => ({ default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }) }));
vi.mock('@/lib/security', () => ({ getClientIp: () => 'isolated', checkRateLimit: async () => ({ ok: true }), RATE_LIMITS: { login: {} }, logSecurityRejection: vi.fn() }));
vi.mock('bcryptjs', () => ({ default: { compare: async (password: string) => password === 'test-password' } }));

import { createAdminDeviceSession, verifyAdminDeviceSession, revokeAdminDeviceSession, normaliseAdminDeviceDetails,
  adminDeviceSessionMetadataFromRequest, listAdminDeviceSessions, recordAdminDeviceHeartbeat } from '@/lib/auth/admin-device-sessions';
import { signMobileToken, verifyMobileToken, requireDriverMobile } from '@/lib/auth';
import { POST as login } from '@/app/api/mobile/admin/auth/login/route';
import { POST as upgrade } from '@/app/api/mobile/admin/auth/session/route';
import { POST as logout } from '@/app/api/mobile/admin/auth/logout/route';
import { GET as devices } from '@/app/api/mobile/admin/auth/devices/route';
import { POST as heartbeat } from '@/app/api/mobile/admin/auth/devices/heartbeat/route';
import { DELETE as removeDevice } from '@/app/api/mobile/admin/auth/devices/[id]/route';

const adminId = '10000000-0000-4000-8000-000000000001';
function request(body?: unknown, token?: string) {
  return new Request('https://isolated.invalid/api/mobile/admin/auth/session', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
beforeEach(() => {
  fixture.sessions = []; fixture.unavailable = false; fixture.telemetryUnavailable = false; fixture.seenWrites = 0;
  fixture.users = [{ id: adminId, email: 'admin@isolated.invalid', name: 'Test admin', role: 'admin', emailVerified: true, passwordHash: 'mock-hash' }];
});

describe('account-scoped signed-in device management', () => {
  const deviceBody = { state: 'active', device: { deviceName: 'Admin iPhone', modelName: 'iPhone', platform: 'ios', osVersion: '18.5', appVersion: '2.0' } };
  it('records true password login separately from upgrade/session creation and foreground activity', async () => {
    const response = await login(request({ email: 'admin@isolated.invalid', password: 'test-password', persistentSession: true,
      device: deviceBody.device }));
    const { token } = await response.json();
    expect(fixture.sessions[0].lastLoginAt).toBeInstanceOf(Date);
    expect(fixture.sessions[0].lastSeenAt).toBeInstanceOf(Date);
    expect(fixture.sessions[0].lastActiveAt).toBeNull();
    expect(fixture.sessions[0].deviceName).toBe('Admin iPhone');
    const legacy = await signMobileToken({ id: adminId, email: 'admin@isolated.invalid', name: 'Test', role: 'admin' });
    await upgrade(request({ device: { platform: 'ios' } }, legacy));
    expect(fixture.sessions[1].lastLoginAt).toBeNull();
    expect(fixture.sessions[1].lastActiveAt).toBeNull();
    expect((await heartbeat(request(deviceBody, token))).status).toBe(200);
    expect(fixture.sessions[0].lastActiveAt).toBeInstanceOf(Date);
  });
  it('keeps nullable unknown history for old sessions instead of inventing login or foreground times', async () => {
    const token = await createAdminDeviceSession(adminId);
    fixture.sessions[0].lastSeenAt = null;
    const [item] = await listAdminDeviceSessions(adminId, token.split('.')[1]);
    expect(item).toMatchObject({ lastLoginAt: null, lastSeenAt: null, lastActiveAt: null, deviceName: null, modelName: null });
  });
  it('throttles accepted-auth lastSeen writes to once per minute and never turns them into foreground activity', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
    const token = await createAdminDeviceSession(adminId);
    await verifyAdminDeviceSession(token);
    vi.advanceTimersByTime(59_999); await verifyAdminDeviceSession(token);
    expect(fixture.seenWrites).toBe(0);
    vi.advanceTimersByTime(1); await verifyAdminDeviceSession(token); await verifyAdminDeviceSession(token);
    expect(fixture.seenWrites).toBe(1);
    expect(fixture.sessions[0].lastActiveAt).toBeNull();
  });
  it('does not reject a valid sign-in when best-effort lastSeen telemetry fails', async () => {
    const token = await createAdminDeviceSession(adminId);
    fixture.sessions[0].lastSeenAt = null; fixture.telemetryUnavailable = true;
    expect((await verifyAdminDeviceSession(token)).id).toBe(adminId);
    expect(fixture.sessions[0].lastSeenAt).toBeNull();
  });
  it('bounds untrusted device labels and sanitizes markup/control characters without accepting identity fields', () => {
    const details = normaliseAdminDeviceDetails({ deviceName: `<script>\u0000${'x'.repeat(200)}</script>`, modelName: 'y'.repeat(200),
      platform: '<script>', osVersion: 'z'.repeat(100), appVersion: 'a'.repeat(90), userId: adminId, token: 'do-not-accept' });
    expect(details.deviceName).toHaveLength(120); expect(details.modelName).toHaveLength(120);
    expect(details.osVersion).toHaveLength(64); expect(details.appVersion).toHaveLength(40);
    expect(details).not.toHaveProperty('platform'); expect(details).not.toHaveProperty('userId'); expect(details).not.toHaveProperty('token');
    expect(details.deviceName).not.toMatch(/[<>\u0000]/);
  });
  it('reads bounded IP/user-agent from server headers, never from device body', () => {
    const req = new Request('https://isolated.invalid', { headers: { 'x-forwarded-for': '203.0.113.1, 198.51.100.2', 'user-agent': 'a'.repeat(300) } });
    expect(adminDeviceSessionMetadataFromRequest(req, { ip: '192.0.2.1' })).toMatchObject({ ip: '203.0.113.1', userAgent: 'a'.repeat(256), passwordLogin: false });
    expect(adminDeviceSessionMetadataFromRequest(new Request('https://isolated.invalid', { headers: { 'x-forwarded-for': '<invalid>' } }), {})).not.toHaveProperty('ip');
  });
  it('lists only the authenticated account and never returns a credential, digest or user agent', async () => {
    const token = await createAdminDeviceSession(adminId, { deviceName: 'Current iPhone', userAgent: 'private-agent' });
    const second = await createAdminDeviceSession(adminId);
    const otherId = '20000000-0000-4000-8000-000000000002';
    fixture.users.push({ ...fixture.users[0], id: otherId, email: 'other@isolated.invalid' });
    await createAdminDeviceSession(otherId, { deviceName: 'Other account device' });
    const response = await devices(request(undefined, token));
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toContain('no-store');
    const data = await response.json();
    expect(data.currentSessionId).toBe(token.split('.')[1]); expect(data.items).toHaveLength(2);
    expect(data.items.find((item: { id: string }) => item.id === token.split('.')[1]).isCurrent).toBe(true);
    const text = JSON.stringify(data);
    for (const secret of [token, second, fixture.sessions[0].tokenHash, 'private-agent', 'Other account device']) expect(text).not.toContain(secret);
  });
  it('permits a valid legacy admin to list owned sessions without claiming a current opaque installation', async () => {
    const legacy = await signMobileToken({ id: adminId, email: 'admin@isolated.invalid', name: 'Test', role: 'admin' });
    const response = await devices(request(undefined, legacy));
    expect(response.status).toBe(200); expect((await response.json()).currentSessionId).toBeNull();
  });
  it('scopes removal to the authenticated account, preserving other devices and accounts', async () => {
    const token = await createAdminDeviceSession(adminId);
    const second = await createAdminDeviceSession(adminId);
    const otherId = '20000000-0000-4000-8000-000000000002';
    fixture.users.push({ ...fixture.users[0], id: otherId, email: 'other@isolated.invalid' });
    const other = await createAdminDeviceSession(otherId);
    expect((await removeDevice(request(undefined, token), { params: Promise.resolve({ id: other.split('.')[1] }) })).status).toBe(404);
    const response = await removeDevice(request(undefined, token), { params: Promise.resolve({ id: second.split('.')[1] }) });
    expect(await response.json()).toEqual({ ok: true, removedCurrent: false });
    expect((await removeDevice(request(undefined, token), { params: Promise.resolve({ id: second.split('.')[1] }) })).status).toBe(200);
    expect((await verifyAdminDeviceSession(token)).id).toBe(adminId);
    expect((await verifyAdminDeviceSession(other)).id).toBe(otherId);
    await expect(verifyAdminDeviceSession(second)).rejects.toThrow('Unauthorized');
  });
  it('identifies removal of the current device and emits a trusted explicit-revocation heartbeat response', async () => {
    const token = await createAdminDeviceSession(adminId);
    const id = token.split('.')[1];
    const removed = await removeDevice(request(undefined, token), { params: Promise.resolve({ id }) });
    expect(await removed.json()).toEqual({ ok: true, removedCurrent: true });
    const response = await heartbeat(request(deviceBody, token));
    expect(response.status).toBe(401); expect(await response.json()).toEqual({ error: 'Unauthorized', code: 'DEVICE_SESSION_REVOKED', sessionId: id });
    const wrong = `${token.slice(0, -3)}xxx`;
    const tampered = await heartbeat(request(deviceBody, wrong));
    expect(tampered.status).toBe(401); expect(await tampered.json()).not.toHaveProperty('code');
  });
  it('does not mark unrelated401 or storage errors as explicit device removal', async () => {
    const token = await createAdminDeviceSession(adminId);
    fixture.users[0].role = 'customer';
    const unauthorized = await heartbeat(request(deviceBody, token));
    expect(unauthorized.status).toBe(401); expect(await unauthorized.json()).not.toHaveProperty('code');
    fixture.users[0].role = 'admin'; fixture.unavailable = true;
    const response = await heartbeat(request(deviceBody, token));
    expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty('code');
  });
  it('requires opaque authentication and a genuine foreground state without client-supplied timestamps', async () => {
    const token = await createAdminDeviceSession(adminId);
    expect((await heartbeat(request(deviceBody))).status).toBe(401);
    expect((await devices(request())).status).toBe(401);
    expect((await removeDevice(request(), { params: Promise.resolve({ id: token.split('.')[1] }) })).status).toBe(401);
    for (const body of [{ ...deviceBody, state: 'background' }, { ...deviceBody, lastActiveAt: '2100-01-01' }, { ...deviceBody, device: { userId: adminId } }]) {
      expect((await heartbeat(request(body, token))).status).toBe(400);
    }
    expect(fixture.sessions[0].lastActiveAt).toBeNull();
  });
  it('uses server time for activity and never changes the recorded password login time', async () => {
    const token = await createAdminDeviceSession(adminId);
    vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T12:00:00Z'));
    expect(await recordAdminDeviceHeartbeat(token, { deviceName: 'Updated iPhone', ip: '203.0.113.2' })).toBe(true);
    expect(fixture.sessions[0].lastActiveAt?.toISOString()).toBe('2030-01-01T12:00:00.000Z');
    expect(fixture.sessions[0].lastIp).toBe('203.0.113.2'); expect(fixture.sessions[0].firstIp).toBeNull();
    expect(fixture.sessions[0].lastLoginAt).toBeNull();
  });
});
afterEach(() => vi.useRealTimers());

describe('opt-in durable admin device credentials', () => {
  it('issues an unpredictable opaque secret and persists only its SHA256 digest', async () => {
    const token = await createAdminDeviceSession(adminId);
    expect(token).toMatch(/^acs_v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    expect(fixture.sessions[0].tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(fixture.sessions)).not.toContain(token);
    expect(JSON.stringify(fixture.sessions)).not.toContain(token.split('.')[2]);
    expect(await verifyMobileToken(token)).toEqual({ id: adminId, sub: adminId, name: 'Test admin', email: 'admin@isolated.invalid', role: 'admin' });
  });
  it('survives arbitrary clock age and inactivity without changing the device credential', async () => {
    const token = await createAdminDeviceSession(adminId);
    vi.useFakeTimers(); vi.setSystemTime(new Date('2100-01-01T12:00:00Z'));
    expect((await verifyAdminDeviceSession(token)).id).toBe(adminId);
    expect(fixture.sessions).toHaveLength(1);
  });
  it('revokes only the current installation, with idempotent repeated logout', async () => {
    const current = await createAdminDeviceSession(adminId);
    const other = await createAdminDeviceSession(adminId);
    expect(current).not.toBe(other);
    expect(await revokeAdminDeviceSession(current)).toBe(true);
    const revokedAt = fixture.sessions[0].revokedAt;
    expect(await revokeAdminDeviceSession(current)).toBe(true);
    expect(fixture.sessions[0].revokedAt).toBe(revokedAt);
    await expect(verifyMobileToken(current)).rejects.toThrow('Unauthorized');
    expect((await verifyMobileToken(other)).id).toBe(adminId);
    expect(fixture.sessions[1].revokedAt).toBeNull();
  });
  it('never revokes another installation using its UUID and the wrong secret', async () => {
    const first = await createAdminDeviceSession(adminId);
    const second = await createAdminDeviceSession(adminId);
    const forged = `acs_v1.${second.split('.')[1]}.${first.split('.')[2]}`;
    expect(await revokeAdminDeviceSession(forged)).toBe(false);
    await expect(verifyAdminDeviceSession(forged)).rejects.toThrow('Unauthorized');
    expect(fixture.sessions.every((session) => session.revokedAt === null)).toBe(true);
  });
  it.each(['acs_v1.bad', 'acs_v1.00000000-0000-4000-8000-000000000000.short', 'wrong-token'])(
    'rejects malformed credentials %s', async (token) => {
      await expect(verifyAdminDeviceSession(token)).rejects.toThrow('Unauthorized');
      expect(await revokeAdminDeviceSession(token)).toBe(false);
    },
  );
  it('checks current user role, verified email and deletion on every request', async () => {
    const token = await createAdminDeviceSession(adminId);
    fixture.users[0].role = 'customer';
    await expect(verifyMobileToken(token)).rejects.toThrow('Unauthorized');
    fixture.users[0].role = 'admin'; fixture.users[0].emailVerified = false;
    await expect(verifyMobileToken(token)).rejects.toThrow('Unauthorized');
    fixture.users = [];
    await expect(verifyMobileToken(token)).rejects.toThrow();
  });
  it('cannot use an opaque admin session as a driver credential', async () => {
    const token = await createAdminDeviceSession(adminId);
    await expect(requireDriverMobile(request(undefined, token))).rejects.toThrow('Unauthorized');
  });
  it.each(['driver', 'customer'])('cannot create a persistent session for %s', async (role) => {
    fixture.users[0].role = role;
    await expect(createAdminDeviceSession(adminId)).rejects.toThrow('Unauthorized');
    expect(fixture.sessions).toHaveLength(0);
  });
});

describe('opt-in login and valid legacy credential upgrade', () => {
  it.each([undefined, false, 'true', 1])('keeps legacy JWT behavior unless boolean true is supplied (%s)', async (persistentSession) => {
    const response = await login(request({ email: 'admin@isolated.invalid', password: 'test-password', persistentSession }));
    expect(response.status).toBe(200);
    const { token } = await response.json();
    expect(token.startsWith('acs_v1.')).toBe(false);
    const verified = await jwtVerify(token, new TextEncoder().encode(process.env.NEXTAUTH_SECRET));
    expect(verified.payload.exp! - verified.payload.iat!).toBe(7 * 24 * 60 * 60);
    expect(fixture.sessions).toHaveLength(0);
  });
  it('issues durable credentials only for explicit successful admin login', async () => {
    const response = await login(request({ email: 'admin@isolated.invalid', password: 'test-password', persistentSession: true }));
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect((await response.json()).token).toMatch(/^acs_v1\./);
    expect(fixture.sessions).toHaveLength(1);
    expect((await login(request({ email: 'admin@isolated.invalid', password: 'incorrect', persistentSession: true }))).status).toBe(401);
    expect(fixture.sessions).toHaveLength(1);
  });
  it('upgrades a valid legacy admin JWT and reuses an existing opaque token', async () => {
    const legacy = await signMobileToken({ id: adminId, email: 'old@isolated.invalid', name: 'Old name', role: 'admin' });
    const response = await upgrade(request(undefined, legacy));
    expect(response.status).toBe(200);
    const { token, user } = await response.json();
    expect(token).toMatch(/^acs_v1\./); expect(user.name).toBe('Test admin');
    const again = await upgrade(request(undefined, token));
    expect((await again.json()).token).toBe(token); expect(fixture.sessions).toHaveLength(1);
  });
  it('rejects expired JWTs without creating a permanent session', async () => {
    const expired = await new SignJWT({ id: adminId, role: 'admin' }).setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(946684800).sign(new TextEncoder().encode(process.env.NEXTAUTH_SECRET));
    expect((await upgrade(request(undefined, expired))).status).toBe(401);
    expect(fixture.sessions).toHaveLength(0);
  });
  it('rejects legacy customer tokens and retains legacy role constraints', async () => {
    const token = await signMobileToken({ id: adminId, email: 'admin@isolated.invalid', name: 'Test', role: 'customer' });
    expect((await verifyMobileToken(token)).role).toBe('customer');
    expect((await upgrade(request(undefined, token))).status).toBe(401);
    expect(fixture.sessions).toHaveLength(0);
  });
  it('rejects a legacy driver token for an account that is not a current driver', async () => {
    const token = await signMobileToken({ id: adminId, email: 'admin@isolated.invalid', name: 'Test', role: 'driver', driverId: 'driver-id' });
    await expect(verifyMobileToken(token)).rejects.toThrow();
    await expect(requireDriverMobile(request(undefined, token))).rejects.toThrow('Unauthorized');
    expect((await upgrade(request(undefined, token))).status).toBe(401);
    expect(fixture.sessions).toHaveLength(0);
  });
  it('rejects users whose verified/admin status changed since their legacy JWT was issued', async () => {
    const token = await signMobileToken({ id: adminId, email: 'admin@isolated.invalid', name: 'Test', role: 'admin' });
    fixture.users[0].emailVerified = false;
    expect((await upgrade(request(undefined, token))).status).toBe(401);
    fixture.users[0].emailVerified = true; fixture.users[0].role = 'customer';
    expect((await upgrade(request(undefined, token))).status).toBe(401);
  });
  it('requires a bearer credential, and never discloses service failures', async () => {
    expect((await upgrade(request())).status).toBe(401);
    expect((await upgrade(request(undefined, 'invalid'))).status).toBe(401);
    const token = await createAdminDeviceSession(adminId);
    fixture.unavailable = true;
    const response = await upgrade(request(undefined, token));
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain('marker');
  });
  it('logout revokes only the presented valid opaque device and remains idempotent', async () => {
    const token = await createAdminDeviceSession(adminId);
    const other = await createAdminDeviceSession(adminId);
    expect((await logout(request(undefined, token))).status).toBe(200);
    expect((await logout(request(undefined, token))).status).toBe(200);
    expect((await upgrade(request(undefined, token))).status).toBe(401);
    expect((await verifyMobileToken(other)).id).toBe(adminId);
    expect((await logout(request())).status).toBe(401);
  });
});
