import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { normalizeBonlinePhone, isBonlineBusinessPhone } from './events';

export class BonlineLinkError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

/** Links are explicit provenance, never an inferred conversion from a matching number. */
export async function linkBonlineCall(scope: string, eventKey: string, adminId: string,
  input: { quoteId?: string; bookingId?: string }) {
  const result = await db.execute(sql`
    SELECT c.phone, q.customer_phone AS quote_phone, q.id AS quote_id,
      b.customer_phone AS booking_phone, b.id AS booking_id,
      qb.booking_id AS quote_booking_id
    FROM bonline_calls c
    LEFT JOIN admin_quote_drafts q ON q.id = ${input.quoteId ?? null}::uuid
    LEFT JOIN quick_bookings qb ON qb.id = q.quick_booking_id
    LEFT JOIN bookings b ON b.id = ${input.bookingId ?? null}::uuid
    WHERE c.scope = ${scope} AND c.event_key = ${eventKey}
  `);
  const row = result.rows[0] as undefined | {
    phone: string | null; quote_phone: string | null; quote_id: string | null;
    booking_phone: string | null; booking_id: string | null; quote_booking_id: string | null;
  };
  if (!row) throw new BonlineLinkError('Call not found.', 404);
  const phone = normalizeBonlinePhone(row.phone);
  if (!phone || isBonlineBusinessPhone(phone)) throw new BonlineLinkError('This call has no usable customer number.', 409);
  if ((input.quoteId && (!row.quote_id || normalizeBonlinePhone(row.quote_phone) !== phone)) ||
      (input.bookingId && (!row.booking_id || normalizeBonlinePhone(row.booking_phone) !== phone))) {
    throw new BonlineLinkError('The saved quote or booking must belong to this caller number.', 409);
  }
  if (input.quoteId && input.bookingId && row.quote_booking_id && row.quote_booking_id !== input.bookingId) {
    throw new BonlineLinkError('This quote belongs to a different booking.', 409);
  }
  // Retries are safe; a new call cannot silently replace earlier attribution.
  const saved = await db.execute(sql`
    INSERT INTO bonline_call_links(scope, event_key, quote_id, booking_id, linked_by)
    VALUES (${scope}, ${eventKey}, ${input.quoteId ?? null}::uuid, ${input.bookingId ?? null}::uuid, ${adminId})
    ON CONFLICT(scope,event_key) DO UPDATE SET
      quote_id = COALESCE(bonline_call_links.quote_id, EXCLUDED.quote_id),
      booking_id = COALESCE(bonline_call_links.booking_id, EXCLUDED.booking_id),
      updated_at = clock_timestamp()
    WHERE (bonline_call_links.quote_id IS NULL OR EXCLUDED.quote_id IS NULL OR bonline_call_links.quote_id = EXCLUDED.quote_id)
      AND (bonline_call_links.booking_id IS NULL OR EXCLUDED.booking_id IS NULL OR bonline_call_links.booking_id = EXCLUDED.booking_id)
      AND NOT EXISTS (
        SELECT 1 FROM admin_quote_drafts q JOIN quick_bookings qb ON qb.id = q.quick_booking_id
        WHERE q.id = COALESCE(bonline_call_links.quote_id, EXCLUDED.quote_id)
          AND qb.booking_id IS NOT NULL
          AND COALESCE(bonline_call_links.booking_id, EXCLUDED.booking_id) IS NOT NULL
          AND qb.booking_id <> COALESCE(bonline_call_links.booking_id, EXCLUDED.booking_id)
      )
    RETURNING quote_id, booking_id
  `);
  if (!saved.rows[0]) throw new BonlineLinkError('This call is already linked to another quote or booking.', 409);
  const link = saved.rows[0] as { quote_id: string | null; booking_id: string | null };
  return { linked: true, quoteId: link.quote_id, bookingId: link.booking_id };
}
