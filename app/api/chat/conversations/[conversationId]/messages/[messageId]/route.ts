import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authMobile } from '@/lib/auth';
import { canAccessConversation } from '@/lib/chat/permissions';
import { deleteMessage, editMessage, getMessageById } from '@/lib/chat/queries';
import type { ChatRole } from '@/lib/chat/types';

const updateMessageSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('edit'),
    body: z.string().trim().min(1).max(5000),
  }),
  z.object({
    action: z.literal('delete'),
  }),
]);

type RouteContext = { params: Promise<{ conversationId: string; messageId: string }> };

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
    // Keep remote URLs and unexpected values unchanged.
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

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const session = await authMobile(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId, messageId } = await ctx.params;
  const role = session.user.role as ChatRole;

  const hasAccess = await canAccessConversation({ id: session.user.id, role }, conversationId);
  if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const parsed = updateMessageSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }

  const message = await getMessageById(conversationId, messageId, role);
  if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

  if (parsed.data.action === 'edit') {
    if (message.deleted) {
      return NextResponse.json({ error: 'Deleted messages cannot be edited' }, { status: 400 });
    }
    if (message.senderId !== session.user.id) {
      return NextResponse.json({ error: 'Only the sender can edit this message' }, { status: 403 });
    }
    if (message.messageType !== 'text' && message.messageType !== 'admin_note') {
      return NextResponse.json({ error: 'Only text messages can be edited' }, { status: 400 });
    }
    if (message.messageType === 'admin_note' && role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can edit internal notes' }, { status: 403 });
    }

    const updated = await editMessage(conversationId, messageId, parsed.data.body);
    if (!updated) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    return NextResponse.json(normalizeMessageUploadUrls(updated, req));
  }

  if (message.senderId !== session.user.id && role !== 'admin') {
    return NextResponse.json({ error: 'Only the sender or an admin can delete this message' }, { status: 403 });
  }

  const updated = await deleteMessage(conversationId, messageId);
  if (!updated) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  return NextResponse.json(normalizeMessageUploadUrls(updated, req));
}
