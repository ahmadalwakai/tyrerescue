import type { Metadata } from 'next';
import { BookingWizard } from '@/components/BookingWizard';
import { JsonLd } from '@/components/JsonLd';
import { getBreadcrumbSchema, getFAQSchema } from '@/lib/schemas';
import { SITE_URL } from '@/lib/seo-data';

type PageProps = {
  searchParams: Promise<{ type?: string }>;
};

export const metadata: Metadata = {
  title: { absolute: 'Book Mobile Tyre Fitting Glasgow | 247 Mo Glasgow' },
  description:
    'Book a Glasgow mobile tyre fitting callback with 247 Mo Glasgow. Emergency callouts, scheduled mobile fitting and secure card payment.',
  alternates: { canonical: `${SITE_URL}/book` },
};

const faqs = [
  {
    question: 'Do I pay online?',
    answer: 'Yes. The wizard creates a live quote and secure Stripe payment for confirmed bookings.',
  },
  {
    question: 'Can I still call for emergencies?',
    answer: 'Yes. For urgent flat tyres, calling 0141 266 0690 is still the fastest option.',
  },
  {
    question: 'What details help you quote faster?',
    answer: 'Your tyre size, location, vehicle registration and whether the tyre is flat, damaged or worn.',
  },
];

export default async function BookPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialBookingType = params.type === 'emergency' ? 'emergency' : undefined;

  return (
    <main className="book-shell">
      <JsonLd data={getFAQSchema(faqs)} />
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Book', path: '/book' },
        ])}
      />
      <BookingWizard initialBookingType={initialBookingType} />
    </main>
  );
}
