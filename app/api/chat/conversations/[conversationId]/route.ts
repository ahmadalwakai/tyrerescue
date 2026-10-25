import { NextRequest, NextResponse } from 'next/server';
import { authMobile } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingConversations, messageAttachments, bookingMessages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getConversationDetail } from '@/lib/chat/queries';
import { resolveChatActor } from '@/lib/chat/customer-access';
import { getGuestUnreadCount } from '@/lib/chat/queries';

const adminControlSchema = z.object({
  lock: z.boolean().optional(),
  mute: z.boolean().optional(),
  close: z.boolean().optional(),
  archive: z.boolean().optional(),
  reopen: z.boolean().optional(),
  deleteAttachment: z.object({
    messageId: z.string().uuid(),
    attachmentId: z.string().uuid(),
  }).optional(),
});

type RouteContext = { params: Promise<{ conversationId: string }> };

/** GET /api/chat/conversations/[conversationId] — conversation detail */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const { conversationId } = await ctx.params;
  if (!z.string().uuid().safeParse(conversationId).success) return NextResponse.json({ error: 'Invalid conversation' }, { status: 400 });
  const actor = await resolveChatActor(req, conversationId);
  if (!actor) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const detail = await getConversationDetail(conversationId);
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // A customer does not need staff account IDs/names to contact the support team.
  return NextResponse.json({ ...detail, ...(actor.role === 'customer' ? { participants: [] } : {}),
    ...(actor.id === null ? { unreadCount: await getGuestUnreadCount(conversationId) } : {}) });
}

/** PATCH /api/chat/conversations/[conversationId] — admin controls */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const session = await authMobile(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { conversationId } = await ctx.params;

  const body = await req.json();
  const parsed = adminControlSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (data.lock !== undefined) updates.locked = data.lock;
  if (data.mute !== undefined) updates.muted = data.mute;
  if (data.close) updates.status = 'closed';
  if (data.archive) updates.status = 'archived';
  if (data.reopen) {
    updates.status = 'open';
    updates.locked = false;
  }

  if (Object.keys(updates).length > 1) {
    await db
      .update(bookingConversations)
      .set(updates)
      .where(eq(bookingConversations.id, conversationId));
  }

  // Soft-delete attachment
  if (data.deleteAttachment) {
    const { messageId, attachmentId } = data.deleteAttachment;
    // Verify attachment belongs to this conversation
    const [msg] = await db
      .select({ id: bookingMessages.id })
      .from(bookingMessages)
      .where(
        and(
          eq(bookingMessages.id, messageId),
          eq(bookingMessages.conversationId, conversationId),
        ),
      )
      .limit(1);

    if (msg) {
      await db
        .update(messageAttachments)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(messageAttachments.id, attachmentId),
            eq(messageAttachments.messageId, messageId),
          ),
        );
    }
  }

  return NextResponse.json({ success: true });
}
