import { Metadata } from 'next';
import { FAQContent } from './FAQContent';
import { faqItems, buildFAQPageJsonLd } from '@/lib/content/faq';
import { JsonLd } from '@/components/seo/JsonLd';

export const metadata: Metadata = {
  title: 'FAQ | Mobile Tyre Fitting Scotland | Tyre Rescue',
  description:
    'Common questions about mobile tyre fitting across Scotland. Coverage areas, response times for Glasgow, Edinburgh, Aberdeen, Inverness and the Highlands, pricing and booking information.',
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
