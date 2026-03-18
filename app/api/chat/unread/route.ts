import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getTotalUnread } from '@/lib/chat/queries';

/** GET /api/chat/unread — total unread count for current user */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const count = await getTotalUnread(session.user.id);
  return NextResponse.json({ unread: count });
}
