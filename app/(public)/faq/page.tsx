import { Metadata } from 'next';
import { FAQContent } from './FAQContent';
import { faqItems, buildFAQPageJsonLd } from '@/lib/content/faq';
import { JsonLd } from '@/components/seo/JsonLd';

export const metadata: Metadata = {
  title: 'FAQ | Mobile Tyre Fitting Near Me | Tyre Repair Glasgow | Tyre Rescue',
  description:
    'Common questions about mobile tyre fitting in Glasgow. How does tyre repair near me work? Pricing, response times, coverage areas and booking information.',
  alternates: { canonical: 'https://www.tyrerescue.uk/faq' },
};

export default function FAQPage() {
  const jsonLd = buildFAQPageJsonLd(faqItems);

  return (
    <>
      <JsonLd data={jsonLd} />
      <FAQContent />
    </>
  );
}
