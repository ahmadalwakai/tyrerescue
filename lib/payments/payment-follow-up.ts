import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createAdminNotification } from '@/lib/notifications';
import { sendAdminExpoPush } from '@/lib/notifications/expo-admin-push';

/**
 * Staff follow-up for bookings still waiting for payment. Run every 7 minutes
 * (vercel.json), it reminds admins on their phones until the booking is paid,
 * cancelled, or older than the payment link's 24-hour life.
 *
 * - One booking: a push naming its reference and amount; several: one
 *   combined push, so a busy evening is one reminder per run, not a flood.
 * - Lock-screen safe: no customer name or contact details in the push.
 * - A follow-up record per booking (admin_notifications, which the in-app
 *   notification list already shows) stops a retried run from repeating it
 *   within the same 7-minute window.
 */

export const FOLLOW_UP_INTERVAL_MINUTES = 7;
const FOLLOW_UP_WINDOW_HOURS = 24;
const MAX_BOOKINGS_PER_RUN = 20;

export interface FollowUpBooking {
  id: string;
  ref_number: string;
  total_amount: string | number;
  payment_type: string | null;
  status: string;
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] } | null)?.rows ?? []);
}

const money = (value: string | number) => `£${Number(value).toFixed(2)}`;

/** Bookings due a reminder now: unpaid, recent, and not reminded in this window. */
export async function findBookingsDueFollowUp(now = new Date()): Promise<FollowUpBooking[]> {
  const since = new Date(now.getTime() - FOLLOW_UP_WINDOW_HOURS * 3_600_000).toISOString();
  // Slightly under the interval so a run that starts a few seconds early still fires.
  const remindedAfter = new Date(now.getTime() - (FOLLOW_UP_INTERVAL_MINUTES - 0.5) * 60_000).toISOString();
  const result = await db.execute(sql`
    SELECT b.id, b.ref_number, b.total_amount, b.payment_type, b.status
    FROM bookings b
    WHERE b.status IN ('awaiting_payment', 'payment_failed')
      AND b.created_at >= ${since}::timestamptz
      AND NOT EXISTS (
        SELECT 1 FROM payment_events e
        WHERE e.booking_id = b.id AND e.status IN ('succeeded', 'paid')
          AND e.event_type IN ('payment_succeeded', 'deposit_succeeded', 'cash_confirmed', 'manual_paid'))
      AND NOT EXISTS (
        SELECT 1 FROM admin_notifications n
        WHERE n.type = 'payment.follow_up' AND n.entity_id = b.id::text AND n.created_at > ${remindedAfter}::timestamptz)
    ORDER BY b.created_at ASC
    LIMIT ${MAX_BOOKINGS_PER_RUN}`);
  return rowsOf<FollowUpBooking>(result);
}

export function followUpPushContent(due: FollowUpBooking[]): { title: string; body: string; data: Record<string, unknown> } | null {
  if (due.length === 0) return null;
  if (due.length === 1) {
    const [booking] = due;
    const what = booking.payment_type === 'deposit' ? 'Deposit' : 'Payment';
    return {
      title: `${what} not received yet`,
      body: `${booking.ref_number} (${money(booking.total_amount)}) is still unpaid. Follow up with the customer.`,
      data: { type: 'payment_follow_up', bookingId: booking.id, refNumber: booking.ref_number },
    };
  }
  const refs = due.slice(0, 3).map((booking) => booking.ref_number).join(', ');
  return {
    title: `${due.length} payments not received yet`,
    body: `${refs}${due.length > 3 ? ` and ${due.length - 3} more` : ''}. Follow up with the customers.`,
    data: { type: 'payment_follow_up' },
  };
}

export async function runPaymentFollowUp(now = new Date()): Promise<{ reminded: number }> {
  const due = await findBookingsDueFollowUp(now);
  const push = followUpPushContent(due);
  if (!push) return { reminded: 0 };
  // Record first: the record is what prevents a retried run from repeating the push.
  for (const booking of due) {
    await createAdminNotification({
      type: 'payment.follow_up',
      title: push.title,
      body: `${booking.ref_number} (${money(booking.total_amount)}) is still unpaid.`,
      entityType: 'booking',
      entityId: booking.id,
      link: `/admin/bookings/${booking.ref_number}`,
      severity: 'info',
      createdBy: 'system',
      metadata: { refNumber: booking.ref_number, updateType: 'payment_follow_up' },
    });
  }
  await sendAdminExpoPush({ title: push.title, body: push.body, data: push.data, platforms: ['ios'], ttl: FOLLOW_UP_INTERVAL_MINUTES * 60 });
  return { reminded: due.length };
}
