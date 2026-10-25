import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TokenRow = { id: string; userId: string; token: string; platform: string; deviceSessionId?: string | null };
type SqlExpression = { parts: readonly string[]; values: unknown[] };
const state = vi.hoisted(() => ({ rows: [] as TokenRow[], user: { id: 'admin-1' } as { id: string } | null,
  afterSelect: null as (() => void) | null, conflictBinding: null as SqlExpression | null }));
const database = vi.hoisted(() => ({
  insert: vi.fn(() => ({ values: (value: Omit<TokenRow, 'id'>) => ({
    onConflictDoUpdate: async (options: { set?: { deviceSessionId?: SqlExpression } }) => {
      const existing = state.rows.find((row) => row.token === value.token);
      state.conflictBinding = options.set?.deviceSessionId ?? null;
      if (existing) {
        const binding = state.conflictBinding ? (existing.userId === value.userId ? existing.deviceSessionId : null) : existing.deviceSessionId;
        Object.assign(existing, value, { deviceSessionId: binding });
      }
      else state.rows.push({ id: `native:${value.token}`, ...value });
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
vi.mock('drizzle-orm', () => ({ eq: (column: string, value: string) => ({ column, value }), and: (...conditions: unknown[]) => conditions,
  isNull: (column: string) => ({ column, value: null }), sql: (parts: TemplateStringsArray, ...values: unknown[]) => ({ parts, values }) }));
vi.mock('@/app/api/mobile/admin/_lib', () => ({
  getMobileAdminUser: async () => state.user,
  unauthorizedResponse: () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
}));

import { DELETE, POST } from '@/app/api/mobile/admin/native-alert-token/route';

function request(body: unknown, method = 'POST') {
  return new NextRequest('https://www.tyrerescue.uk/api/mobile/admin/native-alert-token', {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.rows = [
    { id: 'legacy-iphone', userId: 'admin-1', token: 'ExponentPushToken[legacy-iphone]', platform: 'ios' },
    { id: 'modern-iphone', userId: 'admin-1', token: 'ExpoPushToken[modern-iphone]', platform: 'ios' },
    { id: 'old-native', userId: 'admin-1', token: 'old-native-fcm', platform: 'android' },
    { id: 'other-iphone', userId: 'admin-2', token: 'ExpoPushToken[other-iphone]', platform: 'ios' },
    { id: 'other-native', userId: 'admin-2', token: 'other-native-fcm', platform: 'android' },
  ];
  state.user = { id: 'admin-1' };
  state.afterSelect = null; state.conflictBinding = null;
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden in this test'));
});
afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('native admin token registration preserves every Expo device', () => {
  it.each(['ExponentPushToken[iphone]', 'ExpoPushToken[iphone]', ' ExpoPushToken[iphone] '])(
    'rejects Expo token %s before changing any registrations', async (token) => {
      expect((await POST(request({ token, platform: 'android' }))).status).toBe(400);
      expect(database.select).not.toHaveBeenCalled();
      expect(database.delete).not.toHaveBeenCalled();
      expect(database.insert).not.toHaveBeenCalled();
      expect(state.rows).toHaveLength(5);
    },
  );

  it('replaces a stale native token while preserving legacy/modern iPhones and other admins', async () => {
    expect((await POST(request({ token: 'new-native-fcm', platform: 'android' }))).status).toBe(200);
    expect(state.rows.map((row) => row.id)).toEqual([
      'legacy-iphone', 'modern-iphone', 'other-iphone', 'other-native', 'native:new-native-fcm',
    ]);
    expect(state.rows.find((row) => row.token === 'new-native-fcm')?.userId).toBe('admin-1');
  });

  it('does not duplicate native tokens when registration is retried', async () => {
    for (let i = 0; i < 2; i++) await POST(request({ token: 'new-native-fcm', platform: 'android' }));
    expect(state.rows).toHaveLength(5);
    expect(state.rows.filter((row) => row.token === 'new-native-fcm')).toHaveLength(1);
    expect(state.rows.filter((row) => row.userId === 'admin-1' && row.platform === 'ios')).toHaveLength(2);
  });

  it('native logout preserves both Expo token formats and every other admin registration', async () => {
    expect((await DELETE(request({}, 'DELETE'))).status).toBe(200);
    expect(state.rows.map((row) => row.id)).toEqual(['legacy-iphone', 'modern-iphone', 'other-iphone', 'other-native']);
  });

  it('legacy registration and logout preserve native registrations linked to other sessions', async () => {
    const managed = { id: 'managed-native', userId: 'admin-1', token: 'managed-native-fcm', platform: 'android', deviceSessionId: 'managed-session' };
    state.rows.push(managed);
    expect((await POST(request({ token: 'new-legacy-native', platform: 'android' }))).status).toBe(200);
    expect(state.rows).toContainEqual(managed);
    expect((await DELETE(request({}, 'DELETE'))).status).toBe(200);
    expect(state.rows).toContainEqual(managed);
    expect(state.rows.some((row) => row.token === 'new-legacy-native')).toBe(false);
    expect(state.rows.find((row) => row.id === 'other-native')?.userId).toBe('admin-2');
  });

  it('requires an authenticated admin before accessing registrations', async () => {
    state.user = null;
    expect((await POST(request({ token: 'blocked' }))).status).toBe(401);
    expect((await DELETE(request({}, 'DELETE'))).status).toBe(401);
    expect(database.select).not.toHaveBeenCalled();
    expect(database.insert).not.toHaveBeenCalled();
    expect(database.delete).not.toHaveBeenCalled();
  });
  it.each(['registration', 'logout'])('preserves a row newly bound to a managed session during legacy %s', async (operation) => {
    state.afterSelect = () => { state.rows.find((row) => row.id === 'old-native')!.deviceSessionId = 'new-session'; };
    const response = operation === 'registration' ? await POST(request({ token: 'new-native-fcm', platform: 'android' })) : await DELETE(request({}, 'DELETE'));
    expect(response.status).toBe(200);
    expect(state.rows.find((row) => row.id === 'old-native')?.deviceSessionId).toBe('new-session');
  });
  it.each(['registration', 'logout'])('preserves a row reassigned to another admin during legacy %s', async (operation) => {
    state.afterSelect = () => { state.rows.find((row) => row.id === 'old-native')!.userId = 'admin-2'; };
    const response = operation === 'registration' ? await POST(request({ token: 'new-native-fcm', platform: 'android' })) : await DELETE(request({}, 'DELETE'));
    expect(response.status).toBe(200);
    expect(state.rows.find((row) => row.id === 'old-native')?.userId).toBe('admin-2');
  });
  it('clears the old session association when a native token changes account', async () => {
    state.rows.find((row) => row.id === 'other-native')!.deviceSessionId = 'other-account-session';
    expect((await POST(request({ token: 'other-native-fcm', platform: 'android' }))).status).toBe(200);
    expect(state.rows.find((row) => row.id === 'other-native')).toMatchObject({ userId: 'admin-1', deviceSessionId: null });
    expect(state.conflictBinding?.parts.join('?')).toBe('CASE WHEN ? = ? THEN ? ELSE NULL END');
    expect(state.conflictBinding?.values).toEqual(['userId', 'admin-1', 'deviceSessionId']);
  });
  it('preserves an existing same-account managed association when legacy registration retries the same token', async () => {
    state.rows.find((row) => row.id === 'old-native')!.deviceSessionId = 'current-managed-session';
    expect((await POST(request({ token: 'old-native-fcm', platform: 'android' }))).status).toBe(200);
    expect(state.rows.find((row) => row.id === 'old-native')?.deviceSessionId).toBe('current-managed-session');
  });
});
