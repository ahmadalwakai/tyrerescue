import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cookieSettings, auditLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const patchSchema = z.object({ value: z.string() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { key } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(cookieSettings)
    .where(eq(cookieSettings.key, key))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'Setting not found' }, { status: 404 });
  }

  const [updated] = await db
    .update(cookieSettings)
    .set({
      value: parsed.data.value,
      updatedBy: session.user.id,
      updatedAt: new Date(),
    })
    .where(eq(cookieSettings.key, key))
    .returning();

  await db.insert(auditLogs).values({
    actorUserId: session.user.id,
    actorRole: session.user.role,
    entityType: 'cookie_setting',
    entityId: existing.id,
    action: 'update',
    beforeJson: { key: existing.key, value: existing.value },
    afterJson: { key: updated.key, value: updated.value },
  });

  return NextResponse.json(updated);
}
