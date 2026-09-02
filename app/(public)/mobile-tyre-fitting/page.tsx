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
  getHowToSchema,
} from '@/lib/seo/schemas';

const SITE_URL = 'https://www.tyrerescue.uk';

export const metadata: Metadata = {
  title: 'Mobile Tyre Fitting Scotland | All Cities | 24/7 | Tyre Rescue',
  description:
    'Mobile tyre fitting across all of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness, Dundee, Perth, Highlands, Borders and Islands. We come to you. Fitting from £20. Emergency callout from £49. Call 0141 266 0690.',
  keywords: [
    'mobile tyre fitting scotland',
    'mobile tyre fitter scotland',
    'mobile tyre fitting near me',
    'tyre fitting at home scotland',
    'tyre fitting at roadside scotland',
    'mobile tyre fitting glasgow',
    'mobile tyre fitting edinburgh',
    'mobile tyre fitting aberdeen',
    'mobile tyre fitting inverness',
    '24 hour tyre fitting scotland',
  ].join(', '),
  alternates: { canonical: `${SITE_URL}/mobile-tyre-fitting` },
  openGraph: {
    title: 'Mobile Tyre Fitting Scotland | All Cities | Tyre Rescue',
    description:
      'Mobile tyre fitting across all of Scotland — from Glasgow to Shetland. We come to your exact location. Fitting from £20. Emergency callout from £49.',
    url: `${SITE_URL}/mobile-tyre-fitting`,
    type: 'website',
    images: [{ url: `${SITE_URL}/images/home/slide-1.webp`, width: 1200, height: 630, alt: 'Mobile tyre fitting Scotland — Tyre Rescue' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mobile Tyre Fitting Scotland | Tyre Rescue',
    description: 'We come to your exact location across all of Scotland. Fitting from £20. Emergency callout from £49. Call 0141 266 0690.',
    images: [`${SITE_URL}/images/home/slide-1.webp`],
  },
};

const cities = [
  { name: 'Glasgow', slug: 'glasgow', postcode: 'G', response: '25–40 min' },
  { name: 'Edinburgh', slug: 'edinburgh', postcode: 'EH', response: '50–65 min' },
  { name: 'Aberdeen', slug: 'aberdeen', postcode: 'AB', response: '~90 min' },
  { name: 'Inverness', slug: 'inverness', postcode: 'IV', response: '~100 min' },
  { name: 'Dundee', slug: 'dundee', postcode: 'DD', response: '65–80 min' },
  { name: 'Perth', slug: 'perth', postcode: 'PH', response: '70–85 min' },
  { name: 'Stirling', slug: 'stirling', postcode: 'FK', response: '45–60 min' },
  { name: 'Paisley', slug: 'paisley', postcode: 'PA', response: '30–45 min' },
  { name: 'Hamilton', slug: 'hamilton', postcode: 'ML', response: '35–50 min' },
  { name: 'Motherwell', slug: 'motherwell', postcode: 'ML', response: '40–55 min' },
  { name: 'East Kilbride', slug: 'east-kilbride', postcode: 'G74', response: '35–50 min' },
  { name: 'Cumbernauld', slug: 'cumbernauld', postcode: 'G67', response: '30–45 min' },
  { name: 'Kilmarnock', slug: 'kilmarnock', postcode: 'KA', response: '40–55 min' },
  { name: 'Ayr', slug: 'ayr', postcode: 'KA7', response: '45–60 min' },
  { name: 'Irvine', slug: 'irvine', postcode: 'KA11', response: '40–55 min' },
  { name: 'Greenock', slug: 'greenock', postcode: 'PA15', response: '35–50 min' },
  { name: 'Livingston', slug: 'livingston', postcode: 'EH54', response: '55–70 min' },
  { name: 'Falkirk', slug: 'falkirk', postcode: 'FK', response: '45–60 min' },
  { name: 'Kirkcaldy', slug: 'kirkcaldy', postcode: 'KY', response: '55–70 min' },
  { name: 'Dunfermline', slug: 'dunfermline', postcode: 'KY11', response: '50–65 min' },
  { name: 'Elgin', slug: 'elgin', postcode: 'IV30', response: '~110 min' },
  { name: 'Fort William', slug: 'fort-william', postcode: 'PH33', response: '~100 min' },
  { name: 'Dumfries', slug: 'dumfries', postcode: 'DG', response: '80–100 min' },
  { name: 'Galashiels', slug: 'galashiels', postcode: 'TD1', response: '65–80 min' },
  { name: 'Oban', slug: 'oban', postcode: 'PA34', response: '~110 min' },
  { name: 'Wick', slug: 'wick', postcode: 'KW1', response: '~3 hrs' },
  { name: 'Isle of Skye', slug: 'isle-of-skye', postcode: 'IV41', response: '~2 hrs' },
  { name: 'Stornoway', slug: 'stornoway', postcode: 'HS1', response: 'By arrangement' },
  { name: 'Lerwick', slug: 'lerwick', postcode: 'ZE1', response: 'By arrangement' },
  { name: 'Arbroath', slug: 'arbroath', postcode: 'DD11', response: '55–75 min' },
  { name: 'Dingwall', slug: 'dingwall', postcode: 'IV15', response: '~105 min' },
  { name: 'Pitlochry', slug: 'pitlochry', postcode: 'PH16', response: '80–100 min' },
  { name: 'St Andrews', slug: 'st-andrews', postcode: 'KY16', response: '65–85 min' },
  { name: 'East Lothian', slug: 'east-lothian', postcode: 'EH41', response: '60–80 min' },
];

const faqs = [
  {
    question: 'What is mobile tyre fitting?',
    answer: 'Mobile tyre fitting is a service where a certified fitter drives to your exact location — your home, workplace, car park, or roadside — and replaces or repairs your tyres on the spot. You do not need to drive to a garage or wait for a tow truck.',
  },
  {
    question: 'How much does mobile tyre fitting cost in Scotland?',
    answer: 'Fitting fee starts from £20 per tyre. Tyre prices vary by size and brand — budget tyres from around £40, premium from £80+. Emergency callout fee is from £49. Puncture repair from £25. We give you a full itemized quote before any work begins.',
  },
  {
    question: 'How quickly can a mobile tyre fitter reach me in Scotland?',
    answer: 'Response times depend on your location. In Greater Glasgow: 25–40 minutes. Central Belt cities (Edinburgh, Falkirk, Stirling): 45–65 minutes. Dundee, Perth, Kirkcaldy: 60–85 minutes. Aberdeen, Inverness: approximately 90–100 minutes. Remote Highland and island locations: we give an honest ETA when you call.',
  },
  {
    question: 'Do you cover rural Scotland and the Highlands?',
    answer: 'Yes — we cover all of Scotland including rural Highland areas, the NC500 route, and Scottish islands. For very remote locations and islands (Skye, Lewis, Shetland), we require advance booking and response times are longer. Call 0141 266 0690 and we will tell you the honest ETA for your location.',
  },
  {
    question: 'Can you fit tyres at my home or workplace?',
    answer: 'Yes — the most popular use of our mobile service. We come to your home, office car park, or any safe flat surface. No need to take a day off or arrange a lift. Book online or call us and we will confirm a time window.',
  },
  {
    question: 'Do I need to know my tyre size?',
    answer: 'No. Give us your vehicle registration number and we will look up the correct tyre specification. Your tyre size is also printed on the sidewall of your current tyre (e.g., 205/55R16). We carry a wide range of sizes on every van.',
  },
];

const howTo = getHowToSchema({
  name: 'How to get mobile tyre fitting in Scotland',
  description: 'Simple steps to get a tyre fitted at your location anywhere in Scotland.',
  steps: [
    { name: 'Call or book online', text: 'Call 0141 266 0690 or use our online booking form. Give your postcode, vehicle registration, and describe the tyre issue.' },
    { name: 'Confirm your quote', text: 'We will quote a total price covering the tyre, fitting fee, and any callout charge. For emergencies, we confirm before dispatching.' },
    { name: 'Wait at your location', text: 'Stay safely at your car, home, or workplace. For motorway breakdowns, exit the vehicle and stand behind the barrier. We will give you an ETA.' },
    { name: 'Fitter arrives with your tyre', text: 'Our fitter arrives with the correct tyre already loaded on the van. The full fitting including balancing takes 20–40 minutes.' },
    { name: 'Drive away — done', text: 'Your new tyre is fitted, balanced, and torqued to manufacturer specification. TPMS is reset where required. Your old tyre is taken away for recycling.' },
  ],
});

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
  cityGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px', marginTop: '32px' },
  cityCard: { border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', background: '#18181B', padding: '16px' },
  cityLink: { color: '#F4F4F5', textDecoration: 'none', fontWeight: 700, fontSize: '16px', display: 'block', marginBottom: '4px' },
  cityMeta: { color: '#A1A1AA', fontSize: '13px' },
  pricingRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginTop: '32px' },
  pricingCard: { border: '1px solid rgba(249,115,22,0.25)', borderRadius: '8px', background: '#18181B', padding: '20px' },
  pricingLabel: { color: '#A1A1AA', fontSize: '13px', textTransform: 'uppercase' as const, letterSpacing: '0.1em' },
  pricingAmount: { color: '#F97316', fontSize: '32px', fontWeight: 900, marginTop: '4px', fontFamily: 'var(--font-display)' },
  pricingNote: { color: '#71717A', fontSize: '12px', marginTop: '6px' },
  faqSection: { borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '24px' },
  faqItem: { borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '18px 0' },
  faqQ: { fontWeight: 700, color: '#F4F4F5', marginBottom: '8px', fontSize: '16px' },
  faqA: { color: '#A1A1AA', lineHeight: 1.7, fontSize: '15px' },
  trustBar: { display: 'flex', gap: '24px', flexWrap: 'wrap' as const, margin: '24px 0 0', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '24px' },
  trustItem: { color: '#D4D4D8', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' },
};

export default function MobileTyreFittingPage() {
  return (
    <div style={s.page}>
      <JsonLd data={[
        getLocalBusinessSchema(),
        getBreadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Mobile Tyre Fitting Scotland', path: '/mobile-tyre-fitting' },
        ]),
        getFAQSchema(faqs),
        howTo,
      ]} />
      <Nav />

      <main id="main-content">
        <header style={s.hero}>
          <div style={s.wrap}>
            <p style={s.eyebrow}>Mobile tyre fitting · All of Scotland</p>
            <h1 style={s.h1}>Mobile Tyre Fitting Scotland</h1>
            <p style={s.lead}>
              We come to you — home, work, car park, or roadside. Covering all of Scotland from
              Glasgow to Shetland. Fitting from £20. Emergency callout from £49.
              Available 24 hours a day, 7 days a week.
            </p>
            <div style={s.ctaRow}>
              <a href="tel:01412660690" style={s.ctaPrimary}>Call 0141 266 0690</a>
              <Link href="/book" style={s.ctaSecondary}>Book Online</Link>
              <Link href="/emergency" style={s.ctaSecondary}>Emergency Callout</Link>
            </div>
            <div style={s.trustBar}>
              <span style={s.trustItem}>★★★★★ 4.8 / 5 on Trustpilot</span>
              <span style={s.trustItem}>34 Scottish cities covered</span>
              <span style={s.trustItem}>G to ZE postcodes</span>
              <span style={s.trustItem}>Fitting from £20</span>
            </div>
          </div>
        </header>

        <section style={s.section}>
          <div style={s.wrap}>
            <h2 style={s.h2}>Prices for Mobile Tyre Fitting in Scotland</h2>
            <p style={{ color: '#A1A1AA', fontSize: '16px', maxWidth: '700px', marginBottom: '0' }}>
              All prices shown are guide prices. Your final quote is confirmed before any work begins — no surprises.
            </p>
            <div style={s.pricingRow}>
              {[
                { label: 'Mobile tyre fitting', amount: 'from £20', note: 'Per tyre fitting fee. Tyre price separate.' },
                { label: 'Emergency callout', amount: 'from £49', note: 'Confirmed before dispatch. Tyre price separate.' },
                { label: 'Puncture repair', amount: 'from £25', note: 'Where the tyre is legally repairable.' },
              ].map((item) => (
                <div key={item.label} style={s.pricingCard}>
                  <p style={s.pricingLabel}>{item.label}</p>
                  <p style={s.pricingAmount}>{item.amount}</p>
                  <p style={s.pricingNote}>{item.note}</p>
                </div>
              ))}
            </div>
            <p style={{ color: '#71717A', fontSize: '13px', marginTop: '16px' }}>
              <Link href="/pricing-faq" style={{ color: '#F97316' }}>Pricing FAQ →</Link>{' '}
              including tyre supply, TPMS reset, and city-specific response times.
            </p>
          </div>
        </section>

        <section style={s.sectionAlt}>
          <div style={s.wrap}>
            <h2 style={s.h2}>Mobile Tyre Fitting by City</h2>
            <p style={{ color: '#A1A1AA', fontSize: '16px', maxWidth: '700px', marginBottom: '0' }}>
              Select your city for local pricing, response times, and area coverage. We cover all
              Scottish postcodes — G to ZE.
            </p>
            <div style={s.cityGrid}>
              {cities.map((city) => (
                <div key={city.slug} style={s.cityCard}>
                  <Link href={`/mobile-tyre-fitting/${city.slug}`} style={s.cityLink}>
                    {city.name}
                  </Link>
                  <p style={s.cityMeta}>
                    {city.postcode} · {city.response}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={s.section}>
          <div style={s.wrap}>
            <h2 style={s.h2}>How Mobile Tyre Fitting Works</h2>
            <p style={{ color: '#A1A1AA', fontSize: '16px', maxWidth: '700px' }}>
              No garage visit needed. Here is what happens from your call to your car being road-ready.
            </p>
            <ol style={{ color: '#D4D4D8', lineHeight: 1.8, maxWidth: '680px', paddingLeft: '20px', marginTop: '16px' }}>
              <li><strong>Call or book online</strong> — give us your location, reg, and tyre issue.</li>
              <li><strong>We confirm your quote</strong> — full price including tyre, fitting, and callout.</li>
              <li><strong>Wait safely</strong> at home, work, or roadside while we drive to you.</li>
              <li><strong>Fitter arrives</strong> with the correct tyre already on the van.</li>
              <li><strong>Drive away</strong> — new tyre fitted, balanced, torqued. Old tyre recycled.</li>
            </ol>
            <div style={{ ...s.ctaRow, marginTop: '24px' }}>
              <a href="tel:01412660690" style={s.ctaPrimary}>Call 0141 266 0690</a>
              <Link href="/book" style={s.ctaSecondary}>Book Online Now</Link>
            </div>
          </div>
        </section>

        <section style={s.sectionAlt}>
          <div style={s.wrap}>
            <h2 style={s.h2}>Frequently Asked Questions</h2>
            <div style={s.faqSection}>
              {faqs.map((faq) => (
                <div key={faq.question} style={s.faqItem}>
                  <p style={s.faqQ}>{faq.question}</p>
                  <p style={s.faqA}>{faq.answer}</p>
                </div>
              ))}
            </div>
            <div style={{ ...s.ctaRow, marginTop: '32px' }}>
              <Link href="/faq" style={s.ctaSecondary}>Full FAQ →</Link>
              <Link href="/pricing-faq" style={s.ctaSecondary}>Pricing FAQ →</Link>
              <Link href="/service-areas" style={s.ctaSecondary}>All Service Areas →</Link>
              <Link href="/blog" style={s.ctaSecondary}>City Guides →</Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
