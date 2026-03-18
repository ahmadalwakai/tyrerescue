import { db } from '@/lib/db';
import {
  bookingConversations,
  conversationParticipants,
  bookingMessages,
  messageAttachments,
  messageReadState,
  bookings,
  drivers,
  users,
} from '@/lib/db/schema';
import { eq, and, desc, sql, inArray, isNull } from 'drizzle-orm';
import type {
  ChatChannel,
  ChatRole,
  ConversationSummary,
  MessageView,
  ConversationDetail,
} from './types';

/* ─── Get or create a conversation for a booking + channel ──────── */

export async function getOrCreateConversation(
  bookingId: string,
  channel: ChatChannel,
  initiatorUserId: string,
  initiatorRole: ChatRole,
): Promise<string> {
  // Check for existing
  const [existing] = await db
    .select({ id: bookingConversations.id })
    .from(bookingConversations)
    .where(
      and(
        eq(bookingConversations.bookingId, bookingId),
        eq(bookingConversations.channel, channel),
      ),
    )
    .limit(1);

  if (existing) return existing.id;

  // Create new
  const [conv] = await db
    .insert(bookingConversations)
    .values({ bookingId, channel })
    .returning({ id: bookingConversations.id });

  // Add initiator as participant
  await db.insert(conversationParticipants).values({
    conversationId: conv.id,
    userId: initiatorUserId,
    role: initiatorRole,
  });

  // Initialize their read state
  await db.insert(messageReadState).values({
    conversationId: conv.id,
    userId: initiatorUserId,
    unreadCount: 0,
  });

  return conv.id;
}

/* ─── List conversations for a user (role-scoped) ──────────────── */

export async function listConversations(
  userId: string,
  role: ChatRole,
  filters?: { bookingRef?: string; status?: string; channel?: string },
): Promise<ConversationSummary[]> {
  // Build base query conditions
  const conditions: ReturnType<typeof eq>[] = [];

  if (filters?.status) {
    conditions.push(eq(bookingConversations.status, filters.status));
  }
  if (filters?.channel) {
    conditions.push(eq(bookingConversations.channel, filters.channel));
  }

  // Role-scoped: get relevant booking IDs first
  let bookingIds: string[] | null = null;

  if (role === 'customer') {
    const rows = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.userId, userId));
    bookingIds = rows.map((r) => r.id);
  } else if (role === 'driver') {
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.userId, userId))
      .limit(1);
    if (!driver) return [];
    const rows = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.driverId, driver.id));
    bookingIds = rows.map((r) => r.id);
  }
  // admin: bookingIds stays null → no booking filter

  if (bookingIds !== null && bookingIds.length === 0) return [];

  // Filter by booking ref if given
  if (filters?.bookingRef) {
    const [b] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.refNumber, filters.bookingRef))
      .limit(1);
    if (!b) return [];
    if (bookingIds) {
      if (!bookingIds.includes(b.id)) return [];
      bookingIds = [b.id];
    } else {
      bookingIds = [b.id];
    }
  }

  if (bookingIds !== null) {
    conditions.push(inArray(bookingConversations.bookingId, bookingIds));
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
    const [booking] = await db
      .select({
        refNumber: bookings.refNumber,
        customerName: bookings.customerName,
        driverId: bookings.driverId,
      })
      .from(bookings)
      .where(eq(bookings.id, conv.bookingId))
      .limit(1);

    let driverName: string | null = null;
    if (booking?.driverId) {
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
      // exclude admin_note type — we can't use ne easily, so use raw sql
    }
    const [lastMsg] = await db
      .select({
        body: bookingMessages.body,
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

    result.push({
      id: conv.id,
      bookingId: conv.bookingId,
      bookingRef: booking?.refNumber ?? '',
      channel: conv.channel as ConversationSummary['channel'],
      status: conv.status as ConversationSummary['status'],
      locked: conv.locked ?? false,
      muted: conv.muted ?? false,
      customerName: booking?.customerName ?? '',
      driverName,
      lastMessageBody: lastMsg?.body ?? null,
      lastMessageAt: lastMsg?.createdAt?.toISOString() ?? null,
      lastMessageSenderRole: (lastMsg?.senderRole as ChatRole) ?? null,
      unreadCount: readState?.unreadCount ?? 0,
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
    .select()
    .from(bookingConversations)
    .where(eq(bookingConversations.id, conversationId))
    .limit(1);

  if (!conv) return null;

  const [booking] = await db
    .select({ refNumber: bookings.refNumber })
    .from(bookings)
    .where(eq(bookings.id, conv.bookingId))
    .limit(1);

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
    bookingRef: booking?.refNumber ?? '',
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
    conditions.push(sql`${bookingMessages.createdAt} < (SELECT created_at FROM booking_messages WHERE id = ${cursor})`);
  }

  const rows = await db
    .select()
    .from(bookingMessages)
    .where(and(...conditions))
    .orderBy(desc(bookingMessages.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const messageRows = hasMore ? rows.slice(0, limit) : rows;

  const messages: MessageView[] = [];
  for (const m of messageRows) {
    const [sender] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, m.senderId))
      .limit(1);

    const attachments = await db
      .select()
      .from(messageAttachments)
      .where(eq(messageAttachments.messageId, m.id));

    messages.push({
      id: m.id,
      senderId: m.senderId,
      senderName: sender?.name ?? 'Unknown',
      senderRole: m.senderRole as ChatRole,
      body: m.body,
      messageType: m.messageType as MessageView['messageType'],
      deliveryStatus: m.deliveryStatus as MessageView['deliveryStatus'],
      attachments: attachments.map((a) => ({
        id: a.id,
        url: a.url,
        mimeType: a.mimeType,
        fileSize: a.fileSize,
        fileName: a.fileName,
        deleted: a.deletedAt !== null,
      })),
      createdAt: m.createdAt?.toISOString() ?? '',
    });
  }

  // Reverse so oldest first
  messages.reverse();

  return {
    messages,
    nextCursor: hasMore ? messageRows[messageRows.length - 1].id : null,
  };
}

/* ─── Send a message ───────────────────────────────────────────── */

export async function sendMessage(
  conversationId: string,
  senderId: string,
  senderRole: ChatRole,
  body: string | null,
  messageType: 'text' | 'image' | 'admin_note' = 'text',
  attachmentData?: { url: string; mimeType: string; fileSize: number; fileName?: string },
): Promise<MessageView> {
  const [msg] = await db
    .insert(bookingMessages)
    .values({
      conversationId,
      senderId,
      senderRole,
      body,
      messageType,
      deliveryStatus: 'sent',
    })
    .returning();

  // Create attachment if provided
  let attachments: MessageView['attachments'] = [];
  if (attachmentData) {
    const [att] = await db
      .insert(messageAttachments)
      .values({
        messageId: msg.id,
        url: attachmentData.url,
        mimeType: attachmentData.mimeType,
        fileSize: attachmentData.fileSize,
        fileName: attachmentData.fileName ?? null,
      })
      .returning();
    attachments = [
      {
        id: att.id,
        url: att.url,
        mimeType: att.mimeType,
        fileSize: att.fileSize,
        fileName: att.fileName,
        deleted: false,
      },
    ];
  }

  // Update conversation updatedAt
  await db
    .update(bookingConversations)
    .set({ updatedAt: new Date() })
    .where(eq(bookingConversations.id, conversationId));

  // Increment unread count for all OTHER participants
  const participants = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId));

  for (const p of participants) {
    if (p.userId === senderId) continue;
    // admin_note should not increment unread for non-admin
    if (messageType === 'admin_note') {
      // Only increment for other admins (we'll check role)
      const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, p.userId))
        .limit(1);
      if (user?.role !== 'admin') continue;
    }

    const [existing] = await db
      .select({ id: messageReadState.id, unreadCount: messageReadState.unreadCount })
      .from(messageReadState)
      .where(
        and(
          eq(messageReadState.conversationId, conversationId),
          eq(messageReadState.userId, p.userId),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(messageReadState)
        .set({ unreadCount: (existing.unreadCount ?? 0) + 1, updatedAt: new Date() })
        .where(eq(messageReadState.id, existing.id));
    } else {
      await db.insert(messageReadState).values({
        conversationId,
        userId: p.userId,
        unreadCount: 1,
      });
    }
  }

  const [sender] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, senderId))
    .limit(1);

  return {
    id: msg.id,
    senderId: msg.senderId,
    senderName: sender?.name ?? 'Unknown',
    senderRole: msg.senderRole as ChatRole,
    body: msg.body,
    messageType: msg.messageType as MessageView['messageType'],
    deliveryStatus: 'sent',
    attachments,
    createdAt: msg.createdAt?.toISOString() ?? '',
  };
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
