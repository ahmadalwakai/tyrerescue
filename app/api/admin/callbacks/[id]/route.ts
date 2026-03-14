import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { callMeBack } from '@/lib/db/schema';
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

  if (!['pending', 'resolved', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  await db
    .update(callMeBack)
    .set({
      status,
      resolvedAt: status === 'resolved' ? new Date() : null,
      resolvedBy: status === 'resolved' ? session.user.id : null,
    })
    .where(eq(callMeBack.id, id));

  return NextResponse.json({ success: true });
}
