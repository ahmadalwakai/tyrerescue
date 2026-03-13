import { Suspense } from 'react';
import { Metadata } from 'next';
import { TyresContent } from './TyresContent';

export const metadata: Metadata = {
  title: 'Tyre Catalogue',
  description:
    'Browse our range of new and part-worn tyres. Find the right tyres for your vehicle with competitive prices and mobile fitting included.',
  alternates: { canonical: 'https://tyrerescue.uk/tyres' },
};

export default function TyresPage() {
  return (
    <Suspense>
      <TyresContent />
    </Suspense>
  );
}
