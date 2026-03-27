import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, callMeBack } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const status = String(body?.status || '');

  if (!['pending', 'resolved', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const { id } = await params;

  await db
    .update(callMeBack)
    .set({
      status,
      resolvedAt: status === 'resolved' ? new Date() : null,
      resolvedBy: status === 'resolved' ? user.id : null,
    })
    .where(eq(callMeBack.id, id));

  return NextResponse.json({ success: true });
}
