import type { Metadata } from 'next';
import { AreaGrid } from '@/components/AreaGrid';
import { FaqBlock } from '@/components/FaqBlock';
import { JsonLd } from '@/components/JsonLd';
import { MapboxCoverage } from '@/components/MapboxCoverage';
import { getBreadcrumbSchema, getFAQSchema } from '@/lib/schemas';
import { SITE_URL } from '@/lib/seo-data';

export const metadata: Metadata = {
  title: { absolute: 'Areas We Cover in Glasgow | All G Postcodes | 247 Mo Glasgow' },
  description:
    '247 Mo Glasgow covers Glasgow and surrounding G postcodes for 24/7 mobile tyre fitting, emergency tyres and puncture repair.',
  alternates: { canonical: `${SITE_URL}/areas` },
};

const faqs = [
  {
    question: 'Which Glasgow postcodes do you cover?',
    answer: 'We cover G1-G78, including the city centre, west end, southside, east end and surrounding towns.',
  },
  {
    question: 'Do you go outside Glasgow?',
    answer: 'Yes, we cover nearby Greater Glasgow areas when a fitter and suitable tyre stock are available.',
  },
  {
    question: 'Where are you based?',
    answer: '247 Mo Glasgow is backed by a real tyre workshop in Parkhead, G31.',
  },
];

export default function AreasPage() {
  return (
    <main className="site-shell">
      <JsonLd data={getFAQSchema(faqs)} />
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Areas', path: '/areas' },
        ])}
      />
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow">All G postcodes</p>
          <h1>Areas We Cover in Glasgow</h1>
          <p>
            From Bearsden to Castlemilk, Drumchapel to Baillieston - mobile tyre fitting, puncture repair and emergency
            tyre callouts across Glasgow.
          </p>
        </div>
      </section>

      <section className="section section-dark">
        <div className="container">
          <p className="eyebrow">Coverage map</p>
          <h2 className="section-title">GLASGOW RESPONSE RADIUS</h2>
          <MapboxCoverage token={process.env.NEXT_PUBLIC_MAPBOX_TOKEN} />
        </div>
      </section>

      <AreaGrid />
      <FaqBlock faqs={faqs} title="Areas FAQ" />
    </main>
  );
}
