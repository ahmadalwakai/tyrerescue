import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tyreCatalogue, auditLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateSchema = z.object({
  brand: z.string().min(1).max(100).optional(),
  pattern: z.string().min(1).max(200).optional(),
  season: z.enum(['summer', 'winter', 'allseason']).optional(),
  speed_rating: z.string().max(5).optional(),
  tier: z.enum(['budget', 'mid', 'premium']).optional(),
  suggested_price_new: z.number().min(0).optional(),
});

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
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(tyreCatalogue)
    .where(eq(tyreCatalogue.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.brand !== undefined) updates.brand = parsed.data.brand;
  if (parsed.data.pattern !== undefined) updates.pattern = parsed.data.pattern;
  if (parsed.data.season !== undefined) updates.season = parsed.data.season;
  if (parsed.data.speed_rating !== undefined) updates.speedRating = parsed.data.speed_rating;

  if (Object.keys(updates).length > 0) {
    await db.update(tyreCatalogue).set(updates).where(eq(tyreCatalogue.id, id));
  }

  // Audit log
  await db.insert(auditLogs).values({
    actorUserId: session.user.id,
    actorRole: 'admin',
    entityType: 'tyre_catalogue',
    entityId: id,
    action: 'update_catalogue',
    beforeJson: existing,
    afterJson: { ...existing, ...updates },
  });

  const [updated] = await db
    .select()
    .from(tyreCatalogue)
    .where(eq(tyreCatalogue.id, id))
    .limit(1);

  return NextResponse.json(updated);
}
