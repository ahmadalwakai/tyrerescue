import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TokenRow = { id: string; userId: string; token: string; platform: string; deviceSessionId?: string | null };
const state = vi.hoisted(() => ({ rows: [] as TokenRow[], user: { id: 'admin-1' } as { id: string } | null,
  afterSelect: null as (() => void) | null, verifiedSessionId: null as string | null }));
const database = vi.hoisted(() => ({
  insert: vi.fn(() => ({ values: (value: Omit<TokenRow, 'id'>) => ({
    onConflictDoUpdate: async () => {
      const existing = state.rows.find((row) => row.token === value.token);
      if (existing) Object.assign(existing, value);
      else state.rows.push({ id: `device-${state.rows.length}`, ...value });
    },
  }) })),
  select: vi.fn(() => ({ from: () => ({ where: async () => {
    const selected = state.rows.filter((row) => row.userId === state.user?.id).map((row) => ({ ...row }));
    const afterSelect = state.afterSelect; state.afterSelect = null; afterSelect?.();
    return selected;
  } }) })),
  delete: vi.fn(() => ({ where: async (conditions: Array<{ column: keyof TokenRow; value: string | null }>) => {
    state.rows = state.rows.filter((row) => !conditions.every((condition) => condition.value === null ? row[condition.column] == null : row[condition.column] === condition.value));
  } })),
}));
vi.mock('@/lib/db', () => ({ db: database }));
vi.mock('@/lib/db/schema', () => ({ adminPushTokens: { id: 'id', token: 'token', userId: 'userId', platform: 'platform', deviceSessionId: 'deviceSessionId' } }));
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...await importOriginal<typeof import('drizzle-orm')>(),
  eq: (column: string, value: string) => ({ column, value }),
  and: (...conditions: unknown[]) => conditions,
  isNull: (column: string) => ({ column, value: null }),
}));
vi.mock('@/lib/auth/admin-device-sessions', () => ({ getCurrentAdminDeviceSessionId: async () => state.verifiedSessionId }));
vi.mock('@/app/api/mobile/admin/_lib', () => ({
  getMobileAdminUser: async () => state.user,
  unauthorizedResponse: () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
}));

import { DELETE, POST } from '@/app/api/mobile/admin/push-token/route';

function request(body: unknown, method = 'POST', bearer?: string) {
  return new NextRequest('https://www.tyrerescue.uk/api/mobile/admin/push-token', {
    method, headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.rows = [
    { id: 'existing-iphone', userId: 'admin-1', token: 'ExponentPushToken[existing-iphone]', platform: 'ios' },
    { id: 'native-android', userId: 'admin-1', token: 'native-fcm-token', platform: 'android' },
    { id: 'other-admin', userId: 'admin-2', token: 'ExpoPushToken[other-admin]', platform: 'ios' },
  ];
  state.user = { id: 'admin-1' };
  state.afterSelect = null; state.verifiedSessionId = null;
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('admin iPhone push registration', () => {
  it.each(['ExponentPushToken[test-device]', 'ExpoPushToken[test-device]'])(
    'accepts the Expo token format %s without removing another device', async (token) => {
      const response = await POST(request({ token, platform: 'ios' }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(state.rows).toHaveLength(4);
      expect(state.rows).toContainEqual(expect.objectContaining({ id: 'existing-iphone' }));
      expect(database.delete).not.toHaveBeenCalled();
    },
  );

  it('does not silence an existing iPhone when the same admin registers Android', async () => {
    await POST(request({ token: 'ExpoPushToken[new-android]', platform: 'android' }));
    expect(state.rows.find((row) => row.id === 'existing-iphone')?.platform).toBe('ios');
    expect(state.rows.find((row) => row.token === 'ExpoPushToken[new-android]')?.platform).toBe('android');
    expect(state.rows.find((row) => row.id === 'other-admin')?.userId).toBe('admin-2');
  });

  it('keeps registration idempotent when the app retries', async () => {
    for (let i = 0; i < 2; i++) await POST(request({ token: 'ExpoPushToken[retry-device]', platform: 'ios' }));
    expect(state.rows.filter((row) => row.token === 'ExpoPushToken[retry-device]')).toHaveLength(1);
    expect(state.rows).toHaveLength(4);
  });

  it('requires an authenticated admin before reading or changing tokens', async () => {
    state.user = null;
    expect((await POST(request({ token: 'ExpoPushToken[blocked]', platform: 'ios' }))).status).toBe(401);
    expect((await DELETE(request({ token: 'ExpoPushToken[blocked]' }, 'DELETE'))).status).toBe(401);
    expect(database.insert).not.toHaveBeenCalled();
    expect(database.select).not.toHaveBeenCalled();
    expect(database.delete).not.toHaveBeenCalled();
  });

  it.each([null, [], { token: 'native-fcm-token' }, { token: 'ExpoPushToken[]' }, { token: 'ExpoPushToken[bad]extra' }, { token: 123 }])(
    'rejects malformed registration bodies without changing any devices: %j', async (body) => {
      expect((await POST(request(body))).status).toBe(400);
      expect(state.rows).toHaveLength(3);
      expect(database.insert).not.toHaveBeenCalled();
    },
  );

  it('handles invalid JSON without an internal server error', async () => {
    const response = await POST(new NextRequest('https://www.tyrerescue.uk/api/mobile/admin/push-token', { method: 'POST', body: '{' }));
    expect(response.status).toBe(400);
    expect(database.insert).not.toHaveBeenCalled();
  });

  it('unregisters only the current device without silencing another iPhone', async () => {
    state.rows.push({ id: 'second-iphone', userId: 'admin-1', token: 'ExpoPushToken[second-iphone]', platform: 'ios' });
    expect((await DELETE(request({ token: 'ExponentPushToken[existing-iphone]' }, 'DELETE'))).status).toBe(200);
    expect(state.rows.map((row) => row.id)).toEqual(['native-android', 'other-admin', 'second-iphone']);
  });

  it('does not unregister another admin device even with its token', async () => {
    expect((await DELETE(request({ token: 'ExpoPushToken[other-admin]' }, 'DELETE'))).status).toBe(200);
    expect(state.rows).toHaveLength(3);
    expect(database.delete).not.toHaveBeenCalled();
  });

  it.each([{}, null, [], { token: 'native-fcm-token' }])('rejects malformed device logout without clearing all devices: %j', async (body) => {
    expect((await DELETE(request(body, 'DELETE'))).status).toBe(400);
    expect(state.rows).toHaveLength(3);
    expect(database.delete).not.toHaveBeenCalled();
  });

  it('preserves the bodyless legacy logout contract for older installed app versions', async () => {
    state.rows.push({ id: 'modern-iphone', userId: 'admin-1', token: 'ExpoPushToken[modern]', platform: 'ios' });
    expect((await DELETE(new NextRequest('https://www.tyrerescue.uk/api/mobile/admin/push-token', { method: 'DELETE' }))).status).toBe(200);
    expect(state.rows.map((row) => row.id)).toEqual(['native-android', 'other-admin']);
  });
  it('cannot let an old bodyless logout silence a different managed installation', async () => {
    state.rows.push({ id: 'managed-iphone', userId: 'admin-1', token: 'ExpoPushToken[managed]', platform: 'ios', deviceSessionId: 'own-session-2' });
    expect((await DELETE(new NextRequest('https://www.tyrerescue.uk/api/mobile/admin/push-token', { method: 'DELETE' }))).status).toBe(200);
    expect(state.rows.map((row) => row.id)).toContain('managed-iphone');
  });
  it('rechecks an unlinked legacy row after it is bound to a managed session during logout', async () => {
    state.afterSelect = () => { state.rows.find((row) => row.id === 'existing-iphone')!.deviceSessionId = 'new-session'; };
    expect((await DELETE(new NextRequest('https://www.tyrerescue.uk/api/mobile/admin/push-token', { method: 'DELETE' }))).status).toBe(200);
    expect(state.rows.find((row) => row.id === 'existing-iphone')?.deviceSessionId).toBe('new-session');
  });
  it('rechecks token and owner when targeted cleanup races an account/token change', async () => {
    state.afterSelect = () => {
      const row = state.rows.find((item) => item.id === 'existing-iphone')!;
      row.userId = 'admin-2'; row.token = 'ExpoPushToken[new-account-device]';
    };
    expect((await DELETE(request({ token: 'ExponentPushToken[existing-iphone]' }, 'DELETE'))).status).toBe(200);
    expect(state.rows.find((row) => row.id === 'existing-iphone')?.userId).toBe('admin-2');
  });
  it('prevents a legacy targeted logout from deleting a managed installation', async () => {
    state.rows[0].deviceSessionId = 'new-session';
    expect((await DELETE(request({ token: state.rows[0].token }, 'DELETE'))).status).toBe(200);
    expect(state.rows[0].id).toBe('existing-iphone'); expect(database.delete).not.toHaveBeenCalled();
  });
  it('allows verified current-session cleanup but preserves a newer same-account session binding', async () => {
    state.verifiedSessionId = 'current-session'; state.rows[0].deviceSessionId = 'current-session';
    state.afterSelect = () => { state.rows.find((row) => row.id === 'existing-iphone')!.deviceSessionId = 'new-session'; };
    expect((await DELETE(request({ token: state.rows[0].token }, 'DELETE', 'acs_v1.isolated-current'))).status).toBe(200);
    expect(state.rows.find((row) => row.id === 'existing-iphone')?.deviceSessionId).toBe('new-session');
    state.rows[0].deviceSessionId = 'current-session';
    expect((await DELETE(request({ token: state.rows[0].token }, 'DELETE', 'acs_v1.isolated-current'))).status).toBe(200);
    expect(state.rows.some((row) => row.id === 'existing-iphone')).toBe(false);
  });
  it('cannot target another already-bound session of the same administrator', async () => {
    state.verifiedSessionId = 'current-session'; state.rows[0].deviceSessionId = 'different-session';
    expect((await DELETE(request({ token: state.rows[0].token }, 'DELETE', 'acs_v1.isolated-current'))).status).toBe(200);
    expect(database.delete).not.toHaveBeenCalled(); expect(state.rows).toHaveLength(3);
  });
  it('requires a verified opaque secret before using a claimed current session', async () => {
    expect((await DELETE(request({ token: state.rows[0].token }, 'DELETE', 'acs_v1.unverified'))).status).toBe(401);
    expect(database.select).not.toHaveBeenCalled(); expect(database.delete).not.toHaveBeenCalled();
  });
});
