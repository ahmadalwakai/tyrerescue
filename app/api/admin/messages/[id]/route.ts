import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { contactMessages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { status } = body;

  if (!['unread', 'read', 'replied', 'archived'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  await db
    .update(contactMessages)
    .set({
      status,
      repliedAt: status === 'replied' ? new Date() : undefined,
      repliedBy: status === 'replied' ? session.user.id : undefined,
    })
    .where(eq(contactMessages.id, id));

  return NextResponse.json({ success: true });
}
