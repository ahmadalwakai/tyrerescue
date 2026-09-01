import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { JsonLd } from '@/components/seo/JsonLd';
import { getBreadcrumbSchema, getFAQSchema, getLocalBusinessSchema } from '@/lib/seo/schemas';

const SITE_URL = 'https://www.tyrerescue.uk';

export const metadata: Metadata = {
  title: 'Mobile Tyre Fitting Service Areas Scotland | Tyre Rescue',
  description:
    'Mobile tyre fitting across all of Scotland. We cover Glasgow, Edinburgh, Aberdeen, Inverness, Dundee, Perth, Stirling, the Highlands, Islands and every postcode in between. Find your area.',
  alternates: { canonical: `${SITE_URL}/service-areas` },
  openGraph: {
    title: 'Mobile Tyre Fitting Service Areas — All of Scotland | Tyre Rescue',
    description:
      'Tyre Rescue covers every Scottish postcode from G to ZE. Find mobile tyre fitting in your area — Central Belt, Highlands, Islands and everywhere in between.',
    url: `${SITE_URL}/service-areas`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mobile Tyre Fitting Service Areas Scotland | Tyre Rescue',
    description:
      'Find mobile tyre fitting in your area — we cover all of Scotland including Glasgow, Edinburgh, Aberdeen, Inverness, Highlands and Islands.',
  },
};

const regions = [
  {
    name: 'Glasgow & West Scotland',
    description: 'Our home territory. Fastest response times — typically 25–45 minutes across Greater Glasgow and the surrounding areas.',
    cities: [
      { name: 'Glasgow', slug: 'glasgow', postcode: 'G' },
      { name: 'Paisley', slug: 'paisley', postcode: 'PA1–PA3' },
      { name: 'Greenock', slug: 'greenock', postcode: 'PA15–PA16' },
      { name: 'Hamilton', slug: 'hamilton', postcode: 'ML3' },
      { name: 'East Kilbride', slug: 'east-kilbride', postcode: 'G74–G75' },
      { name: 'Motherwell', slug: 'motherwell', postcode: 'ML1' },
      { name: 'Cumbernauld', slug: 'cumbernauld', postcode: 'G67–G68' },
    ],
  },
  {
    name: 'Edinburgh & East Scotland',
    description: 'Scotland\'s capital and surrounding Lothians. Response typically 50–65 minutes from our base.',
    cities: [
      { name: 'Edinburgh', slug: 'edinburgh', postcode: 'EH1–EH17' },
      { name: 'Livingston', slug: 'livingston', postcode: 'EH54' },
      { name: 'Dunfermline', slug: 'dunfermline', postcode: 'KY11–KY12' },
      { name: 'Kirkcaldy', slug: 'kirkcaldy', postcode: 'KY1–KY2' },
      { name: 'East Lothian', slug: 'east-lothian', postcode: 'EH21–EH42' },
      { name: 'Falkirk', slug: 'falkirk', postcode: 'FK1–FK3' },
      { name: 'Stirling', slug: 'stirling', postcode: 'FK7–FK9' },
    ],
  },
  {
    name: 'Ayrshire & South Scotland',
    description: 'Ayrshire coast and South Scotland. Dispatched via M77 — typically 40–55 minutes.',
    cities: [
      { name: 'Kilmarnock', slug: 'kilmarnock', postcode: 'KA1–KA3' },
      { name: 'Ayr', slug: 'ayr', postcode: 'KA7–KA8' },
      { name: 'Irvine', slug: 'irvine', postcode: 'KA11–KA12' },
      { name: 'Dumfries', slug: 'dumfries', postcode: 'DG1–DG2' },
      { name: 'Galashiels', slug: 'galashiels', postcode: 'TD1' },
    ],
  },
  {
    name: 'Dundee & Tayside',
    description: 'Dundee city and surrounding Angus and Perthshire. Response typically 65–85 minutes.',
    cities: [
      { name: 'Dundee', slug: 'dundee', postcode: 'DD1–DD5' },
      { name: 'Perth', slug: 'perth', postcode: 'PH1–PH2' },
      { name: 'Arbroath', slug: 'arbroath', postcode: 'DD11' },
      { name: 'St Andrews', slug: 'st-andrews', postcode: 'KY16' },
      { name: 'Pitlochry', slug: 'pitlochry', postcode: 'PH16' },
    ],
  },
  {
    name: 'Aberdeen & North-East Scotland',
    description: 'Aberdeen and Aberdeenshire. Scotland\'s oil capital. Response approximately 90 minutes.',
    cities: [
      { name: 'Aberdeen', slug: 'aberdeen', postcode: 'AB10–AB25' },
      { name: 'Elgin', slug: 'elgin', postcode: 'IV30' },
      { name: 'Dingwall', slug: 'dingwall', postcode: 'IV15' },
    ],
  },
  {
    name: 'Inverness & the Highlands',
    description: 'Highland capital and surrounding area including the NC500 route. Response 90–120 minutes from Central Belt.',
    cities: [
      { name: 'Inverness', slug: 'inverness', postcode: 'IV1–IV3' },
      { name: 'Fort William', slug: 'fort-william', postcode: 'PH33–PH34' },
      { name: 'Oban', slug: 'oban', postcode: 'PA34' },
      { name: 'Wick', slug: 'wick', postcode: 'KW1' },
    ],
  },
  {
    name: 'Scottish Islands',
    description: 'Island services operate by advance booking (minimum 24 hours) due to ferry logistics.',
    cities: [
      { name: 'Isle of Skye', slug: 'isle-of-skye', postcode: 'IV41–IV56' },
      { name: 'Stornoway (Lewis & Harris)', slug: 'stornoway', postcode: 'HS1–HS9' },
      { name: 'Lerwick (Shetland)', slug: 'lerwick', postcode: 'ZE1–ZE3' },
    ],
  },
];

const services = [
  { name: 'Mobile Tyre Fitting', slug: 'mobile-tyre-fitting' },
  { name: 'Emergency Tyre Fitting', slug: 'emergency-tyre-fitting' },
  { name: 'Puncture Repair', slug: 'puncture-repair' },
  { name: 'Tyre Supply & Fit', slug: 'tyre-supply-and-fit' },
];

const coverageFaqs = [
  {
    question: 'What areas of Scotland do you cover for mobile tyre fitting?',
    answer: 'We cover all of Scotland — every postcode from G (Glasgow) to ZE (Shetland). This includes the Central Belt, all major cities, the Highlands, Argyll, the Scottish Borders, and the islands of Skye, Lewis, Orkney, and Shetland. Enter your postcode when booking and the system confirms your exact availability and response time.',
  },
  {
    question: 'How quickly can you reach areas outside Glasgow and Edinburgh?',
    answer: 'Response times vary by location: Central Belt cities (Hamilton, Falkirk, Stirling) are typically 35–50 minutes. Dundee, Perth and Kirkcaldy are 60–80 minutes. Aberdeen and Inverness are approximately 90 minutes. For very remote Highland locations and island services, advance booking of at least 24 hours is required.',
  },
  {
    question: 'Do you cover the NC500 tourist route?',
    answer: 'Yes. Our mobile fitters cover the entire NC500 route — from Inverness, around the north coast, through Torridon and Applecross, and back south. If you have a flat tyre on the NC500, call 0141 266 0690 immediately. Tell us your exact location and we will dispatch the nearest available fitter and give you a realistic ETA.',
  },
  {
    question: 'Is there an extra charge for remote or Highland locations?',
    answer: 'For most locations within 30 miles of a major town, there is no surcharge — our standard pricing applies. For very remote locations that require extended travel, a travel supplement may apply. We always confirm the total price before dispatching a fitter.',
  },
  {
    question: 'Do you cover the Scottish islands?',
    answer: 'Yes — we operate on Skye (accessible by bridge), Lewis and Harris, Shetland, and other islands. Island services require minimum 24 hours advance booking due to ferry scheduling. Call 0141 266 0690 to arrange island service.',
  },
];

const jsonLd = [
  getBreadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Service Areas', path: '/service-areas' },
  ]),
  getFAQSchema(coverageFaqs),
  getLocalBusinessSchema(),
];

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#09090B', color: '#F4F4F5' },
  hero: { borderBottom: '1px solid rgba(255,255,255,0.12)', padding: 'clamp(48px,8vw,88px) 16px' },
  wrap: { maxWidth: '1120px', margin: '0 auto' },
  eyebrow: { color: '#F97316', fontSize: '12px', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '16px' },
  h1: { fontSize: 'clamp(40px,7vw,80px)', lineHeight: 0.95, margin: 0, maxWidth: '900px', fontFamily: 'var(--font-display)' },
  lead: { color: '#D4D4D8', fontSize: '18px', lineHeight: 1.7, maxWidth: '760px', marginTop: '24px' },
  ctaRow: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '28px' },
  ctaPrimary: { display: 'inline-flex', alignItems: 'center', minHeight: '44px', padding: '12px 18px', borderRadius: '4px', background: '#F97316', color: '#09090B', fontWeight: 800, textDecoration: 'none' },
  ctaSecondary: { display: 'inline-flex', alignItems: 'center', minHeight: '44px', padding: '12px 18px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.24)', color: '#F4F4F5', fontWeight: 700, textDecoration: 'none' },
  section: { padding: '56px 16px' },
  sectionAlt: { padding: '56px 16px', background: '#0F0F12' },
  h2: { fontSize: 'clamp(28px,4vw,48px)', lineHeight: 1, margin: '0 0 12px', fontFamily: 'var(--font-display)' },
  regionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginTop: '40px' },
  regionCard: { border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', background: '#18181B', padding: '24px' },
  regionTitle: { fontSize: '20px', fontWeight: 800, marginBottom: '8px', color: '#F4F4F5' },
  regionDesc: { color: '#A1A1AA', fontSize: '14px', lineHeight: 1.6, marginBottom: '16px' },
  cityList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  cityLink: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#D4D4D8', textDecoration: 'none', fontSize: '14px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  postcodeBadge: { fontSize: '11px', color: '#A1A1AA', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '3px' },
  serviceGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '24px' },
  serviceCard: { border: '1px solid rgba(249,115,22,0.3)', borderRadius: '8px', background: '#18181B', padding: '16px' },
  serviceLink: { color: '#F97316', textDecoration: 'none', fontWeight: 700, fontSize: '15px' },
  faqSection: { borderTop: '1px solid rgba(255,255,255,0.12)', marginTop: '32px' },
  faqItem: { borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '20px 0' },
  faqQ: { fontWeight: 700, color: '#F4F4F5', marginBottom: '8px', fontSize: '16px' },
  faqA: { color: '#A1A1AA', lineHeight: 1.7, fontSize: '15px' },
};

export default function ServiceAreasPage() {
  return (
    <div style={s.page}>
      <JsonLd data={jsonLd} />
      <Nav />

      <main id="main-content">
        <header style={s.hero}>
          <div style={s.wrap}>
            <p style={s.eyebrow}>Mobile tyre fitting coverage</p>
            <h1 style={s.h1}>Mobile Tyre Fitting Across All of Scotland</h1>
            <p style={s.lead}>
              We cover every Scottish postcode from G (Glasgow) to ZE (Shetland) — 24 hours a day,
              7 days a week. Find your area below, or call 0141 266 0690 for an immediate response.
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
            <h2 style={s.h2}>Scotland Service Area Map</h2>
            <p style={{ ...s.lead, fontSize: '16px', marginTop: '8px', marginBottom: '0' }}>
              Select your region to find mobile tyre fitting near you. Every city links to a
              dedicated service page with local pricing, response times, and area coverage.
            </p>
            <div style={s.regionGrid}>
              {regions.map((region) => (
                <div key={region.name} style={s.regionCard}>
                  <h3 style={s.regionTitle}>{region.name}</h3>
                  <p style={s.regionDesc}>{region.description}</p>
                  <div style={s.cityList}>
                    {region.cities.map((city) => (
                      <Link
                        key={city.slug}
                        href={`/mobile-tyre-fitting/${city.slug}`}
                        style={s.cityLink}
                      >
                        <span>{city.name}</span>
                        <span style={s.postcodeBadge}>{city.postcode}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={s.sectionAlt}>
          <div style={s.wrap}>
            <h2 style={s.h2}>Services Available Across Scotland</h2>
            <p style={{ color: '#A1A1AA', fontSize: '16px', maxWidth: '760px', marginBottom: '0' }}>
              All services are available at every location in our coverage area. Response times
              and advance booking requirements vary by distance.
            </p>
            <div style={s.serviceGrid}>
              {services.map((svc) => (
                <div key={svc.slug} style={s.serviceCard}>
                  <Link href={`/${svc.slug}/glasgow`} style={s.serviceLink}>
                    {svc.name}
                  </Link>
                  <p style={{ color: '#A1A1AA', fontSize: '13px', marginTop: '6px', marginBottom: '0' }}>
                    Available across all of Scotland
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={s.section}>
          <div style={s.wrap}>
            <h2 style={s.h2}>Coverage Questions</h2>
            <div style={s.faqSection}>
              {coverageFaqs.map((faq) => (
                <div key={faq.question} style={s.faqItem}>
                  <p style={s.faqQ}>{faq.question}</p>
                  <p style={s.faqA}>{faq.answer}</p>
                </div>
              ))}
            </div>
            <div style={{ ...s.ctaRow, marginTop: '32px' }}>
              <Link href="/pricing" style={s.ctaSecondary}>View Pricing</Link>
              <Link href="/blog" style={s.ctaSecondary}>City Guides</Link>
              <Link href="/contact" style={s.ctaSecondary}>Contact Us</Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
