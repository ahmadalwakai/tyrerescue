import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { getLocalBusinessSchema, getServiceSchema, getBreadcrumbSchema, getFAQSchema } from '@/lib/seo/schemas';
import { priceCitySlugs, getCityPriceData } from '@/lib/seo/cities';
import { CityQuoteWidget } from './CityQuoteWidget';

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

  const title = `Mobile Tyre Fitting ${city.name} — Prices & Instant Booking | Tyre Rescue`;
  const description = `Mobile tyre fitting prices in ${city.name}. Budget tyres from £45, mid-range from £65, premium from £90. Fitting from £20. Emergency callout £49. No hidden fees. Call 0141 266 0690.`;

  return {
    title,
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
      answer: `Mobile tyre fitting in ${city.name} starts from £20 per tyre (fitting fee only). Budget tyres cost from £45, mid-range from £65, and premium brands from £90 — all including fitting. Emergency callouts have a £49 callout fee on top of the tyre price. There are no hidden charges.`,
    },
    {
      question: `How quickly can a mobile tyre fitter reach me in ${city.name}?`,
      answer: `Our average response time in ${city.name} is approximately ${city.depotDistance === 0 ? '35' : city.depotDistance < 20 ? '30' : city.depotDistance < 40 ? '45' : '55'} minutes. We dispatch the nearest available fitter to your exact location. You'll receive an accurate ETA when you call 0141 266 0690.`,
    },
    {
      question: `Do you offer 24-hour emergency tyre fitting in ${city.name}?`,
      answer: `Yes — we provide 24/7 emergency mobile tyre fitting in ${city.name}. Call 0141 266 0690 at any time, day or night, and we'll dispatch a fitter to your location. Emergency callouts have a flat £49 callout fee plus the tyre cost.`,
    },
    {
      question: `What tyre brands do you carry in ${city.name}?`,
      answer: `We carry budget brands (e.g. Hifly, Roadstone), mid-range brands (e.g. Hankook, Falken, Firestone), and premium brands (e.g. Michelin, Continental, Bridgestone, Pirelli) on every van. Tell us your tyre size when calling and we'll confirm availability before dispatching.`,
    },
    {
      question: `Is mobile tyre fitting in ${city.name} more expensive than a garage?`,
      answer: `The tyre cost is the same. Mobile fitting adds a small convenience premium (£20 per tyre vs £10–15 at a garage). However, when you factor in fuel, travel time, and the cost of recovery if your tyre is flat, mobile fitting is often cheaper overall — and far more convenient.`,
    },
  ];

  return (
    <>
      <JsonLd data={localSchema} />
      <JsonLd data={serviceSchema} />
      <JsonLd data={breadcrumbs} />
      <JsonLd data={getFAQSchema(faqs)} />

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'system-ui, sans-serif' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: '0.875rem', marginBottom: '1.5rem', color: '#666' }}>
          <Link href="/">Home</Link>
          {' / '}
          <Link href="/mobile-tyre-fitting/glasgow">Mobile Tyre Fitting</Link>
          {' / '}
          <span>{city.name} Prices</span>
        </nav>

        <h1 style={{ fontSize: '2rem', lineHeight: 1.2, marginBottom: '1rem' }}>
          Mobile Tyre Fitting in {city.name} — Prices & Booking
        </h1>

        <p style={{ fontSize: '1.125rem', lineHeight: 1.7, marginBottom: '2rem', color: '#444' }}>
          {city.description}
        </p>

        {/* Pricing table */}
        <section style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '1rem' }}>Mobile Tyre Fitting Prices in {city.name}</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Service</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Price</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {[
                { service: 'Fitting fee (per tyre)', price: 'From £20', notes: 'Labour + balancing included' },
                { service: 'Budget tyre (e.g. 205/55 R16)', price: 'From £45', notes: 'Incl. fitting' },
                { service: 'Mid-range tyre', price: 'From £65', notes: 'Incl. fitting' },
                { service: 'Premium tyre (Michelin, Continental)', price: 'From £90', notes: 'Incl. fitting' },
                { service: 'Emergency callout fee', price: '£49', notes: 'Plus tyre cost' },
                { service: 'Puncture repair', price: '£25', notes: 'Where repairable' },
              ].map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{row.service}</td>
                  <td style={{ padding: '10px 12px', color: '#e85c0d', fontWeight: 700 }}>{row.price}</td>
                  <td style={{ padding: '10px 12px', color: '#666', fontSize: '0.875rem' }}>{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.5rem' }}>
            All prices include labour. VAT not applicable for mobile callouts. Prices correct as of 2026.
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
          <ul style={{ lineHeight: 2, paddingLeft: '1.25rem', color: '#444' }}>
            <li>We come to you — home, work, car park, or roadside</li>
            <li>Transparent pricing — the price you see is the price you pay</li>
            <li>Budget, mid-range and premium tyres on every van</li>
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
            <details key={i} style={{ marginBottom: '0.75rem', borderBottom: '1px solid #eee', paddingBottom: '0.75rem' }}>
              <summary style={{ fontWeight: 600, cursor: 'pointer', padding: '0.5rem 0', fontSize: '1rem' }}>
                {faq.question}
              </summary>
              <p style={{ marginTop: '0.5rem', lineHeight: 1.7, color: '#444', paddingLeft: '1rem' }}>
                {faq.answer}
              </p>
            </details>
          ))}
        </section>

        {/* Related links */}
        <nav aria-label="Related pages" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
          <Link href="/book" style={{ fontWeight: 700, color: '#e85c0d', textDecoration: 'none', fontSize: '1rem' }}>
            Book Now →
          </Link>
          <Link href={`/mobile-tyre-fitting/${slug}`} style={{ fontWeight: 600, color: '#333', textDecoration: 'none' }}>
            {city.name} Service Page →
          </Link>
          <Link href="/pricing-faq" style={{ fontWeight: 600, color: '#333', textDecoration: 'none' }}>
            Pricing FAQ →
          </Link>
        </nav>

        {/* Call CTA */}
        <section style={{ background: '#e85c0d', color: '#fff', borderRadius: '8px', padding: '1.5rem 2rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: 600 }}>
            Need a tyre in {city.name} now?
          </p>
          <a href="tel:01412660690" style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fff', textDecoration: 'none', letterSpacing: '0.05em' }}>
            0141 266 0690
          </a>
          <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', opacity: 0.9 }}>Available 24/7 — emergency and scheduled</p>
        </section>
      </main>
    </>
  );
}
