// Disposable PostgreSQL only: execute the release migrations and real API SQL.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';

const state = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema>, userId: null as string | null }));
vi.mock('@/lib/db', () => ({ db: new Proxy({}, { get: (_, key) => Reflect.get(state.db, key) }) }));
vi.mock('@/app/api/mobile/customer/_lib', () => ({ getCustomerMobileUser: async () => state.userId ? { id: state.userId } : null,
  unauthorizedResponse: () => new Response(null, { status: 401 }) }));
vi.mock('@/lib/customer-booking-access', () => ({ authorizeCustomerBooking: async () => true }));
import { POST, DELETE } from '@/app/api/mobile/customer/push-token/route';

const user = '10000000-0000-4000-8000-000000000001';
const bookingA = '20000000-0000-4000-8000-000000000001';
const bookingB = '20000000-0000-4000-8000-000000000002';
const conversation = '30000000-0000-4000-8000-000000000001';
const originalMessage = '40000000-0000-4000-8000-000000000001';
const request = (method: string, body: unknown) => new NextRequest('https://isolated.invalid/api/mobile/customer/push-token', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('customer release migrations on isolated PostgreSQL', () => {
  it('preserves staff messages, constrains guest senders, keeps several guest bookings and logs out one device', async () => {
    const pg = new PGlite();
    state.db = drizzle(pg, { schema });
    try {
      await pg.exec(`
        CREATE TABLE users (id uuid PRIMARY KEY);
        CREATE TABLE bookings (id uuid PRIMARY KEY, user_id uuid REFERENCES users(id), ref_number text UNIQUE NOT NULL);
        CREATE TABLE booking_conversations (id uuid PRIMARY KEY, booking_id uuid REFERENCES bookings(id));
        CREATE TABLE booking_messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES booking_conversations(id) ON DELETE CASCADE, sender_id uuid NOT NULL REFERENCES users(id), sender_role text NOT NULL, body text);
        CREATE TABLE tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id), customer_token text NOT NULL);
        CREATE TABLE customer_push_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id), booking_id uuid REFERENCES bookings(id), token text NOT NULL UNIQUE, platform text NOT NULL DEFAULT 'ios', last_ref_number varchar(20), is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
        INSERT INTO users VALUES ('${user}');
        INSERT INTO bookings VALUES ('${bookingA}', NULL, 'TR-A'), ('${bookingB}', NULL, 'TR-B');
        INSERT INTO booking_conversations VALUES ('${conversation}', '${bookingA}');
        INSERT INTO booking_messages VALUES ('${originalMessage}', '${conversation}', '${user}', 'admin', 'Existing staff message');
        INSERT INTO tracking_sessions (booking_id, customer_token) VALUES ('${bookingA}', 'original-private-customer-token');
        INSERT INTO customer_push_tokens (token, user_id, booking_id) VALUES ('ExponentPushToken[legacy]', '${user}', '${bookingA}');
      `);
      await pg.exec(readFileSync('drizzle/migrations/0035_customer_push_subscriptions.sql', 'utf8'));
      await pg.exec(readFileSync('drizzle/migrations/0036_customer_guest_chat.sql', 'utf8'));
      await pg.exec(readFileSync('drizzle/migrations/0036_customer_guest_chat.sql', 'utf8'));
      expect((await pg.query('SELECT body, sender_id FROM booking_messages')).rows).toEqual([{ body: 'Existing staff message', sender_id: user }]);
      expect((await pg.query('SELECT is_active, user_id, booking_id FROM customer_push_tokens')).rows).toEqual([{ is_active: false, user_id: null, booking_id: null }]);
      expect((await pg.query('SELECT share_version FROM tracking_sessions')).rows).toEqual([{ share_version: 0 }]);
      await pg.query("INSERT INTO booking_messages (conversation_id, sender_id, sender_role, body) VALUES ($1, NULL, 'customer', 'Guest message')", [conversation]);
      for (const role of ['admin', 'driver']) {
        await expect(pg.query('INSERT INTO booking_messages (conversation_id, sender_id, sender_role) VALUES ($1, NULL, $2)', [conversation, role])).rejects.toMatchObject({ code: '23514' });
      }
      await expect(pg.query('INSERT INTO guest_chat_read_state (conversation_id, last_read_message_id) VALUES ($1, $2)', [conversation, '99999999-0000-4000-8000-000000000001'])).rejects.toMatchObject({ code: '23503' });
      await pg.query('INSERT INTO guest_chat_read_state (conversation_id, last_read_message_id) VALUES ($1, $2)', [conversation, originalMessage]);

      const tokenA = 'ExponentPushToken[device_a]';
      state.userId = null;
      expect((await POST(request('POST', { token: tokenA, refNumber: 'TR-A' }))).status).toBe(200);
      expect((await POST(request('POST', { token: tokenA, refNumber: 'TR-B' }))).status).toBe(200);
      expect((await pg.query('SELECT booking_id FROM customer_push_subscriptions ORDER BY booking_id')).rows).toEqual([{ booking_id: bookingA }, { booking_id: bookingB }]);
      state.userId = user;
      expect((await POST(request('POST', { token: tokenA }))).status).toBe(200);
      const tokenB = 'ExponentPushToken[device_b]';
      expect((await POST(request('POST', { token: tokenB }))).status).toBe(200);
      expect((await DELETE(request('DELETE', { token: tokenA }))).status).toBe(200);
      expect((await pg.query('SELECT booking_id FROM customer_push_subscriptions')).rows).toHaveLength(0);
      expect((await pg.query('SELECT token, is_active FROM customer_push_tokens WHERE token IN ($1, $2) ORDER BY token', [tokenA, tokenB])).rows).toEqual([{ token: tokenA, is_active: false }, { token: tokenB, is_active: true }]);

      await pg.query('UPDATE tracking_sessions SET share_version = share_version + 1 WHERE booking_id = $1', [bookingA]);
      expect((await pg.query('SELECT share_version, customer_token FROM tracking_sessions')).rows).toEqual([{ share_version: 1, customer_token: 'original-private-customer-token' }]);
      await pg.query('DELETE FROM booking_conversations WHERE id = $1', [conversation]);
      expect((await pg.query('SELECT * FROM guest_chat_read_state')).rows).toHaveLength(0);
    } finally { state.userId = null; await pg.close(); }
  }, 30_000);
});
