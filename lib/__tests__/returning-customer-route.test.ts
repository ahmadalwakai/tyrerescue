import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  user: { id: 'admin-1' } as { id: string } | null,
  lookup: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('@/app/api/mobile/admin/_lib', () => ({
  getMobileAdminUser: async () => mock.user,
  unauthorizedResponse: () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
}));
vi.mock('@/lib/db', () => ({ db: { execute: mock.execute } }));
vi.mock('@/lib/customers/returning-customer', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/customers/returning-customer')>(),
  findReturningCustomers: mock.lookup,
}));

import { GET } from '@/app/api/mobile/admin/customers/match/route';

function request(query: string | Record<string, string> = ''): Request {
  const search = typeof query === 'string' ? query : new URLSearchParams(query).toString();
  return new Request(`https://example.test/api/mobile/admin/customers/match?${search}`);
}

function expectPrivateResponse(response: Response): void {
  expect(response.headers.get('Cache-Control')).toContain('private');
  expect(response.headers.get('Cache-Control')).toContain('no-store');
  const vary = response.headers.get('Vary')?.toLowerCase().split(',').map((value) => value.trim());
  expect(vary).toEqual(expect.arrayContaining(['authorization', 'cookie']));
}

beforeEach(() => {
  mock.user = { id: 'admin-1' };
  mock.lookup.mockReset().mockResolvedValue([]);
  mock.execute.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('returning customer lookup HTTP boundary', () => {
  it('requires an admin before inspecting even an invalid query', async () => {
    mock.user = null;
    const response = await GET(request('unknown=value'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expectPrivateResponse(response);
    expect(mock.lookup).not.toHaveBeenCalled();
    expect(mock.execute).not.toHaveBeenCalled();
  });

  it.each(['07700 900123', '+44 7700 900123', '0044 7700 900123'])(
    'returns a successful empty result for a supported phone with no bookings: %s',
    async (phone) => {
      const response = await GET(request({ phone }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ matches: [] });
      expectPrivateResponse(response);
      expect(mock.lookup).toHaveBeenCalledExactlyOnceWith({ phone });
    },
  );

  it('preserves address and tyre lookup for the booking draft', async () => {
    const query = { address: '12 High Street, Glasgow G1 2AB', tyreSize: '205/55R16' };
    const response = await GET(request(query));
    expect(response.status).toBe(200);
    expect(mock.lookup).toHaveBeenCalledExactlyOnceWith(query);
    expectPrivateResponse(response);
  });

  it('returns the matching histories without merging or changing service results', async () => {
    const matches = [
      { key: 'account:first', confidence: 'linked_account', bookingCount: 75, bookings: [] },
      { key: 'account:second', confidence: 'linked_account', bookingCount: 2, bookings: [] },
    ];
    mock.lookup.mockResolvedValueOnce(matches);
    const response = await GET(request({ phone: '+447700900123' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ matches });
    expectPrivateResponse(response);
  });

  it.each([
    ['empty query', ''],
    ['blank query', 'phone=+++&address=+++'],
    ['unsupported international phone', new URLSearchParams({ phone: '+1 415 555 0100' }).toString()],
    ['incomplete phone', 'phone=12345'],
    ['malformed phone', 'phone=withheld'],
    ['postcode only', 'address=G1+2AB'],
    ['partial address', 'address=Glasgow+G1+2AB'],
    ['tyre size only', 'tyreSize=205%2F55R16'],
    ['duplicate phone parameters', 'phone=07700900123&phone=07700900999'],
    ['unknown parameter', 'phone=07700900123&accountId=any'],
    ['oversized phone', new URLSearchParams({ phone: '0'.repeat(41) }).toString()],
    ['oversized address', new URLSearchParams({ address: 'a'.repeat(301) }).toString()],
    ['oversized tyre size', new URLSearchParams({ phone: '07700900123', tyreSize: '2'.repeat(31) }).toString()],
  ])('rejects %s instead of reporting a new customer', async (_description, query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
    expectPrivateResponse(response);
    expect(mock.lookup).not.toHaveBeenCalled();
    expect(mock.execute).not.toHaveBeenCalled();
  });

  it('reports a failed lookup separately from no matches and never logs customer data', async () => {
    const sensitiveDetail = 'Database rejected customer +447700900123 at 12 High Street';
    mock.lookup.mockRejectedValueOnce(new Error(sensitiveDetail));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await GET(request({ phone: '+447700900123' }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain('447700900123');
    expect(JSON.stringify(body)).not.toContain('Database rejected');
    expectPrivateResponse(response);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]).toEqual([expect.any(String)]);
    expect(String(log.mock.calls[0][0])).not.toContain('447700900123');
    expect(String(log.mock.calls[0][0])).not.toContain('12 High Street');
    expect(String(log.mock.calls[0][0])).not.toContain('Database rejected');
  });
});
