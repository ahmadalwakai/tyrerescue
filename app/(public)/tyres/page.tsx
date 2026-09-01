import { Suspense } from 'react';
import { Metadata } from 'next';
import { TyresContent } from './TyresContent';

export const metadata: Metadata = {
  title: 'Buy Tyres Scotland | Mobile Fitting Included | Tyre Rescue',
  description:
    'Browse and buy tyres online in Scotland. Budget, mid-range, and premium brands. Mobile fitting to your home, work, or roadside across all of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness and beyond. Call 0141 266 0690.',
  keywords: 'buy tyres scotland, tyres online scotland, cheap tyres scotland, tyre prices scotland, budget tyres glasgow, premium tyres scotland, continental tyres scotland, michelin tyres scotland',
  alternates: { canonical: 'https://www.tyrerescue.uk/tyres' },
  openGraph: {
    title: 'Buy Tyres Scotland | Mobile Fitting Included | Tyre Rescue',
    description: 'Browse and buy tyres online. Mobile fitting to your location across all of Scotland. Budget from ~£40, premium from ~£80. Call 0141 266 0690.',
    url: 'https://www.tyrerescue.uk/tyres',
    type: 'website',
  },
};

export default function TyresPage() {
  return (
    <Suspense>
      <TyresContent />
    </Suspense>
  );
}
