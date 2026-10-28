import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export type BonlineCallOutcome = 'unknown' | 'ringing' | 'answered' | 'missed';
export type BonlineFollowUpStatus = 'pending' | 'claimed' | 'resolved';

export interface BonlineFollowUp {
  status: BonlineFollowUpStatus;
  assignedTo: string | null;
  claimedAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BonlineManagedCall {
  id: string;
  callId: string;
  phone: string | null;
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  firstReceivedAt: string;
  lastReceivedAt: string;
  outcome: BonlineCallOutcome;
  followUp: BonlineFollowUp | null;
}

export interface BonlineCallsSummary {
  openFollowUps: number;
  overdueFollowUps: number;
}

interface CallCursor { at: string; id: string }
export interface BonlineCallsQuery {
  limit: number;
  outcome?: BonlineCallOutcome;
  followUp?: BonlineFollowUpStatus | 'open';
  before?: CallCursor;
}
export type BonlineFollowUpCommand = { action: 'claim' | 'release' | 'resolve'; resolution: string | null };

const outcomes: readonly string[] = ['unknown', 'ringing', 'answered', 'missed'];
const followUpStatuses: readonly string[] = ['pending', 'claimed', 'resolved', 'open'];
export const isBonlineCallId = (value: string): boolean => /^[a-f0-9]{64}$/.test(value);

function decodeCursor(value: string): CallCursor | null {
  if (value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value) return null;
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [at, id] = parsed;
    if (typeof at !== 'string' || typeof id !== 'string' || !isBonlineCallId(id)
      || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/.test(at)
      || at.startsWith('0000') || !Number.isFinite(Date.parse(at))
      || new Date(at).toISOString().slice(0, 19) !== at.slice(0, 19)) return null;
    return { at, id };
  } catch {
    return null;
  }
}

/** Bound and validate every filter before issuing a query. */
export function parseBonlineCallsQuery(params: URLSearchParams): BonlineCallsQuery | null {
  for (const key of params.keys()) {
    if (!['limit', 'outcome', 'followUp', 'before'].includes(key) || params.getAll(key).length !== 1) return null;
  }
  const limitText = params.get('limit');
  if (limitText !== null && !/^(?:[1-9]|[1-9][0-9]|100)$/.test(limitText)) return null;
  const outcome = params.get('outcome');
  const followUp = params.get('followUp');
  if ((outcome !== null && !outcomes.includes(outcome)) || (followUp !== null && !followUpStatuses.includes(followUp))) return null;
  const beforeText = params.get('before');
  const before = beforeText === null ? undefined : decodeCursor(beforeText);
  if (before === null) return null;
  return {
    limit: limitText === null ? 50 : Number(limitText),
    ...(outcome === null ? {} : { outcome: outcome as BonlineCallOutcome }),
    ...(followUp === null ? {} : { followUp: followUp as BonlineFollowUpStatus | 'open' }),
    ...(before === undefined ? {} : { before }),
  };
}

export function parseBonlineFollowUpCommand(value: unknown): BonlineFollowUpCommand | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== 'action' && key !== 'resolution')
    || (body.action !== 'claim' && body.action !== 'release' && body.action !== 'resolve')) return null;
  if ('resolution' in body && (body.action !== 'resolve' || typeof body.resolution !== 'string' || body.resolution.length > 500)) return null;
  return { action: body.action, resolution: typeof body.resolution === 'string' ? body.resolution.trim() || null : null };
}

type Timestamp = string | Date;
interface FollowUpRow {
  status: BonlineFollowUpStatus;
  assigned_to: string | null;
  claimed_at: Timestamp | null;
  resolved_at: Timestamp | null;
  resolved_by: string | null;
  resolution: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}
const iso = (value: Timestamp): string => new Date(value).toISOString();
const nullableIso = (value: Timestamp | null): string | null => value === null ? null : iso(value);
function followUpFromRow(row: FollowUpRow): BonlineFollowUp {
  return {
    status: row.status, assignedTo: row.assigned_to, claimedAt: nullableIso(row.claimed_at),
    resolvedAt: nullableIso(row.resolved_at), resolvedBy: row.resolved_by, resolution: row.resolution,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  };
}

interface CallRow {
  event_key: string; call_id: string; phone: string | null;
  started_at: Timestamp | null; answered_at: Timestamp | null; ended_at: Timestamp | null;
  first_received_at: Timestamp; last_received_at: Timestamp; outcome: BonlineCallOutcome;
  cursor_time: string; follow_up: FollowUpRow | null;
}

export async function readBonlineCalls(scope: string, query: BonlineCallsQuery): Promise<{ calls: BonlineManagedCall[]; nextCursor: string | null; summary: BonlineCallsSummary }> {
  const filters = [sql`c.scope = ${scope}`];
  if (query.outcome) filters.push(sql`c.outcome = ${query.outcome}`);
  if (query.followUp === 'open') filters.push(sql`f.status IN ('pending', 'claimed')`);
  else if (query.followUp) filters.push(sql`f.status = ${query.followUp}`);
  // Late answer evidence makes a task nonactionable even if an older writer
  // has not yet reconciled its follow-up status.
  if (query.followUp && query.followUp !== 'resolved') filters.push(sql`c.outcome = 'missed'`);
  if (query.before) filters.push(sql`(c.last_received_at, c.event_key) < (${query.before.at}::timestamptz, ${query.before.id})`);
  const result = await db.execute(sql`
    WITH page AS (
      SELECT c.event_key, c.call_id, c.phone, c.started_at, c.answered_at, c.ended_at,
        c.first_received_at, c.last_received_at, c.outcome,
        to_char(c.last_received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time,
        CASE WHEN f.event_key IS NULL THEN NULL ELSE row_to_json(f) END AS follow_up
      FROM bonline_calls c
      LEFT JOIN bonline_call_followups f ON f.scope = c.scope AND f.event_key = c.event_key
      WHERE ${sql.join(filters, sql` AND `)}
      ORDER BY c.last_received_at DESC, c.event_key DESC
      LIMIT ${query.limit + 1}
    ), summary AS (
      SELECT count(*)::integer AS open_follow_ups,
        (count(*) FILTER (WHERE f.created_at <= clock_timestamp() - interval '15 minutes'))::integer AS overdue_follow_ups
      FROM bonline_call_followups f
      JOIN bonline_calls c ON c.scope = f.scope AND c.event_key = f.event_key
      WHERE f.scope = ${scope} AND c.outcome = 'missed' AND f.status IN ('pending', 'claimed')
    )
    SELECT summary.open_follow_ups, summary.overdue_follow_ups,
      COALESCE(json_agg(page ORDER BY page.last_received_at DESC, page.event_key DESC)
        FILTER (WHERE page.event_key IS NOT NULL), '[]'::json) AS calls
    FROM summary LEFT JOIN page ON true
    GROUP BY summary.open_follow_ups, summary.overdue_follow_ups
  `);
  const resultRow = result.rows[0] as unknown as { calls: CallRow[]; open_follow_ups: number; overdue_follow_ups: number } | undefined;
  if (!resultRow) throw new Error('bOnline call history returned no result.');
  const rows = resultRow.calls;
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    summary: { openFollowUps: resultRow.open_follow_ups, overdueFollowUps: resultRow.overdue_follow_ups },
    calls: page.map((row) => ({
      id: row.event_key, callId: row.call_id, phone: row.phone,
      startedAt: nullableIso(row.started_at), answeredAt: nullableIso(row.answered_at), endedAt: nullableIso(row.ended_at),
      firstReceivedAt: iso(row.first_received_at), lastReceivedAt: iso(row.last_received_at), outcome: row.outcome,
      followUp: row.follow_up ? followUpFromRow(row.follow_up) : null,
    })),
    // Keep PostgreSQL microseconds, rather than losing them through JS Date.
    nextCursor: rows.length > query.limit && last
      ? Buffer.from(JSON.stringify([last.cursor_time, last.event_key])).toString('base64url') : null,
  };
}

export type BonlineFollowUpResult = { result: 'updated'; followUp: BonlineFollowUp }
  | { result: 'not_found' } | { result: 'conflict' };

/** Ownership and eligibility are checked in the UPDATE itself, so simultaneous
 * claims cannot both succeed. Provider delivery never owns these user fields. */
export async function updateBonlineFollowUp(
  scope: string, id: string, adminId: string, command: BonlineFollowUpCommand,
): Promise<BonlineFollowUpResult> {
  const result = await db.execute(sql`
    WITH updated AS (
      UPDATE bonline_call_followups f SET
        status = CASE WHEN ${command.action} = 'claim' THEN 'claimed'
          WHEN ${command.action} = 'release' THEN 'pending' ELSE 'resolved' END,
        assigned_to = CASE WHEN ${command.action} = 'release' THEN NULL ELSE ${adminId} END,
        claimed_at = CASE WHEN ${command.action} = 'release' THEN NULL ELSE COALESCE(f.claimed_at, clock_timestamp()) END,
        resolved_at = CASE WHEN ${command.action} = 'resolve' THEN clock_timestamp() ELSE NULL END,
        resolved_by = CASE WHEN ${command.action} = 'resolve' THEN ${adminId} ELSE NULL END,
        resolution = CASE WHEN ${command.action} = 'resolve' THEN ${command.resolution} ELSE NULL END,
        updated_at = clock_timestamp()
      FROM bonline_calls c
      WHERE f.scope = ${scope} AND f.event_key = ${id}
        AND c.scope = f.scope AND c.event_key = f.event_key AND c.outcome = 'missed'
        AND f.status <> 'resolved' AND (f.assigned_to IS NULL OR f.assigned_to = ${adminId})
      RETURNING f.*
    )
    SELECT 'updated' AS result, row_to_json(updated) AS follow_up FROM updated
    UNION ALL
    SELECT CASE WHEN EXISTS (SELECT 1 FROM bonline_calls WHERE scope = ${scope} AND event_key = ${id})
      THEN 'conflict' ELSE 'not_found' END AS result, NULL AS follow_up
    WHERE NOT EXISTS (SELECT 1 FROM updated)
  `);
  const row = result.rows[0] as unknown as { result: 'updated' | 'not_found' | 'conflict'; follow_up: FollowUpRow | null } | undefined;
  if (!row) throw new Error('bOnline follow-up update returned no result.');
  return row.result === 'updated' && row.follow_up
    ? { result: 'updated', followUp: followUpFromRow(row.follow_up) }
    : { result: row.result === 'not_found' ? 'not_found' : 'conflict' };
}
