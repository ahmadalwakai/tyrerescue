import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { recordManualPayment } from '../payments/manual-payment';

const pg = new PGlite();
const client = { query: (text: string, values?: unknown[]) => pg.query(text, values) } as unknown as Parameters<typeof recordManualPayment>[0];
const staff = '10000000-0000-4000-8000-000000000001';

beforeAll(async () => {
  await pg.exec(`
    CREATE TABLE bookings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ref_number text UNIQUE, status text, total_amount numeric,
      payment_type text, deposit_paid_at timestamptz, deposit_amount_pence integer, remaining_balance_pence integer, updated_at timestamptz);
    CREATE TABLE payment_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid, booking_ref text, event_type text,
      payment_method text, paid_via text, link_status text, amount_pence integer, currency text, source text, status text,
      metadata jsonb, occurred_at timestamptz);
    CREATE TABLE booking_status_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid, from_status text,
      to_status text, actor_user_id uuid, actor_role text, note text);
  `);
}, 30_000);
beforeEach(async () => {
  await pg.exec(`TRUNCATE bookings, payment_events, booking_status_history;
    INSERT INTO bookings (ref_number, status, total_amount, payment_type) VALUES
      ('TYR-DEP', 'awaiting_payment', 194.32, 'deposit'), ('TYR-FULL', 'awaiting_payment', 194.32, NULL),
      ('TYR-CANCELLED', 'cancelled', 120, NULL), ('TYR-STRIPE', 'paid', 100, 'full');
    INSERT INTO payment_events (booking_id, event_type, amount_pence, currency, status)
      SELECT id, 'payment_succeeded', 10000, 'gbp', 'succeeded' FROM bookings WHERE ref_number = 'TYR-STRIPE';`);
});
afterAll(async () => { await pg.close(); });

const booking = async (ref: string) => (await pg.query<Record<string, unknown>>('SELECT * FROM bookings WHERE ref_number = $1', [ref])).rows[0];
const events = async (ref: string) => (await pg.query<{ event_type: string; amount_pence: number; paid_via: string; source: string }>(
  `SELECT e.event_type, e.amount_pence, e.paid_via, e.source FROM payment_events e JOIN bookings b ON b.id = e.booking_id WHERE b.ref_number = $1 ORDER BY e.occurred_at`, [ref])).rows;

describe('manual payment confirmation on disposable PostgreSQL', () => {
  it('records a 20% deposit once, then the exact remaining balance once', async () => {
    const deposit = await recordManualPayment(client, { refNumber: 'TYR-DEP', kind: 'deposit', actorUserId: staff });
    expect(deposit).toMatchObject({ status: 'recorded', amountPence: 3886, bookingStatus: 'deposit_paid' });
    expect(await booking('TYR-DEP')).toMatchObject({ status: 'deposit_paid', deposit_amount_pence: 3886, remaining_balance_pence: 15546 });
    expect(await recordManualPayment(client, { refNumber: 'TYR-DEP', kind: 'deposit', actorUserId: staff })).toEqual({ status: 'already_recorded', kind: 'deposit' });

    const balance = await recordManualPayment(client, { refNumber: 'TYR-DEP', kind: 'full', actorUserId: staff });
    expect(balance).toMatchObject({ status: 'recorded', amountPence: 15546, bookingStatus: 'paid' });
    expect(await recordManualPayment(client, { refNumber: 'TYR-DEP', kind: 'full', actorUserId: staff })).toEqual({ status: 'already_recorded', kind: 'full' });
    expect(await events('TYR-DEP')).toEqual([
      { event_type: 'deposit_succeeded', amount_pence: 3886, paid_via: 'manual', source: 'admin' },
      { event_type: 'manual_paid', amount_pence: 15546, paid_via: 'manual', source: 'admin' },
    ]);
    const history = await pg.query<{ to_status: string; actor_user_id: string }>('SELECT to_status, actor_user_id FROM booking_status_history ORDER BY to_status');
    expect(history.rows).toEqual([{ to_status: 'deposit_paid', actor_user_id: staff }, { to_status: 'paid', actor_user_id: staff }]);
  });

  it('records the full amount when nothing was paid before', async () => {
    expect(await recordManualPayment(client, { refNumber: 'TYR-FULL', kind: 'full', actorUserId: staff }))
      .toMatchObject({ status: 'recorded', amountPence: 19432, bookingStatus: 'paid' });
    expect(await booking('TYR-FULL')).toMatchObject({ status: 'paid', payment_type: 'full', remaining_balance_pence: 0 });
  });

  it('never records over a Stripe payment or on a cancelled booking', async () => {
    expect(await recordManualPayment(client, { refNumber: 'TYR-STRIPE', kind: 'full', actorUserId: staff })).toEqual({ status: 'already_recorded', kind: 'full' });
    expect(await recordManualPayment(client, { refNumber: 'TYR-STRIPE', kind: 'deposit', actorUserId: staff })).toEqual({ status: 'already_recorded', kind: 'deposit' });
    expect(await recordManualPayment(client, { refNumber: 'TYR-CANCELLED', kind: 'full', actorUserId: staff })).toMatchObject({ status: 'not_payable' });
    expect(await recordManualPayment(client, { refNumber: 'TYR-NOPE', kind: 'full', actorUserId: staff })).toEqual({ status: 'not_found' });
    expect(await events('TYR-STRIPE')).toHaveLength(1);
  });
});
