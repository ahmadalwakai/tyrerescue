import { Pool, type PoolClient } from '@neondatabase/serverless';

export class DirectDriverChatError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

export interface DirectDriverChat {
  conversationId: string;
  scope: 'direct_driver';
  driverId: string;
  driverName: string;
  reused: boolean;
}

// Also used by isolated PostgreSQL tests; no production connection is created
// until the authenticated route actually opens a chat.
export interface DirectChatClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export function isDirectChatSchemaUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; cause?: unknown; message?: string };
  if (candidate.code === '42703' || candidate.code === '42P01' || candidate.code === '42P10') return true;
  return candidate.cause ? isDirectChatSchemaUnavailable(candidate.cause) : false;
}

/** Called inside a transaction: serialize retries on the actual selected driver. */
export async function openDirectDriverChat(
  client: DirectChatClient,
  adminUserId: string,
  driverId: string,
): Promise<DirectDriverChat> {
  // Do not trust a stale client role or permit a forged participant list.
  const actor = await client.query("SELECT id FROM users WHERE id = $1 AND role = 'admin'", [adminUserId]);
  if (!actor.rows[0]) throw new DirectDriverChatError('Admin access required', 403);
  const target = await client.query(
    "SELECT d.id, d.user_id, u.name FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.id = $1 AND u.role = 'driver' FOR UPDATE OF d",
    [driverId],
  );
  const driver = target.rows[0];
  if (!driver) throw new DirectDriverChatError('Driver account not found', 404);

  // The partial unique index is the final guard across concurrent requests.
  const inserted = await client.query(
    `INSERT INTO booking_conversations (booking_id, direct_driver_id, channel)
     VALUES (NULL, $1, 'admin_driver')
     ON CONFLICT (direct_driver_id) WHERE direct_driver_id IS NOT NULL DO NOTHING RETURNING id, status`,
    [driverId],
  );
  const found = inserted.rows[0] ? inserted : await client.query(
    'SELECT id, status FROM booking_conversations WHERE direct_driver_id = $1 FOR UPDATE', [driverId],
  );
  const conversationId = found.rows[0]?.id;
  if (typeof conversationId !== 'string') throw new Error('Could not open driver conversation');

  // Selecting a driver is an explicit admin request to start talking again.
  // Reuse the same history and audit reopening; never unlock or unmute silently.
  const previousStatus = found.rows[0]?.status;
  if (previousStatus === 'closed' || previousStatus === 'archived') {
    await client.query("UPDATE booking_conversations SET status = 'open', updated_at = NOW() WHERE id = $1", [conversationId]);
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, actor_role, entity_type, entity_id, action, before_json, after_json)
       VALUES ($1, 'admin', 'chat', $2, 'chat.direct_driver.reopened', $3::jsonb, $4::jsonb)`,
      [adminUserId, conversationId, JSON.stringify({ status: previousStatus }), JSON.stringify({ status: 'open', driverId })],
    );
  }

  for (const [userId, role] of [[adminUserId, 'admin'], [driver.user_id, 'driver']]) {
    await client.query(
      `INSERT INTO conversation_participants (conversation_id, user_id, role)
       SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2)`,
      [conversationId, userId, role],
    );
    await client.query(
      `INSERT INTO message_read_state (conversation_id, user_id, unread_count)
       SELECT $1, $2, 0 WHERE NOT EXISTS (SELECT 1 FROM message_read_state WHERE conversation_id = $1 AND user_id = $2)`,
      [conversationId, userId],
    );
  }
  return { conversationId, scope: 'direct_driver', driverId, driverName: typeof driver.name === 'string' ? driver.name : 'Driver', reused: inserted.rows.length === 0 };
}

export async function getOrCreateDirectDriverConversation(adminUserId: string, driverId: string): Promise<DirectDriverChat> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8_000 });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '10s'");
    const result = await openDirectDriverChat(client, adminUserId, driverId);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    if (isDirectChatSchemaUnavailable(error)) {
      throw new DirectDriverChatError('Direct driver chat is not available until the server database is updated.', 503, 'DIRECT_DRIVER_CHAT_UNAVAILABLE');
    }
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}
