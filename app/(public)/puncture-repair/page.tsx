import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  getLocalBusinessSchema,
  getBreadcrumbSchema,
  getFAQSchema,
} from '@/lib/seo/schemas';

const SITE_URL = 'https://www.tyrerescue.uk';

export const metadata: Metadata = {
  title: 'Puncture Repair Scotland | Mobile Roadside Repair | Tyre Rescue',
  description:
    'Mobile puncture repair across all of Scotland. We come to you — roadside, home, or car park. Repair from £25 where safe and legal. Can\'t be repaired? We\'ll fit a replacement. Call 0141 266 0690.',
  keywords: [
    'puncture repair scotland',
    'mobile puncture repair',
    'puncture repair near me',
    'roadside puncture repair scotland',
    'puncture repair glasgow',
    'puncture repair edinburgh',
    'tyre repair near me',
    'flat tyre repair scotland',
  ].join(', '),
  alternates: { canonical: `${SITE_URL}/puncture-repair` },
  openGraph: {
    title: 'Puncture Repair Scotland | Mobile | Tyre Rescue',
    description:
      'Mobile puncture repair across Scotland. We come to you. Repair from £25. Available 24/7. Call 0141 266 0690.',
    url: `${SITE_URL}/puncture-repair`,
    type: 'website',
    images: [{ url: `${SITE_URL}/images/home/slide-1.webp`, width: 1200, height: 630, alt: 'Puncture repair Scotland — Tyre Rescue' }],
  },
};

const faqs = [
  {
    question: 'How much does puncture repair cost in Scotland?',
    answer: 'Our mobile puncture repair starts from £25 where the tyre is legally repairable. This includes the repair itself and rebalancing. If the tyre cannot be legally repaired (damage outside the repairable zone, or sidewall damage), we will advise a replacement tyre — quoted separately before any work.',
  },
  {
    question: 'Can all punctures be repaired?',
    answer: 'No. Under British Standard BSAU159f, a tyre can only be repaired if the puncture is in the central three-quarters of the tread, the hole is no larger than 6mm, and the tyre has not been driven while significantly underinflated. Sidewall damage, cuts, or large holes cannot be repaired. We assess on arrival and tell you honestly whether repair is safe and legal.',
  },
  {
    question: 'Do you repair punctures at the roadside?',
    answer: 'Yes — roadside puncture repair is our most common callout. We come to wherever you are: motorway layby, car park, roadside verge, or any safe stopping area. Call 0141 266 0690 and we will dispatch the nearest fitter.',
  },
  {
    question: 'How long does a puncture repair take?',
    answer: 'A standard roadside puncture repair typically takes 20–30 minutes on site. This includes removing the wheel, inspecting the damage, inserting and vulcanizing the repair plug, rebalancing, and refitting. If a replacement tyre is needed, add another 10–15 minutes.',
  },
  {
    question: 'What if the puncture cannot be repaired — do you carry replacement tyres?',
    answer: 'Yes. Every callout van carries a wide range of tyre sizes. If we assess the damage and determine that repair is not safe or legal, we can immediately fit a replacement tyre instead. You will be quoted the tyre price before we proceed.',
  },
  {
    question: 'Do you cover puncture repair in the Highlands and Islands?',
    answer: 'Yes — we cover all of Scotland including the Highlands, NC500 route, and the islands (Skye, Lewis, Shetland). Response times for remote areas and islands are longer — call 0141 266 0690 for an honest ETA.',
  },
];

const cities = [
  { name: 'Glasgow', slug: 'glasgow' },
  { name: 'Edinburgh', slug: 'edinburgh' },
  { name: 'Aberdeen', slug: 'aberdeen' },
  { name: 'Inverness', slug: 'inverness' },
  { name: 'Dundee', slug: 'dundee' },
  { name: 'Perth', slug: 'perth' },
  { name: 'Stirling', slug: 'stirling' },
  { name: 'Paisley', slug: 'paisley' },
  { name: 'Hamilton', slug: 'hamilton' },
  { name: 'Kilmarnock', slug: 'kilmarnock' },
  { name: 'Ayr', slug: 'ayr' },
  { name: 'Kirkcaldy', slug: 'kirkcaldy' },
  { name: 'Dunfermline', slug: 'dunfermline' },
  { name: 'Motherwell', slug: 'motherwell' },
  { name: 'Greenock', slug: 'greenock' },
  { name: 'Fort William', slug: 'fort-william' },
  { name: 'Elgin', slug: 'elgin' },
  { name: 'Galashiels', slug: 'galashiels' },
];

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#09090B', color: '#F4F4F5' },
  hero: { borderBottom: '1px solid rgba(255,255,255,0.12)', padding: 'clamp(48px,8vw,88px) 16px' },
  wrap: { maxWidth: '1120px', margin: '0 auto' },
  eyebrow: { color: '#F97316', fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, marginBottom: '16px' },
  h1: { fontSize: 'clamp(40px,7vw,80px)', lineHeight: 0.95, margin: 0, maxWidth: '900px', fontFamily: 'var(--font-display)' },
  lead: { color: '#D4D4D8', fontSize: '18px', lineHeight: 1.7, maxWidth: '760px', marginTop: '24px' },
  ctaRow: { display: 'flex', gap: '12px', flexWrap: 'wrap' as const, marginTop: '28px' },
  ctaPrimary: { display: 'inline-flex', alignItems: 'center', minHeight: '44px', padding: '12px 18px', borderRadius: '4px', background: '#F97316', color: '#09090B', fontWeight: 800, textDecoration: 'none' },
  ctaSecondary: { display: 'inline-flex', alignItems: 'center', minHeight: '44px', padding: '12px 18px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.24)', color: '#F4F4F5', fontWeight: 700, textDecoration: 'none' },
  section: { padding: '56px 16px' },
  sectionAlt: { padding: '56px 16px', background: '#0F0F12' },
  h2: { fontSize: 'clamp(26px,4vw,44px)', lineHeight: 1, margin: '0 0 12px', fontFamily: 'var(--font-display)' },
  cityGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px', marginTop: '24px' },
  cityLink: { display: 'block', color: '#F97316', textDecoration: 'none', fontWeight: 700, padding: '10px 14px', border: '1px solid rgba(249,115,22,0.25)', borderRadius: '6px', background: '#18181B', fontSize: '14px' },
  faqSection: { borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '24px' },
  faqItem: { borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '18px 0' },
  faqQ: { fontWeight: 700, color: '#F4F4F5', marginBottom: '8px', fontSize: '16px' },
  faqA: { color: '#A1A1AA', lineHeight: 1.7, fontSize: '15px' },
  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginTop: '28px' },
  infoCard: { border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: '#18181B', padding: '20px' },
  infoTitle: { color: '#F97316', fontWeight: 800, marginBottom: '8px', fontSize: '16px' },
  infoText: { color: '#A1A1AA', lineHeight: 1.7, fontSize: '14px' },
};

export default function PunctureRepairPage() {
  return (
    <div style={s.page}>
      <JsonLd data={[
        getLocalBusinessSchema(),
        getBreadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Puncture Repair Scotland', path: '/puncture-repair' },
        ]),
        getFAQSchema(faqs),
      ]} />
      <Nav />

      <main id="main-content">
        <header style={s.hero}>
          <div style={s.wrap}>
            <p style={s.eyebrow}>Mobile puncture repair · All of Scotland</p>
            <h1 style={s.h1}>Puncture Repair Scotland</h1>
            <p style={s.lead}>
              We come to your exact location — roadside, driveway, or car park — and repair your
              puncture on the spot. Repair from £25 where safe and legal. If it cannot be repaired,
              we fit a replacement tyre straight away. Available 24/7 across all of Scotland.
            </p>
            <div style={s.ctaRow}>
              <a href="tel:01412660690" style={s.ctaPrimary}>Call 0141 266 0690</a>
              <Link href="/book" style={s.ctaSecondary}>Book Online</Link>
              <Link href="/emergency" style={s.ctaSecondary}>Emergency Callout</Link>
            </div>
          </div>
        </header>

        <section style={s.section}>
          <div style={s.wrap}>
            <h2 style={s.h2}>When Can a Puncture Be Repaired?</h2>
            <p style={{ color: '#A1A1AA', fontSize: '16px', maxWidth: '700px' }}>
              Not all punctures can be legally or safely repaired. Our fitters assess on arrival
              and advise you honestly — no upselling, no pressure.
            </p>
            <div style={s.infoGrid}>
              <div style={s.infoCard}>
                <p style={s.infoTitle}>Repairable ✓</p>
                <p style={s.infoText}>
                  Puncture in the central ¾ of the tread area. Hole 6mm or smaller. Tyre was not
                  driven significantly underinflated. No prior illegal repairs. Tyre has adequate
                  tread depth remaining.
                </p>
              </div>
              <div style={s.infoCard}>
                <p style={s.infoTitle}>Not repairable ✗</p>
                <p style={s.infoText}>
                  Sidewall damage or cuts. Shoulder area punctures. Holes larger than 6mm.
                  Run-flat damage. Tyre driven flat (internal structure damage). Prior illegal
                  repair in the same area.
                </p>
              </div>
              <div style={s.infoCard}>
                <p style={s.infoTitle}>Pricing</p>
                <p style={s.infoText}>
                  Repair: from £25. Replacement tyre: from £40 (budget) + £20 fitting. Emergency
                  callout: from £49 (included in repair price). Full quote confirmed before work
                  begins.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section style={s.sectionAlt}>
          <div style={s.wrap}>
            <h2 style={s.h2}>Puncture Repair by City</h2>
            <p style={{ color: '#A1A1AA', fontSize: '16px', maxWidth: '700px', marginBottom: '0' }}>
              We cover all Scottish cities and beyond. Select your city for local response times
              and coverage details.
            </p>
            <div style={s.cityGrid}>
              {cities.map((city) => (
                <Link key={city.slug} href={`/puncture-repair/${city.slug}`} style={s.cityLink}>
                  {city.name}
                </Link>
              ))}
            </div>
            <p style={{ color: '#71717A', fontSize: '14px', marginTop: '16px' }}>
              Don&apos;t see your city?{' '}
              <Link href="/service-areas" style={{ color: '#F97316' }}>View all 34 covered areas →</Link>
            </p>
          </div>
        </section>

        <section style={s.section}>
          <div style={s.wrap}>
            <h2 style={s.h2}>Puncture Repair FAQ</h2>
            <div style={s.faqSection}>
              {faqs.map((faq) => (
                <div key={faq.question} style={s.faqItem}>
                  <p style={s.faqQ}>{faq.question}</p>
                  <p style={s.faqA}>{faq.answer}</p>
                </div>
              ))}
            </div>
            <div style={{ ...s.ctaRow, marginTop: '28px' }}>
              <Link href="/mobile-tyre-fitting" style={s.ctaSecondary}>Mobile Tyre Fitting →</Link>
              <Link href="/emergency" style={s.ctaSecondary}>Emergency Callout →</Link>
              <Link href="/pricing" style={s.ctaSecondary}>Full Pricing →</Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
