import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { BUSINESS_PHONE_E164 } from '@/lib/config/business-contact';
import { BONLINE_FRESH_CALL_MS, type BonlineCallEvent } from './events';

export interface IncomingCall {
  id: string;
  ledgerId?: string;
  callId: string;
  phone: string;
  createdAt: string;
  receivedAt: string;
}

export interface IncomingCallFeed {
  cursor: string;
  serverTime: string;
  events: IncomingCall[];
}

export function isBonlineCursor(value: string): boolean {
  return /^(0|[1-9]\d{0,18})$/.test(value) && BigInt(value) <= BigInt('9223372036854775807');
}

/** One statement/transaction serializes writes through the counter row. Readers
 * therefore cannot advance past a sequence whose event has not committed yet. */
export async function storeBonlineEvent(scope: string, event: BonlineCallEvent): Promise<void> {
  const result = await db.execute(sql`
    WITH expired AS (
      DELETE FROM bonline_call_events WHERE (scope, event_key) IN (
        SELECT scope, event_key FROM bonline_call_events
        WHERE received_at < clock_timestamp() - interval '24 hours'
        ORDER BY received_at LIMIT 500
      )
    ), counter AS (
      UPDATE bonline_event_state SET cursor = cursor + 1 WHERE id = 1 RETURNING cursor
    ), feed AS (
    INSERT INTO bonline_call_events
      (scope, event_key, sequence, call_id, phone, created_at, ended_at, incoming_verified, verified_answered_at, provider_ended_at)
    SELECT ${scope}, ${event.key}, cursor, ${event.callId}, ${event.phone},
      ${event.createdAt}::timestamptz,
      CASE WHEN ${event.kind} = 'call_ended' THEN clock_timestamp() ELSE NULL END,
      ${event.verifiedInbound === true}, ${event.answeredAt ?? null}::timestamptz, ${event.endedAt ?? null}::timestamptz
    FROM counter
    ON CONFLICT (scope, event_key) DO UPDATE
      SET ended_at = CASE WHEN ${event.kind} = 'call_ended'
        THEN COALESCE(bonline_call_events.ended_at, clock_timestamp())
        ELSE bonline_call_events.ended_at END,
        incoming_verified = bonline_call_events.incoming_verified OR EXCLUDED.incoming_verified,
        verified_answered_at = LEAST(bonline_call_events.verified_answered_at, EXCLUDED.verified_answered_at),
        provider_ended_at = LEAST(bonline_call_events.provider_ended_at, EXCLUDED.provider_ended_at)
    RETURNING event_key, ended_at, incoming_verified, verified_answered_at, provider_ended_at
    ), ledger AS (
      INSERT INTO bonline_calls (
        scope, event_key, call_id, phone, started_at, answered_at, ended_at, outcome, explicit_unanswered, follow_up_required
      )
      SELECT ${scope}, ${event.key}, ${event.callId},
        CASE WHEN ${event.phone} = ${BUSINESS_PHONE_E164} THEN NULL ELSE ${event.phone} END,
        ${event.createdAt}::timestamptz, feed.verified_answered_at,
        COALESCE(feed.provider_ended_at, feed.ended_at),
        CASE WHEN feed.verified_answered_at IS NOT NULL THEN 'answered'
          WHEN ${event.kind} = 'call_ended' AND ${event.unansweredAtEnd === true} THEN 'missed'
          WHEN ${event.kind} = 'call_ended' OR feed.ended_at IS NOT NULL THEN 'unknown'
          WHEN ${event.createdAt}::timestamptz IS NOT NULL THEN 'ringing' ELSE 'unknown' END,
        ${event.unansweredAtEnd === true},
        feed.verified_answered_at IS NULL AND ${event.kind} = 'call_ended' AND ${event.unansweredAtEnd === true}
          AND ${event.phone}::text IS NOT NULL AND ${event.phone} <> ${BUSINESS_PHONE_E164}
      FROM feed
      WHERE feed.incoming_verified OR EXISTS (
        SELECT 1 FROM bonline_calls WHERE scope = ${scope} AND event_key = ${event.key}
      )
      ON CONFLICT (scope, event_key) DO UPDATE SET
        phone = CASE WHEN bonline_calls.phone = ${BUSINESS_PHONE_E164}
          THEN EXCLUDED.phone ELSE COALESCE(bonline_calls.phone, EXCLUDED.phone) END,
        started_at = LEAST(bonline_calls.started_at, EXCLUDED.started_at),
        answered_at = LEAST(bonline_calls.answered_at, EXCLUDED.answered_at),
        ended_at = LEAST(bonline_calls.ended_at, EXCLUDED.ended_at),
        explicit_unanswered = bonline_calls.explicit_unanswered OR EXCLUDED.explicit_unanswered,
        follow_up_required = bonline_calls.follow_up_required OR (
          COALESCE(bonline_calls.answered_at, EXCLUDED.answered_at) IS NULL
          AND COALESCE(bonline_calls.ended_at, EXCLUDED.ended_at) IS NOT NULL
          AND (bonline_calls.explicit_unanswered OR EXCLUDED.explicit_unanswered)
          AND COALESCE(NULLIF(bonline_calls.phone, ${BUSINESS_PHONE_E164}), EXCLUDED.phone) IS NOT NULL
        ),
        last_received_at = clock_timestamp(),
        outcome = CASE
          WHEN COALESCE(bonline_calls.answered_at, EXCLUDED.answered_at) IS NOT NULL THEN 'answered'
          WHEN COALESCE(bonline_calls.ended_at, EXCLUDED.ended_at) IS NOT NULL
            AND (bonline_calls.explicit_unanswered OR EXCLUDED.explicit_unanswered) THEN 'missed'
          WHEN COALESCE(bonline_calls.ended_at, EXCLUDED.ended_at) IS NOT NULL THEN 'unknown'
          WHEN COALESCE(bonline_calls.started_at, EXCLUDED.started_at) IS NOT NULL THEN 'ringing'
          ELSE 'unknown' END
      RETURNING scope, event_key, phone, outcome, follow_up_required
    ), followups AS (
      INSERT INTO bonline_call_followups (scope, event_key, status, resolved_at, resolution)
      SELECT scope, event_key,
        CASE WHEN outcome = 'answered' THEN 'resolved' ELSE 'pending' END,
        CASE WHEN outcome = 'answered' THEN clock_timestamp() END,
        CASE WHEN outcome = 'answered' THEN 'Answered call confirmed' END
      FROM ledger WHERE follow_up_required AND phone IS NOT NULL AND phone <> ${BUSINESS_PHONE_E164}
      ON CONFLICT (scope, event_key) DO UPDATE SET
        status = 'resolved', resolved_at = EXCLUDED.resolved_at, resolved_by = NULL,
        resolution = EXCLUDED.resolution, updated_at = clock_timestamp()
      WHERE EXCLUDED.status = 'resolved' AND bonline_call_followups.status <> 'resolved'
    )
    SELECT event_key FROM feed
  `);
  if (result.rows.length !== 1) throw new Error('bOnline storage is not initialized.');
}

/** A fresh listening session includes currently active calls. This lets an
 * operator open Assisted Chat after the native call UI has started ringing.
 * Ended calls and calls outside the live window are never replayed. */
export async function readBonlineFeed(scope: string, after: string | null): Promise<IncomingCallFeed> {
  const result = await db.execute(sql`
    WITH snapshot AS (
      SELECT cursor, clock_timestamp() AS server_time FROM bonline_event_state WHERE id = 1
    ), calls AS (
      SELECT sequence, event_key, call_id, phone, created_at, received_at
      FROM bonline_call_events, snapshot
      WHERE scope = ${scope}
        AND sequence > ${after ?? '0'}::bigint AND sequence <= snapshot.cursor
        AND ended_at IS NULL AND phone IS NOT NULL
        AND phone <> ${BUSINESS_PHONE_E164}
        AND created_at >= snapshot.server_time - (${BONLINE_FRESH_CALL_MS} * interval '1 millisecond')
        AND received_at >= snapshot.server_time - (${BONLINE_FRESH_CALL_MS} * interval '1 millisecond')
      ORDER BY sequence LIMIT 50
    )
    SELECT snapshot.cursor::text AS cursor, snapshot.server_time::text AS server_time,
      COALESCE(json_agg(json_build_object(
        'id', calls.sequence::text, 'ledgerId', calls.event_key, 'callId', calls.call_id, 'phone', calls.phone,
        'createdAt', calls.created_at, 'receivedAt', calls.received_at
      ) ORDER BY calls.sequence) FILTER (WHERE calls.sequence IS NOT NULL), '[]'::json) AS events
    FROM snapshot LEFT JOIN calls ON true
    GROUP BY snapshot.cursor, snapshot.server_time
  `);
  const row = result.rows[0] as { cursor: string; server_time: string; events: IncomingCall[] } | undefined;
  if (!row) throw new Error('bOnline storage is not initialized.');
  const events = row.events.map((event) => ({
    ...event,
    createdAt: new Date(event.createdAt).toISOString(),
    receivedAt: new Date(event.receivedAt).toISOString(),
  }));
  return {
    cursor: events.length === 50 ? events[events.length - 1].id : row.cursor,
    serverTime: new Date(row.server_time).toISOString(),
    events,
  };
}
