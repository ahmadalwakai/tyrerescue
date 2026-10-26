import { Pool, type PoolClient } from '@neondatabase/serverless';

/**
 * Staff confirmation that a customer paid outside Tyre Rescue's Stripe links
 * (another provider's link, bank transfer…), either the 20% deposit or the
 * full outstanding balance.
 *
 * Recorded the same way the verified Stripe webhook records a payment (a
 * payment_events receipt plus the booking's payment fields and status), but
 * marked paid_via 'manual' / source 'admin' with the staff member's ID, so it
 * stays distinguishable and auditable. A row lock serialises concurrent taps,
 * and a payment that is already recorded is reported, never recorded twice.
 */

export type ManualPaymentKind = 'full' | 'deposit';

export type ManualPaymentResult =
  | { status: 'recorded'; kind: ManualPaymentKind; amountPence: number; bookingId: string; previousStatus: string; bookingStatus: string }
  | { status: 'already_recorded'; kind: ManualPaymentKind }
  | { status: 'not_found' }
  | { status: 'not_payable'; reason: string };

const CLOSED_STATUSES = new Set(['cancelled', 'refunded', 'refunded_partial', 'cancelled_refund_pending']);
const PRE_PAYMENT_STATUSES = new Set(['awaiting_payment', 'payment_failed', 'draft']);
const DEPOSIT_FRACTION = 0.2;

type QueryClient = Pick<PoolClient, 'query'>;

interface LockedBooking {
  id: string;
  ref_number: string;
  status: string;
  total_amount: string | number;
  payment_type: string | null;
  deposit_paid_at: unknown;
  deposit_amount_pence: number | null;
}

async function withTransaction<T>(work: (client: QueryClient) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8_000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '10s'");
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

export async function recordManualPayment(
  client: QueryClient,
  input: { refNumber: string; kind: ManualPaymentKind; actorUserId: string; note?: string | null },
): Promise<ManualPaymentResult> {
  const locked = await client.query(
    `SELECT id, ref_number, status, total_amount, payment_type, deposit_paid_at, deposit_amount_pence
     FROM bookings WHERE ref_number = $1 FOR UPDATE`, [input.refNumber]);
  const booking = locked.rows[0] as LockedBooking | undefined;
  if (!booking) return { status: 'not_found' };
  if (CLOSED_STATUSES.has(booking.status)) return { status: 'not_payable', reason: `Booking is ${booking.status.replace(/_/g, ' ')}.` };

  const totalPence = Math.round(Number(booking.total_amount) * 100);
  if (!Number.isSafeInteger(totalPence) || totalPence <= 0) return { status: 'not_payable', reason: 'Booking has no payable total.' };

  const receipts = await client.query(
    `SELECT event_type, amount_pence FROM payment_events
     WHERE booking_id = $1 AND status IN ('succeeded', 'paid')
       AND event_type IN ('payment_succeeded', 'deposit_succeeded', 'cash_confirmed', 'manual_paid')`, [booking.id]);
  const rows = receipts.rows as Array<{ event_type: string; amount_pence: number | null }>;
  const paidPence = rows.reduce((sum, row) => sum + Math.max(0, Number(row.amount_pence ?? 0)), 0);
  const depositRecorded = Boolean(booking.deposit_paid_at) || rows.some((row) => row.event_type === 'deposit_succeeded');

  let amountPence: number;
  let eventType: 'deposit_succeeded' | 'manual_paid';
  let nextStatus = booking.status;
  if (input.kind === 'deposit') {
    if (depositRecorded || paidPence >= totalPence) return { status: 'already_recorded', kind: 'deposit' };
    amountPence = booking.deposit_amount_pence && booking.deposit_amount_pence > 0
      ? booking.deposit_amount_pence : Math.round(totalPence * DEPOSIT_FRACTION);
    eventType = 'deposit_succeeded';
    if (PRE_PAYMENT_STATUSES.has(booking.status)) nextStatus = 'deposit_paid';
  } else {
    amountPence = totalPence - paidPence;
    if (amountPence <= 0) return { status: 'already_recorded', kind: 'full' };
    eventType = 'manual_paid';
    if (PRE_PAYMENT_STATUSES.has(booking.status) || booking.status === 'deposit_paid') nextStatus = 'paid';
  }

  await client.query(
    `INSERT INTO payment_events
       (booking_id, booking_ref, event_type, payment_method, paid_via, link_status, amount_pence, currency, source, status, metadata, occurred_at)
     VALUES ($1, $2, $3, 'manual', 'manual', NULL, $4, 'gbp', 'admin', 'succeeded', $5::jsonb, NOW())`,
    [booking.id, booking.ref_number, eventType, amountPence, JSON.stringify({
      confirmedBy: input.actorUserId, via: 'assisted_chat_manual_payment', kind: input.kind,
      note: input.note ?? null, previousStatus: booking.status,
    })]);

  if (input.kind === 'deposit') {
    await client.query(
      `UPDATE bookings SET status = $2, payment_type = 'deposit', deposit_paid_at = COALESCE(deposit_paid_at, NOW()),
         deposit_amount_pence = $3, remaining_balance_pence = $4, updated_at = NOW() WHERE id = $1`,
      [booking.id, nextStatus, amountPence, Math.max(0, totalPence - paidPence - amountPence)]);
  } else {
    await client.query(
      `UPDATE bookings SET status = $2, payment_type = COALESCE(payment_type, 'full'), remaining_balance_pence = 0,
         updated_at = NOW() WHERE id = $1`, [booking.id, nextStatus]);
  }
  if (nextStatus !== booking.status) {
    await client.query(
      `INSERT INTO booking_status_history (booking_id, from_status, to_status, actor_user_id, actor_role, note)
       VALUES ($1, $2, $3, $4, 'admin', $5)`,
      [booking.id, booking.status, nextStatus, input.actorUserId,
        input.kind === 'deposit' ? 'Deposit confirmed manually by staff (paid outside Stripe)' : 'Payment confirmed manually by staff (paid outside Stripe)']);
  }
  return { status: 'recorded', kind: input.kind, amountPence, bookingId: booking.id, previousStatus: booking.status, bookingStatus: nextStatus };
}

export function recordManualPaymentForBooking(input: Parameters<typeof recordManualPayment>[1]): Promise<ManualPaymentResult> {
  return withTransaction((client) => recordManualPayment(client, input));
}
