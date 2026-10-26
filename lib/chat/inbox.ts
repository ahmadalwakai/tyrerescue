import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { ChatRole, ConversationSummary, InboxBox } from './types';

/**
 * Role-scoped conversation inbox in one statement (previously several queries
 * per conversation).
 *
 * Visibility mirrors canAccessConversation():
 * - admin: every conversation (optionally narrowed to one driver);
 * - customer: their own bookings' customer threads, never admin/driver threads;
 * - driver: customer/driver threads of bookings currently assigned to them,
 *   admin/driver booking threads they are assigned to or take part in, and
 *   their own direct chat.
 *
 * Unread policy: a viewer has read everything up to an anchor, the newest of
 * their read marker and their own latest message. For admins the latest staff
 * message also counts (shared inbox: a staff reply means the thread was seen).
 * Unread messages are those after the anchor from other senders that the viewer
 * can see; customers never count customer messages, admins never count staff
 * messages.
 */

export interface InboxFilters {
  bookingRef?: string;
  status?: string;
  channel?: string;
  driverId?: string;
  box?: InboxBox;
  /** Admin-only free-text search: booking ref, customer name or phone, driver name. */
  q?: string;
  /** Opaque cursor from a previous page's nextCursor. */
  before?: string;
  limit?: number;
}

export interface InboxPage {
  conversations: ConversationSummary[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Timestamps leave SQL as ISO text: the neon-http driver returns raw strings for timestamptz. */
function iso(column: SQL): SQL {
  return sql`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function encodeInboxCursor(lastActivityAt: string, id: string): string {
  return `${lastActivityAt}|${id}`;
}

export function decodeInboxCursor(cursor: string | undefined): { at: string; id: string } | null {
  if (!cursor) return null;
  const [at, id, extra] = cursor.split('|');
  if (extra !== undefined || !id || !UUID.test(id) || !at || Number.isNaN(Date.parse(at))) return null;
  return { at, id };
}

function visibility(userId: string, role: ChatRole, driverId?: string): SQL {
  if (role === 'admin') {
    if (!driverId) return sql`TRUE`;
    // A direct chat belongs to its own driver only; a stray participant row
    // never attaches it to another driver.
    return sql`(CASE WHEN c.booking_id IS NULL THEN c.direct_driver_id = ${driverId}::uuid
      ELSE (b.driver_id = ${driverId}::uuid OR EXISTS (
        SELECT 1 FROM conversation_participants p JOIN drivers pdx ON pdx.user_id = p.user_id
        WHERE p.conversation_id = c.id AND p.role = 'driver' AND pdx.id = ${driverId}::uuid)) END)`;
  }
  if (role === 'customer') {
    return sql`(c.booking_id IS NOT NULL AND b.user_id = ${userId}::uuid AND c.channel <> 'admin_driver')`;
  }
  return sql`(c.channel IN ('customer_driver', 'admin_driver') AND (
    (c.booking_id IS NOT NULL AND b.driver_id = (SELECT me.id FROM drivers me WHERE me.user_id = ${userId}::uuid LIMIT 1))
    OR (c.booking_id IS NOT NULL AND c.channel = 'admin_driver' AND EXISTS (
      SELECT 1 FROM conversation_participants p WHERE p.conversation_id = c.id AND p.user_id = ${userId}::uuid))
    OR (c.booking_id IS NULL AND ddu.id = ${userId}::uuid)))`;
}

function filterConditions(role: ChatRole, filters: InboxFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(sql`c.status = ${filters.status}`);
  if (filters.channel) conditions.push(sql`c.channel = ${filters.channel}`);
  if (filters.bookingRef) conditions.push(sql`b.ref_number = ${filters.bookingRef}`);
  if (filters.box === 'customers') conditions.push(sql`c.channel IN ('customer_admin', 'customer_driver') AND c.status = 'open'`);
  if (filters.box === 'drivers') conditions.push(sql`c.channel = 'admin_driver' AND c.status = 'open'`);
  if (filters.box === 'closed') conditions.push(sql`c.status IN ('closed', 'archived')`);
  const q = filters.q?.trim();
  if (q && role === 'admin') {
    const pattern = `%${escapeLike(q)}%`;
    const digits = q.replace(/\D/g, '');
    const phone = digits.length >= 4
      ? sql` OR regexp_replace(COALESCE(b.customer_phone, ''), '\\D', '', 'g') LIKE ${`%${digits}%`}`
      : sql``;
    conditions.push(sql`(b.ref_number ILIKE ${pattern} OR b.customer_name ILIKE ${pattern}
      OR COALESCE(ddu.name, pd.name, bdu.name, '') ILIKE ${pattern}${phone})`);
  }
  return conditions;
}

function inboxFrom(userId: string, role: ChatRole, filters: InboxFilters): SQL {
  const isAdmin = role === 'admin';
  const where = [
    // A direct chat is only ever a staff/driver thread with a real driver account.
    sql`(c.booking_id IS NOT NULL OR (c.channel = 'admin_driver' AND ddu.role = 'driver'))`,
    visibility(userId, role, filters.driverId),
    ...filterConditions(role, filters),
  ];
  return sql`
    FROM booking_conversations c
    LEFT JOIN bookings b ON b.id = c.booking_id
    LEFT JOIN drivers dd ON dd.id = c.direct_driver_id
    LEFT JOIN users ddu ON ddu.id = dd.user_id
    LEFT JOIN drivers bd ON bd.id = b.driver_id
    LEFT JOIN users bdu ON bdu.id = bd.user_id
    LEFT JOIN LATERAL (
      SELECT pdd.id, pu.name FROM conversation_participants p
      JOIN users pu ON pu.id = p.user_id JOIN drivers pdd ON pdd.user_id = pu.id
      WHERE p.conversation_id = c.id AND p.role = 'driver'
      ORDER BY p.joined_at NULLS LAST, p.id LIMIT 1
    ) pd ON c.booking_id IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT m.body, m.message_type, m.sender_role, m.created_at FROM booking_messages m
      WHERE m.conversation_id = c.id AND (${isAdmin}::boolean OR m.message_type <> 'admin_note')
      ORDER BY m.created_at DESC, m.id DESC LIMIT 1
    ) lm ON TRUE
    LEFT JOIN LATERAL (
      SELECT a.created_at, a.id FROM booking_messages a
      WHERE a.conversation_id = c.id AND (
        a.id = (SELECT r.last_read_message_id FROM message_read_state r
          WHERE r.conversation_id = c.id AND r.user_id = ${userId}::uuid
          ORDER BY r.updated_at DESC NULLS LAST LIMIT 1)
        OR a.sender_id = ${userId}::uuid
        OR (${isAdmin}::boolean AND a.sender_role = 'admin'))
      ORDER BY a.created_at DESC, a.id DESC LIMIT 1
    ) an ON TRUE
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS n FROM booking_messages u
      WHERE u.conversation_id = c.id
        AND u.sender_id IS DISTINCT FROM ${userId}::uuid
        AND (${isAdmin}::boolean OR u.message_type <> 'admin_note')
        AND (${role} <> 'customer' OR u.sender_role <> 'customer')
        AND (NOT ${isAdmin}::boolean OR u.sender_role <> 'admin')
        AND (an.id IS NULL OR (u.created_at, u.id) > (an.created_at, an.id))
    ) un ON TRUE
    WHERE ${sql.join(where, sql` AND `)}`;
}

interface InboxRow {
  id: string;
  booking_id: string | null;
  channel: ConversationSummary['channel'];
  status: ConversationSummary['status'];
  locked: boolean | null;
  muted: boolean | null;
  ref_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  booking_status: string | null;
  driver_id: string | null;
  driver_name: string | null;
  last_body: string | null;
  last_type: string | null;
  last_sender_role: string | null;
  last_at: string | null;
  activity_at: string;
  created_at: string | null;
  unread: number | string | null;
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] } | null)?.rows ?? []);
}

function toSummary(row: InboxRow, role: ChatRole): ConversationSummary {
  const summary: ConversationSummary = {
    id: row.id,
    bookingId: row.booking_id,
    scope: row.booking_id ? 'booking' : 'direct_driver',
    bookingRef: row.booking_id ? row.ref_number ?? '' : 'Direct chat',
    channel: row.channel,
    status: row.status,
    locked: row.locked ?? false,
    muted: row.muted ?? false,
    customerName: row.customer_name ?? '',
    driverId: row.driver_id,
    driverName: row.driver_name,
    lastMessageBody: row.last_body ?? (row.last_type === 'audio' ? 'Voice message' : row.last_type === 'image' ? 'Photo' : null),
    lastMessageAt: row.last_at,
    lastMessageSenderRole: (row.last_sender_role as ChatRole | null) ?? null,
    unreadCount: Number(row.unread ?? 0),
    createdAt: row.created_at ?? '',
    lastActivityAt: row.activity_at,
  };
  if (role === 'admin') {
    summary.customerPhone = row.customer_phone;
    summary.bookingStatus = row.booking_status;
  }
  return summary;
}

export async function listInbox(userId: string, role: ChatRole, filters: InboxFilters = {}): Promise<InboxPage> {
  const limit = Math.min(Math.max(Math.trunc(filters.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const cursor = decodeInboxCursor(filters.before);
  const activity = sql`COALESCE(lm.created_at, c.created_at)`;
  const page = cursor ? sql` AND (${activity}, c.id) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : sql``;
  const result = await db.execute(sql`
    SELECT c.id, c.booking_id, c.channel, c.status, c.locked, c.muted,
      b.ref_number, b.customer_name, b.customer_phone, b.status AS booking_status,
      CASE WHEN c.booking_id IS NULL THEN dd.id ELSE COALESCE(pd.id, b.driver_id) END AS driver_id,
      CASE WHEN c.booking_id IS NULL THEN ddu.name ELSE COALESCE(pd.name, bdu.name) END AS driver_name,
      lm.body AS last_body, lm.message_type AS last_type, lm.sender_role AS last_sender_role,
      ${iso(sql`lm.created_at`)} AS last_at, ${iso(activity)} AS activity_at, ${iso(sql`c.created_at`)} AS created_at,
      un.n AS unread
    ${inboxFrom(userId, role, filters)}${page}
    ORDER BY ${activity} DESC, c.id DESC
    LIMIT ${limit + 1}`);
  const rows = rowsOf<InboxRow>(result);
  const pageRows = rows.slice(0, limit);
  const last = pageRows[pageRows.length - 1];
  return {
    conversations: pageRows.map((row) => toSummary(row, role)),
    nextCursor: rows.length > limit && last ? encodeInboxCursor(last.activity_at, last.id) : null,
  };
}

/** Total unread across every conversation the viewer can see (same policy as the inbox). */
export async function countInboxUnread(userId: string, role: ChatRole): Promise<number> {
  const result = await db.execute(sql`SELECT COALESCE(sum(un.n), 0)::int AS total ${inboxFrom(userId, role, {})}`);
  return Number(rowsOf<{ total: number | string | null }>(result)[0]?.total ?? 0);
}
