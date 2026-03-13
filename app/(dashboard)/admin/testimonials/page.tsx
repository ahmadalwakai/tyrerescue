import { db, testimonials } from '@/lib/db';
import { desc } from 'drizzle-orm';
import { TestimonialsClient } from './TestimonialsClient';

export default async function AdminTestimonialsPage() {
  const items = await db
    .select({
      id: testimonials.id,
      authorName: testimonials.authorName,
      rating: testimonials.rating,
      content: testimonials.content,
      jobType: testimonials.jobType,
      approved: testimonials.approved,
      featured: testimonials.featured,
    })
    .from(testimonials)
    .orderBy(desc(testimonials.createdAt));

  return <TestimonialsClient testimonials={items} />;
}
