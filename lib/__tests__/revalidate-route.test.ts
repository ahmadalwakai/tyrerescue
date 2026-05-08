import { describe, it, expect, beforeEach, vi } from 'vitest';

// We import the route module dynamically per-test so env changes take effect.
async function loadRoute() {
  vi.resetModules();
  return await import('@/app/api/revalidate/route');
}

function makeRequest(body: unknown, secretHeader: string | null) {
  const headers = new Headers();
  if (secretHeader !== null) headers.set('x-revalidate-secret', secretHeader);
  headers.set('content-type', 'application/json');
  return new Request('http://test.local/api/revalidate', {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });
}

// Stub revalidatePath so tests don't require Next runtime.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('/api/revalidate — protected on-demand revalidation', () => {
  beforeEach(() => {
    process.env.REVALIDATE_SECRET = 'test-secret';
  });

  it('rejects when secret env is unset', async () => {
    delete process.env.REVALIDATE_SECRET;
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ path: '/' }, 'anything') as never);
    expect(res.status).toBe(503);
  });

  it('rejects when header is missing', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ path: '/' }, null) as never);
    expect(res.status).toBe(401);
  });

  it('rejects when header is wrong', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ path: '/' }, 'nope') as never);
    expect(res.status).toBe(401);
  });

  it('rejects unsafe admin path', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ path: '/admin/dashboard' }, 'test-secret') as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.rejected).toContain('/admin/dashboard');
  });

  it('rejects /api/* paths', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ path: '/api/health' }, 'test-secret') as never);
    expect(res.status).toBe(400);
  });

  it('rejects /tracking, /quote, /success', async () => {
    const { POST } = await loadRoute();
    for (const p of ['/tracking/abc', '/quote', '/success/abc']) {
      const res = await POST(makeRequest({ path: p }, 'test-secret') as never);
      expect(res.status).toBe(400);
    }
  });

  it('accepts /mobile-tyre-fitting/glasgow', async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      makeRequest({ path: '/mobile-tyre-fitting/glasgow' }, 'test-secret') as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.revalidated).toContain('/mobile-tyre-fitting/glasgow');
  });

  it('accepts /blog/[slug]', async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      makeRequest({ path: '/blog/something' }, 'test-secret') as never,
    );
    expect(res.status).toBe(200);
  });

  it('accepts homepage', async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeRequest({ path: '/' }, 'test-secret') as never);
    expect(res.status).toBe(200);
  });

  it('rejects malformed inputs', async () => {
    const { POST } = await loadRoute();
    for (const p of ['noslash', '/with?query', '/with#hash', '/with/../escape']) {
      const res = await POST(makeRequest({ path: p }, 'test-secret') as never);
      expect(res.status).toBe(400);
    }
  });

  it('GET is not allowed', async () => {
    const { GET } = await loadRoute();
    const res = GET();
    expect(res.status).toBe(405);
  });
});
