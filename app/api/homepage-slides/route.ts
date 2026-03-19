import { NextResponse } from 'next/server';
import { db, homepageMedia } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';

/** GET /api/homepage-slides — public endpoint returning active homepage slides */
export async function GET() {
  const slides = await db
    .select({
      id: homepageMedia.id,
      src: homepageMedia.src,
      alt: homepageMedia.alt,
      eyebrow: homepageMedia.eyebrow,
      title: homepageMedia.title,
      caption: homepageMedia.caption,
      objectPosition: homepageMedia.objectPosition,
      animationStyle: homepageMedia.animationStyle,
    })
    .from(homepageMedia)
    .where(eq(homepageMedia.isActive, true))
    .orderBy(asc(homepageMedia.sortOrder));

  return NextResponse.json(slides, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
