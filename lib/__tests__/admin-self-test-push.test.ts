import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const fixture = vi.hoisted(() => ({
  user: { id: '11111111-1111-4111-8111-111111111111' } as { id: string } | null,
  sessionId: '22222222-2222-4222-8222-222222222222' as string | null,
  rows: [] as Array<{ userId: string; sessionId: string | null; token: string; revoked?: boolean }>,
}));
const mocks = vi.hoisted(() => ({
  execute: vi.fn(), verifySession: vi.fn(), rateLimit: vi.fn(), send: vi.fn(), fetch: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: { execute: mocks.execute } }));
vi.mock('@/lib/auth/admin-device-sessions', () => ({ getCurrentAdminDeviceSessionId: mocks.verifySession }));
vi.mock('@/app/api/mobile/admin/_lib', () => ({
  getMobileAdminUser: async () => fixture.user,
  unauthorizedResponse: () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
}));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock('@/lib/notifications/admin-self-test-push', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/notifications/admin-self-test-push')>(),
  sendAdminSelfTestPush: mocks.send,
}));

import { POST } from '@/app/api/mobile/admin/notifications/test/route';

function request(body: unknown = {}, bearer = 'acs_v1.isolated-secret') {
  return new Request('https://www.tyrerescue.uk/api/mobile/admin/notifications/test', {
    method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  fixture.user = { id: '11111111-1111-4111-8111-111111111111' };
  fixture.sessionId = '22222222-2222-4222-8222-222222222222';
  fixture.rows = [
    { userId: fixture.user.id, sessionId: fixture.sessionId, token: 'ExpoPushToken[current-device]' },
    { userId: fixture.user.id, sessionId: 'another-device', token: 'ExpoPushToken[other-phone]' },
    { userId: fixture.user.id, sessionId: null, token: 'ExpoPushToken[legacy-phone]' },
    { userId: 'other-admin', sessionId: fixture.sessionId, token: 'ExpoPushToken[other-admin]' },
  ];
  mocks.verifySession.mockImplementation(async () => fixture.sessionId);
  mocks.rateLimit.mockResolvedValue({ ok: true, remaining: 0, retryAfterSeconds: 0 });
  mocks.send.mockResolvedValue('accepted');
  mocks.execute.mockImplementation(async (statement: SQL) => {
    const query = new PgDialect().sqlToQuery(statement);
    const [userId, sessionId] = query.params;
    return { rows: fixture.rows.filter((row) => row.userId === userId && row.sessionId === sessionId && !row.revoked).slice(0, 1) };
  });
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('explicit device-bound notification test (isolated database and transport)', () => {
  it('sends one test only to the authenticated current device, without returning tokens', async () => {
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(result.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await result.json()).toEqual({ ok: true, status: 'accepted' });
    expect(mocks.verifySession).toHaveBeenCalledWith('acs_v1.isolated-secret', fixture.user!.id);
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith('ExpoPushToken[current-device]');
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
    expect(query.sql).toContain('push.user_id = $1::uuid AND push.device_session_id = $2::uuid');
    expect(query.sql).toContain('device.user_id = push.user_id');
    expect(query.sql).toContain("device.revoked_at IS NULL AND actor.role = 'admin' AND actor.email_verified = TRUE");
    expect(query.sql).toContain('LIMIT 1');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('does not reveal or send to any device before admin authentication', async () => {
    fixture.user = null;
    expect((await POST(request())).status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.verifySession).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([null, [], { token: 'ExpoPushToken[other-phone]' }, { userId: 'other-admin' }, { deviceSessionId: 'another-device' }, { message: 'custom' }])(
    'rejects client-selected recipients or message fields: %j', async (body) => {
      expect((await POST(request(body))).status).toBe(400);
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed JSON without sending', async () => {
    const result = await POST(new Request('https://www.tyrerescue.uk/api/mobile/admin/notifications/test', { method: 'POST', body: '{' }));
    expect(result.status).toBe(400); expect(mocks.send).not.toHaveBeenCalled();
  });

  it('requires a verified device secret and never falls back to a legacy JWT', async () => {
    expect((await POST(request({}, 'legacy-mobile-jwt'))).status).toBe(409);
    fixture.sessionId = null;
    expect((await POST(request())).status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each(['absent', 'revoked'])('does not substitute another phone when the current registration is %s', async (kind) => {
    if (kind === 'absent') fixture.rows.shift();
    else fixture.rows[0].revoked = true;
    expect((await POST(request())).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('limits repeat tests for this verified administrator and session', async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, remaining: 0, retryAfterSeconds: 42 });
    const result = await POST(request());
    expect(result.status).toBe(429);
    expect(result.headers.get('Retry-After')).toBe('42');
    expect(mocks.rateLimit).toHaveBeenCalledWith(`adminNotificationTest:${fixture.user!.id}:${fixture.sessionId}`, { limit: 1, windowMs: 60_000 });
    expect(mocks.execute).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([['rejected', 502], ['unavailable', 503]] as const)('does not claim success for %s push', async (outcome, status) => {
    mocks.send.mockResolvedValue(outcome);
    const result = await POST(request());
    expect(result.status).toBe(status);
    expect(await result.json()).not.toHaveProperty('ok', true);
  });

  it('redacts database/provider errors instead of exposing credentials', async () => {
    mocks.execute.mockRejectedValue(new Error('secret database token'));
    const result = await POST(request());
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain('secret database token');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('executes the real recipient SQL against isolated PostgreSQL semantics', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const isolated = new PGlite();
    try {
      await isolated.exec(`
        CREATE TABLE users (id uuid PRIMARY KEY, role text, email_verified boolean);
        CREATE TABLE admin_device_sessions (id uuid PRIMARY KEY, user_id uuid, revoked_at timestamptz);
        CREATE TABLE admin_push_tokens (user_id uuid, device_session_id uuid, token text, platform text, updated_at timestamptz);
        INSERT INTO users VALUES ('11111111-1111-4111-8111-111111111111','admin',true),('33333333-3333-4333-8333-333333333333','admin',true);
        INSERT INTO admin_device_sessions VALUES
          ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',NULL),
          ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',NULL);
        INSERT INTO admin_push_tokens VALUES
          ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ExpoPushToken[real-isolated-device]','ios','2026-01-01'),
          ('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','ExpoPushToken[other-phone]','ios','2026-01-02'),
          ('11111111-1111-4111-8111-111111111111',NULL,'ExpoPushToken[legacy-phone]','ios','2026-01-02'),
          ('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','ExpoPushToken[other-admin]','ios','2026-01-02'),
          ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','native-fcm-token','android','2026-01-03');
      `);
      mocks.execute.mockImplementation(async (statement: SQL) => {
        const query = new PgDialect().sqlToQuery(statement);
        return isolated.query(query.sql, query.params);
      });
      expect((await POST(request())).status).toBe(200);
      expect(mocks.send).toHaveBeenCalledExactlyOnceWith('ExpoPushToken[real-isolated-device]');
      mocks.send.mockClear();
      await isolated.exec("UPDATE admin_device_sessions SET revoked_at = NOW() WHERE id = '22222222-2222-4222-8222-222222222222'");
      expect((await POST(request())).status).toBe(409);
      expect(mocks.send).not.toHaveBeenCalled();
      await isolated.exec("UPDATE admin_device_sessions SET revoked_at = NULL; UPDATE users SET role = 'customer' WHERE id = '11111111-1111-4111-8111-111111111111'");
      expect((await POST(request())).status).toBe(409);
      expect(mocks.send).not.toHaveBeenCalled();
    } finally {
      await isolated.close();
    }
  }, 15_000);
});

describe('single-recipient push relay acceptance', () => {
  async function actualSender() {
    return (await vi.importActual<typeof import('@/lib/notifications/admin-self-test-push')>('@/lib/notifications/admin-self-test-push')).sendAdminSelfTestPush;
  }

  it('sends one harmless test message with no booking mutations or broadcast channels', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'ok', id: 'isolated-ticket' }] }) });
    expect(await (await actualSender())('ExpoPushToken[isolated-current]')).toBe('accepted');
    const message = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(message).toHaveLength(1);
    expect(message[0]).toEqual(expect.objectContaining({ to: 'ExpoPushToken[isolated-current]', data: { type: 'admin_notification_test' }, ttl: 60 }));
    expect(message[0]).not.toHaveProperty('badge');
    expect(message[0].body).not.toContain('booking');
  });

  it.each([
    [{ data: [{ status: 'error', message: 'ExpoPushToken[secret]', details: { error: 'DeviceNotRegistered' } }] }, 'rejected'],
    [{ data: [{ status: 'ok' }, { status: 'ok' }] }, 'unavailable'],
    [{ data: [] }, 'unavailable'],
    [{ data: { status: 'ok' } }, 'unavailable'],
    [{ data: [{ status: 'unknown' }] }, 'unavailable'],
    [null, 'unavailable'],
  ])('checks provider response shape before reporting acceptance', async (payload, outcome) => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => payload });
    expect(await (await actualSender())('ExpoPushToken[isolated-current]')).toBe(outcome);
  });

  it('does not contact the relay for malformed device tokens', async () => {
    expect(await (await actualSender())('not-an-expo-token')).toBe('unavailable');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('handles HTTP and transport failures without logging provider/token text', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnLog = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sender = await actualSender();
    mocks.fetch.mockResolvedValueOnce({ ok: false }).mockRejectedValueOnce(new Error('ExpoPushToken[secret]'));
    expect(await sender('ExpoPushToken[isolated-current]')).toBe('unavailable');
    expect(await sender('ExpoPushToken[isolated-current]')).toBe('unavailable');
    expect(errorLog).not.toHaveBeenCalled(); expect(warnLog).not.toHaveBeenCalled();
  });

  it('aborts a stalled relay request after eight seconds', async () => {
    vi.useFakeTimers();
    mocks.fetch.mockImplementation((_url, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const pending = (await actualSender())('ExpoPushToken[isolated-current]');
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await pending).toBe('unavailable');
  });
});
