import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureParticipant } from '@/lib/chat/permissions';
import { getMessageById, getMessages, sendMessage } from '@/lib/chat/queries';
import type { MessageType } from '@/lib/chat/types';
import { createAdminNotification } from '@/lib/notifications';
import { notifyDriverNewMessage } from '@/lib/notifications/driver-push';
import { db, bookingConversations, bookings, conversationParticipants, drivers } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { canChatActorSend, resolveChatActor } from '@/lib/chat/customer-access';
import { sendAdminExpoPush } from '@/lib/notifications/expo-admin-push';
import { notifyCustomerChatMessage } from '@/lib/notifications/customer-push';

const sendSchema = z.object({
  body: z.string().max(5000).nullable(),
  clientMessageId: z.string().uuid().optional(),
  messageType: z.enum(['text', 'image', 'audio', 'admin_note']).default('text'),
  attachment: z.object({
    url: z.string().url(),
    mimeType: z.string(),
    fileSize: z.number().int().positive(),
    fileName: z.string().optional(),
  }).optional(),
});

type RouteContext = { params: Promise<{ conversationId: string }> };

function attachmentPreview(messageType: MessageType): string {
  if (messageType === 'audio') return 'Sent a voice message';
  if (messageType === 'image') return 'Sent a photo';
  return 'Sent an attachment';
}

function getRequestOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host;
  const protocol = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '') ?? 'http';
  return `${protocol}://${host}`;
}

function normalizeLocalChatUploadUrl(rawUrl: string, request: NextRequest): string {
  try {
    const url = new URL(rawUrl);
    const staticPrefix = '/uploads/chat-attachments/';
    const apiPrefix = '/api/chat/uploads/';
    if (url.pathname.startsWith(staticPrefix)) {
      return new URL(`${apiPrefix}${url.pathname.slice(staticPrefix.length)}`, getRequestOrigin(request)).toString();
    }
    if (url.pathname.startsWith(apiPrefix) && ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname)) {
      return new URL(url.pathname, getRequestOrigin(request)).toString();
    }
  } catch {
    // Keep remote blob URLs and unexpected values unchanged.
  }
  return rawUrl;
}

function normalizeMessageUploadUrls<T extends { attachments: { url: string }[] }>(message: T, request: NextRequest): T {
  return {
    ...message,
    attachments: message.attachments.map((attachment) => ({
      ...attachment,
      url: normalizeLocalChatUploadUrl(attachment.url, request),
    })),
  };
}

/** GET /api/chat/conversations/[conversationId]/messages — paginated messages */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const { conversationId } = await ctx.params;
  if (!z.string().uuid().safeParse(conversationId).success) return NextResponse.json({ error: 'Invalid conversation' }, { status: 400 });
  const actor = await resolveChatActor(req, conversationId);
  if (!actor) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const cursor = req.nextUrl.searchParams.get('cursor') ?? undefined;
  const rawLimit = Number(req.nextUrl.searchParams.get('limit') ?? '50');
  if ((cursor && !z.string().uuid().safeParse(cursor).success) || !Number.isInteger(rawLimit) || rawLimit < 1) {
    return NextResponse.json({ error: 'Invalid pagination' }, { status: 400 });
  }
  if (actor.id) await ensureParticipant(conversationId, actor.id, actor.role);
  const result = await getMessages(conversationId, actor.role, cursor, Math.min(rawLimit, 100));
  return NextResponse.json({
    ...result,
    messages: result.messages.map((message) => normalizeMessageUploadUrls(message, req)),
  });
}

/** POST /api/chat/conversations/[conversationId]/messages — send a message */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { conversationId } = await ctx.params;
  if (!z.string().uuid().safeParse(conversationId).success) return NextResponse.json({ error: 'Invalid conversation' }, { status: 400 });
  const actor = await resolveChatActor(req, conversationId);
  if (!actor) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const { role } = actor;

  // Permission check
  const check = await canChatActorSend(actor, conversationId);
  if (!check.allowed) {
    return NextResponse.json({ error: check.reason }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }

  const { body: msgBody, messageType, attachment, clientMessageId } = parsed.data;

  // Only admins can send admin_note
  if (messageType === 'admin_note' && role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can post internal notes' }, { status: 403 });
  }

  // Must have body or attachment
  if (!msgBody?.trim() && !attachment) {
    return NextResponse.json({ error: 'Message must have text or an attachment' }, { status: 400 });
  }

  // Guest messages are text only until media has booking-scoped private storage.
  if (actor.id === null && (attachment || messageType !== 'text')) {
    return NextResponse.json({ error: 'Guest chat currently supports text messages' }, { status: 400 });
  }

  if (messageType === 'audio' && !attachment?.mimeType.toLowerCase().startsWith('audio/')) {
    return NextResponse.json({ error: 'Voice messages must include an audio attachment' }, { status: 400 });
  }

  if (messageType === 'image' && !attachment?.mimeType.toLowerCase().startsWith('image/')) {
    return NextResponse.json({ error: 'Image messages must include an image attachment' }, { status: 400 });
  }

  // Ensure sender is a participant
  if (actor.id) await ensureParticipant(conversationId, actor.id, role);

  const findReplay = async () => {
    if (!clientMessageId) return null;
    const existing = await getMessageById(conversationId, clientMessageId, role);
    if (!existing) return null;
    if (existing.senderId !== actor.id || existing.senderRole !== role || existing.body !== msgBody || existing.messageType !== messageType ||
        JSON.stringify(existing.attachments.map((item) => ({ url: item.url, mimeType: item.mimeType, fileSize: item.fileSize, fileName: item.fileName ?? null }))) !==
          JSON.stringify(attachment ? [{ url: attachment.url, mimeType: attachment.mimeType, fileSize: attachment.fileSize, fileName: attachment.fileName ?? null }] : [])) {
      return NextResponse.json({ error: 'Message identifier is already in use' }, { status: 409 });
    }
    return NextResponse.json(normalizeMessageUploadUrls(existing, req), { status: 201 });
  };
  const replay = await findReplay();
  if (replay) return replay;
  let message;
  try { message = await sendMessage(
    conversationId,
    actor.id,
    role,
    msgBody,
    messageType as MessageType,
    attachment,
    clientMessageId,
  ); } catch (error) {
    // A retried or overlapping send keeps the same ID and never inserts twice.
    const duplicate = clientMessageId ? await findReplay() : null;
    if (duplicate) return duplicate;
    throw error;
  }

  const [convContext] = await db
    .select({
      bookingId: bookingConversations.bookingId,
      channel: bookingConversations.channel,
      bookingRef: bookings.refNumber,
      driverId: bookings.driverId,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
    })
    .from(bookingConversations)
    .leftJoin(bookings, eq(bookings.id, bookingConversations.bookingId))
    .where(eq(bookingConversations.id, conversationId))
    .limit(1);

  const adminLink = convContext?.bookingRef
    ? `/admin/bookings/${convContext.bookingRef}`
    : '/admin/chat';

  const notificationTasks: Promise<unknown>[] = [];
  // Await dispatch so a serverless request cannot end before the push is sent.
  if (role !== 'admin') {
    notificationTasks.push(createAdminNotification({
      type: 'chat.message.received',
      title: 'New Chat Message',
      body: `${role === 'driver' ? 'Driver' : 'Customer'}: ${msgBody?.slice(0, 80) || attachmentPreview(messageType)}`,
      entityType: 'chat',
      entityId: conversationId,
      link: adminLink,
      severity: 'info',
      createdBy: 'system',
      metadata: {
        refNumber: convContext?.bookingRef ?? undefined,
        conversationId,
        chatScope: convContext?.bookingId ? 'booking' : 'direct_driver',
        customerName: convContext?.customerName ?? undefined,
        customerPhone: convContext?.customerPhone ?? undefined,
        chatSenderRole: role,
        chatPreview: msgBody?.slice(0, 160) || attachmentPreview(messageType),
        important: true,
        updateType: 'created',
        adminPath: adminLink,
      },
    }));
    if (convContext?.channel === 'customer_admin') notificationTasks.push(sendAdminExpoPush({
      title: 'Customer message', body: 'A customer has sent a message to Tyre Rescue.',
      platforms: ['ios'], channelId: 'messages_v2', ttl: 600,
      data: { type: 'chat_message', conversationId, bookingId: convContext.bookingId, refNumber: convContext.bookingRef },
    }));
    // Staff/driver threads previously reached only web push and email, so the
    // iOS inbox missed driver messages. The payload carries no message text.
    if (role === 'driver' && convContext?.channel === 'admin_driver') notificationTasks.push(sendAdminExpoPush({
      title: 'Driver message', body: 'A driver has sent a message to Tyre Rescue.',
      platforms: ['ios'], channelId: 'messages_v2', ttl: 600,
      data: { type: 'driver_chat_message', conversationId, bookingId: convContext.bookingId, refNumber: convContext.bookingRef },
    }));
  }

  if (role === 'admin' && messageType !== 'admin_note' && convContext?.channel === 'customer_admin' && convContext.bookingId) {
    notificationTasks.push(notifyCustomerChatMessage({ bookingId: convContext.bookingId, conversationId }));
  }

  // A customer/admin conversation never sends its content to a driver.
  if (role !== 'driver' && messageType !== 'admin_note' &&
      (convContext?.channel === 'admin_driver' || convContext?.channel === 'customer_driver')) {
    notificationTasks.push((async () => {
      try {
        const [directDriver] = convContext?.bookingId === null ? await db
          .select({ driverId: bookingConversations.directDriverId })
          .from(bookingConversations)
          .where(eq(bookingConversations.id, conversationId))
          .limit(1) : [];
        const [participantDriver] = convContext?.bookingId !== null ? await db
          .select({ driverId: drivers.id })
          .from(conversationParticipants)
          .innerJoin(drivers, eq(drivers.userId, conversationParticipants.userId))
          .where(
            and(
              eq(conversationParticipants.conversationId, conversationId),
              eq(conversationParticipants.role, 'driver'),
            ),
          )
          .limit(1) : [];
        const notifyDriverId = directDriver?.driverId ?? participantDriver?.driverId ?? convContext?.driverId;
        if (!notifyDriverId) return;
        await notifyDriverNewMessage(
          notifyDriverId,
          conversationId,
          actor.name,
          msgBody?.slice(0, 100) || attachmentPreview(messageType),
        );
      } catch (err) {
        console.error('[chat] Failed to notify driver:', err);
      }
    })());
  }

  await Promise.allSettled(notificationTasks);

  return NextResponse.json(normalizeMessageUploadUrls(message, req), { status: 201 });
}
