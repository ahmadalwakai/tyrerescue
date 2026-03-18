import { NextRequest, NextResponse } from 'next/server';
import { authMobile } from '@/lib/auth';
import { getTotalUnread } from '@/lib/chat/queries';

/** GET /api/chat/unread — total unread count for current user */
export async function GET(req: NextRequest) {
  const session = await authMobile(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const count = await getTotalUnread(session.user.id);
  return NextResponse.json({ unread: count });
}
