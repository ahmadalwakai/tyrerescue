import { Pool, type PoolClient } from '@neondatabase/serverless';
import {
  validateStripePaymentMatch,
  type StripePaymentIdentity,
  type StoredPaymentAttempt,
} from './stripe-webhook';

export interface VerifiedStripePayment {
  eventId: string;
  eventType: string;
  createdAt: Date;
  outcome: 'succeeded' | 'failed' | 'expired';
  source?: 'stripe_webhook' | 'system';
  payment: StripePaymentIdentity;
  expiresAt?: Date | null;
  errorCode?: string | null;
}

export interface StripeWebhookResult {
  state: 'applied' | 'duplicate' | 'ignored' | 'needs_checking';
  reason?: string;
  bookingId: string;
  previousStatus?: string;
}

function numberPence(value: unknown): number {
  return Math.round(Number(value ?? 0) * 100);
}

/**
 * The booking lock serializes different Stripe events for the same booking.
 * Receipt, payment evidence, booking state and history commit together. A crash
 * therefore leaves either all payment truth persisted, or a retryable event.
 */
export async function persistStripeWebhook(input: VerifiedStripePayment): Promise<StripeWebhookResult> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8_000 });
  const client = await pool.connect();
  const { payment } = input;
  const result = (state: StripeWebhookResult['state'], reason?: string): StripeWebhookResult => ({
    state, reason, bookingId: payment.bookingId,
  });
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '10s'");
    const bookingResult = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [payment.bookingId]);
    const booking = bookingResult.rows[0];
    if (!booking) {
      await client.query('COMMIT');
      return result('ignored', 'unknown_booking');
    }

    const receipt = await client.query(
      `SELECT id FROM payment_events WHERE metadata->>'stripeEventId' = $1
         OR metadata->>'reconciliationId' = $1 LIMIT 1`, [input.eventId],
    );
    const otherOwner = await client.query(
      `SELECT booking_id FROM payments
         WHERE stripe_pi_id = $1 AND booking_id IS DISTINCT FROM $3::uuid
       UNION ALL
       SELECT booking_id FROM payment_events
         WHERE (stripe_payment_intent_id = $1 OR stripe_session_id = $2)
           AND booking_id IS DISTINCT FROM $3::uuid
       LIMIT 1`,
      [payment.paymentIntentId, payment.sessionId, booking.id],
    );
    if (otherOwner.rows.length) {
      await client.query('COMMIT');
      return result('ignored', 'payment_bound_to_different_booking');
    }
    const paymentRows = (await client.query('SELECT * FROM payments WHERE booking_id = $1', [booking.id])).rows;
    const eventRows = (await client.query('SELECT * FROM payment_events WHERE booking_id = $1', [booking.id])).rows;
    const attempts: StoredPaymentAttempt[] = [
      ...paymentRows.map((row) => ({
        paymentIntentId: row.stripe_pi_id?.startsWith('pi_') ? row.stripe_pi_id : null,
        sessionId: row.stripe_payload?.sessionId ?? (row.stripe_pi_id?.startsWith('cs_') ? row.stripe_pi_id : null),
        amountPence: numberPence(row.amount),
        currency: row.currency ?? 'gbp',
      })),
      ...eventRows.filter((row) => ['link_created', 'link_sent'].includes(row.event_type)).map((row) => ({
        paymentIntentId: row.stripe_payment_intent_id,
        sessionId: row.stripe_session_id,
        amountPence: row.amount_pence,
        currency: row.currency ?? 'gbp',
      })),
    ];

    // One successful PaymentIntent is counted once across both legacy and
    // canonical storage. Cash/manual receipts also reduce outstanding balance.
    const paidByIntent = new Map<string, number>();
    for (const row of paymentRows) {
      if (['succeeded', 'paid'].includes(row.status)) paidByIntent.set(row.stripe_pi_id, numberPence(row.amount));
    }
    let nonStripePaidPence = 0;
    for (const row of eventRows) {
      if (['payment_succeeded', 'deposit_succeeded'].includes(row.event_type) && row.stripe_payment_intent_id) {
        paidByIntent.set(row.stripe_payment_intent_id, row.amount_pence ?? 0);
      } else if (['cash_confirmed', 'manual_paid'].includes(row.event_type)) {
        nonStripePaidPence += row.amount_pence ?? 0;
      }
    }
    const alreadySucceeded = payment.paymentIntentId && paidByIntent.has(payment.paymentIntentId);
    const outstandingPence = Math.max(0, numberPence(booking.total_amount)
      - [...paidByIntent.values()].reduce((sum, amount) => sum + amount, 0) - nonStripePaidPence);
    const match = validateStripePaymentMatch(payment, {
      id: booking.id,
      refNumber: booking.ref_number,
      totalAmount: booking.total_amount,
      depositAmountPence: booking.deposit_amount_pence,
      stripePiId: booking.stripe_pi_id,
      stripeDepositPiId: booking.stripe_deposit_pi_id,
      // Saved attempt fixes admin-link amount. Outstanding is checked below
      // for every payment purpose, so stale paid links enter review uniformly.
    }, attempts);
    if (!match.valid) {
      await client.query('COMMIT');
      return result('ignored', match.reason);
    }

    const blockedBooking = ['cancelled', 'cancelled_refund_pending', 'refunded', 'refunded_partial'].includes(booking.status);
    if (input.outcome === 'succeeded' && blockedBooking && alreadySucceeded) {
      await client.query('COMMIT');
      return result('needs_checking', 'settled_payment_for_closed_booking');
    }
    if (receipt.rows.length) {
      if (input.outcome === 'succeeded' && alreadySucceeded) {
        await writePaidBooking(client, booking, payment);
      }
      await client.query('COMMIT');
      return result('duplicate');
    }
    if (input.outcome !== 'succeeded' && (alreadySucceeded || eventRows.some((row) =>
      row.stripe_session_id === payment.sessionId && payment.sessionId
      && ['payment_succeeded', 'deposit_succeeded'].includes(row.event_type)))) {
      await client.query('COMMIT');
      return result('ignored', 'payment_already_succeeded');
    }
    if (input.outcome === 'succeeded' && alreadySucceeded) {
      // Repair the crash window of older nontransactional confirmation code:
      // saved payment evidence can precede the booking status update.
      await writePaidBooking(client, booking, payment);
      await client.query('COMMIT');
      return result('duplicate');
    }
    const exceedsOutstanding = input.outcome === 'succeeded' && !alreadySucceeded
      && payment.amountPence > outstandingPence;
    const depositAlreadySettled = input.outcome === 'succeeded' && payment.purpose === 'deposit'
      && !alreadySucceeded && Boolean(booking.deposit_paid_at || eventRows.some((row) => row.event_type === 'deposit_succeeded'));
    const needsChecking = input.outcome === 'succeeded' && (blockedBooking || exceedsOutstanding || depositAlreadySettled);
    const reviewReason = blockedBooking ? 'payment_received_for_cancelled_booking'
      : depositAlreadySettled ? 'deposit_already_settled' : 'payment_exceeds_outstanding_balance';
    const canonicalType = needsChecking ? 'payment_needs_checking'
      : input.outcome === 'expired' ? 'link_expired'
        : input.outcome === 'failed' ? 'payment_failed'
          : payment.purpose === 'deposit' ? 'deposit_succeeded' : 'payment_succeeded';
    const inserted = await client.query(
      `INSERT INTO payment_events
         (booking_id, booking_ref, event_type, payment_method, paid_via, link_status,
          amount_pence, currency, stripe_session_id, stripe_payment_intent_id,
          source, status, metadata, occurred_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               $15, $11, $12::jsonb, $13, $14)
       ON CONFLICT DO NOTHING RETURNING id`,
      [booking.id, booking.ref_number, canonicalType,
        payment.purpose === 'deposit' ? 'deposit_link' : 'card_link',
        input.outcome === 'succeeded' && !needsChecking ? 'payment_link' : null,
        needsChecking ? 'unknown' : input.outcome === 'succeeded' ? 'paid' : input.outcome,
        payment.amountPence, payment.currency, payment.sessionId, payment.paymentIntentId,
        needsChecking ? 'needs_checking' : input.outcome,
        JSON.stringify({
          ...(input.source === 'system' ? { reconciliationId: input.eventId } : { stripeEventId: input.eventId }),
          verification: input.source === 'system' ? 'stripe_api_reconciliation' : 'signed_stripe_webhook',
          stripeEventType: input.eventType,
          project: payment.project ?? 'legacy_bound_payment', source: payment.source ?? null,
          purpose: payment.purpose, errorCode: input.errorCode ?? null,
          ...(needsChecking ? { reason: reviewReason, outstandingPence } : {}) }),
        input.createdAt, input.expiresAt ?? null, input.source ?? 'stripe_webhook'],
    );
    if (!inserted.rows.length) {
      await client.query('COMMIT');
      return result('duplicate');
    }
    if (needsChecking) {
      await client.query('COMMIT');
      return result('needs_checking', reviewReason);
    }

    if (input.outcome !== 'expired' && payment.paymentIntentId) {
      await client.query(
        `INSERT INTO payments (booking_id, stripe_pi_id, amount, currency, status, stripe_payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (stripe_pi_id) DO UPDATE SET status = EXCLUDED.status,
           stripe_payload = EXCLUDED.stripe_payload, updated_at = NOW()
         WHERE payments.booking_id = EXCLUDED.booking_id AND payments.status NOT IN ('succeeded', 'paid')`,
        [booking.id, payment.paymentIntentId, (payment.amountPence / 100).toFixed(2), payment.currency,
          input.outcome, JSON.stringify({ sessionId: payment.sessionId,
            ...(input.source === 'system' ? { reconciliationId: input.eventId } : { stripeEventId: input.eventId }),
            source: payment.source ?? null, project: payment.project ?? null })],
      );
      if (payment.sessionId) {
        await client.query(
          `UPDATE payments SET status = 'superseded', updated_at = NOW()
           WHERE booking_id = $1 AND stripe_pi_id = $2 AND status NOT IN ('succeeded', 'paid')`,
          [booking.id, payment.sessionId],
        );
      }
    }

    if (input.outcome === 'succeeded') {
      await writePaidBooking(client, booking, payment);
    }
    // A declined card can be retried on the same intent/session. Keep the
    // booking payable and its stock reservation until its normal expiry.
    await client.query('COMMIT');
    return { ...result('applied'), previousStatus: booking.status };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

interface StoredBooking {
  id: string;
  status: string;
  total_amount: string;
  payment_type: string | null;
  deposit_paid_at: Date | string | null;
  stripe_pi_id: string | null;
  stripe_deposit_pi_id: string | null;
}

async function writePaidBooking(client: PoolClient, booking: StoredBooking, payment: StripePaymentIdentity) {
  let nextStatus = booking.status;
  if (['awaiting_payment', 'payment_failed', 'draft'].includes(booking.status)) {
    nextStatus = payment.purpose === 'deposit' ? 'deposit_paid' : 'paid';
  }
  if (payment.purpose === 'deposit') {
    // A replay of an earlier deposit must not replace a subsequently settled
    // full balance or move an assigned job backwards in its lifecycle.
    if (booking.deposit_paid_at || booking.payment_type === 'full') return;
    await client.query(
      `UPDATE bookings SET status = $2, payment_type = 'deposit', deposit_paid_at = COALESCE(deposit_paid_at, NOW()),
         deposit_amount_pence = $3, remaining_balance_pence = $4,
         stripe_deposit_pi_id = $5, updated_at = NOW() WHERE id = $1`,
      [booking.id, nextStatus, payment.amountPence, numberPence(booking.total_amount) - payment.amountPence,
        payment.paymentIntentId],
    );
  } else {
    if (nextStatus === booking.status && booking.payment_type === 'full' && booking.stripe_pi_id === payment.paymentIntentId) return;
    await client.query(
      `UPDATE bookings SET status = $2, payment_type = 'full', stripe_pi_id = $3,
         remaining_balance_pence = 0, updated_at = NOW() WHERE id = $1`,
      [booking.id, nextStatus, payment.paymentIntentId],
    );
  }
  if (nextStatus !== booking.status) {
    await client.query(
      `INSERT INTO booking_status_history (booking_id, from_status, to_status, actor_role, note)
       VALUES ($1, $2, $3, 'system', $4)`,
      [booking.id, booking.status, nextStatus, `Payment confirmed from verified Stripe evidence (${payment.paymentIntentId})`],
    );
  }
}
