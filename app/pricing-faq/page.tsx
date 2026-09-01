import { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { getFAQSchema, getBreadcrumbSchema } from '@/lib/seo/schemas';
import { pricingFaqs } from '@/lib/content/pricing';

export const metadata: Metadata = {
  title: 'Mobile Tyre Fitting Pricing FAQ | Tyre Rescue',
  description:
    'Common questions about Tyre Rescue mobile tyre fitting prices, emergency callout fees, travel, weather, traffic and itemized quotes.',
  alternates: { canonical: 'https://www.tyrerescue.uk/pricing-faq' },
};

export default function PricingFAQPage() {
  return (
    <>
      <JsonLd data={getFAQSchema(pricingFaqs)} />
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Pricing FAQ', path: '/pricing-faq' },
        ])}
      />

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 1rem' }}>
        <h1>Tyre Fitting Pricing FAQ</h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.7, marginBottom: '2rem' }}>
          Straightforward answers about how we price mobile tyre fitting across all of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness, Highlands and Islands.
        </p>

        <dl>
          {pricingFaqs.map((faq, i) => (
            <div key={i} style={{ marginBottom: '1.5rem' }}>
              <dt style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.35rem' }}>
                {faq.question}
              </dt>
              <dd style={{ margin: 0, lineHeight: 1.7 }}>{faq.answer}</dd>
            </div>
          ))}
        </dl>

        <nav
          aria-label="Related pages"
          style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '2rem' }}
        >
          <Link href="/pricing" style={{ fontWeight: 600 }}>
            Full Pricing Guide →
          </Link>
          <Link href="/book" style={{ fontWeight: 600 }}>
            Get an Instant Quote →
          </Link>
        </nav>
      </main>
    </>
  );
}
