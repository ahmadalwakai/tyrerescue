import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { BUSINESS_PHONE_E164 } from '@/lib/config/business-contact';
import { getBookingPaymentSummaryMap, type PaymentBookingInput } from '@/lib/payments/payment-summary';

/** Call-cohort report: calls received in the period, linked sales/payments known now. */
export async function readBonlineAnalytics(scope: string, days: 7 | 30 | 90, now = new Date()) {
  const from = new Date(now.getTime() - days * 86_400_000).toISOString();
  const to = now.toISOString();
  const cohort = sql`c.scope = ${scope} AND c.first_received_at >= ${from}::timestamptz
    AND c.first_received_at <= ${to}::timestamptz AND (c.phone IS NULL OR c.phone <> ${BUSINESS_PHONE_E164})`;
  const attribution = sql`
    FROM bonline_calls c
    LEFT JOIN bonline_call_links l ON l.scope = c.scope AND l.event_key = c.event_key
    LEFT JOIN admin_quote_drafts q ON q.id = l.quote_id
    LEFT JOIN quick_bookings qb ON qb.id = q.quick_booking_id
    LEFT JOIN bookings b ON b.id = COALESCE(l.booking_id, qb.booking_id)
    WHERE ${cohort}`;
  const [callResult, conversionResult, bookingResult] = await Promise.all([
    db.execute(sql`SELECT count(*) AS total,
      count(*) FILTER (WHERE c.outcome = 'answered') AS answered,
      count(*) FILTER (WHERE c.outcome = 'missed') AS missed,
      count(*) FILTER (WHERE c.outcome IN ('unknown', 'ringing')) AS unknown,
      count(*) FILTER (WHERE c.outcome = 'missed' AND f.status IN ('pending','claimed')) AS open,
      count(*) FILTER (WHERE c.outcome = 'missed' AND f.status IN ('pending','claimed') AND f.created_at <= ${to}::timestamptz - interval '15 minutes') AS overdue
      FROM bonline_calls c LEFT JOIN bonline_call_followups f ON f.scope = c.scope AND f.event_key = c.event_key
      WHERE ${cohort}`),
    db.execute(sql`SELECT count(DISTINCT q.id) AS quotes, count(DISTINCT b.id) AS bookings,
      count(*) FILTER (WHERE q.id IS NOT NULL) AS quoted_calls,
      count(*) FILTER (WHERE b.id IS NOT NULL) AS booked_calls ${attribution}`),
    db.execute(sql`SELECT DISTINCT b.id, b.ref_number AS "refNumber", b.status,
      b.payment_type AS "paymentType", b.total_amount AS "totalAmount",
      b.deposit_amount_pence AS "depositAmountPence", b.remaining_balance_pence AS "remainingBalancePence",
      b.deposit_paid_at AS "depositPaidAt", b.stripe_pi_id AS "stripePiId", b.stripe_deposit_pi_id AS "stripeDepositPiId"
      ${attribution} AND b.id IS NOT NULL LIMIT 5001`),
  ]);
  const bookings = bookingResult.rows as unknown as PaymentBookingInput[];
  if (bookings.length > 5000) throw new Error('Report too large; select a shorter period.');
  const summaries = await getBookingPaymentSummaryMap(bookings, { audience: 'driver' });
  // Legacy refund routes write the refunds table. Exclude refunds already in the
  // canonical ledger so a refund cannot be subtracted twice.
  const refundByBooking = new Map<string, number>();
  if (bookings.length) {
    const ids = sql.join(bookings.map((booking) => sql`${booking.id}::uuid`), sql`, `);
    const refunds = await db.execute(sql`
      SELECT booking_id, sum(round(amount * 100)) AS pence FROM (
        SELECT DISTINCT ON (r.booking_id, COALESCE(r.stripe_refund_id, r.id::text)) r.*
        FROM refunds r WHERE r.booking_id IN (${ids}) AND NOT EXISTS (
          SELECT 1 FROM payment_events e WHERE e.booking_id = r.booking_id
            AND e.event_type IN ('refund_created', 'refund_succeeded') AND e.status IN ('succeeded','paid')
            AND lower(e.currency) = 'gbp'
            AND e.amount_pence > 0
            AND (e.booking_ref IS NULL OR e.booking_ref = (SELECT ref_number FROM bookings WHERE id = r.booking_id))
            AND COALESCE(e.metadata->>'stripeRefundId', e.metadata->>'refundId') = r.stripe_refund_id
        ) ORDER BY r.booking_id, COALESCE(r.stripe_refund_id, r.id::text), r.created_at DESC
      ) deduplicated GROUP BY booking_id`);
    for (const row of refunds.rows as { booking_id: string; pence: string | number }[]) {
      refundByBooking.set(row.booking_id, Math.max(0, Number(row.pence)));
    }
  }
  let paidRevenuePence = 0;
  let paidBookings = 0;
  for (const booking of bookings) {
    const net = Math.max(0, (summaries.get(booking.id)?.paidPence ?? 0) - (refundByBooking.get(booking.id) ?? 0));
    paidRevenuePence += net;
    if (net > 0) paidBookings += 1;
  }
  const calls = callResult.rows[0] as Record<string, string | number>;
  const conversions = conversionResult.rows[0] as Record<string, string | number>;
  const totalCalls = Number(calls.total);
  return {
    period: { days, from, to }, currency: 'GBP' as const,
    metrics: {
      totalCalls, answeredCalls: Number(calls.answered), missedCalls: Number(calls.missed), unknownCalls: Number(calls.unknown),
      openFollowUps: Number(calls.open), overdueFollowUps: Number(calls.overdue),
      linkedQuotes: Number(conversions.quotes), linkedBookings: Number(conversions.bookings), paidBookings, paidRevenuePence,
      quoteConversionRate: totalCalls ? Number(conversions.quoted_calls) / totalCalls : 0,
      bookingConversionRate: totalCalls ? Number(conversions.booked_calls) / totalCalls : 0,
    },
  };
}
