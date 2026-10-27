import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { BONLINE_FRESH_CALL_MS, type BonlineCallEvent } from './events';

export interface IncomingCall {
  id: string;
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
    )
    INSERT INTO bonline_call_events
      (scope, event_key, sequence, call_id, phone, created_at, ended_at)
    SELECT ${scope}, ${event.key}, cursor, ${event.callId}, ${event.phone},
      ${event.createdAt}::timestamptz,
      CASE WHEN ${event.kind} = 'call_ended' THEN clock_timestamp() ELSE NULL END
    FROM counter
    ON CONFLICT (scope, event_key) DO UPDATE
      SET ended_at = CASE WHEN ${event.kind} = 'call_ended'
        THEN COALESCE(bonline_call_events.ended_at, clock_timestamp())
        ELSE bonline_call_events.ended_at END
    RETURNING event_key
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
      SELECT sequence, call_id, phone, created_at, received_at
      FROM bonline_call_events, snapshot
      WHERE scope = ${scope}
        AND sequence > ${after ?? '0'}::bigint AND sequence <= snapshot.cursor
        AND ended_at IS NULL AND phone IS NOT NULL
        AND created_at >= snapshot.server_time - (${BONLINE_FRESH_CALL_MS} * interval '1 millisecond')
        AND received_at >= snapshot.server_time - (${BONLINE_FRESH_CALL_MS} * interval '1 millisecond')
      ORDER BY sequence LIMIT 50
    )
    SELECT snapshot.cursor::text AS cursor, snapshot.server_time::text AS server_time,
      COALESCE(json_agg(json_build_object(
        'id', calls.sequence::text, 'callId', calls.call_id, 'phone', calls.phone,
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
