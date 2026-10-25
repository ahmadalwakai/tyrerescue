import { describe, expect, it } from 'vitest';
import { openBookingConversation, type BookingConversationClient } from '../chat/booking-conversation';

describe('booking conversation creation retries', () => {
  it('takes a transaction lock before lookup and reuses the thread without fake guest accounts', async () => {
    let id: string | null = null;
    const calls: { sql: string; values?: unknown[] }[] = [];
    const client: BookingConversationClient = { query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT id FROM booking_conversations')) return { rows: id ? [{ id }] : [] };
      if (sql.startsWith('INSERT INTO booking_conversations')) { id = 'conversation-a'; return { rows: [{ id }] }; }
      return { rows: [] };
    } };
    const input = { bookingId: 'booking-a', channel: 'customer_admin' as const, initiatorUserId: null, initiatorRole: 'customer' as const };
    expect(await openBookingConversation(client, input)).toBe('conversation-a');
    expect(await openBookingConversation(client, input)).toBe('conversation-a');
    expect(calls[0].sql).toContain('pg_advisory_xact_lock');
    expect(calls[0].values).toEqual(['booking-chat:booking-a:customer_admin']);
    expect(calls.filter((call) => call.sql.startsWith('INSERT INTO booking_conversations'))).toHaveLength(1);
    expect(calls.some((call) => call.sql.includes('INSERT INTO conversation_participants'))).toBe(false);
    expect(calls.some((call) => call.sql.includes('INSERT INTO message_read_state'))).toBe(false);
  });
  it('uses the selected private driver participant and initializes real account read state inside the same lock', async () => {
    const calls: { sql: string; values?: unknown[] }[] = [];
    const client: BookingConversationClient = { query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: sql.startsWith('SELECT c.id') ? [{ id: 'existing-private-thread' }] : [] };
    } };
    await openBookingConversation(client, { bookingId: 'booking-a', channel: 'admin_driver', initiatorUserId: 'admin-a', initiatorRole: 'admin', targetDriverUserId: 'driver-user-a' });
    expect(calls[1].values).toEqual(['booking-a', 'admin_driver', 'driver-user-a']);
    expect(calls.filter((call) => call.sql.includes('INSERT INTO conversation_participants')).map((call) => call.values)).toEqual([
      ['existing-private-thread', 'admin-a', 'admin'], ['existing-private-thread', 'driver-user-a', 'driver'],
    ]);
    expect(calls.filter((call) => call.sql.includes('INSERT INTO message_read_state'))).toHaveLength(2);
  });
});
