import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db, homepageMedia } from '@/lib/db';
import { z } from 'zod';

const schema = z.object({
  animationStyle: z.enum(['fade', 'fadeZoom', 'fadePan', 'crossfade']),
});

/** PUT /api/admin/homepage-media/animation — bulk-update animation style for all slides */
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await db.update(homepageMedia).set({
    animationStyle: parsed.data.animationStyle,
    updatedAt: new Date(),
  });

  return NextResponse.json({ success: true, animationStyle: parsed.data.animationStyle });
}
