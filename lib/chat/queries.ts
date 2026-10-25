import { sendBookingChatMessage } from './booking-message';
import { getOrCreateBookingConversation } from './booking-conversation';
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

export async function listConversations(
  userId: string,
  role: ChatRole,
  filters?: { bookingRef?: string; status?: string; channel?: string; driverId?: string },
): Promise<ConversationSummary[]> {
  // Build base query conditions
  const conditions: SQL[] = [];

  if (filters?.status) {
    conditions.push(eq(bookingConversations.status, filters.status));
  }
  if (filters?.channel) {
    conditions.push(eq(bookingConversations.channel, filters.channel));
  }

  if (role === 'customer') {
    const rows = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.userId, userId));
    const bookingIds = rows.map((r) => r.id);
    if (bookingIds.length === 0) return [];
    conditions.push(inArray(bookingConversations.bookingId, bookingIds));
    conditions.push(sql`${bookingConversations.channel} != 'admin_driver'`);
  } else if (role === 'driver') {
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.userId, userId))
      .limit(1);
    if (!driver) return [];
    const bookingRows = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.driverId, driver.id));
    const participantRows = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, userId));
    const bookingIds = bookingRows.map((r) => r.id);
    const participantConversationIds = participantRows.map((r) => r.conversationId);
    const driverVisibility: SQL[] = [];
    if (bookingIds.length > 0) driverVisibility.push(inArray(bookingConversations.bookingId, bookingIds));
    if (participantConversationIds.length > 0) {
      driverVisibility.push(inArray(bookingConversations.id, participantConversationIds));
    }
    if (driverVisibility.length === 0) return [];
    conditions.push(driverVisibility.length === 1 ? driverVisibility[0] : or(...driverVisibility)!);
    conditions.push(sql`${bookingConversations.channel} in ('customer_driver', 'admin_driver')`);
  } else if (filters?.driverId) {
    const [driver] = await db
      .select({ id: drivers.id, userId: drivers.userId })
      .from(drivers)
      .where(eq(drivers.id, filters.driverId))
      .limit(1);
    if (!driver) return [];
    const bookingRows = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.driverId, driver.id));
    const participantRows = driver.userId
      ? await db
          .select({ conversationId: conversationParticipants.conversationId })
          .from(conversationParticipants)
          .where(eq(conversationParticipants.userId, driver.userId))
      : [];
    const bookingIds = bookingRows.map((r) => r.id);
    const participantConversationIds = participantRows.map((r) => r.conversationId);
    const driverFilter: SQL[] = [];
    if (bookingIds.length > 0) driverFilter.push(inArray(bookingConversations.bookingId, bookingIds));
    if (participantConversationIds.length > 0) {
      driverFilter.push(inArray(bookingConversations.id, participantConversationIds));
    }
    if (driverFilter.length === 0) return [];
    conditions.push(driverFilter.length === 1 ? driverFilter[0] : or(...driverFilter)!);
  }
  // admin without driverId: no booking filter

  // Filter by booking ref if given
  if (filters?.bookingRef) {
    const [b] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.refNumber, filters.bookingRef))
      .limit(1);
    if (!b) return [];
    conditions.push(eq(bookingConversations.bookingId, b.id));
  }

  const convRows = await db
    .select({
      id: bookingConversations.id,
      bookingId: bookingConversations.bookingId,
      channel: bookingConversations.channel,
      status: bookingConversations.status,
      locked: bookingConversations.locked,
      muted: bookingConversations.muted,
      createdAt: bookingConversations.createdAt,
    })
    .from(bookingConversations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(bookingConversations.updatedAt))
    .limit(100);

  if (convRows.length === 0) return [];

  // Hydrate with booking ref, customer name, driver name, last message, unread count
  const result: ConversationSummary[] = [];

  for (const conv of convRows) {
    const [booking] = conv.bookingId ? await db
      .select({
        refNumber: bookings.refNumber,
        customerName: bookings.customerName,
        driverId: bookings.driverId,
      })
      .from(bookings)
      .where(eq(bookings.id, conv.bookingId))
      .limit(1) : [];

    const [directDriver] = !conv.bookingId ? await db.select({ id: drivers.id, userId: drivers.userId, name: users.name })
      .from(bookingConversations)
      .innerJoin(drivers, eq(drivers.id, bookingConversations.directDriverId))
      .innerJoin(users, eq(users.id, drivers.userId))
      .where(and(eq(bookingConversations.id, conv.id), eq(users.role, 'driver'))).limit(1) : [];
    if (!conv.bookingId && (
      conv.channel !== 'admin_driver' || !directDriver || role === 'customer' ||
      (role === 'driver' && directDriver.userId !== userId) ||
      (filters?.driverId && directDriver.id !== filters.driverId)
    )) continue;

    let driverId: string | null = directDriver?.id ?? booking?.driverId ?? null;
    let driverName: string | null = directDriver?.name ?? null;
    const [participantDriver] = await db
      .select({
        driverId: drivers.id,
        name: users.name,
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(users.id, conversationParticipants.userId))
      .innerJoin(drivers, eq(drivers.userId, users.id))
      .where(
        and(
          eq(conversationParticipants.conversationId, conv.id),
          eq(conversationParticipants.role, 'driver'),
        ),
      )
      .limit(1);

    if (!directDriver && participantDriver) {
      driverId = participantDriver.driverId;
      driverName = participantDriver.name ?? null;
    } else if (!directDriver && booking?.driverId) {
      const [d] = await db
        .select({ userId: drivers.userId })
        .from(drivers)
        .where(eq(drivers.id, booking.driverId))
        .limit(1);
      if (d?.userId) {
        const [u] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, d.userId))
          .limit(1);
        driverName = u?.name ?? null;
      }
    }

    // Last message (excluding admin notes for non-admin)
    const msgConditions = [eq(bookingMessages.conversationId, conv.id)];
    if (role !== 'admin') {
      msgConditions.push(sql`${bookingMessages.messageType} != 'admin_note'`);
    }
    const [lastMsg] = await db
      .select({
        body: bookingMessages.body,
        messageType: bookingMessages.messageType,
        createdAt: bookingMessages.createdAt,
        senderRole: bookingMessages.senderRole,
      })
      .from(bookingMessages)
      .where(and(...msgConditions))
      .orderBy(desc(bookingMessages.createdAt))
      .limit(1);

    // Unread count
    const [readState] = await db
      .select({ unreadCount: messageReadState.unreadCount })
      .from(messageReadState)
      .where(
        and(
          eq(messageReadState.conversationId, conv.id),
          eq(messageReadState.userId, userId),
        ),
      )
      .limit(1);

    let unreadCount = readState?.unreadCount ?? 0;
    if (!readState && conv.channel === 'customer_admin') {
      // A new guest thread has no staff participants yet. A claimed guest
      // booking also has no account read state until its owner first opens it.
      const unreadConditions = [eq(bookingMessages.conversationId, conv.id),
        sql`${bookingMessages.senderId} IS DISTINCT FROM ${userId}::uuid`];
      if (role === 'customer') unreadConditions.push(sql`${bookingMessages.senderRole} != 'customer'`);
      if (role !== 'admin') unreadConditions.push(sql`${bookingMessages.messageType} != 'admin_note'`);
      const [unread] = await db.select({ count: sql<number>`count(*)::int` }).from(bookingMessages).where(and(...unreadConditions));
      unreadCount = unread?.count ?? 0;
    }

    result.push({
      id: conv.id,
      bookingId: conv.bookingId,
      scope: conv.bookingId ? 'booking' : 'direct_driver',
      bookingRef: conv.bookingId ? booking?.refNumber ?? '' : 'Direct chat',
      channel: conv.channel as ConversationSummary['channel'],
      status: conv.status as ConversationSummary['status'],
      locked: conv.locked ?? false,
      muted: conv.muted ?? false,
      customerName: booking?.customerName ?? '',
      driverId,
      driverName,
      lastMessageBody:
        lastMsg?.body ??
        (lastMsg?.messageType === 'audio' ? 'Voice message' : lastMsg?.messageType === 'image' ? 'Photo' : null),
      lastMessageAt: lastMsg?.createdAt?.toISOString() ?? null,
      lastMessageSenderRole: (lastMsg?.senderRole as ChatRole) ?? null,
      unreadCount,
      createdAt: conv.createdAt?.toISOString() ?? '',
    });
  }

  return result;
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

export async function markConversationRead(
  conversationId: string,
  userId: string,
): Promise<void> {
  // Get the latest message ID
  const [latest] = await db
    .select({ id: bookingMessages.id })
    .from(bookingMessages)
    .where(eq(bookingMessages.conversationId, conversationId))
    .orderBy(desc(bookingMessages.createdAt))
    .limit(1);

  const [existing] = await db
    .select({ id: messageReadState.id })
    .from(messageReadState)
    .where(
      and(
        eq(messageReadState.conversationId, conversationId),
        eq(messageReadState.userId, userId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(messageReadState)
      .set({
        lastReadMessageId: latest?.id ?? null,
        unreadCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(messageReadState.id, existing.id));
  } else {
    await db.insert(messageReadState).values({
      conversationId,
      userId,
      lastReadMessageId: latest?.id ?? null,
      unreadCount: 0,
    });
  }
}

/* ─── Get total unread count for a user ────────────────────────── */

export async function getTotalUnread(userId: string): Promise<number> {
  const rows = await db
    .select({ unreadCount: messageReadState.unreadCount })
    .from(messageReadState)
    .where(eq(messageReadState.userId, userId));

  return rows.reduce((sum, r) => sum + (r.unreadCount ?? 0), 0);
}
