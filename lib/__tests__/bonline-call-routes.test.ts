import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ user: { id: 'admin-1' } as { id: string } | null, read: vi.fn(), update: vi.fn() }));
vi.mock('@/app/api/mobile/admin/_lib', () => ({ getMobileAdminUser: async () => mock.user }));
vi.mock('@/lib/bonline/calls', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/bonline/calls')>(),
  readBonlineCalls: mock.read, updateBonlineFollowUp: mock.update,
}));
import { GET } from '@/app/api/mobile/admin/phone/calls/route';
import { PATCH } from '@/app/api/mobile/admin/phone/calls/[id]/follow-up/route';

const secret = 'test-secret-'.repeat(6);
const id = 'a'.repeat(64);
const context = { params: Promise.resolve({ id }) };
const get = (query = '') => GET(new Request(`https://example.test/api/mobile/admin/phone/calls${query}`));
const patch = (body: unknown = { action: 'claim' }, callId = id, contentType = 'application/json') => PATCH(new Request(`https://example.test/api/mobile/admin/phone/calls/${callId}/follow-up`, {
  method: 'PATCH', headers: { 'Content-Type': contentType }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id: callId }) });

beforeEach(() => {
  vi.stubEnv('BONLINE_WEBHOOK_SECRET', secret);
  vi.stubEnv('BONLINE_ADMIN_USER_IDS', '');
  mock.user = { id: 'admin-1' };
  mock.read.mockReset().mockResolvedValue({ calls: [], nextCursor: null, summary: { openFollowUps: 0, overdueFollowUps: 0 } });
  mock.update.mockReset().mockResolvedValue({ result: 'updated', followUp: { status: 'claimed', assignedTo: 'admin-1' } });
});
afterEach(() => vi.unstubAllEnvs());

describe('mobile call history and follow-up routes', () => {
  it('requires admin authentication before reads or writes and prevents caching even on errors', async () => {
    mock.user = null;
    for (const response of [await get(), await patch()]) {
      expect(response.status).toBe(401);
      expect(response.headers.get('Cache-Control')).toContain('private, no-store');
      expect(response.headers.get('Vary')).toBe('Authorization, Cookie');
    }
    expect(mock.read).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
  });
  it('disables unconfigured or excluded administrators and rejects mutations', async () => {
    for (const [name, value] of [['BONLINE_ADMIN_USER_IDS', 'another-admin'], ['BONLINE_WEBHOOK_SECRET', '']]) {
      vi.stubEnv(name, value);
      expect(await (await get()).json()).toEqual({ enabled: false, currentAdminId: 'admin-1', calls: [], nextCursor: null,
        summary: { openFollowUps: 0, overdueFollowUps: 0 } });
      expect((await patch()).status).toBe(403);
    }
    expect(mock.read).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled();
  });
  it('passes only validated filters and secret-derived scope, including open follow-ups', async () => {
    const response = await get('?outcome=missed&followUp=open&limit=25');
    expect(await response.json()).toEqual({ enabled: true, currentAdminId: 'admin-1', calls: [], nextCursor: null,
      summary: { openFollowUps: 0, overdueFollowUps: 0 } });
    expect(mock.read).toHaveBeenCalledWith(createHash('sha256').update(secret).digest('hex'), { outcome: 'missed', followUp: 'open', limit: 25 });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    for (const query of ['?limit=101', '?limit=1&limit=2', '?outcome=invalid', '?before=invalid', '?scope=another']) {
      expect((await get(query)).status).toBe(400);
    }
    expect(mock.read).toHaveBeenCalledOnce();
  });
  it('restricts body shape and assigns only the authenticated administrator', async () => {
    expect((await patch()).status).toBe(200);
    expect(mock.update).toHaveBeenCalledWith(expect.any(String), id, 'admin-1', { action: 'claim', resolution: null });
    for (const invalid of [{ action: 'claim', assignedTo: 'another-admin' }, { action: 'delete' }, { action: 'resolve', resolution: 'x'.repeat(501) }]) {
      expect((await patch(invalid)).status).toBe(400);
    }
    expect((await patch({ action: 'claim' }, 'invalid-id')).status).toBe(400);
    expect(mock.update).toHaveBeenCalledOnce();
  });
  it('bounds and validates JSON before mutation', async () => {
    expect((await patch({ action: 'claim' }, id, 'text/plain')).status).toBe(415);
    expect((await patch({ action: 'resolve', resolution: 'x'.repeat(33_000) })).status).toBe(413);
    const malformed = new Request('https://example.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{' });
    expect((await PATCH(malformed, context)).status).toBe(400);
    expect(mock.update).not.toHaveBeenCalled();
  });
  it('returns conflict and not found without exposing another assignee or internal errors', async () => {
    mock.update.mockResolvedValueOnce({ result: 'conflict' });
    expect((await patch()).status).toBe(409);
    mock.update.mockResolvedValueOnce({ result: 'not_found' });
    expect((await patch()).status).toBe(404);
    mock.update.mockRejectedValueOnce(new Error('private database connection detail'));
    const response = await patch();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private database');
    mock.read.mockRejectedValueOnce(new Error('private database connection detail'));
    expect((await get()).status).toBe(503);
  });
});
