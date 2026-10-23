import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mockAuth }));

import { GET } from '@/app/api/admin/runtime/route';

describe('runtime evidence endpoint', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([null, { user: { role: 'driver' } }])('requires an admin session (%j)', async (session) => {
    mockAuth.mockResolvedValue(session);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('returns only the executing process version with no caching', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'admin' } });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ node: process.version });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
