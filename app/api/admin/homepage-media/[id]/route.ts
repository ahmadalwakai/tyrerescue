import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db, homepageMedia } from '@/lib/db';
import { eq, and, ne, asc, sql } from 'drizzle-orm';
import { z } from 'zod';

type RouteContext = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  src: z.string().min(1).optional(),
  alt: z.string().min(1).max(500).optional(),
  eyebrow: z.string().min(1).max(100).optional(),
  title: z.string().min(1).max(200).optional(),
  caption: z.string().max(500).nullable().optional(),
  objectPosition: z.string().max(50).optional(),
  animationStyle: z.enum(['fade', 'fadeZoom', 'fadePan', 'crossfade']).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

/** PATCH /api/admin/homepage-media/[id] — update a slide */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // If deactivating, ensure at least one other active slide remains
  if (parsed.data.isActive === false) {
    const activeCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(homepageMedia)
      .where(and(eq(homepageMedia.isActive, true), ne(homepageMedia.id, id)));

    if (activeCount[0].count < 1) {
      return NextResponse.json(
        { error: 'Cannot deactivate the last active slide' },
        { status: 400 },
      );
    }
  }

  const [updated] = await db
    .update(homepageMedia)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(homepageMedia.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Slide not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

/** DELETE /api/admin/homepage-media/[id] — delete a slide */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;

  // Guard: don't allow deleting the last active slide
  const [target] = await db
    .select({ isActive: homepageMedia.isActive })
    .from(homepageMedia)
    .where(eq(homepageMedia.id, id));

  if (!target) {
    return NextResponse.json({ error: 'Slide not found' }, { status: 404 });
  }

  if (target.isActive) {
    const activeCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(homepageMedia)
      .where(and(eq(homepageMedia.isActive, true), ne(homepageMedia.id, id)));

    if (activeCount[0].count < 1) {
      return NextResponse.json(
        { error: 'Cannot delete the last active slide' },
        { status: 400 },
      );
    }
  }

  await db.delete(homepageMedia).where(eq(homepageMedia.id, id));

  return NextResponse.json({ success: true });
}
