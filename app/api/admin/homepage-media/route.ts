import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db, homepageMedia } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';
import { z } from 'zod';

/** GET /api/admin/homepage-media — list all slides (admin only) */
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const slides = await db
    .select()
    .from(homepageMedia)
    .orderBy(asc(homepageMedia.sortOrder));

  return NextResponse.json(slides);
}

const createSchema = z.object({
  src: z.string().min(1),
  alt: z.string().min(1).max(500),
  eyebrow: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  caption: z.string().max(500).optional(),
  objectPosition: z.string().max(50).default('center center'),
  animationStyle: z.enum(['fade', 'fadeZoom', 'fadePan', 'crossfade']).default('fadeZoom'),
  isActive: z.boolean().default(true),
});

/** POST /api/admin/homepage-media — create a new slide */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Get max sort order to append at end
  const existing = await db
    .select({ sortOrder: homepageMedia.sortOrder })
    .from(homepageMedia)
    .orderBy(asc(homepageMedia.sortOrder));

  const nextOrder = existing.length > 0
    ? Math.max(...existing.map((e) => e.sortOrder)) + 1
    : 0;

  const [slide] = await db
    .insert(homepageMedia)
    .values({ ...parsed.data, sortOrder: nextOrder })
    .returning();

  return NextResponse.json(slide, { status: 201 });
}
