import { db, faqs } from '@/lib/db';
import { asc } from 'drizzle-orm';
import { FAQClient } from './FAQClient';

export default async function AdminFAQPage() {
  const items = await db
    .select({
      id: faqs.id,
      question: faqs.question,
      answer: faqs.answer,
      displayOrder: faqs.displayOrder,
      active: faqs.active,
    })
    .from(faqs)
    .orderBy(asc(faqs.displayOrder));

  return <FAQClient faqs={items} />;
}
