import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('../db/schema')>('../db/schema');
  return { ...schema, db: new Proxy({}, { get: (_, prop) => (state.db as Record<string | symbol, unknown>)[prop] }) };
});

import { countInboxUnread, listInbox } from '../chat/inbox';
import { canAccessConversation } from '../chat/permissions';
import { getPeerReadMarker, markConversationRead } from '../chat/queries';

const pg = new PGlite();
const id = (group: number, n: number) => `${group}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = id(1, 1);
const admin2 = id(1, 2);
const customer = id(1, 3);
const otherCustomer = id(1, 4);
const driverUser = id(1, 5);
const driver2User = id(1, 6);
const driver = id(2, 1);
const driver2 = id(2, 2);
const booking = id(3, 1);
const otherBooking = id(3, 2);
const conv = {
  customerAdmin: id(4, 1),
  customerDriver: id(4, 2),
  bookingStaff: id(4, 3),
  direct: id(4, 4),
  direct2: id(4, 5),
  otherCustomer: id(4, 6),
};

let seq = 0;
async function message(conversationId: string, senderId: string | null, senderRole: string, body: string, type = 'text') {
  seq += 1;
  const messageId = id(5, seq);
  await pg.query(`INSERT INTO booking_messages (id, conversation_id, sender_id, sender_role, body, message_type, delivery_status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, 'sent', TIMESTAMPTZ '2026-10-01 10:00:00+00' + make_interval(mins => $7))`,
  [messageId, conversationId, senderId, senderRole, body, type, seq]);
  return messageId;
}

beforeAll(async () => {
  state.db = drizzle(pg);
  await pg.exec(`
    CREATE TABLE users (id uuid PRIMARY KEY, role text NOT NULL, name text);
    CREATE TABLE drivers (id uuid PRIMARY KEY, user_id uuid REFERENCES users(id));
    CREATE TABLE bookings (id uuid PRIMARY KEY, ref_number text, customer_name text, customer_phone text, status text,
      user_id uuid REFERENCES users(id), driver_id uuid REFERENCES drivers(id));
    CREATE TABLE booking_conversations (id uuid PRIMARY KEY, booking_id uuid REFERENCES bookings(id), direct_driver_id uuid REFERENCES drivers(id),
      channel text NOT NULL, status text NOT NULL DEFAULT 'open', locked boolean DEFAULT false, muted boolean DEFAULT false,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE conversation_participants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES booking_conversations(id),
      user_id uuid NOT NULL REFERENCES users(id), role text NOT NULL, joined_at timestamptz DEFAULT now());
    CREATE TABLE booking_messages (id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES booking_conversations(id), sender_id uuid REFERENCES users(id),
      sender_role text NOT NULL, body text, message_type text NOT NULL, delivery_status text NOT NULL, created_at timestamptz DEFAULT now());
    CREATE TABLE message_read_state (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES booking_conversations(id),
      user_id uuid NOT NULL REFERENCES users(id), last_read_message_id uuid REFERENCES booking_messages(id), unread_count integer DEFAULT 0,
      updated_at timestamptz DEFAULT now());
    CREATE TABLE guest_chat_read_state (conversation_id uuid PRIMARY KEY REFERENCES booking_conversations(id),
      last_read_message_id uuid REFERENCES booking_messages(id), last_read_at timestamptz);
    INSERT INTO users VALUES ('${admin}', 'admin', 'Ava Admin'), ('${admin2}', 'admin', 'Ben Admin'), ('${customer}', 'customer', 'Cara'),
      ('${otherCustomer}', 'customer', 'Olly'), ('${driverUser}', 'driver', 'Dan Driver'), ('${driver2User}', 'driver', 'Eve Driver');
    INSERT INTO drivers VALUES ('${driver}', '${driverUser}'), ('${driver2}', '${driver2User}');
    INSERT INTO bookings VALUES ('${booking}', 'TYR-2026-10001', 'Cara Customer', '07700 900123', 'driver_assigned', '${customer}', '${driver}'),
      ('${otherBooking}', 'TYR-2026-10002', 'Olly Other', '07700 900999', 'paid', '${otherCustomer}', NULL);
    INSERT INTO booking_conversations (id, booking_id, direct_driver_id, channel, status, created_at) VALUES
      ('${conv.customerAdmin}', '${booking}', NULL, 'customer_admin', 'open', '2026-09-30 09:00+00'),
      ('${conv.customerDriver}', '${booking}', NULL, 'customer_driver', 'open', '2026-09-30 09:01+00'),
      ('${conv.bookingStaff}', '${booking}', NULL, 'admin_driver', 'open', '2026-09-30 09:02+00'),
      ('${conv.direct}', NULL, '${driver}', 'admin_driver', 'open', '2026-09-30 09:03+00'),
      ('${conv.direct2}', NULL, '${driver2}', 'admin_driver', 'closed', '2026-09-30 09:04+00'),
      ('${conv.otherCustomer}', '${otherBooking}', NULL, 'customer_admin', 'open', '2026-09-30 09:05+00');
  `);
}, 30_000);

beforeEach(async () => {
  seq = 0;
  await pg.exec(`TRUNCATE guest_chat_read_state, message_read_state, booking_messages, conversation_participants;
    UPDATE bookings SET driver_id = '${driver}' WHERE id = '${booking}';`);
});
afterAll(async () => { await pg.close(); });

const byId = (page: Awaited<ReturnType<typeof listInbox>>) => Object.fromEntries(page.conversations.map((item) => [item.id, item]));

describe('chat inbox on disposable PostgreSQL', () => {
  it('counts unread for an admin who never opened the thread, from the last staff reply onwards', async () => {
    await message(conv.direct, driverUser, 'driver', 'old question');
    await message(conv.direct, admin2, 'admin', 'answered by another admin');
    await message(conv.direct, driverUser, 'driver', 'new 1');
    await message(conv.direct, driverUser, 'driver', 'new 2');
    await message(conv.customerAdmin, null, 'customer', 'guest hello');

    const items = byId(await listInbox(admin, 'admin'));
    expect(items[conv.direct]).toMatchObject({ unreadCount: 2, lastMessageBody: 'new 2', driverName: 'Dan Driver', scope: 'direct_driver' });
    expect(items[conv.customerAdmin]).toMatchObject({ unreadCount: 1, customerPhone: '07700 900123', bookingStatus: 'driver_assigned' });
    expect(await countInboxUnread(admin, 'admin')).toBe(3);
  });

  it('moves the read marker only forward and only to messages the viewer can see', async () => {
    const first = await message(conv.direct, driverUser, 'driver', 'one');
    const second = await message(conv.direct, driverUser, 'driver', 'two');
    await message(conv.direct, driverUser, 'driver', 'three');
    const note = await message(conv.bookingStaff, admin, 'admin', 'internal', 'admin_note');

    expect(await markConversationRead(conv.direct, admin, 'admin', second)).toEqual({ lastReadMessageId: second });
    expect(byId(await listInbox(admin, 'admin'))[conv.direct].unreadCount).toBe(1);
    // An older marker never rewinds; an unknown ID changes nothing.
    expect(await markConversationRead(conv.direct, admin, 'admin', first)).toEqual({ lastReadMessageId: second });
    expect(await markConversationRead(conv.direct, admin, 'admin', id(9, 9))).toEqual({ lastReadMessageId: second });
    // A driver cannot set a marker on an internal note.
    expect(await markConversationRead(conv.bookingStaff, driverUser, 'driver', note)).toEqual({ lastReadMessageId: null });
    // Without an explicit marker, everything visible is read.
    await markConversationRead(conv.direct, admin, 'admin');
    expect(byId(await listInbox(admin, 'admin'))[conv.direct].unreadCount).toBe(0);
    const rows = await pg.query<{ unread_count: number }>(`SELECT unread_count FROM message_read_state WHERE user_id = $1`, [admin]);
    expect(rows.rows).toEqual([{ unread_count: 0 }]);
  });

  it('hides internal notes from drivers and customers', async () => {
    await message(conv.bookingStaff, driverUser, 'driver', 'driver update');
    await message(conv.bookingStaff, admin, 'admin', 'staff only', 'admin_note');
    const driverView = byId(await listInbox(driverUser, 'driver'))[conv.bookingStaff];
    expect(driverView).toMatchObject({ lastMessageBody: 'driver update', unreadCount: 0 });
    expect(driverView.customerPhone).toBeUndefined();
    expect(byId(await listInbox(admin, 'admin'))[conv.bookingStaff].lastMessageBody).toBe('staff only');
  });

  it('scopes customers to their own customer threads', async () => {
    await message(conv.customerAdmin, admin, 'admin', 'hi Cara');
    await message(conv.otherCustomer, admin, 'admin', 'hi Olly');
    const page = await listInbox(customer, 'customer');
    expect(page.conversations.map((item) => item.id).sort()).toEqual([conv.customerAdmin, conv.customerDriver].sort());
    expect(byId(page)[conv.customerAdmin].unreadCount).toBe(1);
    expect(await canAccessConversation({ id: customer, role: 'customer' }, conv.bookingStaff)).toBe(false);
    expect(await canAccessConversation({ id: customer, role: 'customer' }, conv.otherCustomer)).toBe(false);
  });

  it('removes a reassigned driver from the customer thread but keeps staff threads they joined', async () => {
    await pg.query(`INSERT INTO conversation_participants (conversation_id, user_id, role) VALUES ($1, $3, 'driver'), ($2, $3, 'driver')`,
      [conv.customerDriver, conv.bookingStaff, driverUser]);
    const assigned = (await listInbox(driverUser, 'driver')).conversations.map((item) => item.id).sort();
    expect(assigned).toEqual([conv.customerDriver, conv.bookingStaff, conv.direct].sort());

    await pg.query(`UPDATE bookings SET driver_id = $1 WHERE id = $2`, [driver2, booking]);
    const reassigned = (await listInbox(driverUser, 'driver')).conversations.map((item) => item.id).sort();
    expect(reassigned).toEqual([conv.bookingStaff, conv.direct].sort());
    expect(await canAccessConversation({ id: driverUser, role: 'driver' }, conv.customerDriver)).toBe(false);
    expect(await canAccessConversation({ id: driverUser, role: 'driver' }, conv.bookingStaff)).toBe(true);
    expect(await canAccessConversation({ id: driver2User, role: 'driver' }, conv.customerDriver)).toBe(true);
    // Another driver's direct chat stays private.
    expect(await canAccessConversation({ id: driverUser, role: 'driver' }, conv.direct2)).toBe(false);
  });

  it('orders by newest activity and pages without gaps or repeats', async () => {
    await message(conv.otherCustomer, null, 'customer', 'first');
    await message(conv.direct, driverUser, 'driver', 'second');
    await message(conv.customerAdmin, null, 'customer', 'third');
    const seen: string[] = [];
    let before: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = await listInbox(admin, 'admin', { limit: 2, before });
      seen.push(...result.conversations.map((item) => item.id));
      if (!result.nextCursor) break;
      before = result.nextCursor;
    }
    expect(seen.slice(0, 3)).toEqual([conv.customerAdmin, conv.direct, conv.otherCustomer]);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(6);
  });

  it('splits the inbox into customers, drivers and closed, and searches as staff', async () => {
    const ids = async (filters: Parameters<typeof listInbox>[2]) => (await listInbox(admin, 'admin', filters)).conversations.map((item) => item.id).sort();
    expect(await ids({ box: 'customers' })).toEqual([conv.customerAdmin, conv.customerDriver, conv.otherCustomer].sort());
    expect(await ids({ box: 'drivers' })).toEqual([conv.bookingStaff, conv.direct].sort());
    expect(await ids({ box: 'closed' })).toEqual([conv.direct2]);
    expect(await ids({ q: '10002' })).toEqual([conv.otherCustomer]);
    expect(await ids({ q: '900123' })).toEqual([conv.customerAdmin, conv.customerDriver, conv.bookingStaff].sort());
    expect(await ids({ q: 'eve' })).toEqual([conv.direct2]);
    expect(await ids({ q: '100%' })).toEqual([]);
    // Customers cannot use staff search to see other threads.
    expect((await listInbox(customer, 'customer', { q: 'Olly' })).conversations.map((item) => item.id))
      .not.toContain(conv.otherCustomer);
  });

  it('reports read only from the other side, never from a fellow admin', async () => {
    const first = await message(conv.direct, admin, 'admin', 'are you near?');
    const second = await message(conv.direct, admin, 'admin', 'call me');
    await pg.query(`INSERT INTO conversation_participants (conversation_id, user_id, role) VALUES ($1, $2, 'driver'), ($1, $3, 'admin')`,
      [conv.direct, driverUser, admin2]);
    expect(await getPeerReadMarker(conv.direct, 'admin')).toBeNull();
    await markConversationRead(conv.direct, driverUser, 'driver', first);
    await markConversationRead(conv.direct, admin2, 'admin', second);
    expect((await getPeerReadMarker(conv.direct, 'admin'))?.id).toBe(first);
    // The driver sees the staff side's marker.
    expect((await getPeerReadMarker(conv.direct, 'driver'))?.id).toBe(second);
  });

  it("counts the guest customer's marker for staff only", async () => {
    const reply = await message(conv.customerAdmin, admin, 'admin', 'on the way');
    await pg.query('INSERT INTO guest_chat_read_state VALUES ($1, $2, now())', [conv.customerAdmin, reply]);
    expect((await getPeerReadMarker(conv.customerAdmin, 'admin'))?.id).toBe(reply);
    expect(await getPeerReadMarker(conv.customerAdmin, 'customer')).toBeNull();
  });
});
