import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: { id: 'admin-one' } as { id: string } | null,
  execute: null as null | ((query: unknown) => Promise<unknown>),
}));
vi.mock('@/lib/db', () => ({ db: { execute: (query: unknown) => state.execute!(query) } }));
vi.mock('@/app/api/mobile/admin/_lib', () => ({
  getMobileAdminUser: async () => state.user,
  unauthorizedResponse: () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
}));
import { GET, POST } from '@/app/api/mobile/admin/phone/outbound/route';

let pg: PGlite;
let fetcher: ReturnType<typeof vi.fn>;
const tenant = 'd757192a-f826-453a-b929-86b59035163b';
const payload = (override = {}) => ({ phone: '+447700900123', idempotencyKey: randomUUID(), confirmed: true, ...override });
const request = (body: unknown, extraHeaders: Record<string, string> = {}) => new Request('https://example.com/api/mobile/admin/phone/outbound', {
  method: 'POST', headers: { authorization: 'Bearer test-token', 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(body),
});
const getRequest = () => new Request('https://example.com/api/mobile/admin/phone/outbound');

beforeAll(async () => {
  pg = new PGlite(); const database = drizzle(pg);
  state.execute = (query) => database.execute(query as Parameters<typeof database.execute>[0]);
  await pg.exec(readFileSync(resolve('scripts/bonline-call-events.sql'), 'utf8'));
  const migration = readFileSync(resolve('scripts/bonline-call-management.sql'), 'utf8');
  await pg.exec(migration); await pg.exec(migration);
});
beforeEach(async () => {
  state.user = { id: 'admin-one' };
  await pg.exec('TRUNCATE bonline_outbound_attempts');
  const database = drizzle(pg);
  state.execute = (query) => database.execute(query as Parameters<typeof database.execute>[0]);
  vi.stubEnv('BONLINE_OUTBOUND_ENABLED', 'true'); vi.stubEnv('BONLINE_OUTBOUND_PROVIDER', 'wazo');
  vi.stubEnv('BONLINE_OUTBOUND_PROVIDER_VERIFIED', 'true');
  vi.stubEnv('BONLINE_OUTBOUND_API_BASE_URL', 'https://pbx.example.com/api/calld/1.0');
  vi.stubEnv('BONLINE_OUTBOUND_API_TOKEN', 'test-only-provider-token'); vi.stubEnv('BONLINE_OUTBOUND_TENANT_UUID', tenant);
  vi.stubEnv('BONLINE_OUTBOUND_ADMIN_ORIGINS', JSON.stringify({
    'admin-one': { userUuid: tenant, lineId: 7, context: 'outbound' },
    'admin-two': { userUuid: tenant, lineId: 8, context: 'outbound' },
  }));
  fetcher = vi.fn().mockImplementation(async () => Response.json({ call_id: 'provider-call-1' }, { status: 201 }));
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
afterAll(async () => { await pg.close(); });

describe('authenticated outbound route with real local SQL and a fake provider', () => {
  it('requires authentication, serves private capability and makes no calls while disabled', async () => {
    state.user = null;
    expect((await GET(getRequest())).status).toBe(401);
    expect((await POST(request(payload()))).status).toBe(401);
    state.user = { id: 'admin-one' }; vi.stubEnv('BONLINE_OUTBOUND_ENABLED', 'false');
    const status = await GET(getRequest());
    expect(status.headers.get('Cache-Control')).toContain('no-store');
    expect(await status.json()).toMatchObject({ enabled: false, reason: 'not_configured' });
    expect((await POST(request(payload()))).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await pg.query('SELECT * FROM bonline_outbound_attempts')).rows).toHaveLength(0);
  });
  it('rejects foreign origin, missing cookie origin, malformed bodies and missing confirmation before recording a call', async () => {
    expect((await POST(request(payload(), { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await POST(request(payload(), { authorization: '' }))).status).toBe(403);
    expect((await POST(request(payload({ confirmed: false })))).status).toBe(400);
    expect((await POST(request(payload({ originUser: 'other' })))).status).toBe(400);
    expect((await POST(request(payload({ extra: 'x'.repeat(2_100) })))).status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('persists audit identity and replays the same request without a second provider request', async () => {
    const body = payload(); const first = await POST(request(body));
    expect(first.status).toBe(202); expect(await first.json()).toMatchObject({ status: 'accepted', replayed: false });
    const replay = await POST(request(body));
    expect(replay.status).toBe(202); expect(await replay.json()).toMatchObject({ status: 'accepted', replayed: true });
    expect(fetcher).toHaveBeenCalledOnce();
    const { rows } = await pg.query<Record<string, unknown>>('SELECT * FROM bonline_outbound_attempts');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ admin_user_id: 'admin-one', idempotency_key: body.idempotencyKey,
      phone: body.phone, status: 'accepted', provider_call_id: 'provider-call-1' });
    expect(JSON.stringify(rows)).not.toContain('test-only-provider-token');
  });
  it('uses DB uniqueness for simultaneous idempotent requests and rejects a changed destination', async () => {
    const body = payload();
    const responses = await Promise.all([POST(request(body)), POST(request(body))]);
    expect(responses.map((response) => response.status)).toEqual([202, 202]);
    expect(fetcher).toHaveBeenCalledOnce();
    expect((await POST(request({ ...body, phone: '+447700900456' }))).status).toBe(409);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('enforces the durable fixed-window limit and isolates each admin', async () => {
    const body = payload(); await POST(request(body));
    // Align with the current DB window if this test happened to cross its edge.
    await pg.exec('UPDATE bonline_outbound_attempts SET rate_bucket = floor(extract(epoch FROM clock_timestamp()) / 30)::bigint');
    const blocked = await POST(request(payload()));
    expect(blocked.status).toBe(429); expect(blocked.headers.get('Retry-After')).toBe('30');
    state.user = { id: 'admin-two' };
    expect((await POST(request(body))).status).toBe(202);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).source.line_id).toBe(8);
  });
  it('keeps uncertain provider outcomes durable and never retries them automatically', async () => {
    fetcher.mockRejectedValue(new Error('network interrupted'));
    const body = payload();
    expect(await (await POST(request(body))).json()).toMatchObject({ status: 'unknown', replayed: false });
    expect(await (await POST(request(body))).json()).toMatchObject({ status: 'unknown', replayed: true });
    expect(fetcher).toHaveBeenCalledOnce();
    expect((await pg.query('SELECT status FROM bonline_outbound_attempts')).rows).toEqual([{ status: 'unknown' }]);
  });
  it('records definite rejections and replays the failure without a new call', async () => {
    fetcher.mockImplementation(async () => Response.json({ error: 'private account details' }, { status: 403 }));
    const body = payload(); const first = await POST(request(body)); expect(first.status).toBe(502);
    expect(await first.json()).toMatchObject({ status: 'failed', reason: 'provider_403' });
    expect((await POST(request(body))).status).toBe(502);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('fails closed before provider work when the durable store is unavailable', async () => {
    state.execute = async () => { throw new Error('private DB failure'); };
    expect(await (await GET(getRequest())).json()).toMatchObject({ enabled: false, reason: 'audit_unavailable' });
    expect((await POST(request(payload()))).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps a pending reservation after post-provider audit failure, preventing a duplicate call', async () => {
    const realExecute = state.execute!; let executions = 0;
    state.execute = async (query) => { if (++executions === 2) throw new Error('audit write lost'); return realExecute(query); };
    const body = payload();
    expect(await (await POST(request(body))).json()).toMatchObject({ status: 'unknown', reason: 'audit_update_unavailable' });
    state.execute = realExecute;
    expect(await (await POST(request(body))).json()).toMatchObject({ status: 'pending', replayed: true });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
