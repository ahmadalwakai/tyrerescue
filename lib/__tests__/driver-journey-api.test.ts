import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), list: vi.fn(), decide: vi.fn(), read: vi.fn() }));
vi.mock('@/app/api/mobile/admin/_lib', async () => {
  const { NextResponse } = await import('next/server');
  return { getMobileAdminUser: mocks.auth, unauthorizedResponse: () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
});
vi.mock('@/lib/tracking/driver-journeys', () => ({ listDriverJourneyItems: mocks.list, decideDriverJourney: mocks.decide, readDriverJourneyEvent: mocks.read }));
import { GET } from '@/app/api/mobile/admin/driver-journeys/route';
import { POST as decision } from '@/app/api/mobile/admin/driver-journeys/[id]/decision/route';
import { POST as read } from '@/app/api/mobile/admin/driver-journeys/events/[eventId]/read/route';

const id = '11111111-1111-4111-8111-111111111111';
const adminId = '22222222-2222-4222-8222-222222222222';
const request = (body?: unknown, query = '') => new Request(`https://isolated.invalid/api/mobile/admin/driver-journeys${query}`, {
  ...(body === undefined ? {} : { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
});
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ id: adminId }); mocks.list.mockResolvedValue([]);
  mocks.decide.mockResolvedValue('confirmed'); mocks.read.mockResolvedValue(true);
});
describe('protected driver journey APIs (isolated, no network or pushes)', () => {
  it('requires admin authentication for feed, answers and read state', async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect((await decision(request({ decision: 'yes' }), { params: Promise.resolve({ id }) })).status).toBe(401);
    expect((await read(request({}), { params: Promise.resolve({ eventId: id }) })).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.decide).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it('fetches canonical event data with explicit no-store', async () => {
    const response = await GET(request(undefined, `?eventId=${id}`));
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(mocks.list).toHaveBeenCalledWith(id); expect(await response.json()).toEqual({ ok: true, items: [] });
  });
  it('rejects malformed event identifiers before accessing the store', async () => {
    expect((await GET(request(undefined, '?eventId=../customer'))).status).toBe(400);
    expect((await read(request({}), { params: Promise.resolve({ eventId: 'bad-id' }) })).status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([{ decision: 'maybe' }, { decision: 'yes', driverId: id }, {}, 'not json'])(
    'rejects invalid or client-controlled decision data %#', async (body) => {
      expect((await decision(request(body), { params: Promise.resolve({ id }) })).status).toBe(400);
      expect(mocks.decide).not.toHaveBeenCalled();
    },
  );
  it.each(['yes', 'no'] as const)('binds %s to the authenticated administrator', async (answer) => {
    mocks.decide.mockResolvedValue(answer === 'yes' ? 'confirmed' : 'rejected');
    const response = await decision(request({ decision: answer }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200); expect(mocks.decide).toHaveBeenCalledWith(id, answer, adminId);
  });
  it('returns a conflict for expired, changed or already answered suggestions', async () => {
    mocks.decide.mockResolvedValue(null);
    expect((await decision(request({ decision: 'yes' }), { params: Promise.resolve({ id }) })).status).toBe(409);
  });
  it('reports missing read events without manufacturing a successful update', async () => {
    mocks.read.mockResolvedValue(false);
    expect((await read(request({}), { params: Promise.resolve({ eventId: id }) })).status).toBe(404);
  });
  it('returns a safe unavailable response without exposing internal details', async () => {
    mocks.list.mockRejectedValue(new Error('isolated internal credential marker'));
    const response = await GET(request());
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain('credential');
  });
});
