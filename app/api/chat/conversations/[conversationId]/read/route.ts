import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { canAccessConversation } from '@/lib/chat/permissions';
import { markConversationRead } from '@/lib/chat/queries';
import type { ChatRole } from '@/lib/chat/types';

type RouteContext = { params: Promise<{ conversationId: string }> };

/** POST /api/chat/conversations/[conversationId]/read — mark conversation as read */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await ctx.params;
  const role = session.user.role as ChatRole;

  const hasAccess = await canAccessConversation({ id: session.user.id, role }, conversationId);
  if (!hasAccess) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  await markConversationRead(conversationId, session.user.id);
  return NextResponse.json({ success: true });
}
