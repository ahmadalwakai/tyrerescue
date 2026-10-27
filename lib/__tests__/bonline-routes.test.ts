import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  user: { id: 'admin-1' } as { id: string } | null,
  store: vi.fn(),
  feed: vi.fn(),
}));
vi.mock('@/app/api/mobile/admin/_lib', () => ({
  getMobileAdminUser: async () => mock.user,
  unauthorizedResponse: () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
}));
vi.mock('@/lib/bonline/store', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/bonline/store')>(),
  storeBonlineEvent: mock.store,
  readBonlineFeed: mock.feed,
}));

import { POST } from '@/app/api/webhooks/bonline/[secret]/route';
import { GET } from '@/app/api/mobile/admin/phone/incoming-call/route';

const secret = 'test-secret-'.repeat(6);
const request = (extra: Record<string, unknown> = {}, name = 'call_created') => new Request('https://example.test/api/webhooks/bonline/secret', {
  method: 'POST', headers: { 'Content-Type': 'application/json', name },
  body: JSON.stringify({ call_id: 'test-call', caller_id_number: '+447700900123', direction: 'inbound', creation_time: new Date().toISOString(), ...extra }),
});

beforeEach(() => {
  vi.stubEnv('BONLINE_WEBHOOK_SECRET', secret);
  vi.stubEnv('BONLINE_TENANT_IDS', '');
  vi.stubEnv('BONLINE_USER_IDS', '');
  vi.stubEnv('BONLINE_ADMIN_USER_IDS', '');
  mock.user = { id: 'admin-1' };
  mock.store.mockReset().mockResolvedValue(undefined);
  mock.feed.mockReset().mockResolvedValue({ cursor: '5', serverTime: new Date().toISOString(), events: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe('bOnline HTTP authorization and delivery', () => {
  it('rejects the wrong webhook secret before reading or storing data', async () => {
    expect((await POST(request(), { params: Promise.resolve({ secret: 'wrong' }) })).status).toBe(404);
    expect(mock.store).not.toHaveBeenCalled();
  });
  it('persists incoming calls and acknowledges unsupported/outgoing events without storing them', async () => {
    expect((await POST(request(), { params: Promise.resolve({ secret }) })).status).toBe(200);
    expect(mock.store).toHaveBeenCalledOnce();
    mock.store.mockClear();
    expect((await POST(request({ direction: 'outbound' }), { params: Promise.resolve({ secret }) })).status).toBe(202);
    expect(mock.store).not.toHaveBeenCalled();
  });
  it('asks the provider to retry a storage outage instead of losing the call', async () => {
    mock.store.mockRejectedValueOnce(new Error('outage'));
    expect((await POST(request(), { params: Promise.resolve({ secret }) })).status).toBe(503);
  });
  it('requires an authenticated admin and protects the feed from caching', async () => {
    mock.user = null;
    expect((await GET(new Request('https://example.test/api/mobile/admin/phone/incoming-call'))).status).toBe(401);
    expect(mock.feed).not.toHaveBeenCalled();
    mock.user = { id: 'admin-1' };
    const response = await GET(new Request('https://example.test/api/mobile/admin/phone/incoming-call?after=4'));
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.json()).toMatchObject({ enabled: true, cursor: '5' });
  });
  it('disables projects or admins without this call feed', async () => {
    vi.stubEnv('BONLINE_ADMIN_USER_IDS', 'another-admin');
    expect(await (await GET(new Request('https://example.test/api/mobile/admin/phone/incoming-call'))).json()).toMatchObject({ enabled: false, events: [] });
    vi.stubEnv('BONLINE_WEBHOOK_SECRET', '');
    expect(await (await GET(new Request('https://example.test/api/mobile/admin/phone/incoming-call'))).json()).toMatchObject({ enabled: false });
    expect(mock.feed).not.toHaveBeenCalled();
  });
  it('validates a cursor before querying storage', async () => {
    expect((await GET(new Request('https://example.test/api/mobile/admin/phone/incoming-call?after=-1'))).status).toBe(400);
    expect(mock.feed).not.toHaveBeenCalled();
  });
});
