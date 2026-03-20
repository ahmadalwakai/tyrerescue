import type { Metadata } from 'next';
import { CompareIndexContent } from './CompareIndexContent';
import { JsonLd } from '@/components/seo/JsonLd';

export const metadata: Metadata = {
  title: 'Compare Tyre Rescue vs Competitors | Mobile Tyre Fitting Scotland',
  description:
    'See how Tyre Rescue compares to Kwik Fit, National Tyres, ATS Euromaster & Halfords for mobile tyre fitting in Glasgow, Edinburgh & Scotland. 24/7 emergency service.',
  alternates: { canonical: 'https://www.tyrerescue.uk/compare' },
  keywords: [
    'tyre fitting comparison scotland',
    'best mobile tyre fitting',
    'kwik fit alternative',
    'national tyres alternative',
    'tyre rescue reviews',
  ],
};

export default function ComparePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Tyre Rescue vs Competitors',
    description: 'Compare Tyre Rescue with leading tyre fitting providers in Scotland.',
    url: 'https://www.tyrerescue.uk/compare',
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Tyre Rescue vs Kwik Fit', url: 'https://www.tyrerescue.uk/compare/tyre-rescue-vs-kwik-fit' },
        { '@type': 'ListItem', position: 2, name: 'Tyre Rescue vs National Tyres', url: 'https://www.tyrerescue.uk/compare/tyre-rescue-vs-national-tyres' },
        { '@type': 'ListItem', position: 3, name: 'Tyre Rescue vs ATS Euromaster', url: 'https://www.tyrerescue.uk/compare/tyre-rescue-vs-ats-euromaster' },
        { '@type': 'ListItem', position: 4, name: 'Tyre Rescue vs Halfords', url: 'https://www.tyrerescue.uk/compare/tyre-rescue-vs-halfords' },
      ],
    },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <CompareIndexContent />
    </>
  );
}
