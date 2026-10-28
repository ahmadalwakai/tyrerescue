import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUSINESS_PHONE_E164 } from '@/lib/config/business-contact';

const state = vi.hoisted(() => ({
  execute: null as null | ((query: unknown) => Promise<unknown>),
  user: { id: 'local-regression-admin' } as { id: string } | null,
}));
vi.mock('@/lib/db', () => ({ db: { execute: (query: unknown) => state.execute!(query) } }));
// Keep the real HTTP helpers without loading the external authentication SDK.
vi.mock('@/lib/auth', () => ({ requireAdminMobile: vi.fn() }));
vi.mock('@/app/api/mobile/admin/_lib', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/app/api/mobile/admin/_lib')>(),
  getMobileAdminUser: async () => state.user,
}));

import { POST } from '@/app/api/webhooks/bonline/[secret]/route';
import { GET } from '@/app/api/mobile/admin/phone/incoming-call/route';
import { IncomingPhoneCallFeed, parseIncomingPhoneCalls } from '@/assisted-chat-app/src/lib/incoming-phone-call';

let pg: PGlite;
const secret = 'local-bonline-regression-'.repeat(3);
const customer = '+447700900555';

function webhook(caller: string, peer: string, suppliedSecret = secret) {
  return POST(new Request('https://example.test/api/webhooks/bonline/local-test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Full default provider snapshot: no event-name or tenant headers.
    body: JSON.stringify({
      call_id: 'local-caller-regression', user_uuid: 'local-provider-user',
      direction: 'inbound', is_caller: false, status: 'Ringing',
      caller_id_number: caller, peer_caller_id_number: peer,
      creation_time: new Date().toISOString(), answer_time: null, hangup_time: null,
      bridges: [], talking_to: {},
    }),
  }), { params: Promise.resolve({ secret: suppliedSecret }) });
}

async function mobileFeed() {
  const response = await GET(new Request('https://example.test/api/mobile/admin/phone/incoming-call'));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toContain('no-store');
  const parsed = parseIncomingPhoneCalls(await response.json());
  expect(parsed).not.toBeNull();
  return parsed!;
}

beforeAll(async () => {
  pg = new PGlite();
  const database = drizzle(pg);
  state.execute = (query) => database.execute(query as Parameters<typeof database.execute>[0]);
  await pg.exec(readFileSync(resolve('scripts/bonline-call-events.sql'), 'utf8'));
  await pg.exec(readFileSync(resolve('scripts/bonline-call-management.sql'), 'utf8'));
});
beforeEach(async () => {
  vi.stubEnv('BONLINE_WEBHOOK_SECRET', secret);
  vi.stubEnv('BONLINE_TENANT_IDS', '');
  vi.stubEnv('BONLINE_USER_IDS', '');
  vi.stubEnv('BONLINE_ADMIN_USER_IDS', '');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('This regression must never use a network service.'); }));
  state.user = { id: 'local-regression-admin' };
  await pg.exec('TRUNCATE bonline_call_events, bonline_call_followups, bonline_calls; UPDATE bonline_event_state SET cursor = 0;');
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(async () => { await pg.close(); });

describe('bOnline webhook through storage, mobile HTTP feed and released client parser', () => {
  it.each([
    { orientation: 'customer in caller field with is_caller false', caller: customer, peer: BUSINESS_PHONE_E164 },
    { orientation: 'customer in peer field with is_caller false', caller: BUSINESS_PHONE_E164, peer: customer },
  ])('delivers the external customer for $orientation', async ({ caller, peer }) => {
    const accepted = await webhook(caller, peer);
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ received: true, accepted: true });

    const feed = await mobileFeed();
    expect(feed.events).toHaveLength(1);
    expect(feed.events[0].phone).toBe(customer);
    expect(new IncomingPhoneCallFeed().accept(feed)?.phone).toBe(customer);
    expect((await pg.query<{ phone: string }>('SELECT phone FROM bonline_call_events')).rows)
      .toEqual([{ phone: customer }]);
  });

  it('acknowledges both-owned fields without persisting or delivering our business number', async () => {
    const ignored = await webhook('01932 509613', BUSINESS_PHONE_E164);
    expect(ignored.status).toBe(202);
    expect(await ignored.json()).toEqual({ received: true, accepted: false });
    const feed = await mobileFeed();
    expect(feed.events).toEqual([]);
    expect(new IncomingPhoneCallFeed().accept(feed)).toBeNull();
    expect((await pg.query('SELECT phone FROM bonline_call_events')).rows).toEqual([]);
  });

  it('retains webhook-secret and mobile-admin authorization boundaries', async () => {
    expect((await webhook(customer, BUSINESS_PHONE_E164, 'wrong-secret')).status).toBe(404);
    expect((await pg.query('SELECT phone FROM bonline_call_events')).rows).toEqual([]);
    state.user = null;
    expect((await GET(new Request('https://example.test/api/mobile/admin/phone/incoming-call'))).status).toBe(401);
  });
});
