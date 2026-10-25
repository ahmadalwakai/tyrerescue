import Link from 'next/link';
import { AnimatedHeroLines, AnimatedSection, AnimatedStat } from '@/components/Animated';
import { AreaGrid } from '@/components/AreaGrid';
import { CtaBanner } from '@/components/CtaBanner';
import { FaqBlock } from '@/components/FaqBlock';
import { JsonLd } from '@/components/JsonLd';
import { LiveActivityTicker } from '@/components/LiveActivityTicker';
import { OrangeParticles } from '@/components/OrangeParticles';
import { ServiceBento } from '@/components/ServiceBento';
import { StickySteps } from '@/components/StickySteps';
import { TestimonialMarquee } from '@/components/TestimonialMarquee';
import { HOME_FAQS } from '@/lib/content';
import { getFAQSchema } from '@/lib/schemas';
import { PHONE_DISPLAY, PHONE_TEL, WHATSAPP } from '@/lib/seo-data';

const TRUST_ITEMS = [
  'OWN WORKSHOP PARKHEAD G31',
  'FULLY INSURED',
  'ALL G1–G78 POSTCODES',
  'REAL FITTERS NOT BROKERS',
  '24/7 · 365 DAYS',
  'SAME-DAY AVAILABILITY',
  'CONTINENTAL · MICHELIN · GOODYEAR',
];

const WHY_ITEMS = [
  {
    num: '01',
    title: 'OWN WORKSHOP',
    body: 'Parkhead G31 — real stock, real fitters, Glasgow dispatch behind every booking.',
  },
  {
    num: '02',
    title: 'DIRECT — NO BROKER',
    body: 'Your booking goes straight into our dispatch system. No middlemen, no delays.',
  },
  {
    num: '03',
    title: 'FULLY INSURED',
    body: 'Public liability and professional process on every roadside, home and workplace job.',
  },
  {
    num: '04',
    title: '24/7 · 365',
    body: 'We answer. Every call. Every hour. Christmas, bank holidays, 3am on the M8.',
  },
];

export default function Home() {
  const trustContent = [...TRUST_ITEMS, ...TRUST_ITEMS, ...TRUST_ITEMS];

  return (
    <main>
      <JsonLd data={getFAQSchema(HOME_FAQS)} />

      {/* ─── HERO ─── */}
      <section className="hero-black">
        <OrangeParticles />
        <div className="hero-speedlines" aria-hidden="true" />
        <div className="hero-corona" aria-hidden="true" />

        <div className="hero-content hero-centered">
          <div className="live-badge">
            <span className="live-dot" aria-hidden="true" />
            LIVE · GLASGOW CALLOUTS ACTIVE
          </div>

          <AnimatedHeroLines lines={['FLAT TYRE?', '35 MINUTES.']} />

          <p className="hero-sub">
            <span className="hero-accent">24/7</span> emergency mobile tyre fitting across all Glasgow
            postcodes G1–G78. Real fitters, own workshop — not a broker.
          </p>

          <div className="hero-cta-row">
            <a className="hero-call-btn btn-flame" href={`tel:${PHONE_TEL}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.3 1 .3 2 .5 3.1.5.7 0 1.3.6 1.3 1.3v3.5c0 .7-.6 1.3-1.3 1.3C10.2 21.5 2.5 13.8 2.5 4.3 2.5 3.6 3.1 3 3.8 3h3.5c.7 0 1.3.6 1.3 1.3 0 1.1.2 2.1.5 3.1.1.4 0 .9-.3 1.2l-2.2 2.2Z" />
              </svg>
              CALL {PHONE_DISPLAY}
            </a>
            <Link className="hero-book-btn" href="/book?type=emergency">
              BOOK EMERGENCY →
            </Link>
            <a
              className="hero-whatsapp-btn"
              href={`https://wa.me/${WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2.5A9.3 9.3 0 0 0 4 16.6l-1 4.9 5-1.2A9.3 9.3 0 1 0 12 2.5Zm5.4 13.2c-.2.6-1.1 1.1-1.8 1.2-.5.1-1.1.2-3.4-.8-2.9-1.2-4.8-4.2-4.9-4.4-.1-.1-1.2-1.6-1.2-3 0-1.5.8-2.2 1.1-2.5.2-.3.6-.4.9-.4h.6c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.4.5-.3.4c-.1.2-.2.4 0 .6.2.4.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.5 1.6.3.1.5.1.7-.1l.9-1.1c.2-.3.5-.2.8-.1l1.9.9c.3.1.5.2.6.4.1.1.1.8-.1 1.5Z" />
              </svg>
              WHATSAPP
            </a>
          </div>

          <LiveActivityTicker />

          <div className="hero-stats redesign-stats">
            <AnimatedStat value={35} suffix=" MIN" label="Avg Response Time" />
            <AnimatedStat value={24} suffix="/7" label="Always Available" />
            <AnimatedStat value={5000} suffix="+" label="Tyres Fitted" />
          </div>
        </div>
      </section>

      {/* ─── TRUST TICKER ─── */}
      <div className="trust-ticker" aria-label="Trust signals">
        <div className="ticker-track">
          {trustContent.map((item, i) => (
            <span key={`${item}-${i}`}>
              <em>✓</em> {item} ·
            </span>
          ))}
        </div>
      </div>

      {/* ─── SERVICES ─── */}
      <ServiceBento />

      {/* ─── HOW IT WORKS ─── */}
      <StickySteps />

      {/* ─── AREAS ─── */}
      <AreaGrid title="ALL GLASGOW — G1 TO G78" />

      {/* ─── WHY US ─── */}
      <section className="section why-section">
        <div className="container">
          <AnimatedSection>
            <h2 className="section-title bordered-title">WHY 247 MO</h2>
          </AnimatedSection>
          <div className="why-list">
            {WHY_ITEMS.map((item, i) => (
              <AnimatedSection key={item.num} delay={i * 0.08}>
                <div className="why-row">
                  <span className="why-num">{item.num}</span>
                  <div>
                    <h3 className="why-title">{item.title}</h3>
                    <p className="why-body">{item.body}</p>
                  </div>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TESTIMONIALS ─── */}
      <TestimonialMarquee />

      {/* ─── FAQ ─── */}
      <FaqBlock faqs={HOME_FAQS} title="COMMON QUESTIONS" />

      {/* ─── CTA ─── */}
      <CtaBanner title="FLAT TYRE IN GLASGOW?" />
    </main>
  );
}
