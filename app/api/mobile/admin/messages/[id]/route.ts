import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, contactMessages } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const status = String(body?.status || '');

  if (!['unread', 'read', 'replied', 'archived'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const { id } = await params;

  await db
    .update(contactMessages)
    .set({
      status,
      repliedAt: status === 'replied' ? new Date() : undefined,
      repliedBy: status === 'replied' ? user.id : undefined,
    })
    .where(eq(contactMessages.id, id));

  return NextResponse.json({ success: true });
}
