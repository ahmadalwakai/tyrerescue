import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ database: null as unknown as PgliteDatabase, admin: true, allowed: true }));
vi.mock('@/lib/db', async () => ({
  ...await import('@/lib/db/schema'),
  db: {
    execute: (...args: Parameters<PgliteDatabase['execute']>) => state.database.execute(...args),
    select: (...args: Parameters<PgliteDatabase['select']>) => state.database.select(...args),
  },
}));
vi.mock('@/app/api/mobile/admin/_lib', () => ({
  getMobileAdminUser: async () => state.admin ? { id: 'admin-1' } : null,
  unauthorizedResponse: () => new Response('{}', { status: 401 }),
}));
vi.mock('@/lib/bonline/config', () => ({
  getBonlineConfig: () => ({ scope: 'scope-a' }), canReadBonlineCalls: () => state.allowed,
}));
import { linkBonlineCall } from '@/lib/bonline/attribution';
import { readBonlineAnalytics } from '@/lib/bonline/analytics';
import { GET } from '@/app/api/mobile/admin/phone/analytics/route';
import { POST } from '@/app/api/mobile/admin/phone/calls/[id]/link/route';

let pg: PGlite;
const key = 'a'.repeat(64);
const secondKey = 'b'.repeat(64);
const bookingId = '00000000-0000-4000-8000-000000000001';
const otherBooking = '00000000-0000-4000-8000-000000000002';
const quoteId = '00000000-0000-4000-8000-000000000003';
const quickId = '00000000-0000-4000-8000-000000000004';
const now = new Date('2026-10-28T12:00:00Z');
const received = '2026-10-28T10:00:00Z';
beforeAll(async () => {
  pg = new PGlite(); state.database = drizzle(pg);
  await pg.exec(`
    CREATE TABLE bookings(id uuid PRIMARY KEY, ref_number text, customer_phone text, status text DEFAULT 'paid',
      payment_type text, total_amount numeric DEFAULT 100, deposit_amount_pence integer,
      remaining_balance_pence integer, deposit_paid_at timestamptz, stripe_pi_id text, stripe_deposit_pi_id text);
    CREATE TABLE quick_bookings(id uuid PRIMARY KEY, booking_id uuid REFERENCES bookings(id));
    CREATE TABLE admin_quote_drafts(id uuid PRIMARY KEY, customer_phone text, quick_booking_id uuid REFERENCES quick_bookings(id));
    CREATE TABLE payment_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid, booking_ref text,
      event_type text, payment_method text, paid_via text, link_status text, amount_pence integer, currency text DEFAULT 'gbp',
      stripe_session_id text, stripe_payment_intent_id text, stripe_checkout_url text, source text DEFAULT 'stripe_webhook',
      status text DEFAULT 'succeeded', metadata jsonb, occurred_at timestamptz, expires_at timestamptz,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid, stripe_pi_id text, amount numeric,
      currency text DEFAULT 'gbp', status text, stripe_payload jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE refunds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid, stripe_refund_id text,
      amount numeric, created_at timestamptz DEFAULT now());
  `);
  await pg.exec(readFileSync(resolve('scripts/bonline-call-events.sql'), 'utf8'));
  await pg.exec(readFileSync(resolve('scripts/bonline-call-management.sql'), 'utf8'));
  const migration = readFileSync(resolve('scripts/bonline-call-attribution.sql'), 'utf8');
  await pg.exec(migration); await pg.exec(migration);
});
beforeEach(async () => {
  state.admin = true; state.allowed = true;
  await pg.exec('TRUNCATE bonline_call_links,bonline_call_followups,bonline_calls,admin_quote_drafts,quick_bookings,bookings,payment_events,payments,refunds CASCADE');
});
afterAll(async () => { await pg.close(); });

async function call(id = key, phone: string | null = '+447700900123', scope = 'scope-a', outcome = 'answered', timestamp = received) {
  await pg.query(`INSERT INTO bonline_calls(scope,event_key,call_id,phone,outcome,first_received_at,last_received_at)
    VALUES($1,$2,$2,$3,$4,$5,$5)`, [scope, id, phone, outcome, timestamp]);
}
async function booking(id = bookingId, phone = '07700 900123') {
  await pg.query('INSERT INTO bookings(id,ref_number,customer_phone) VALUES($1,$2,$3)', [id, `TR-${id.slice(-3)}`, phone]);
}
async function quote(booked: string | null = null) {
  await pg.query('INSERT INTO quick_bookings(id,booking_id) VALUES($1,$2)', [quickId, booked]);
  await pg.query('INSERT INTO admin_quote_drafts(id,customer_phone,quick_booking_id) VALUES($1,$2,$3)', [quoteId, '+447700900123', quickId]);
}
async function receipt(amount: number, pi: string, type = 'payment_succeeded', currency = 'gbp', status = 'succeeded') {
  await pg.query(`INSERT INTO payment_events(booking_id,event_type,amount_pence,stripe_payment_intent_id,currency,status)
    VALUES($1,$2,$3,$4,$5,$6)`, [bookingId, type, amount, pi, currency, status]);
}

describe('bOnline explicit call attribution', () => {
  it('links a matching UK number, retries safely and enriches the quote with the final booking', async () => {
    await call(); await booking(); await quote(bookingId);
    expect(await linkBonlineCall('scope-a', key, 'admin-1', { quoteId })).toMatchObject({ linked: true, quoteId });
    await linkBonlineCall('scope-a', key, 'admin-1', { quoteId });
    expect(await linkBonlineCall('scope-a', key, 'admin-1', { bookingId })).toMatchObject({ quoteId, bookingId });
    expect((await pg.query('SELECT * FROM bonline_call_links')).rows).toHaveLength(1);
  });
  it('rejects a different customer, nonexistent quote, wrong scope and numberless or company calls', async () => {
    await call(); await booking(bookingId, '07700900999');
    await expect(linkBonlineCall('scope-a', key, 'admin', { bookingId })).rejects.toMatchObject({ status: 409 });
    await expect(linkBonlineCall('scope-a', key, 'admin', { quoteId })).rejects.toMatchObject({ status: 409 });
    await expect(linkBonlineCall('scope-b', key, 'admin', { bookingId })).rejects.toMatchObject({ status: 404 });
    for (const phone of [null, '+441932509613']) {
      await pg.query('UPDATE bonline_calls SET phone=$1', [phone]);
      await expect(linkBonlineCall('scope-a', key, 'admin', { bookingId })).rejects.toMatchObject({ status: 409 });
    }
  });
  it('cannot overwrite an earlier booking, even if another booking uses the same phone', async () => {
    await call(); await booking(); await booking(otherBooking);
    await linkBonlineCall('scope-a', key, 'admin', { bookingId });
    await expect(linkBonlineCall('scope-a', key, 'admin', { bookingId: otherBooking })).rejects.toMatchObject({ status: 409 });
  });
  it('rejects an explicit quote/booking pair with an existing conflicting quote relationship', async () => {
    await call(); await booking(); await booking(otherBooking); await quote(otherBooking);
    await expect(linkBonlineCall('scope-a', key, 'admin', { quoteId, bookingId })).rejects.toMatchObject({ status: 409 });
  });
});

describe('bOnline partial attribution updates', () => {
  it.each(['quote-first', 'booking-first'])('rejects a conflicting pair across partial updates: %s', async (order) => {
    await call(); await booking(); await booking(otherBooking); await quote(otherBooking);
    const first = order === 'quote-first' ? { quoteId } : { bookingId };
    const second = order === 'quote-first' ? { bookingId } : { quoteId };
    await linkBonlineCall('scope-a', key, 'admin', first);
    await expect(linkBonlineCall('scope-a', key, 'admin', second)).rejects.toMatchObject({ status: 409 });
  });
});

describe('bOnline call-cohort analytics', () => {
  it('tracks quote conversion into its final booking and counts revenue once across multiple calls', async () => {
    await call(); await call(secondKey); await booking(); await quote();
    await linkBonlineCall('scope-a', key, 'admin', { quoteId });
    expect((await readBonlineAnalytics('scope-a', 30, now)).metrics).toMatchObject({ linkedQuotes: 1, linkedBookings: 0, paidRevenuePence: 0 });
    await pg.query('UPDATE quick_bookings SET booking_id=$1', [bookingId]);
    await linkBonlineCall('scope-a', secondKey, 'admin', { bookingId });
    await receipt(2000, 'pi_deposit', 'deposit_succeeded');
    await receipt(8000, 'pi_balance');
    await receipt(8000, 'pi_balance'); // provider duplicate
    await pg.query(`INSERT INTO payments(booking_id,stripe_pi_id,amount,status) VALUES($1,'pi_balance',80,'succeeded')`, [bookingId]);
    const result = await readBonlineAnalytics('scope-a', 30, now);
    expect(result.metrics).toMatchObject({ totalCalls: 2, answeredCalls: 2, linkedQuotes: 1, linkedBookings: 1,
      paidBookings: 1, paidRevenuePence: 10000, quoteConversionRate: 0.5, bookingConversionRate: 1 });
  });
  it('never treats booking lifecycle, a quote value, pending or foreign-currency money as paid revenue', async () => {
    await call(); await booking(); await quote(bookingId);
    await linkBonlineCall('scope-a', key, 'admin', { quoteId });
    await receipt(10000, 'pi_pending', 'payment_succeeded', 'gbp', 'pending');
    await receipt(10000, 'pi_dollars', 'payment_succeeded', 'usd');
    expect((await readBonlineAnalytics('scope-a', 30, now)).metrics).toMatchObject({ linkedBookings: 1, paidBookings: 0, paidRevenuePence: 0 });
  });
  it('deduplicates canonical and legacy refunds and subtracts legacy-only refunds', async () => {
    await call(); await booking(); await linkBonlineCall('scope-a', key, 'admin', { bookingId });
    await receipt(10000, 'pi_full');
    await pg.query(`INSERT INTO payment_events(booking_id,event_type,amount_pence,metadata) VALUES($1,'refund_succeeded',2000,'{"stripeRefundId":"re_1"}')`, [bookingId]);
    await pg.query(`INSERT INTO refunds(booking_id,stripe_refund_id,amount) VALUES($1,'re_1',20),($1,'re_2',10),($1,'re_2',10)`, [bookingId]);
    expect((await readBonlineAnalytics('scope-a', 30, now)).metrics.paidRevenuePence).toBe(7000);
  });
  it('counts verified missed, overdue and unknown outcomes while isolating scope, company line and period', async () => {
    await call(key, '+447700900123', 'scope-a', 'missed');
    await call(secondKey, null, 'scope-a', 'unknown');
    await call('c'.repeat(64), '+447700900124', 'scope-a', 'ringing');
    await call('d'.repeat(64), '+441932509613');
    await call('e'.repeat(64), '+447700900125', 'scope-b');
    await call('f'.repeat(64), '+447700900126', 'scope-a', 'answered', '2026-09-01T00:00:00Z');
    await pg.query(`INSERT INTO bonline_call_followups(scope,event_key,created_at) VALUES('scope-a',$1,$2)`, [key, received]);
    expect((await readBonlineAnalytics('scope-a', 7, now)).metrics).toMatchObject({ totalCalls: 3, missedCalls: 1,
      unknownCalls: 2, openFollowUps: 1, overdueFollowUps: 1, bookingConversionRate: 0 });
  });
});

describe('bOnline attribution and analytics routes', () => {
  const post = (body: unknown, origin?: string) => POST(new Request('https://example.com/api/mobile/admin/phone/calls/'+key+'/link', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: key }) });
  it('requires admin authorization and bOnline scope access', async () => {
    state.admin = false;
    expect((await GET(new Request('https://example.com?days=7'))).status).toBe(401);
    expect((await post({ bookingId })).status).toBe(401);
    state.admin = true; state.allowed = false;
    expect(await (await GET(new Request('https://example.com'))).json()).toEqual({ enabled: false });
    expect((await post({ bookingId })).status).toBe(403);
  });
  it('rejects invalid report windows, empty links, malformed identifiers and cross-origin cookie mutations', async () => {
    expect((await GET(new Request('https://example.com?days=7abc'))).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post({ bookingId: 'not-a-uuid' })).status).toBe(400);
    expect((await post({ bookingId }, 'https://unrelated.example')).status).toBe(403);
  });
  it('returns confirmed links and private, non-cacheable reports', async () => {
    await call(); await booking();
    expect((await post({ bookingId })).status).toBe(200);
    const response = await GET(new Request('https://example.com?days=30'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect((await response.json()).enabled).toBe(true);
  });
});
