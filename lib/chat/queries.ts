import { sendBookingChatMessage } from './booking-message';
import { getOrCreateBookingConversation } from './booking-conversation';
import { countInboxUnread, listInbox, type InboxFilters } from './inbox';
import { db } from '@/lib/db';
import {
  bookingConversations,
  conversationParticipants,
  bookingMessages,
  messageAttachments,
  messageReadState,
  guestChatReadState,
  bookings,
  drivers,
  users,
} from '@/lib/db/schema';
import { eq, and, desc, sql, inArray, or } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type {
  ChatChannel,
  ChatRole,
  ConversationSummary,
  MessageView,
  ConversationDetail,
} from './types';

type BookingMessageRow = typeof bookingMessages.$inferSelect;

function isDeletedMessage(message: BookingMessageRow, attachments: Array<typeof messageAttachments.$inferSelect>): boolean {
  if (message.body) return false;
  if (attachments.length === 0) return true;
  return attachments.every((attachment) => attachment.deletedAt !== null);
}

async function toMessageView(message: BookingMessageRow): Promise<MessageView> {
  const [sender] = message.senderId ? await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, message.senderId))
    .limit(1) : [];

  const attachments = await db
    .select()
    .from(messageAttachments)
    .where(eq(messageAttachments.messageId, message.id));

  return {
    id: message.id,
    senderId: message.senderId,
    senderName: sender?.name ?? (message.senderId === null && message.senderRole === 'customer' ? 'Guest customer' : 'Unknown'),
    senderRole: message.senderRole as ChatRole,
    body: message.body,
    messageType: message.messageType as MessageView['messageType'],
    deliveryStatus: message.deliveryStatus as MessageView['deliveryStatus'],
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      url: attachment.url,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      fileName: attachment.fileName,
      deleted: attachment.deletedAt !== null,
    })),
    deleted: isDeletedMessage(message, attachments),
    createdAt: message.createdAt?.toISOString() ?? '',
  };
}

/* ─── Get or create a conversation for a booking + channel ──────── */

export async function getOrCreateConversation(
  bookingId: string,
  channel: ChatChannel,
  initiatorUserId: string | null,
  initiatorRole: ChatRole,
  options?: { targetDriverUserId?: string | null },
): Promise<string> {
  return getOrCreateBookingConversation({ bookingId, channel, initiatorUserId, initiatorRole, targetDriverUserId: options?.targetDriverUserId });
}
/* ─── List conversations for a user (role-scoped) ──────────────── */

/** First inbox page; see listInbox for visibility, unread policy and paging. */
export async function listConversations(
  userId: string,
  role: ChatRole,
  filters?: InboxFilters,
): Promise<ConversationSummary[]> {
  return (await listInbox(userId, role, filters)).conversations;
}

/* ─── Get conversation detail ──────────────────────────────────── */

export async function getConversationDetail(
  conversationId: string,
): Promise<ConversationDetail | null> {
  const [conv] = await db
    // Explicit legacy columns keep booking-only reads compatible before migration.
    .select({ id: bookingConversations.id, bookingId: bookingConversations.bookingId,
      channel: bookingConversations.channel, status: bookingConversations.status,
      locked: bookingConversations.locked, muted: bookingConversations.muted })
    .from(bookingConversations)
    .where(eq(bookingConversations.id, conversationId))
    .limit(1);

  if (!conv) return null;

  const [booking] = conv.bookingId ? await db
    .select({ refNumber: bookings.refNumber })
    .from(bookings)
    .where(eq(bookings.id, conv.bookingId))
    .limit(1) : [];

  const parts = await db
    .select({
      userId: conversationParticipants.userId,
      role: conversationParticipants.role,
    })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId));

  const participantsWithNames = [];
  for (const p of parts) {
    const [u] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, p.userId))
      .limit(1);
    participantsWithNames.push({
      userId: p.userId,
      name: u?.name ?? 'Unknown',
      role: p.role as ChatRole,
    });
  }

  return {
    id: conv.id,
    bookingId: conv.bookingId,
    scope: conv.bookingId ? 'booking' : 'direct_driver',
    bookingRef: conv.bookingId ? booking?.refNumber ?? '' : 'Direct chat',
    channel: conv.channel as ConversationDetail['channel'],
    status: conv.status as ConversationDetail['status'],
    locked: conv.locked ?? false,
    muted: conv.muted ?? false,
    participants: participantsWithNames,
  };
}

/* ─── Get messages (paginated) ─────────────────────────────────── */

export async function getMessages(
  conversationId: string,
  viewerRole: ChatRole,
  cursor?: string,
  limit = 50,
): Promise<{ messages: MessageView[]; nextCursor: string | null }> {
  const conditions = [eq(bookingMessages.conversationId, conversationId)];

  // Non-admin viewers don't see admin_note messages
  if (viewerRole !== 'admin') {
    conditions.push(sql`${bookingMessages.messageType} != 'admin_note'`);
  }

  if (cursor) {
    conditions.push(sql`(${bookingMessages.createdAt}, ${bookingMessages.id}) <
      (SELECT created_at, id FROM booking_messages WHERE id = ${cursor}::uuid AND conversation_id = ${conversationId}::uuid)`);
  }

  const rows = await db
    .select()
    .from(bookingMessages)
    .where(and(...conditions))
    .orderBy(desc(bookingMessages.createdAt), desc(bookingMessages.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const messageRows = hasMore ? rows.slice(0, limit) : rows;

  const messages: MessageView[] = [];
  for (const m of messageRows) {
    messages.push(await toMessageView(m));
  }

  // Reverse so oldest first
  messages.reverse();

  return {
    messages,
    nextCursor: hasMore ? messageRows[messageRows.length - 1].id : null,
  };
}

/** Guest read state is scoped to the conversation; it never writes a user row. */
export async function markGuestConversationRead(conversationId: string, messageId: string) {
  const [message] = await db.select({ id: bookingMessages.id, createdAt: bookingMessages.createdAt })
    .from(bookingMessages).where(and(eq(bookingMessages.id, messageId), eq(bookingMessages.conversationId, conversationId),
      sql`${bookingMessages.messageType} != 'admin_note'`)).limit(1);
  if (!message?.createdAt) return;
  await db.insert(guestChatReadState).values({ conversationId, lastReadMessageId: message.id, lastReadAt: message.createdAt })
    .onConflictDoUpdate({ target: guestChatReadState.conversationId,
      set: { lastReadMessageId: message.id, lastReadAt: message.createdAt },
      setWhere: sql`${guestChatReadState.lastReadAt} IS NULL OR
        (${guestChatReadState.lastReadAt}, ${guestChatReadState.lastReadMessageId}) < (${message.createdAt.toISOString()}::timestamptz, ${message.id}::uuid)` });
}

export async function getGuestUnreadCount(conversationId: string) {
  const [state] = await db.select().from(guestChatReadState).where(eq(guestChatReadState.conversationId, conversationId)).limit(1);
  const conditions = [eq(bookingMessages.conversationId, conversationId), eq(bookingMessages.senderRole, 'admin'),
    sql`${bookingMessages.messageType} != 'admin_note'`];
  if (state?.lastReadAt && state.lastReadMessageId) conditions.push(sql`(${bookingMessages.createdAt}, ${bookingMessages.id}) >
    (${state.lastReadAt.toISOString()}::timestamptz, ${state.lastReadMessageId}::uuid)`);
  const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(bookingMessages).where(and(...conditions));
  return result?.count ?? 0;
}

/* ─── Send a message ───────────────────────────────────────────── */

export async function sendMessage(
  conversationId: string,
  senderId: string | null,
  senderRole: ChatRole,
  body: string | null,
  messageType: 'text' | 'image' | 'audio' | 'admin_note' = 'text',
  attachmentData?: { url: string; mimeType: string; fileSize: number; fileName?: string },
  messageId?: string,
): Promise<MessageView> {
  return sendBookingChatMessage({ conversationId, senderId, senderRole, body, messageType, attachment: attachmentData, messageId });
}
export async function getMessageById(
  conversationId: string,
  messageId: string,
  viewerRole: ChatRole,
): Promise<MessageView | null> {
  const conditions = [eq(bookingMessages.id, messageId), eq(bookingMessages.conversationId, conversationId)];
  if (viewerRole !== 'admin') {
    conditions.push(sql`${bookingMessages.messageType} != 'admin_note'`);
  }

  const [message] = await db.select().from(bookingMessages).where(and(...conditions)).limit(1);
  return message ? toMessageView(message) : null;
}

export async function editMessage(
  conversationId: string,
  messageId: string,
  body: string,
): Promise<MessageView | null> {
  const [message] = await db
    .update(bookingMessages)
    .set({ body })
    .where(and(eq(bookingMessages.id, messageId), eq(bookingMessages.conversationId, conversationId)))
    .returning();

  if (!message) return null;
  await db
    .update(bookingConversations)
    .set({ updatedAt: new Date() })
    .where(eq(bookingConversations.id, conversationId));
  return toMessageView(message);
}

export async function deleteMessage(
  conversationId: string,
  messageId: string,
): Promise<MessageView | null> {
  const [message] = await db
    .update(bookingMessages)
    .set({ body: null })
    .where(and(eq(bookingMessages.id, messageId), eq(bookingMessages.conversationId, conversationId)))
    .returning();

  if (!message) return null;
  await db
    .update(messageAttachments)
    .set({ deletedAt: new Date() })
    .where(eq(messageAttachments.messageId, messageId));
  await db
    .update(bookingConversations)
    .set({ updatedAt: new Date() })
    .where(eq(bookingConversations.id, conversationId));
  return toMessageView(message);
}

/* ─── Mark conversation as read ────────────────────────────────── */

/**
 * Advance the viewer's read marker to `upToMessageId` (the newest message the
 * client actually showed) or, without one, to the newest visible message.
 * The marker never moves backwards, and an unknown or hidden message ID leaves
 * it unchanged. unread_count is recomputed from the marker for legacy readers.
 * Callers without the viewer role (older call sites) get it from the user row.
 */
export async function markConversationRead(
  conversationId: string,
  userId: string,
  role?: ChatRole,
  upToMessageId?: string,
): Promise<{ lastReadMessageId: string | null }> {
  const viewerRole: ChatRole = role ?? await (async () => {
    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    return user?.role === 'admin' || user?.role === 'driver' ? user.role : 'customer';
  })();
  const isAdmin = viewerRole === 'admin';
  const target = upToMessageId ? sql`m.id = ${upToMessageId}::uuid` : sql`TRUE`;
  const statement = sql`
    WITH target AS (
      SELECT m.id, m.created_at FROM booking_messages m
      WHERE m.conversation_id = ${conversationId}::uuid AND (${isAdmin}::boolean OR m.message_type <> 'admin_note') AND ${target}
      ORDER BY m.created_at DESC, m.id DESC LIMIT 1
    ), current_marker AS (
      SELECT cm.id, cm.created_at FROM message_read_state r JOIN booking_messages cm ON cm.id = r.last_read_message_id
      WHERE r.conversation_id = ${conversationId}::uuid AND r.user_id = ${userId}::uuid
      ORDER BY cm.created_at DESC, cm.id DESC LIMIT 1
    ), chosen AS (
      SELECT id, created_at FROM (SELECT * FROM target UNION ALL SELECT * FROM current_marker) candidates
      ORDER BY created_at DESC, id DESC LIMIT 1
    ), remaining AS (
      SELECT count(*)::int AS n FROM booking_messages u CROSS JOIN chosen
      WHERE u.conversation_id = ${conversationId}::uuid
        AND u.sender_id IS DISTINCT FROM ${userId}::uuid
        AND (${isAdmin}::boolean OR u.message_type <> 'admin_note')
        AND (${viewerRole} <> 'customer' OR u.sender_role <> 'customer')
        AND (u.created_at, u.id) > (chosen.created_at, chosen.id)
    ), updated AS (
      UPDATE message_read_state SET last_read_message_id = (SELECT id FROM chosen),
        unread_count = COALESCE((SELECT n FROM remaining), 0), updated_at = NOW()
      WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid
      RETURNING last_read_message_id
    ), inserted AS (
      INSERT INTO message_read_state (conversation_id, user_id, last_read_message_id, unread_count)
      SELECT ${conversationId}::uuid, ${userId}::uuid, (SELECT id FROM chosen), COALESCE((SELECT n FROM remaining), 0)
      WHERE NOT EXISTS (SELECT 1 FROM updated)
      RETURNING last_read_message_id
    )
    SELECT last_read_message_id FROM updated UNION ALL SELECT last_read_message_id FROM inserted LIMIT 1`;
  let result;
  try {
    result = await db.execute(statement);
  } catch (error) {
    // Two first reads can race to insert; once the unique index exists the
    // loser retries and updates the winner's row instead.
    if ((error as { code?: string } | null)?.code !== '23505') throw error;
    result = await db.execute(statement);
  }
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? [];
  const marker = (rows[0] as { last_read_message_id?: string | null } | undefined)?.last_read_message_id ?? null;
  return { lastReadMessageId: marker };
}

/* ─── Get total unread count for a user ────────────────────────── */

export async function getTotalUnread(userId: string, role: ChatRole): Promise<number> {
  return countInboxUnread(userId, role);
}
