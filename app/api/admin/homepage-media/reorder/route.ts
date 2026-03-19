import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db, homepageMedia } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const reorderSchema = z.object({
  /** Ordered array of slide IDs in the desired sort order */
  ids: z.array(z.string().uuid()).min(1),
});

/** PUT /api/admin/homepage-media/reorder — bulk-update sort order */
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Update each slide's sortOrder based on array position
  const updates = parsed.data.ids.map((id, index) =>
    db.update(homepageMedia)
      .set({ sortOrder: index, updatedAt: new Date() })
      .where(eq(homepageMedia.id, id)),
  );

  await Promise.all(updates);

  return NextResponse.json({ success: true });
}
