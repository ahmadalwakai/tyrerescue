import { NextRequest, NextResponse } from 'next/server';
import { authMobile } from '@/lib/auth';
import { z } from 'zod';
import { canSendMessage, ensureParticipant } from '@/lib/chat/permissions';
import { getMessages, sendMessage } from '@/lib/chat/queries';
import type { ChatRole, MessageType } from '@/lib/chat/types';
import { createAdminNotification } from '@/lib/notifications';
import { notifyDriverNewMessage } from '@/lib/notifications/driver-push';
import { db, bookingConversations, bookings, conversationParticipants, drivers } from '@/lib/db';
import { and, eq } from 'drizzle-orm';

const sendSchema = z.object({
  body: z.string().max(5000).nullable(),
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
  const session = await authMobile(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await ctx.params;
  const role = session.user.role as ChatRole;

  // Access check is done inside getMessages via permission check
  const { canSendMessage: perm } = await import('@/lib/chat/permissions');
  const check = await perm({ id: session.user.id, role }, conversationId);
  // Even if locked, reading is allowed for participants
  const { canAccessConversation } = await import('@/lib/chat/permissions');
  const hasAccess = await canAccessConversation({ id: session.user.id, role }, conversationId);
  if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const cursor = req.nextUrl.searchParams.get('cursor') ?? undefined;
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10), 100);

  const result = await getMessages(conversationId, role, cursor, limit);
  return NextResponse.json({
    ...result,
    messages: result.messages.map((message) => normalizeMessageUploadUrls(message, req)),
  });
}

/** POST /api/chat/conversations/[conversationId]/messages — send a message */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const session = await authMobile(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await ctx.params;
  const role = session.user.role as ChatRole;

  // Permission check
  const check = await canSendMessage({ id: session.user.id, role }, conversationId);
  if (!check.allowed) {
    return NextResponse.json({ error: check.reason }, { status: 403 });
  }

  const body = await req.json();
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }

  const { body: msgBody, messageType, attachment } = parsed.data;

  // Only admins can send admin_note
  if (messageType === 'admin_note' && role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can post internal notes' }, { status: 403 });
  }

  // Must have body or attachment
  if (!msgBody && !attachment) {
    return NextResponse.json({ error: 'Message must have text or an attachment' }, { status: 400 });
  }

  if (messageType === 'audio' && !attachment?.mimeType.toLowerCase().startsWith('audio/')) {
    return NextResponse.json({ error: 'Voice messages must include an audio attachment' }, { status: 400 });
  }

  if (messageType === 'image' && !attachment?.mimeType.toLowerCase().startsWith('image/')) {
    return NextResponse.json({ error: 'Image messages must include an image attachment' }, { status: 400 });
  }

  // Ensure sender is a participant
  await ensureParticipant(conversationId, session.user.id, role);

  const message = await sendMessage(
    conversationId,
    session.user.id,
    role,
    msgBody,
    messageType as MessageType,
    attachment,
  );

  const [convContext] = await db
    .select({
      bookingId: bookingConversations.bookingId,
      bookingRef: bookings.refNumber,
      driverId: bookings.driverId,
      customerName: bookings.customerName,
      customerPhone: bookings.customerPhone,
    })
    .from(bookingConversations)
    .innerJoin(bookings, eq(bookings.id, bookingConversations.bookingId))
    .where(eq(bookingConversations.id, conversationId))
    .limit(1);

  const adminLink = convContext?.bookingRef
    ? `/admin/bookings/${convContext.bookingRef}`
    : '/admin/chat';

  // Notify admin when a customer or driver sends a message
  if (role !== 'admin') {
    createAdminNotification({
      type: 'chat.message.received',
      title: 'New Chat Message',
      body: `${role === 'driver' ? 'Driver' : 'Customer'}: ${msgBody?.slice(0, 80) || attachmentPreview(messageType)}`,
      entityType: 'chat',
      entityId: conversationId,
      link: adminLink,
      severity: 'info',
      createdBy: 'system',
      metadata: {
        refNumber: convContext?.bookingRef,
        customerName: convContext?.customerName,
        customerPhone: convContext?.customerPhone,
        chatSenderRole: role,
        chatPreview: msgBody?.slice(0, 160) || attachmentPreview(messageType),
        important: true,
        updateType: 'created',
        adminPath: adminLink,
      },
    }).catch(console.error);
  }

  // Notify driver via push when admin or customer sends a message
  if (role !== 'driver') {
    (async () => {
      try {
        const [participantDriver] = await db
          .select({ driverId: drivers.id })
          .from(conversationParticipants)
          .innerJoin(drivers, eq(drivers.userId, conversationParticipants.userId))
          .where(
            and(
              eq(conversationParticipants.conversationId, conversationId),
              eq(conversationParticipants.role, 'driver'),
            ),
          )
          .limit(1);
        const notifyDriverId = participantDriver?.driverId ?? convContext?.driverId;
        if (!notifyDriverId) return;
        await notifyDriverNewMessage(
          notifyDriverId,
          conversationId,
          session.user.name ?? (role === 'admin' ? 'Admin' : 'Customer'),
          msgBody?.slice(0, 100) || attachmentPreview(messageType),
        );
      } catch (err) {
        console.error('[chat] Failed to notify driver:', err);
      }
    })();
  }

  return NextResponse.json(normalizeMessageUploadUrls(message, req), { status: 201 });
}
