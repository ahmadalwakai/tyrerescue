// Disposable PostgreSQL only. No real credentials, payments, bookings or network.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import * as schema from '../db/schema';

const state = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema>, pg: null as unknown as PGlite }));
vi.mock('@/lib/db', async () => ({ ...await import('../db/schema'), db: new Proxy({}, { get: (_, key) => Reflect.get(state.db, key) }) }));
vi.mock('@/lib/auth', () => ({ authMobile: vi.fn() }));
vi.mock('@neondatabase/serverless', () => ({ neonConfig: { webSocketConstructor: class {} }, Pool: class {
  async connect() { return { query: (sql: string, values?: unknown[]) => sql.includes('pg_advisory_xact_lock') ? Promise.resolve({ rows: [] }) : state.pg.query(sql, values), release() {} }; }
  async end() {}
} }));
vi.mock('@/lib/notifications', () => ({ createAdminNotification: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/notifications/driver-push', () => ({ notifyDriverNewMessage: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/notifications/expo-admin-push', () => ({ sendAdminExpoPush: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/notifications/customer-push', () => ({ notifyCustomerChatMessage: vi.fn().mockResolvedValue(true) }));

import { authMobile } from '../auth';
import { getOrCreateDirectDriverConversation, isDirectChatSchemaUnavailable } from '../chat/direct-driver';
import { canAccessConversation } from '../chat/permissions';
import { getConversationDetail, getMessages, listConversations, markConversationRead } from '../chat/queries';
import { POST as openRoute } from '../../app/api/chat/conversations/direct-driver/route';
import { GET as listRoute, POST as bookingRoute } from '../../app/api/chat/conversations/route';
import { GET as readMessages, POST as sendRoute } from '../../app/api/chat/conversations/[conversationId]/messages/route';
import { createAdminNotification } from '../notifications';
import { notifyDriverNewMessage } from '../notifications/driver-push';
import { sendAdminExpoPush } from '../notifications/expo-admin-push';
import { notifyCustomerChatMessage } from '../notifications/customer-push';
import { signCustomerBookingAccessToken } from '../customer-booking-access';
import { GET as detailRoute } from '../../app/api/chat/conversations/[conversationId]/route';
import { POST as readRoute } from '../../app/api/chat/conversations/[conversationId]/read/route';
import { getGuestUnreadCount, sendMessage } from '../chat/queries';

const pg = new PGlite();
const admin = '10000000-0000-4000-8000-000000000001';
const secondAdmin = '10000000-0000-4000-8000-000000000002';
const customer = '20000000-0000-4000-8000-000000000001';
const driverUser = '30000000-0000-4000-8000-000000000001';
const otherDriverUser = '30000000-0000-4000-8000-000000000002';
const driverId = '40000000-0000-4000-8000-000000000001';
const otherDriverId = '40000000-0000-4000-8000-000000000002';
const bookingId = '50000000-0000-4000-8000-000000000001';
const authMock = vi.mocked(authMobile);
function login(id: string, role: 'admin' | 'customer' | 'driver') {
  authMock.mockResolvedValue({ user: { id, role, name: role, email: `${role}@isolated.invalid` } });
}
function request(body?: unknown, url = 'https://isolated.invalid/api/chat/conversations/direct-driver') {
  return new NextRequest(url, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function context(conversationId: string) { return { params: Promise.resolve({ conversationId }) }; }

beforeAll(async () => {
  state.pg = pg;
  const dialect = new PgDialect();
  for (const table of [schema.users, schema.drivers, schema.bookings, schema.bookingConversations, schema.auditLogs,
    schema.conversationParticipants, schema.bookingMessages, schema.messageAttachments, schema.messageReadState]) {
    const { name, columns } = getTableConfig(table);
    const definitions = columns.filter((column) => column.name !== 'direct_driver_id').map((column) => {
      let defaultSql = '';
      if (column.default !== undefined) defaultSql = ` DEFAULT ${typeof column.default === 'object'
        ? dialect.sqlToQuery(column.default as Parameters<PgDialect['sqlToQuery']>[0]).sql
        : typeof column.default === 'string' ? `'${column.default}'` : column.default}`;
      const notNull = column.notNull || (name === 'booking_conversations' && column.name === 'booking_id');
      return `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}${notNull ? ' NOT NULL' : ''}${defaultSql}`;
    });
    await pg.exec(`CREATE TABLE "${name}" (${definitions.join(',')})`);
  }
  const migration = readFileSync('drizzle/migrations/0034_direct_driver_chat.sql', 'utf8');
  await pg.exec(migration);
  await pg.exec(migration);
  const guestMigration = readFileSync('drizzle/migrations/0036_customer_guest_chat.sql', 'utf8');
  await pg.exec(guestMigration);
  await pg.exec(guestMigration);
  vi.stubEnv('CUSTOMER_BOOKING_ACCESS_SECRET', 'isolated-customer-booking-secret-32-characters-minimum');
  state.db = drizzle(pg, { schema });
}, 30_000);
beforeEach(async () => {
  vi.clearAllMocks();
  await pg.exec('TRUNCATE audit_logs,message_read_state,message_attachments,booking_messages,conversation_participants,booking_conversations,bookings,drivers,users CASCADE');
  await state.db.insert(schema.users).values([
    { id: admin, name: 'Admin', email: 'admin@isolated.invalid', role: 'admin' },
    { id: secondAdmin, name: 'Second admin', email: 'admin2@isolated.invalid', role: 'admin' },
    { id: customer, name: 'Private customer', email: 'customer@isolated.invalid', role: 'customer' },
    { id: driverUser, name: 'Selected driver', email: 'driver@isolated.invalid', role: 'driver' },
    { id: otherDriverUser, name: 'Other driver', email: 'other@isolated.invalid', role: 'driver' },
  ]);
  await state.db.insert(schema.drivers).values([{ id: driverId, userId: driverUser }, { id: otherDriverId, userId: otherDriverUser }]);
  login(admin, 'admin');
});
afterAll(async () => { vi.unstubAllEnvs(); await pg.close(); });

describe('direct driver chat with real isolated PostgreSQL', () => {
  it('opens a direct conversation without any booking, with both server-derived participants and read states', async () => {
    const response = await openRoute(request({ driverId }));
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const result = await response.json();
    expect(result).toMatchObject({ scope: 'direct_driver', driverId, driverName: 'Selected driver', reused: false });
    const [conv] = await state.db.select().from(schema.bookingConversations);
    expect(conv).toMatchObject({ bookingId: null, directDriverId: driverId, channel: 'admin_driver' });
    expect(await state.db.select().from(schema.bookings)).toHaveLength(0);
    expect((await state.db.select().from(schema.conversationParticipants)).map((p) => [p.userId, p.role])).toEqual([[admin, 'admin'], [driverUser, 'driver']]);
    expect(await state.db.select().from(schema.messageReadState)).toHaveLength(2);
  });

  it('retries and a second admin reuse one conversation and preserve its messages and unread count', async () => {
    const first = await getOrCreateDirectDriverConversation(admin, driverId);
    await state.db.update(schema.messageReadState).set({ unreadCount: 7 }).where(eq(schema.messageReadState.userId, driverUser));
    for (const actor of [admin, admin, secondAdmin, secondAdmin]) {
      const result = await getOrCreateDirectDriverConversation(actor, driverId);
      expect(result.conversationId).toBe(first.conversationId); expect(result.reused).toBe(true);
    }
    expect(await state.db.select().from(schema.bookingConversations)).toHaveLength(1);
    expect(await state.db.select().from(schema.conversationParticipants)).toHaveLength(3);
    const [driverRead] = await state.db.select().from(schema.messageReadState).where(eq(schema.messageReadState.userId, driverUser));
    expect(driverRead.unreadCount).toBe(7);
    await expect(pg.query("INSERT INTO booking_conversations (direct_driver_id,channel) VALUES ($1,'admin_driver')", [driverId])).rejects.toMatchObject({ code: '23505' });
  });

  it('enforces the database scope and foreign key instead of accepting ambiguous/fabricated bookings', async () => {
    await expect(pg.query("INSERT INTO booking_conversations (channel) VALUES ('admin_driver')")).rejects.toMatchObject({ code: '23514' });
    await expect(pg.query("INSERT INTO booking_conversations (direct_driver_id,channel) VALUES ($1,'customer_driver')", [driverId])).rejects.toMatchObject({ code: '23514' });
    await expect(pg.query("INSERT INTO booking_conversations (direct_driver_id,channel) VALUES ($1,'admin_driver')", [bookingId])).rejects.toMatchObject({ code: '23503' });
  });

  it('explicit admin start-chat reopens the same archived conversation with an audit and preserves locks', async () => {
    const { conversationId } = await getOrCreateDirectDriverConversation(admin, driverId);
    await state.db.update(schema.bookingConversations).set({ status: 'archived', locked: true, muted: true }).where(eq(schema.bookingConversations.id, conversationId));
    expect((await openRoute(request({ driverId }))).status).toBe(200);
    const [conv] = await state.db.select().from(schema.bookingConversations);
    expect(conv).toMatchObject({ id: conversationId, status: 'open', locked: true, muted: true });
    const [audit] = await state.db.select().from(schema.auditLogs);
    expect(audit).toMatchObject({ actorUserId: admin, entityId: conversationId, action: 'chat.direct_driver.reopened', beforeJson: { status: 'archived' }, afterJson: { status: 'open', driverId } });
  });

  it('rejects missing login, customers, drivers, forged participants, invalid IDs and invalid JSON', async () => {
    authMock.mockResolvedValue(null); expect((await openRoute(request({ driverId }))).status).toBe(401);
    for (const [id, role] of [[customer, 'customer'], [driverUser, 'driver']] as const) {
      login(id, role); expect((await openRoute(request({ driverId }))).status).toBe(403);
    }
    login(admin, 'admin');
    for (const body of [{ driverId: 'bad' }, { driverId, userId: customer }, { driverId, bookingId }, { driverId, participants: [customer] }]) {
      expect((await openRoute(request(body))).status).toBe(400);
    }
    const invalid = new NextRequest('https://isolated.invalid/direct', { method: 'POST', body: '{' });
    expect((await openRoute(invalid)).status).toBe(400);
    expect(await state.db.select().from(schema.bookingConversations)).toHaveLength(0);
  });

  it('checks live admin and driver roles and rejects missing/non-driver accounts without writing', async () => {
    await state.db.update(schema.users).set({ role: 'customer' }).where(eq(schema.users.id, admin));
    expect((await openRoute(request({ driverId }))).status).toBe(403);
    await state.db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, admin));
    expect((await openRoute(request({ driverId: bookingId }))).status).toBe(404);
    await state.db.update(schema.users).set({ role: 'customer' }).where(eq(schema.users.id, driverUser));
    expect((await openRoute(request({ driverId }))).status).toBe(404);
    expect(await state.db.select().from(schema.bookingConversations)).toHaveLength(0);
  });

  it('allows only the selected driver and admins even if another participant is inserted by mistake', async () => {
    const { conversationId } = await getOrCreateDirectDriverConversation(admin, driverId);
    await state.db.insert(schema.conversationParticipants).values([
      { conversationId, userId: otherDriverUser, role: 'driver' }, { conversationId, userId: customer, role: 'customer' },
    ]);
    expect(await canAccessConversation({ id: driverUser, role: 'driver' }, conversationId)).toBe(true);
    expect(await canAccessConversation({ id: secondAdmin, role: 'admin' }, conversationId)).toBe(true);
    expect(await canAccessConversation({ id: otherDriverUser, role: 'driver' }, conversationId)).toBe(false);
    expect(await canAccessConversation({ id: customer, role: 'customer' }, conversationId)).toBe(false);
    expect(await listConversations(otherDriverUser, 'driver')).toEqual([]);
    expect(await listConversations(customer, 'customer')).toEqual([]);
    expect(await listConversations(admin, 'admin', { driverId: otherDriverId })).toEqual([]);
    const [summary] = await listConversations(driverUser, 'driver');
    expect(summary).toMatchObject({ id: conversationId, bookingId: null, bookingRef: 'Direct chat', scope: 'direct_driver', customerName: '', driverId, driverName: 'Selected driver' });
    expect(await getConversationDetail(conversationId)).toMatchObject({ bookingId: null, bookingRef: 'Direct chat', scope: 'direct_driver' });
  });

  it('supports existing Driver list/read/reply, unread reset, attachments and staff-only notes', async () => {
    const { conversationId } = await getOrCreateDirectDriverConversation(admin, driverId);
    const ctx = context(conversationId);
    const first = await sendRoute(request({ body: 'Hello driver', messageType: 'text' }), ctx);
    expect(first.status).toBe(201);
    await vi.waitFor(() => expect(notifyDriverNewMessage).toHaveBeenCalledWith(driverId, conversationId, 'admin', 'Hello driver'));
    login(driverUser, 'driver');
    expect((await (await listRoute(request())).json()).conversations[0]).toMatchObject({ id: conversationId, unreadCount: 1 });
    expect((await readMessages(request(undefined, `https://isolated.invalid/chat?limit=50`), ctx)).status).toBe(200);
    await markConversationRead(conversationId, driverUser);
    expect((await listConversations(driverUser, 'driver'))[0].unreadCount).toBe(0);
    const reply = await sendRoute(request({ body: 'Reply', messageType: 'text' }), ctx);
    expect(reply.status).toBe(201);
    expect(createAdminNotification).toHaveBeenCalledWith(expect.objectContaining({ entityId: conversationId, metadata: expect.objectContaining({ conversationId, chatScope: 'direct_driver' }) }));
    login(admin, 'admin');
    const photo = await sendRoute(request({ body: null, messageType: 'image', attachment: { url: 'https://media.isolated.invalid/image.jpg', mimeType: 'image/jpeg', fileSize: 100 } }), ctx);
    expect(photo.status).toBe(201);
    await vi.waitFor(() => expect(notifyDriverNewMessage).toHaveBeenCalledWith(driverId, conversationId, 'admin', 'Sent a photo'));
    vi.mocked(notifyDriverNewMessage).mockClear();
    expect((await sendRoute(request({ body: 'Private staff note', messageType: 'admin_note' }), ctx)).status).toBe(201);
    expect(notifyDriverNewMessage).not.toHaveBeenCalled();
    expect((await getMessages(conversationId, 'driver')).messages.some((m) => m.body === 'Private staff note')).toBe(false);
    expect((await listConversations(driverUser, 'driver'))[0].lastMessageBody).toBe('Photo');
    expect((await getMessages(conversationId, 'admin')).messages.some((m) => m.body === 'Private staff note')).toBe(true);
    login(otherDriverUser, 'driver');
    expect((await readMessages(request(), ctx)).status).toBe(403);
    expect((await sendRoute(request({ body: 'Forged', messageType: 'text' }), ctx)).status).toBe(403);
  });

  it('uses the canonical direct driver for push even if a stale driver participant comes first', async () => {
    const { conversationId } = await getOrCreateDirectDriverConversation(admin, driverId);
    await state.db.delete(schema.conversationParticipants).where(eq(schema.conversationParticipants.conversationId, conversationId));
    await state.db.insert(schema.conversationParticipants).values([
      { conversationId, userId: otherDriverUser, role: 'driver' },
      { conversationId, userId: driverUser, role: 'driver' },
      { conversationId, userId: admin, role: 'admin' },
    ]);
    expect((await sendRoute(request({ body: 'Private destination', messageType: 'text' }), context(conversationId))).status).toBe(201);
    await vi.waitFor(() => expect(notifyDriverNewMessage).toHaveBeenCalledWith(driverId, conversationId, 'admin', 'Private destination'));
    expect(notifyDriverNewMessage).not.toHaveBeenCalledWith(otherDriverId, expect.anything(), expect.anything(), expect.anything());
  });

  it('preserves booking-bound permissions and customers cannot create staff threads', async () => {
    await state.db.insert(schema.bookings).values({ id: bookingId, refNumber: 'ISOLATED-1', userId: customer, driverId,
      bookingType: 'emergency', serviceType: 'tyre_replacement', status: 'pending', addressLine: 'Synthetic address', lat: '55', lng: '-4',
      customerName: 'Private customer', customerEmail: 'customer@isolated.invalid', customerPhone: '000000000',
      priceSnapshot: {}, subtotal: '100', vatAmount: '20', totalAmount: '120' });
    login(customer, 'customer');
    expect((await bookingRoute(request({ bookingId, channel: 'admin_driver' }))).status).toBe(403);
    expect((await bookingRoute(request({ bookingId, channel: 'customer_admin' }))).status).toBe(201);
    const direct = await getOrCreateDirectDriverConversation(admin, driverId);
    expect((await listConversations(customer, 'customer')).map((row) => row.scope)).toEqual(['booking']);
    expect(await canAccessConversation({ id: customer, role: 'customer' }, direct.conversationId)).toBe(false);
    expect((await listConversations(admin, 'admin', { bookingRef: 'ISOLATED-1' })).every((row) => row.bookingId === bookingId)).toBe(true);
  });

  it('returns a clear migration-required 503 without exposing SQL or inserting partial data', async () => {
    await pg.exec('ALTER TABLE booking_conversations RENAME COLUMN direct_driver_id TO isolated_hidden_column');
    try {
      const response = await openRoute(request({ driverId }));
      expect(response.status).toBe(503);
      const payload = await response.json();
      expect(payload).toMatchObject({ code: 'DIRECT_DRIVER_CHAT_UNAVAILABLE' });
      expect(JSON.stringify(payload)).not.toMatch(/SELECT|INSERT|isolated_hidden|direct_driver_id/);
    } finally { await pg.exec('ALTER TABLE booking_conversations RENAME COLUMN isolated_hidden_column TO direct_driver_id'); }
    expect(await state.db.select().from(schema.bookingConversations)).toHaveLength(0);
    expect(await state.db.select().from(schema.conversationParticipants)).toHaveLength(0);
    expect(isDirectChatSchemaUnavailable({ cause: { code: '42703' } })).toBe(true);
    expect(isDirectChatSchemaUnavailable(new Error('connection failed'))).toBe(false);
  });

  it('keeps legacy booking create/list/read working before the direct-chat column exists', async () => {
    await state.db.insert(schema.bookings).values({ id: bookingId, refNumber: 'ISOLATED-LEGACY', userId: customer, driverId,
      bookingType: 'emergency', serviceType: 'tyre_replacement', status: 'pending', addressLine: 'Synthetic address', lat: '55', lng: '-4',
      customerName: 'Private customer', customerEmail: 'customer@isolated.invalid', customerPhone: '000000000',
      priceSnapshot: {}, subtotal: '100', vatAmount: '20', totalAmount: '120' });
    await pg.exec('ALTER TABLE booking_conversations RENAME COLUMN direct_driver_id TO isolated_hidden_column');
    try {
      login(customer, 'customer');
      const response = await bookingRoute(request({ bookingId, channel: 'customer_admin' }));
      expect(response.status).toBe(201);
      const { conversationId } = await response.json();
      expect(await canAccessConversation({ id: customer, role: 'customer' }, conversationId)).toBe(true);
      expect(await getConversationDetail(conversationId)).toMatchObject({ bookingId, scope: 'booking', bookingRef: 'ISOLATED-LEGACY' });
      expect((await listConversations(customer, 'customer'))[0]).toMatchObject({ bookingId, scope: 'booking' });
    } finally { await pg.exec('ALTER TABLE booking_conversations RENAME COLUMN isolated_hidden_column TO direct_driver_id'); }
  });

  async function guestFixture() {
    await state.db.insert(schema.bookings).values({ id: bookingId, refNumber: 'ISOLATED-GUEST', userId: null, driverId,
      bookingType: 'emergency', serviceType: 'tyre_replacement', status: 'paid', addressLine: 'Synthetic address', lat: '55', lng: '-4',
      customerName: 'Guest customer', customerEmail: 'guest@isolated.invalid', customerPhone: '000000000',
      priceSnapshot: {}, subtotal: '100', vatAmount: '20', totalAmount: '120' });
    const capability = await signCustomerBookingAccessToken({ bookingId, refNumber: 'ISOLATED-GUEST' });
    authMock.mockResolvedValue(null);
    function guestRequest(body?: unknown, path = '/api/chat/conversations', proof = capability) {
      return new NextRequest(`https://isolated.invalid${path}`, { method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Booking-Access': proof },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    }
    const response = await bookingRoute(guestRequest({ bookingId, channel: 'customer_admin' }));
    expect(response.status).toBe(201);
    const { conversationId } = await response.json();
    return { conversationId: conversationId as string, guestRequest, capability };
  }

  it('keeps a roadside guest separate from accounts and accepts only the exact booking capability', async () => {
    const { conversationId, guestRequest } = await guestFixture();
    expect(await state.db.select().from(schema.users)).toHaveLength(5);
    expect(await state.db.select().from(schema.conversationParticipants)).toHaveLength(0);
    const response = await sendRoute(guestRequest({ body: 'My tyre is damaged', messageType: 'text' }), context(conversationId));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ senderId: null, senderRole: 'customer', senderName: 'Guest customer' });
    expect(notifyDriverNewMessage).not.toHaveBeenCalled();
    expect(sendAdminExpoPush).toHaveBeenCalledWith(expect.objectContaining({ platforms: ['ios'], data: expect.objectContaining({ conversationId }) }));
    const wrongProof = await signCustomerBookingAccessToken({ bookingId: otherDriverId, refNumber: 'ISOLATED-GUEST' });
    expect((await readMessages(guestRequest(undefined, '/api/chat/messages', wrongProof), context(conversationId))).status).toBe(403);
    expect((await readMessages(request(), context(conversationId))).status).toBe(403);
    expect((await bookingRoute(guestRequest({ bookingId, channel: 'admin_driver' }))).status).toBe(403);
    expect((await bookingRoute(guestRequest({ bookingId, channel: 'customer_driver' }))).status).toBe(403);
    login(driverUser, 'driver');
    await state.db.insert(schema.conversationParticipants).values({ conversationId, userId: driverUser, role: 'driver' });
    expect((await readMessages(request(), context(conversationId))).status).toBe(403);
  });

  it('never pushes customer/admin previews to a driver and hides internal notes from guests', async () => {
    const { conversationId, guestRequest } = await guestFixture();
    login(admin, 'admin');
    expect((await sendRoute(request({ body: 'Private reply', messageType: 'text' }), context(conversationId))).status).toBe(201);
    expect(notifyCustomerChatMessage).toHaveBeenCalledExactlyOnceWith({ bookingId, conversationId });
    expect(notifyDriverNewMessage).not.toHaveBeenCalled();
    expect((await sendRoute(request({ body: 'Internal only', messageType: 'admin_note' }), context(conversationId))).status).toBe(201);
    expect(notifyCustomerChatMessage).toHaveBeenCalledTimes(1);
    authMock.mockResolvedValue(null);
    const page = await (await readMessages(guestRequest(), context(conversationId))).json();
    expect(page.messages.map((message: { body: string }) => message.body)).toEqual(['Private reply']);
    expect((await detailRoute(guestRequest(), context(conversationId))).status).toBe(200);
    expect((await sendRoute(guestRequest({ body: 'Pretend note', messageType: 'admin_note' }), context(conversationId))).status).toBe(403);
    expect((await sendRoute(guestRequest({ body: '  ', messageType: 'text' }), context(conversationId))).status).toBe(400);
    expect((await sendRoute(guestRequest({ body: null, messageType: 'image', attachment: { url: 'https://isolated.invalid/file.jpg', mimeType: 'image/jpeg', fileSize: 8 } }), context(conversationId))).status).toBe(400);
    await state.db.update(schema.bookingConversations).set({ locked: true }).where(eq(schema.bookingConversations.id, conversationId));
    expect((await readMessages(guestRequest(), context(conversationId))).status).toBe(200);
    expect((await sendRoute(guestRequest({ body: 'Cannot send', messageType: 'text' }), context(conversationId))).status).toBe(403);
    await expect(state.db.insert(schema.bookingMessages).values({ conversationId, senderId: null, senderRole: 'admin', body: 'Invalid identity' })).rejects.toThrow();
  });

  it('deduplicates retried and overlapping guest messages without duplicate alerts', async () => {
    const { conversationId, guestRequest } = await guestFixture();
    const body = { body: 'Please help', messageType: 'text', clientMessageId: '60000000-0000-4000-8000-000000000001' };
    const responses = await Promise.all([sendRoute(guestRequest(body), context(conversationId)), sendRoute(guestRequest(body), context(conversationId))]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(await state.db.select().from(schema.bookingMessages)).toHaveLength(1);
    expect(sendAdminExpoPush).toHaveBeenCalledTimes(1);
    expect(createAdminNotification).toHaveBeenCalledTimes(1);
    expect((await sendRoute(guestRequest({ ...body, body: 'Different message' }), context(conversationId))).status).toBe(409);
  });

  it('keeps guest read markers monotonic and ignores notes and markers from another conversation', async () => {
    const { conversationId, guestRequest } = await guestFixture();
    const first = await sendMessage(conversationId, admin, 'admin', 'First');
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await sendMessage(conversationId, admin, 'admin', 'Second');
    await sendMessage(conversationId, admin, 'admin', 'Hidden', 'admin_note');
    expect(await getGuestUnreadCount(conversationId)).toBe(2);
    expect((await readRoute(guestRequest({ lastReadMessageId: second.id }), context(conversationId))).status).toBe(200);
    expect(await getGuestUnreadCount(conversationId)).toBe(0);
    await readRoute(guestRequest({ lastReadMessageId: first.id }), context(conversationId));
    expect(await getGuestUnreadCount(conversationId)).toBe(0);
    const direct = await getOrCreateDirectDriverConversation(admin, driverId);
    const other = await sendMessage(direct.conversationId, admin, 'admin', 'Another private thread');
    await readRoute(guestRequest({ lastReadMessageId: other.id }), context(conversationId));
    expect(await getGuestUnreadCount(conversationId)).toBe(0);
  });

  it('paginates messages with tied timestamps without skipping or leaking another thread', async () => {
    const { conversationId, guestRequest } = await guestFixture();
    const date = new Date('2026-10-22T12:00:00Z');
    await state.db.insert(schema.bookingMessages).values([1, 2, 3].map((value) => ({ id: `60000000-0000-4000-8000-00000000000${value}`,
      conversationId, senderId: admin, senderRole: 'admin', body: `Message ${value}`, createdAt: date })));
    const first = await (await readMessages(guestRequest(undefined, '/api/chat/messages?limit=2'), context(conversationId))).json();
    const second = await (await readMessages(guestRequest(undefined, `/api/chat/messages?limit=2&cursor=${first.nextCursor}`), context(conversationId))).json();
    expect(first.messages.map((message: { body: string }) => message.body)).toEqual(['Message 2', 'Message 3']);
    expect(second.messages.map((message: { body: string }) => message.body)).toEqual(['Message 1']);
    expect((await readMessages(guestRequest(undefined, '/api/chat/messages?limit=-1'), context(conversationId))).status).toBe(400);
    expect((await readMessages(guestRequest(undefined, '/api/chat/messages?cursor=invalid'), context(conversationId))).status).toBe(400);
  });

  it('counts a first guest message for staff and subscribes authorized readers to future unread updates', async () => {
    const { conversationId, guestRequest } = await guestFixture();
    await sendRoute(guestRequest({ body: 'New roadside guest', messageType: 'text' }), context(conversationId));
    expect((await listConversations(admin, 'admin'))[0].unreadCount).toBe(1);
    login(admin, 'admin');
    await readMessages(request(), context(conversationId));
    await readRoute(request({}), context(conversationId));
    expect((await listConversations(admin, 'admin'))[0].unreadCount).toBe(0);
    authMock.mockResolvedValue(null);
    await sendRoute(guestRequest({ body: 'Another update', messageType: 'text' }), context(conversationId));
    expect((await listConversations(admin, 'admin'))[0].unreadCount).toBe(1);
    await state.db.update(schema.bookings).set({ userId: customer }).where(eq(schema.bookings.id, bookingId));
    login(admin, 'admin');
    await sendRoute(request({ body: 'Reply for customer', messageType: 'text' }), context(conversationId));
    expect((await listConversations(customer, 'customer'))[0].unreadCount).toBe(1);
    login(customer, 'customer');
    await readMessages(request(), context(conversationId));
    await readRoute(request({}), context(conversationId));
    expect((await listConversations(customer, 'customer'))[0].unreadCount).toBe(0);
    login(admin, 'admin');
    await sendRoute(request({ body: 'Next reply', messageType: 'text' }), context(conversationId));
    expect((await listConversations(customer, 'customer'))[0].unreadCount).toBe(1);
  });
});
