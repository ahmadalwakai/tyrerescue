import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ pg: null as unknown as PGlite, failAfterAttachment: false }));
vi.mock('@neondatabase/serverless', () => ({ neonConfig: { webSocketConstructor: class {} }, Pool: class {
  async connect() { return { query: async (sql: string, values?: unknown[]) => {
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (state.failAfterAttachment && sql.startsWith('UPDATE booking_conversations')) throw new Error('Injected post-attachment failure');
    return state.pg.query(sql, values);
  }, release() {} }; }
  async end() {}
} }));
import { sendBookingChatMessage } from '../chat/booking-message';

const pg = new PGlite();
const admin = '10000000-0000-4000-8000-000000000001';
const otherAdmin = '10000000-0000-4000-8000-000000000002';
const customer = '10000000-0000-4000-8000-000000000003';
const driver = '10000000-0000-4000-8000-000000000004';
const conversationId = '20000000-0000-4000-8000-000000000001';
const messageId = '30000000-0000-4000-8000-000000000001';
beforeAll(async () => {
  state.pg = pg;
  await pg.exec(`
    CREATE TABLE users (id uuid PRIMARY KEY, role text NOT NULL, name text NOT NULL);
    CREATE TABLE booking_conversations (id uuid PRIMARY KEY, updated_at timestamptz DEFAULT now());
    CREATE TABLE conversation_participants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES booking_conversations(id), user_id uuid NOT NULL REFERENCES users(id), role text NOT NULL);
    CREATE TABLE booking_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES booking_conversations(id), sender_id uuid REFERENCES users(id), sender_role text NOT NULL, body text, message_type text NOT NULL, delivery_status text NOT NULL, created_at timestamptz DEFAULT now(), CHECK (sender_id IS NOT NULL OR sender_role = 'customer'));
    CREATE TABLE message_attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES booking_messages(id), url text NOT NULL, mime_type text NOT NULL, file_size integer NOT NULL, file_name text);
    CREATE TABLE message_read_state (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES booking_conversations(id), user_id uuid NOT NULL REFERENCES users(id), unread_count integer DEFAULT 0, updated_at timestamptz DEFAULT now());
    INSERT INTO users VALUES ('${admin}', 'admin', 'Admin'), ('${otherAdmin}', 'admin', 'Other admin'), ('${customer}', 'customer', 'Customer'), ('${driver}', 'driver', 'Driver');
    INSERT INTO booking_conversations VALUES ('${conversationId}', now());
    INSERT INTO conversation_participants (conversation_id, user_id, role) VALUES ('${conversationId}', '${admin}', 'admin'), ('${conversationId}', '${otherAdmin}', 'admin'), ('${conversationId}', '${customer}', 'customer'), ('${conversationId}', '${driver}', 'driver');
  `);
}, 30_000);
beforeEach(async () => { state.failAfterAttachment = false; await pg.exec('TRUNCATE message_read_state, message_attachments, booking_messages'); });
afterAll(async () => { await pg.close(); });

describe('atomic chat message writes on disposable PostgreSQL', () => {
  it('rolls back message and attachment when a later write fails, then retries the same ID once', async () => {
    const input = { conversationId, messageId, senderId: admin, senderRole: 'admin' as const, body: 'Photo', messageType: 'image' as const,
      attachment: { url: 'https://isolated.invalid/photo.jpg', mimeType: 'image/jpeg', fileSize: 1234 } };
    state.failAfterAttachment = true;
    await expect(sendBookingChatMessage(input)).rejects.toThrow('Injected post-attachment failure');
    expect((await pg.query('SELECT * FROM booking_messages')).rows).toHaveLength(0);
    expect((await pg.query('SELECT * FROM message_attachments')).rows).toHaveLength(0);
    expect((await pg.query('SELECT * FROM message_read_state')).rows).toHaveLength(0);
    state.failAfterAttachment = false;
    const result = await sendBookingChatMessage(input);
    expect(result).toMatchObject({ id: messageId, senderName: 'Admin', body: 'Photo' });
    expect(result.attachments).toHaveLength(1);
    await expect(sendBookingChatMessage(input)).rejects.toMatchObject({ code: '23505' });
    expect((await pg.query('SELECT * FROM booking_messages')).rows).toHaveLength(1);
    expect((await pg.query('SELECT * FROM message_attachments')).rows).toHaveLength(1);
    expect((await pg.query('SELECT unread_count FROM message_read_state')).rows).toEqual([{ unread_count: 1 }, { unread_count: 1 }, { unread_count: 1 }]);
  });
  it('increments internal-note unread counts only for other administrators', async () => {
    await sendBookingChatMessage({ conversationId, senderId: admin, senderRole: 'admin', body: 'Internal', messageType: 'admin_note' });
    expect((await pg.query('SELECT user_id, unread_count FROM message_read_state')).rows).toEqual([{ user_id: otherAdmin, unread_count: 1 }]);
  });
  it('supports a null guest sender without fake users and counts duplicate participant rows once', async () => {
    await pg.query('INSERT INTO conversation_participants (conversation_id, user_id, role) VALUES ($1, $2, $3)', [conversationId, admin, 'admin']);
    const result = await sendBookingChatMessage({ conversationId, senderId: null, senderRole: 'customer', body: 'Help please', messageType: 'text' });
    expect(result.senderId).toBe(null);
    expect(result.senderName).toBe('Guest customer');
    expect((await pg.query('SELECT user_id, unread_count FROM message_read_state WHERE user_id = $1', [admin])).rows).toEqual([{ user_id: admin, unread_count: 1 }]);
  });
});
