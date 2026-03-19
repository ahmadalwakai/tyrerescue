import { db, homepageMedia } from '@/lib/db';
import { asc } from 'drizzle-orm';
import { HeroMediaClient } from './HeroMediaClient';

export default async function AdminHeroMediaPage() {
  const slides = await db
    .select()
    .from(homepageMedia)
    .orderBy(asc(homepageMedia.sortOrder));

  return <HeroMediaClient slides={slides} />;
}
