import { Pool, neonConfig, type PoolClient } from '@neondatabase/serverless';
import type { ChatChannel, ChatRole } from './types';

export interface BookingConversationClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** The caller holds a transaction; the lock serializes booking/channel retries. */
export async function openBookingConversation(client: BookingConversationClient, input: {
  bookingId: string; channel: ChatChannel; initiatorUserId: string | null; initiatorRole: ChatRole; targetDriverUserId?: string | null;
}) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`booking-chat:${input.bookingId}:${input.channel}`]);
  const found = input.targetDriverUserId && input.channel === 'admin_driver'
    ? await client.query(`SELECT c.id FROM booking_conversations c JOIN conversation_participants p ON p.conversation_id = c.id
      WHERE c.booking_id = $1 AND c.channel = $2 AND p.user_id = $3 ORDER BY c.created_at, c.id LIMIT 1`, [input.bookingId, input.channel, input.targetDriverUserId])
    : await client.query('SELECT id FROM booking_conversations WHERE booking_id = $1 AND channel = $2 ORDER BY created_at, id LIMIT 1', [input.bookingId, input.channel]);
  const created = found.rows[0] ? found : await client.query('INSERT INTO booking_conversations (booking_id, channel) VALUES ($1, $2) RETURNING id', [input.bookingId, input.channel]);
  const conversationId = created.rows[0]?.id;
  if (typeof conversationId !== 'string') throw new Error('Could not open booking conversation');
  const participants: [string, ChatRole][] = [];
  if (input.initiatorUserId) participants.push([input.initiatorUserId, input.initiatorRole]);
  if (input.targetDriverUserId && input.targetDriverUserId !== input.initiatorUserId) participants.push([input.targetDriverUserId, 'driver']);
  for (const [userId, role] of participants) {
    await client.query(`INSERT INTO conversation_participants (conversation_id, user_id, role)
      SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2)`, [conversationId, userId, role]);
    await client.query(`INSERT INTO message_read_state (conversation_id, user_id, unread_count)
      SELECT $1, $2, 0 WHERE NOT EXISTS (SELECT 1 FROM message_read_state WHERE conversation_id = $1 AND user_id = $2)`, [conversationId, userId]);
  }
  return conversationId;
}

export async function withBookingChatTransaction<T>(work: (client: BookingConversationClient) => Promise<T>): Promise<T> {
  if (!globalThis.WebSocket && !neonConfig.webSocketConstructor) {
    const { default: WebSocket } = await import('ws');
    neonConfig.webSocketConstructor = WebSocket;
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8_000 });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '10s'");
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client?.release();
    await pool.end().catch(() => undefined);
  }
}

export function getOrCreateBookingConversation(input: Parameters<typeof openBookingConversation>[1]) {
  return withBookingChatTransaction((client) => openBookingConversation(client, input));
}
