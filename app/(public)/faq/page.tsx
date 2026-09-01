import { Metadata } from 'next';
import { FAQContent } from './FAQContent';
import { faqItems, buildFAQPageJsonLd } from '@/lib/content/faq';
import { JsonLd } from '@/components/seo/JsonLd';

export const metadata: Metadata = {
  title: 'FAQ | Mobile Tyre Fitting Scotland | Tyre Rescue',
  description:
    'Common questions about mobile tyre fitting across Scotland — coverage for Glasgow, Edinburgh, Aberdeen, Inverness, Highlands, Borders, Islands; response times, pricing from £20, emergency callout, puncture repair, tyre brands and booking.',
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
