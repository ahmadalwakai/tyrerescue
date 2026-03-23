import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { getLocalBusinessSchema, getServiceSchema, getBreadcrumbSchema } from '@/lib/seo/schemas';
import { priceCitySlugs, getCityPriceData } from '@/lib/seo/cities';
import { CityQuoteWidget } from './CityQuoteWidget';

// ── Static params ────────────────────────────────────────

export function generateStaticParams() {
  return priceCitySlugs.map((city) => ({ city }));
}

// ── Metadata ─────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city: slug } = await params;
  const city = getCityPriceData(slug);
  if (!city) return {};

  const title = `Mobile Tyre Fitting ${city.name} — Prices & Instant Booking | Tyre Rescue`;
  const description = `Compare mobile tyre fitting prices in ${city.name}. See live prices, book online and get a fitter to your door. No hidden fees. ${city.name} coverage 7 days a week.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://www.tyrerescue.uk/mobile-tyre-fitting-${slug}-price`,
    },
    alternates: {
      canonical: `https://www.tyrerescue.uk/mobile-tyre-fitting-${slug}-price`,
    },
  };
}

// ── Page ────────────────────────────────────────────��────

export default async function CityPricePage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city: slug } = await params;
  const city = getCityPriceData(slug);
  if (!city) notFound();

  const businessSchema = getLocalBusinessSchema();
  // Override areaServed to this specific city
  const localSchema = {
    ...businessSchema,
    areaServed: [{ '@type': 'City', name: city.name }],
  };

  const serviceSchema = getServiceSchema({
    serviceName: `Mobile Tyre Fitting in ${city.name}`,
    areaName: city.name,
    areaType: 'City',
    geo: { latitude: city.coordinates.lat, longitude: city.coordinates.lng },
  });

  const breadcrumbs = getBreadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Services', path: '/services' },
    { name: `Mobile Tyre Fitting ${city.name} Price`, path: `/mobile-tyre-fitting-${slug}-price` },
  ]);

  return (
    <>
      <JsonLd data={localSchema} />
      <JsonLd data={serviceSchema} />
      <JsonLd data={breadcrumbs} />

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1rem' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          <Link href="/">Home</Link>
          {' / '}
          <Link href="/services">Services</Link>
          {' / '}
          <span>Mobile Tyre Fitting {city.name}</span>
        </nav>

        <h1>Mobile Tyre Fitting in {city.name}</h1>

        <p style={{ fontSize: '1.125rem', lineHeight: 1.7, marginBottom: '2rem' }}>
          {city.description}
        </p>

        <section aria-label="Price calculator" style={{ marginBottom: '2.5rem' }}>
          <h2>Get Your Instant Price</h2>
          <CityQuoteWidget cityName={city.name} />
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2>Why Book With Tyre Rescue in {city.name}?</h2>
          <ul style={{ lineHeight: 2 }}>
            <li>Transparent pricing — the price you see is the price you pay</li>
            <li>We come to you — home, work, or roadside</li>
            <li>Budget, mid-range and premium tyres carried on every van</li>
            <li>
              {city.depotDistance === 0
                ? 'Based in Glasgow — fastest possible response times'
                : `Only ${city.depotDistance} miles from our Glasgow depot`}
            </li>
          </ul>
        </section>

        <nav aria-label="Related pages" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Link href="/book" style={{ fontWeight: 600 }}>
            Book Now →
          </Link>
          <Link href="/pricing" style={{ fontWeight: 600 }}>
            Full Pricing Guide →
          </Link>
        </nav>
      </main>
    </>
  );
}
