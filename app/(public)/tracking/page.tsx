import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { TrackingLookup } from './TrackingLookup';
import { resolveBrandFromHeaders } from '@/lib/config/site';

export async function generateMetadata(): Promise<Metadata> {
  const brand = resolveBrandFromHeaders(await headers());
  const title =
    brand.key === 'duke_street_tyres'
      ? 'Track Your Booking | Duke Street Tyres'
      : 'Track Your Booking | Tyre Rescue';

  return {
    title: brand.key === 'duke_street_tyres' ? { absolute: title } : title,
    description:
      'Track your mobile tyre fitting booking in real-time. Enter your booking reference to see live driver location and status updates.',
    alternates: { canonical: `${brand.productionUrl}/tracking` },
    authors: [{ name: brand.name }],
    creator: brand.name,
    publisher: brand.name,
    metadataBase: new URL(brand.productionUrl),
    robots: { index: true, follow: true },
  };
}

export default async function TrackingPage() {
  const brand = resolveBrandFromHeaders(await headers());
  return <TrackingLookup brand={brand} />;
}
