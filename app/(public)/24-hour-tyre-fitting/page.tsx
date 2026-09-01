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
  getEmergencyServiceSchema,
} from '@/lib/seo/schemas';

const SITE_URL = 'https://www.tyrerescue.uk';

export const metadata: Metadata = {
  title: '24 Hour Tyre Fitting Scotland | Night Callout | Tyre Rescue',
  description:
    'Tyre Rescue provides 24 hour mobile tyre fitting across all of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness, Highlands and Islands. Flat tyre at 2am? Call 0141 266 0690. We answer night and day.',
  keywords: [
    '24 hour tyre fitting scotland',
    '24 hour tyre fitting glasgow',
    '24 hour tyre fitting edinburgh',
    '24/7 tyre fitting scotland',
    'night tyre fitting scotland',
    'out of hours tyre fitting scotland',
    'overnight tyre fitting glasgow',
    'emergency tyre fitting 24 hour scotland',
    'flat tyre at night scotland',
    '24 hour mobile tyre fitter near me',
  ].join(', '),
  alternates: { canonical: `${SITE_URL}/24-hour-tyre-fitting` },
  openGraph: {
    title: '24 Hour Tyre Fitting Scotland | Night Callout | Tyre Rescue',
    description:
      'Flat tyre at midnight? We operate 24 hours a day, 7 days a week across all of Scotland. Call 0141 266 0690.',
    url: `${SITE_URL}/24-hour-tyre-fitting`,
    type: 'website',
    images: [{ url: `${SITE_URL}/images/home/slide-1.webp`, width: 1200, height: 630, alt: '24 hour mobile tyre fitting Scotland — Tyre Rescue' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '24 Hour Tyre Fitting Scotland | Tyre Rescue',
    description: 'Available 24 hours a day, 7 days a week across all of Scotland. Call 0141 266 0690.',
  },
};

const faqs = [
  {
    question: 'Are you genuinely available 24 hours a day, 7 days a week?',
    answer:
      'Yes. Tyre Rescue operates around the clock, including nights, weekends, bank holidays, and Christmas. Call 0141 266 0690 at any time and our dispatch team will answer and confirm your ETA. We do not use an answering service — you speak directly to someone who can dispatch a fitter.',
  },
  {
    question: 'How much does a 24-hour emergency tyre callout cost?',
    answer:
      'Our emergency callout fee starts from £49, which is confirmed before we dispatch a fitter. The tyre cost is separate and depends on size and brand. We give you a full itemised quote including callout fee, tyre, and fitting before any work begins — no surprises on your bill.',
  },
  {
    question: 'How quickly can a fitter reach me in the middle of the night?',
    answer:
      'Response times are the same day or night. In Greater Glasgow: 25–40 minutes. Edinburgh, Stirling, Falkirk: 50–70 minutes. Aberdeen, Inverness: approximately 90–100 minutes. Rural Highland areas: we give you an honest ETA based on your exact postcode.',
  },
  {
    question: 'Can you come to a motorway or dual carriageway at night?',
    answer:
      'Yes — but for your safety, exit the vehicle and stand behind the barrier before we arrive. Call us as soon as you are safely off the road. For motorway breakdowns, Highways Scotland recommends calling 0300 123 5000 (Traffic Scotland) as well as your tyre fitter.',
  },
  {
    question: 'Do you cover rural Scotland and the Highlands at night?',
    answer:
      'Yes — we cover all of Scotland 24/7, including the Highlands, NC500, Argyll, Galloway, and Scottish islands. For very remote locations, call us to get an accurate ETA for your specific location. We will always be honest about timing.',
  },
  {
    question: 'What should I do while waiting for a 24-hour tyre fitter?',
    answer:
      'Move your vehicle to a safe location — a layby, car park, or off the road. Turn on your hazard lights. Stand well away from moving traffic. Stay warm if it is cold — have a blanket in the car. Call us and stay on an accessible phone. Keep the area around your flat tyre clear for our fitter to work safely.',
  },
];

const cities = [
  { name: 'Glasgow', href: '/mobile-tyre-fitting/glasgow', response: '25–40 min' },
  { name: 'Edinburgh', href: '/mobile-tyre-fitting/edinburgh', response: '50–65 min' },
  { name: 'Aberdeen', href: '/mobile-tyre-fitting/aberdeen', response: '~90 min' },
  { name: 'Inverness', href: '/mobile-tyre-fitting/inverness', response: '~100 min' },
  { name: 'Dundee', href: '/mobile-tyre-fitting/dundee', response: '65–80 min' },
  { name: 'Stirling', href: '/mobile-tyre-fitting/stirling', response: '45–60 min' },
  { name: 'Paisley', href: '/mobile-tyre-fitting/paisley', response: '30–45 min' },
  { name: 'Hamilton', href: '/mobile-tyre-fitting/hamilton', response: '35–50 min' },
  { name: 'Falkirk', href: '/mobile-tyre-fitting/falkirk', response: '45–60 min' },
  { name: 'Perth', href: '/mobile-tyre-fitting/perth', response: '70–85 min' },
  { name: 'Kilmarnock', href: '/mobile-tyre-fitting/kilmarnock', response: '40–55 min' },
  { name: 'Ayr', href: '/mobile-tyre-fitting/ayr', response: '45–60 min' },
];

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#09090B', color: '#F4F4F5' },
  hero: { borderBottom: '1px solid rgba(255,255,255,0.12)', padding: 'clamp(48px,8vw,88px) 16px' },
  wrap: { maxWidth: '1120px', margin: '0 auto' },
  eyebrow: { color: '#F97316', fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, marginBottom: '16px' },
  h1: { fontSize: 'clamp(36px,6vw,76px)', lineHeight: 0.95, margin: 0, maxWidth: '900px', fontFamily: 'var(--font-display)' },
  lead: { color: '#D4D4D8', fontSize: '18px', lineHeight: 1.7, maxWidth: '760px', marginTop: '24px' },
  ctaRow: { display: 'flex', gap: '12px', flexWrap: 'wrap' as const, marginTop: '28px' },
  ctaPrimary: { display: 'inline-flex', alignItems: 'center', minHeight: '48px', padding: '12px 20px', borderRadius: '4px', background: '#F97316', color: '#09090B', fontWeight: 800, textDecoration: 'none', fontSize: '17px' },
  ctaSecondary: { display: 'inline-flex', alignItems: 'center', minHeight: '44px', padding: '12px 18px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.24)', color: '#F4F4F5', fontWeight: 700, textDecoration: 'none' },
  trustBar: { display: 'flex', gap: '24px', flexWrap: 'wrap' as const, margin: '24px 0 0', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '24px' },
  trustItem: { color: '#D4D4D8', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' },
  section: { padding: '56px 16px' },
  sectionAlt: { padding: '56px 16px', background: '#0F0F12' },
  h2: { fontSize: 'clamp(26px,4vw,44px)', lineHeight: 1.05, margin: '0 0 16px', fontFamily: 'var(--font-display)' },
  lead2: { color: '#A1A1AA', fontSize: '16px', maxWidth: '700px', marginBottom: '0' },
  cityGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px', marginTop: '32px' },
  cityCard: { border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', background: '#18181B', padding: '16px' },
  cityLink: { color: '#F4F4F5', textDecoration: 'none', fontWeight: 700, fontSize: '16px', display: 'block', marginBottom: '4px' },
  cityMeta: { color: '#A1A1AA', fontSize: '13px' },
  pricingRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginTop: '32px' },
  pricingCard: { border: '1px solid rgba(249,115,22,0.25)', borderRadius: '8px', background: '#18181B', padding: '24px' },
  pricingLabel: { color: '#A1A1AA', fontSize: '13px', textTransform: 'uppercase' as const, letterSpacing: '0.1em' },
  pricingAmount: { color: '#F97316', fontSize: '32px', fontWeight: 900, marginTop: '4px', fontFamily: 'var(--font-display)' },
  pricingNote: { color: '#71717A', fontSize: '12px', marginTop: '6px' },
  stepsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '32px' },
  stepCard: { border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', background: '#18181B', padding: '20px' },
  stepNum: { color: '#F97316', fontWeight: 900, fontSize: '28px', fontFamily: 'var(--font-display)', marginBottom: '8px' },
  stepTitle: { fontWeight: 700, color: '#F4F4F5', fontSize: '16px', marginBottom: '8px' },
  stepText: { color: '#A1A1AA', fontSize: '14px', lineHeight: 1.6 },
  faqSection: { borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '24px' },
  faqItem: { borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '18px 0' },
  faqQ: { fontWeight: 700, color: '#F4F4F5', marginBottom: '8px', fontSize: '16px' },
  faqA: { color: '#A1A1AA', lineHeight: 1.7, fontSize: '15px' },
};

const steps = [
  { num: '1', title: 'Call 0141 266 0690', text: 'Our dispatch team answers 24 hours a day. Give your postcode and vehicle registration. We will identify your tyre size and quote a total price immediately.' },
  { num: '2', title: 'We confirm price and ETA', text: 'We quote the full price — callout fee, tyre, and fitting — before dispatching. You approve it. No surprises. ETA confirmed based on your exact location.' },
  { num: '3', title: 'Wait safely', text: 'Move off the road. Hazard lights on. Stand clear of moving traffic. Keep warm. We will call you when the fitter is close.' },
  { num: '4', title: 'Fitter arrives with your tyre', text: 'Our fitter arrives with the correct tyre already loaded. Full fitting including balancing: 20–40 minutes. TPMS reset included. Old tyre taken for recycling.' },
  { num: '5', title: 'Drive away — any hour', text: 'New tyre fitted to manufacturer specification. Safe to drive wherever you were headed — even at 3am.' },
];

export default function TwentyFourHourTyreFittingPage() {
  const jsonLd = [
    getLocalBusinessSchema(),
    getEmergencyServiceSchema(),
    getBreadcrumbSchema([
      { name: 'Home', path: '/' },
      { name: '24 Hour Tyre Fitting Scotland', path: '/24-hour-tyre-fitting' },
    ]),
    getFAQSchema(faqs),
  ];

  return (
    <div style={s.page}>
      <JsonLd data={jsonLd} />
      <Nav />

      <main id="main-content">
        {/* Hero */}
        <header style={s.hero}>
          <div style={s.wrap}>
            <p style={s.eyebrow}>24/7 mobile tyre fitting · All of Scotland</p>
            <h1 style={s.h1}>24 Hour Tyre Fitting Scotland</h1>
            <p style={s.lead}>
              Flat tyre at midnight? 3am blowout on the A9? We operate 24 hours a day,
              7 days a week, 365 days a year across all of Scotland — from Glasgow to the
              Highlands. Call now and we answer immediately.
            </p>
            <div style={s.ctaRow}>
              <a href="tel:01412660690" style={s.ctaPrimary}>Call Now — 0141 266 0690</a>
              <Link href="/book" style={s.ctaSecondary}>Book Online</Link>
              <Link href="/emergency-tyre-fitting-near-me" style={s.ctaSecondary}>Emergency Fitting</Link>
            </div>
            <div style={s.trustBar}>
              <span style={s.trustItem}>★ Available right now — 24/7</span>
              <span style={s.trustItem}>★ Night callouts answered immediately</span>
              <span style={s.trustItem}>★ Emergency callout from £49</span>
              <span style={s.trustItem}>★ All of Scotland covered</span>
            </div>
          </div>
        </header>

        {/* Why 24-hour matters */}
        <section style={s.section}>
          <div style={s.wrap}>
            <h2 style={s.h2}>Why 24 Hour Tyre Fitting Matters in Scotland</h2>
            <p style={s.lead2}>
              Scotland's road network — the A9, A82, A835, NC500, and countless rural B-roads —
              means that a flat tyre can happen far from any garage, and at any hour. Waiting
              until morning is not always an option. We designed our service around this.
            </p>
            <div style={{ marginTop: '32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {[
                { title: 'No garage needed', text: 'We come to you — home, roadside, motorway layby, hotel car park, or remote Highland road. You do not need to find a garage or arrange a tow.' },
                { title: 'Night shifts, shift workers, travellers', text: 'Many of our callouts are from shift workers finishing late, lorry drivers, and long-distance travellers who cannot afford to wait until 8am. We understand.' },
                { title: 'Honest ETA, not a guessed window', text: 'We give you a real estimated arrival time based on your exact postcode — not a 4-hour window. You will know when we are arriving.' },
              ].map((item) => (
                <div key={item.title} style={s.stepCard}>
                  <p style={s.stepTitle}>{item.title}</p>
                  <p style={s.stepText}>{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section style={s.sectionAlt}>
          <div style={s.wrap}>
            <h2 style={s.h2}>24 Hour Callout Pricing</h2>
            <p style={s.lead2}>
              All prices confirmed before dispatch. Our 24-hour emergency rate is the same
              as our daytime emergency rate — no night premium.
            </p>
            <div style={s.pricingRow}>
              {[
                { label: 'Emergency callout fee', amount: 'from £49', note: 'Confirmed before we dispatch. Same rate day and night.' },
                { label: 'Tyre fitting (per tyre)', amount: 'from £20', note: 'Tyre cost is separate. We quote the total before starting.' },
                { label: 'Puncture repair', amount: 'from £25', note: 'Only where the tyre is legally repairable.' },
              ].map((item) => (
                <div key={item.label} style={s.pricingCard}>
                  <p style={s.pricingLabel}>{item.label}</p>
                  <p style={s.pricingAmount}>{item.amount}</p>
                  <p style={s.pricingNote}>{item.note}</p>
                </div>
              ))}
            </div>
            <p style={{ color: '#71717A', fontSize: '13px', marginTop: '20px' }}>
              <Link href="/pricing" style={{ color: '#F97316' }}>Full pricing breakdown →</Link>
            </p>
          </div>
        </section>

        {/* How it works */}
        <section style={s.section}>
          <div style={s.wrap}>
            <h2 style={s.h2}>How 24 Hour Tyre Fitting Works</h2>
            <p style={s.lead2}>Five steps from your phone call to driving away safely.</p>
            <div style={s.stepsGrid}>
              {steps.map((step) => (
                <div key={step.num} style={s.stepCard}>
                  <p style={s.stepNum}>{step.num}</p>
                  <p style={s.stepTitle}>{step.title}</p>
                  <p style={s.stepText}>{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Cities */}
        <section style={s.sectionAlt}>
          <div style={s.wrap}>
            <h2 style={s.h2}>24 Hour Coverage Across Scotland</h2>
            <p style={s.lead2}>
              Response times shown are typical — actual ETA given when you call, based on
              exact location and current fitter positions.
            </p>
            <div style={s.cityGrid}>
              {cities.map((city) => (
                <div key={city.href} style={s.cityCard}>
                  <Link href={city.href} style={s.cityLink}>{city.name}</Link>
                  <p style={s.cityMeta}>Typical response: {city.response}</p>
                </div>
              ))}
            </div>
            <p style={{ color: '#71717A', fontSize: '13px', marginTop: '20px' }}>
              <Link href="/service-areas" style={{ color: '#F97316' }}>All 34 Scottish service areas →</Link>
            </p>
          </div>
        </section>

        {/* Night tyre advice */}
        <section style={s.section}>
          <div style={s.wrap}>
            <h2 style={s.h2}>What to Do With a Flat Tyre at Night</h2>
            <ol style={{ color: '#D4D4D8', lineHeight: 1.9, maxWidth: '680px', paddingLeft: '20px', fontSize: '16px' }}>
              <li><strong>Do not panic.</strong> Move your vehicle to the safest position possible — hard shoulder, layby, car park, or verge.</li>
              <li><strong>Turn on your hazard lights immediately</strong> — even before you stop fully, if safe to do so.</li>
              <li><strong>Do not change the tyre yourself on a motorway or busy A-road at night</strong> — the risk of being hit is too high. Call us instead.</li>
              <li><strong>Exit the vehicle</strong> on the side away from traffic. Stand behind the barrier if on a motorway. Wear a hi-vis jacket if you have one.</li>
              <li><strong>Call 0141 266 0690.</strong> Give your postcode or nearest landmark. We will come to you.</li>
              <li><strong>Stay visible.</strong> Keep your hazard lights on. Do not stand in the road to flag down help.</li>
            </ol>
            <div style={{ ...s.ctaRow, marginTop: '24px' }}>
              <a href="tel:01412660690" style={s.ctaPrimary}>Call Now — 0141 266 0690</a>
              <Link href="/blog/what-to-do-flat-tyre-motorway" style={s.ctaSecondary}>Motorway flat tyre guide</Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section style={s.sectionAlt}>
          <div style={s.wrap}>
            <h2 style={s.h2}>24 Hour Tyre Fitting — FAQs</h2>
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
              <Link href="/mobile-tyre-fitting" style={s.ctaSecondary}>Mobile Tyre Fitting →</Link>
              <Link href="/emergency-tyre-fitting-near-me" style={s.ctaSecondary}>Emergency Fitting →</Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
