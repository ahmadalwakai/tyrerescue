import { NextRequest, NextResponse } from 'next/server';
import { markConversationRead } from '@/lib/chat/queries';
import { resolveChatActor } from '@/lib/chat/customer-access';
import { markGuestConversationRead } from '@/lib/chat/queries';
import { z } from 'zod';
import { ensureParticipant } from '@/lib/chat/permissions';

type RouteContext = { params: Promise<{ conversationId: string }> };

/** POST /api/chat/conversations/[conversationId]/read — mark conversation as read */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { conversationId } = await ctx.params;
  if (!z.string().uuid().safeParse(conversationId).success) return NextResponse.json({ error: 'Invalid conversation' }, { status: 400 });
  const actor = await resolveChatActor(req, conversationId);
  if (!actor) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  if (actor.id) {
    await ensureParticipant(conversationId, actor.id, actor.role);
    await markConversationRead(conversationId, actor.id);
  }
  else {
    const body = await req.json().catch(() => null);
    const parsed = z.object({ lastReadMessageId: z.string().uuid() }).safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid read marker' }, { status: 400 });
    await markGuestConversationRead(conversationId, parsed.data.lastReadMessageId);
  }
  return NextResponse.json({ success: true });
}
