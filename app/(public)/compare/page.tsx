import type { Metadata } from 'next';
import { CompareIndexContent } from './CompareIndexContent';
import { JsonLd } from '@/components/seo/JsonLd';

export const metadata: Metadata = {
  title: 'Compare Tyre Rescue vs Kwik Fit, RAC, AA, Black Circles & More | Scotland',
  description:
    'How does Tyre Rescue compare to Kwik Fit, RAC, AA, Black Circles, Tyres on the Drive, Arnold Clark & Protyre for mobile tyre fitting across Scotland? Emergency availability, coverage, and pricing compared.',
  alternates: { canonical: 'https://www.tyrerescue.uk/compare' },
  keywords: [
    'tyre fitting comparison scotland',
    'best mobile tyre fitting scotland',
    'kwik fit alternative scotland',
    'black circles alternative',
    'tyres on the drive alternative',
    'rac vs mobile tyre fitting scotland',
    'aa vs tyre rescue scotland',
    'mobile tyre fitter vs garage scotland',
    'tyre rescue reviews scotland',
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
        { '@type': 'ListItem', position: 5, name: 'Tyre Rescue vs Arnold Clark Tyres', url: 'https://www.tyrerescue.uk/compare/tyre-rescue-vs-arnold-clark-tyres' },
        { '@type': 'ListItem', position: 6, name: 'Tyre Rescue vs Protyre', url: 'https://www.tyrerescue.uk/compare/tyre-rescue-vs-protyre' },
        { '@type': 'ListItem', position: 7, name: 'Tyre Rescue vs Tyres on the Drive', url: 'https://www.tyrerescue.uk/compare/tyre-rescue-vs-tyres-on-the-drive' },
        { '@type': 'ListItem', position: 8, name: 'Tyre Rescue vs Black Circles', url: 'https://www.tyrerescue.uk/compare/tyre-rescue-vs-black-circles' },
        { '@type': 'ListItem', position: 9, name: 'Tyre Rescue vs RAC Breakdown', url: 'https://www.tyrerescue.uk/compare/tyre-rescue-vs-rac-breakdown' },
        { '@type': 'ListItem', position: 10, name: 'Tyre Rescue vs AA Breakdown', url: 'https://www.tyrerescue.uk/compare/tyre-rescue-vs-aa-breakdown' },
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
