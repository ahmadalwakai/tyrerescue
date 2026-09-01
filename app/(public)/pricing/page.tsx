import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { JsonLd } from '@/components/seo/JsonLd';
import { getBreadcrumbSchema, getFAQSchema, getHowToSchema, getServiceSchema } from '@/lib/seo/schemas';
import { pricingFactors, pricingFaqs, pricingRows } from '@/lib/content/pricing';
import { priceCitySlugs, getCityPriceData } from '@/lib/seo/cities';

const SITE_URL = 'https://www.tyrerescue.uk';

export const metadata: Metadata = {
  title: 'Mobile Tyre Fitting Prices Glasgow & Scotland | Tyre Rescue',
  description:
    'Transparent mobile tyre fitting prices across Glasgow, Edinburgh and Scotland. Fitting from £20 plus tyre price, emergency callout from £49, puncture repair from £25. Get an instant quote online.',
  alternates: { canonical: `${SITE_URL}/pricing` },
  openGraph: {
    title: 'Mobile Tyre Fitting Prices | Tyre Rescue',
    description:
      'See guide prices for scheduled mobile tyre fitting, emergency tyre callouts, puncture repair, and tyre supply across Scotland.',
    url: `${SITE_URL}/pricing`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mobile Tyre Fitting Prices | Tyre Rescue',
    description:
      'Fitting from £20 plus tyre price, emergency callout from £49, and puncture repair from £25.',
  },
};

const cityLinks = priceCitySlugs
  .map((slug) => {
    const city = getCityPriceData(slug);
    return city ? { slug, name: city.name } : null;
  })
  .filter((city): city is { slug: string; name: string } => Boolean(city));

const jsonLd = [
  getServiceSchema({
    serviceName: 'Mobile Tyre Fitting Prices',
    areaName: 'Scotland',
    areaType: 'Place',
    baseUrl: SITE_URL,
  }),
  getBreadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Pricing', path: '/pricing' },
  ]),
  getFAQSchema(pricingFaqs),
  getHowToSchema({
    name: 'How to get a mobile tyre fitting price',
    description: 'Check the guide prices, enter your tyre size or vehicle registration, then confirm the itemized quote before booking.',
    steps: [
      {
        name: 'Check guide prices',
        text: 'Review the fitting, emergency callout, puncture repair and tyre supply guide prices.',
      },
      {
        name: 'Enter your tyre details',
        text: 'Use the quote or booking flow to enter your tyre size, vehicle registration and location.',
      },
      {
        name: 'Confirm the live quote',
        text: 'Review the itemized quote before payment, including tyre cost, fitting, travel and any applicable surcharges.',
      },
    ],
  }, `${SITE_URL}/pricing`),
];

const styles = {
  page: {
    minHeight: '100vh',
    background: '#09090B',
    color: '#F4F4F5',
  },
  hero: {
    borderBottom: '1px solid rgba(255,255,255,0.12)',
    padding: 'clamp(48px, 8vw, 88px) 16px',
  },
  wrap: {
    maxWidth: '1120px',
    margin: '0 auto',
  },
  eyebrow: {
    color: '#F97316',
    fontSize: '12px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    marginBottom: '16px',
  },
  h1: {
    fontSize: 'clamp(40px, 7vw, 88px)',
    lineHeight: 0.95,
    margin: 0,
    maxWidth: '900px',
  },
  lead: {
    color: '#D4D4D8',
    fontSize: '18px',
    lineHeight: 1.7,
    maxWidth: '760px',
    marginTop: '24px',
  },
  ctaRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap' as const,
    marginTop: '28px',
  },
  ctaPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '44px',
    padding: '12px 18px',
    borderRadius: '4px',
    background: '#F97316',
    color: '#09090B',
    fontWeight: 800,
    textDecoration: 'none',
  },
  ctaSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '44px',
    padding: '12px 18px',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.24)',
    color: '#F4F4F5',
    fontWeight: 700,
    textDecoration: 'none',
  },
  section: {
    padding: '56px 16px',
  },
  h2: {
    fontSize: 'clamp(28px, 4vw, 48px)',
    lineHeight: 1,
    margin: '0 0 18px',
  },
  muted: {
    color: '#A1A1AA',
    lineHeight: 1.7,
  },
  tableWrap: {
    overflowX: 'auto' as const,
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    minWidth: '680px',
  },
  th: {
    background: '#18181B',
    color: '#FAFAFA',
    padding: '14px 16px',
    textAlign: 'left' as const,
    fontSize: '13px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  td: {
    borderTop: '1px solid rgba(255,255,255,0.10)',
    padding: '16px',
    verticalAlign: 'top' as const,
    lineHeight: 1.55,
  },
  price: {
    color: '#F97316',
    fontWeight: 800,
    whiteSpace: 'nowrap' as const,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '14px',
  },
  card: {
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    background: '#18181B',
    padding: '18px',
  },
  cardLink: {
    color: '#F4F4F5',
    textDecoration: 'none',
    fontWeight: 800,
  },
  list: {
    display: 'grid',
    gap: '12px',
    paddingLeft: '20px',
    color: '#D4D4D8',
    lineHeight: 1.65,
  },
  faq: {
    borderTop: '1px solid rgba(255,255,255,0.12)',
  },
  details: {
    borderBottom: '1px solid rgba(255,255,255,0.12)',
    padding: '18px 0',
  },
  summary: {
    cursor: 'pointer',
    fontWeight: 800,
    color: '#F4F4F5',
  },
} satisfies Record<string, CSSProperties>;

export default function PricingPage() {
  return (
    <div style={styles.page}>
      <JsonLd data={jsonLd} />
      <Nav />

      <main id="main-content">
        <header style={styles.hero}>
          <div style={styles.wrap}>
            <p style={styles.eyebrow}>Transparent tyre fitting prices</p>
            <h1 style={styles.h1}>Mobile Tyre Fitting Prices in Glasgow and Scotland</h1>
            <p style={styles.lead}>
              Use this guide to compare scheduled mobile fitting, emergency callouts,
              puncture repair and tyre supply. Your live quote shows the exact tyre,
              fitting, travel and surcharge line items before you pay.
            </p>
            <div style={styles.ctaRow}>
              <Link href="/quote" style={styles.ctaPrimary}>Get an Instant Quote</Link>
              <Link href="/book" style={styles.ctaSecondary}>Book Mobile Fitting</Link>
              <a href="tel:01412660690" style={styles.ctaSecondary}>Call 0141 266 0690</a>
            </div>
          </div>
        </header>

        <section style={styles.section}>
          <div style={styles.wrap}>
            <h2 style={styles.h2}>Guide Price Table</h2>
            <p style={{ ...styles.muted, maxWidth: '760px', marginBottom: '24px' }}>
              These are realistic guide prices for common jobs. The confirmed quote
              depends on tyre stock, your location, service time, live traffic and
              safe working conditions.
            </p>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Service</th>
                    <th style={styles.th}>Guide price</th>
                    <th style={styles.th}>What affects it</th>
                  </tr>
                </thead>
                <tbody>
                  {pricingRows.map((row) => (
                    <tr key={row.service}>
                      <td style={{ ...styles.td, fontWeight: 800 }}>{row.service}</td>
                      <td style={{ ...styles.td, ...styles.price }}>{row.price}</td>
                      <td style={{ ...styles.td, color: '#D4D4D8' }}>{row.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section style={{ ...styles.section, background: '#0F0F12' }}>
          <div style={styles.wrap}>
            <h2 style={styles.h2}>What Changes the Final Quote?</h2>
            <ul style={styles.list}>
              {pricingFactors.map((factor) => (
                <li key={factor}>{factor}</li>
              ))}
            </ul>
          </div>
        </section>

        <section style={styles.section}>
          <div style={styles.wrap}>
            <h2 style={styles.h2}>City Price Guides</h2>
            <p style={{ ...styles.muted, maxWidth: '760px', marginBottom: '24px' }}>
              Choose a city guide for local response-time and price context. Each page
              links back into the same quote and booking flow.
            </p>
            <div style={styles.grid}>
              {cityLinks.map((city) => (
                <div key={city.slug} style={styles.card}>
                  <Link href={`/mobile-tyre-fitting-${city.slug}-price`} style={styles.cardLink}>
                    {city.name} mobile tyre fitting prices
                  </Link>
                  <p style={{ ...styles.muted, margin: '10px 0 0', fontSize: '14px' }}>
                    Local guide prices, response notes and booking links.
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ ...styles.section, background: '#0F0F12' }}>
          <div style={styles.wrap}>
            <h2 style={styles.h2}>Pricing Questions</h2>
            <div style={styles.faq}>
              {pricingFaqs.map((faq) => (
                <details key={faq.question} style={styles.details}>
                  <summary style={styles.summary}>{faq.question}</summary>
                  <p style={{ ...styles.muted, marginBottom: 0 }}>{faq.answer}</p>
                </details>
              ))}
            </div>
            <div style={styles.ctaRow}>
              <Link href="/pricing-faq" style={styles.ctaSecondary}>Read Pricing FAQ</Link>
              <Link href="/mobile-tyre-fitting/glasgow" style={styles.ctaSecondary}>Glasgow Service Page</Link>
              <Link href="/emergency" style={styles.ctaSecondary}>Emergency Callout</Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
