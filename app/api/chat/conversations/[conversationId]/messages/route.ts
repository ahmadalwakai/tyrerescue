import { NextRequest, NextResponse } from 'next/server';
import { authMobile } from '@/lib/auth';
import { z } from 'zod';
import { canSendMessage, ensureParticipant } from '@/lib/chat/permissions';
import { getMessages, sendMessage } from '@/lib/chat/queries';
import type { ChatRole, MessageType } from '@/lib/chat/types';
import { createAdminNotification } from '@/lib/notifications';

const sendSchema = z.object({
  body: z.string().max(5000).nullable(),
  messageType: z.enum(['text', 'image', 'admin_note']).default('text'),
  attachment: z.object({
    url: z.string().url(),
    mimeType: z.string(),
    fileSize: z.number().int().positive(),
    fileName: z.string().optional(),
  }).optional(),
});

type RouteContext = { params: Promise<{ conversationId: string }> };

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
  return NextResponse.json(result);
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

  // Notify admin when a customer or driver sends a message
  if (role !== 'admin') {
    createAdminNotification({
      type: 'chat.message.received',
      title: 'New Chat Message',
      body: `${role === 'driver' ? 'Driver' : 'Customer'}: ${msgBody?.slice(0, 80) || 'Sent an attachment'}`,
      entityType: 'chat',
      entityId: conversationId,
      link: `/admin/chat/${conversationId}`,
      severity: 'info',
      createdBy: 'system',
    }).catch(console.error);
  }

  return NextResponse.json(message, { status: 201 });
}
