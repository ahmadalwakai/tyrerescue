import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { getLocalBusinessSchema, getServiceSchema, getBreadcrumbSchema, getFAQSchema } from '@/lib/seo/schemas';
import { priceCitySlugs, getCityPriceData } from '@/lib/seo/cities';
import { CityQuoteWidget } from './CityQuoteWidget';
import { SEO_RESPONSE_TIME_LABEL } from '@/lib/seo/response-time';
import { SERVICE_PRICING } from '@/lib/pricing';
import { colorTokens as colors } from '@/lib/design-tokens';

export const revalidate = 604800;
export const dynamicParams = true;

export function generateStaticParams() {
  return priceCitySlugs.map((city) => ({ city }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city: slug } = await params;
  const city = getCityPriceData(slug);
  if (!city) return {};

  const title = `Mobile Tyre Fitting ${city.name} Prices | Tyre Rescue`;
  const description = `Mobile tyre fitting prices in ${city.name}. Fitting from £${SERVICE_PRICING.fitting.from} per tyre plus tyre cost; emergency callout from £${SERVICE_PRICING.emergency.from}. Get an exact quote before booking.`;

  return {
    title: { absolute: title },
    description,
    keywords: [
      `mobile tyre fitting ${city.name.toLowerCase()} price`,
      `tyre fitting cost ${city.name.toLowerCase()}`,
      `how much mobile tyre fitting ${city.name.toLowerCase()}`,
      `cheap tyre fitting ${city.name.toLowerCase()}`,
      `emergency tyre fitting ${city.name.toLowerCase()} price`,
    ].join(', '),
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

export default async function CityPricePage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city: slug } = await params;
  const city = getCityPriceData(slug);
  if (!city) notFound();

  const businessSchema = getLocalBusinessSchema();
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
    { name: 'Mobile Tyre Fitting', path: '/mobile-tyre-fitting/glasgow' },
    { name: `Mobile Tyre Fitting ${city.name} Price`, path: `/mobile-tyre-fitting-${slug}-price` },
  ]);

  const faqs = [
    {
      question: `How much does mobile tyre fitting cost in ${city.name}?`,
      answer: `Mobile tyre fitting in ${city.name} starts from £${SERVICE_PRICING.fitting.from} per tyre for fitting, plus the tyre price. Budget, mid-range and premium tyre prices depend on size, brand and current stock. Emergency callouts start from £${SERVICE_PRICING.emergency.from}, with the tyre and any additional work charged separately. Request an exact quote before booking.`,
    },
    {
      question: `How quickly can a mobile tyre fitter reach me in ${city.name}?`,
      answer: `Our average response time in ${city.name} is ${SEO_RESPONSE_TIME_LABEL}. We dispatch the nearest available fitter to your exact location. You'll receive an accurate ETA when you call 01932 509613.`,
    },
    {
      question: `Do you offer 24-hour emergency tyre fitting in ${city.name}?`,
      answer: `Yes — we provide 24/7 emergency mobile tyre fitting in ${city.name}. Call 01932 509613 at any time, day or night, and we'll dispatch a fitter to your location. Emergency callouts start from £${SERVICE_PRICING.emergency.from}. The tyre and any additional work are charged separately.`,
    },
    {
      question: `What tyre brands do you carry in ${city.name}?`,
      answer: `We offer budget, mid-range and premium tyres, subject to your tyre size and current stock. Tell us your tyre size when calling and we'll confirm the available brands and prices before dispatching.`,
    },
    {
      question: `Is mobile tyre fitting in ${city.name} more expensive than a garage?`,
      answer: `Compare the total quote for the same tyre size and brand. Our mobile fitting fee starts from £${SERVICE_PRICING.fitting.from} per tyre, with the tyre charged separately. Mobile fitting brings the service to your location, so you can also consider travel time and any recovery costs when comparing options.`,
    },
  ];

  return (
    <>
      <JsonLd data={localSchema} />
      <JsonLd data={serviceSchema} />
      <JsonLd data={breadcrumbs} />
      <JsonLd data={getFAQSchema(faqs)} />

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'system-ui, sans-serif', color: colors.text }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: '0.875rem', marginBottom: '1.5rem', color: colors.muted }}>
          <Link href="/">Home</Link>
          {' / '}
          <Link href="/mobile-tyre-fitting/glasgow">Mobile Tyre Fitting</Link>
          {' / '}
          <span>{city.name} Prices</span>
        </nav>

        <h1 style={{ fontSize: '2rem', lineHeight: 1.2, marginBottom: '1rem' }}>
          Mobile Tyre Fitting in {city.name} — Prices & Booking
        </h1>

        <p style={{ fontSize: '1.125rem', lineHeight: 1.7, marginBottom: '2rem', color: colors.muted }}>
          {city.description}
        </p>

        {/* Pricing table */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '1rem' }}>Mobile Tyre Fitting Prices in {city.name}</h2>
          <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
            <thead>
              <tr style={{ background: colors.surface }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: `2px solid ${colors.border}` }}>Service</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: `2px solid ${colors.border}` }}>Price</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: `2px solid ${colors.border}` }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {[
                { service: 'Fitting fee (per tyre)', price: `From £${SERVICE_PRICING.fitting.from}`, notes: SERVICE_PRICING.fitting.disclaimer },
                { service: 'Budget, mid-range and premium tyres', price: 'Quote by size and brand', notes: 'Current stock and tyre price confirmed before booking; fitting charged separately' },
                { service: 'Emergency callout fee', price: `From £${SERVICE_PRICING.emergency.from}`, notes: SERVICE_PRICING.emergency.disclaimer },
                { service: 'Puncture repair', price: `From £${SERVICE_PRICING.punctureRepair.from}`, notes: SERVICE_PRICING.punctureRepair.disclaimer },
              ].map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${colors.border}`, background: i % 2 === 0 ? colors.surface : colors.bg }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{row.service}</td>
                  <td style={{ padding: '10px 12px', color: colors.accent, fontWeight: 700 }}>{row.price}</td>
                  <td style={{ padding: '10px 12px', color: colors.muted, fontSize: '0.875rem' }}>{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p style={{ fontSize: '0.8rem', color: colors.muted, marginTop: '0.5rem' }}>
            Starting fees are shown above. Tyre prices vary by size, brand and stock. Confirm your full quote and any additional work before booking.
          </p>
        </section>

        {/* Quote widget */}
        <section aria-label="Price calculator" style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '1rem' }}>Get Your Exact Price</h2>
          <CityQuoteWidget cityName={city.name} />
        </section>

        {/* Why book */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '1rem' }}>Why Book With Tyre Rescue in {city.name}?</h2>
          <ul style={{ lineHeight: 2, paddingLeft: '1.25rem', color: colors.muted }}>
            <li>We come to you — home, work, car park, or roadside</li>
            <li>Transparent pricing — the price you see is the price you pay</li>
            <li>Budget, mid-range and premium tyre options, subject to current stock</li>
            <li>24/7 emergency callouts — 365 days a year</li>
            <li>
              {city.depotDistance === 0
                ? 'Based in Glasgow — fastest response in the city'
                : `Only ${city.depotDistance} miles from our Glasgow depot — fast response`}
            </li>
            <li>Fitting includes balancing, torqueing and old tyre disposal</li>
          </ul>
        </section>

        {/* FAQ */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '1rem' }}>Frequently Asked Questions</h2>
          {faqs.map((faq, i) => (
            <details key={i} style={{ marginBottom: '0.75rem', borderBottom: `1px solid ${colors.border}`, paddingBottom: '0.75rem' }}>
              <summary style={{ fontWeight: 600, cursor: 'pointer', padding: '0.5rem 0', fontSize: '1rem' }}>
                {faq.question}
              </summary>
              <p style={{ marginTop: '0.5rem', lineHeight: 1.7, color: colors.muted, paddingLeft: '1rem' }}>
                {faq.answer}
              </p>
            </details>
          ))}
        </section>

        {/* Related links */}
        <nav aria-label="Related pages" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
          <Link href="/book" style={{ fontWeight: 700, color: colors.accent, textDecoration: 'none', fontSize: '1rem' }}>
            Book Now →
          </Link>
          <Link href={`/mobile-tyre-fitting/${slug}`} style={{ fontWeight: 600, color: colors.text, textDecoration: 'none' }}>
            {city.name} Service Page →
          </Link>
          <Link href="/pricing-faq" style={{ fontWeight: 600, color: colors.text, textDecoration: 'none' }}>
            Pricing FAQ →
          </Link>
        </nav>

        {/* Call CTA */}
        <section style={{ background: '#e85c0d', color: '#fff', borderRadius: '8px', padding: '1.5rem 2rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: 600 }}>
            Need a tyre in {city.name} now?
          </p>
          <a href="tel:01932509613" style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fff', textDecoration: 'none', letterSpacing: '0.05em' }}>
            01932 509613
          </a>
          <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', opacity: 0.9 }}>Available 24/7 — emergency and scheduled</p>
        </section>
      </main>
    </>
  );
}
