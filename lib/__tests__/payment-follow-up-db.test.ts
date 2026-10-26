import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: null as unknown, pg: null as unknown, pushes: [] as Array<Record<string, unknown>> }));
vi.mock('@/lib/db', async () => ({ db: new Proxy({}, { get: (_, prop) => (state.db as Record<string | symbol, unknown>)[prop] }) }));
vi.mock('@/lib/notifications', () => ({
  createAdminNotification: async (input: { type: string; entityId: string; title: string; body: string }) => {
    const pg = state.pg as PGlite;
    // The record carries the run's clock so the dedupe window is testable.
    await pg.query('INSERT INTO admin_notifications (type, title, body, entity_id, created_at) VALUES ($1, $2, $3, $4, (SELECT now_value FROM test_clock))',
      [input.type, input.title, input.body, input.entityId]);
    return { id: 'n' };
  },
}));
vi.mock('@/lib/notifications/expo-admin-push', () => ({ sendAdminExpoPush: async (payload: Record<string, unknown>) => { state.pushes.push(payload); } }));

import { followUpPushContent, runPaymentFollowUp } from '../payments/payment-follow-up';

const pg = new PGlite();
const t0 = new Date('2026-10-26T12:00:00Z');
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);

beforeAll(async () => {
  state.db = drizzle(pg);
  state.pg = pg;
  await pg.exec(`
    CREATE TABLE bookings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ref_number text, status text, total_amount numeric, payment_type text, created_at timestamptz);
    CREATE TABLE payment_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid, event_type text, status text);
    CREATE TABLE admin_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text, title text, body text, entity_id text, created_at timestamptz);
    CREATE TABLE test_clock (now_value timestamptz);`);
}, 30_000);
beforeEach(async () => {
  state.pushes = [];
  await pg.exec(`TRUNCATE bookings, payment_events, admin_notifications, test_clock;
    INSERT INTO bookings (ref_number, status, total_amount, payment_type, created_at) VALUES
      ('TYR-UNPAID', 'awaiting_payment', 194.32, 'full', '2026-10-26 11:30+00'),
      ('TYR-OLD', 'awaiting_payment', 50, 'full', '2026-10-25 08:00+00'),
      ('TYR-CANCELLED', 'cancelled', 50, 'full', '2026-10-26 11:40+00'),
      ('TYR-PAID-EVENT', 'awaiting_payment', 80, 'full', '2026-10-26 11:45+00');
    INSERT INTO payment_events (booking_id, event_type, status) SELECT id, 'manual_paid', 'succeeded' FROM bookings WHERE ref_number = 'TYR-PAID-EVENT';`);
});
afterAll(async () => { await pg.close(); });

async function runAt(date: Date) {
  await pg.query('DELETE FROM test_clock');
  await pg.query('INSERT INTO test_clock VALUES ($1)', [date.toISOString()]);
  return runPaymentFollowUp(date);
}

describe('payment follow-up every 7 minutes', () => {
  it('reminds only about recent unpaid bookings, once per 7-minute window, until they are paid', async () => {
    expect(await runAt(at(0))).toEqual({ reminded: 1 });
    expect(state.pushes[0]).toMatchObject({ title: 'Payment not received yet', data: { type: 'payment_follow_up', refNumber: 'TYR-UNPAID' } });
    expect(String(state.pushes[0].body)).toContain('£194.32');
    // A retried or early run inside the window sends nothing.
    expect(await runAt(at(3))).toEqual({ reminded: 0 });
    expect(await runAt(at(7))).toEqual({ reminded: 1 });
    // Once paid, reminders stop.
    await pg.exec(`UPDATE bookings SET status = 'paid' WHERE ref_number = 'TYR-UNPAID'`);
    expect(await runAt(at(14))).toEqual({ reminded: 0 });
    expect(state.pushes).toHaveLength(2);
  });

  it('combines several unpaid bookings into one push without customer details', () => {
    const due = ['A', 'B', 'C', 'D'].map((ref, index) => ({ id: `id-${index}`, ref_number: `TYR-${ref}`, total_amount: 10, payment_type: 'full', status: 'awaiting_payment' }));
    expect(followUpPushContent(due)).toEqual({
      title: '4 payments not received yet',
      body: 'TYR-A, TYR-B, TYR-C and 1 more. Follow up with the customers.',
      data: { type: 'payment_follow_up' },
    });
    expect(followUpPushContent([{ ...due[0], payment_type: 'deposit' }])?.title).toBe('Deposit not received yet');
    expect(followUpPushContent([])).toBeNull();
  });
});
