import { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { getFAQSchema, getBreadcrumbSchema } from '@/lib/seo/schemas';

export const metadata: Metadata = {
  title: 'Tyre Fitting Pricing FAQ — TyreRescue',
  description:
    'Common questions about our mobile tyre fitting prices. How we calculate costs, what affects pricing, and why our prices are transparent.',
  alternates: { canonical: 'https://www.tyrerescue.uk/pricing-faq' },
};

const faqs = [
  {
    question: 'Why does the tyre fitting price change?',
    answer:
      'Our prices reflect real-time factors: the tyre you choose, distance from our nearest depot, time of day, and current demand. This means you always pay a fair rate based on the actual cost of reaching you — not a padded flat fee designed around worst-case scenarios.',
  },
  {
    question: 'Does weather affect the price?',
    answer:
      'Yes. Heavy rain, snow and ice make roadside fitting slower and riskier for our engineers. A small weather adjustment of 5–25% may apply during adverse conditions. Clear-weather bookings carry no surcharge at all.',
  },
  {
    question: 'Is emergency tyre fitting more expensive?',
    answer:
      'Emergency callouts carry a 50% surcharge on the base fitting fee because they require a fitter to drop their current schedule and prioritise your job. If your situation allows, booking a standard or evening slot will always be cheaper.',
  },
  {
    question: 'How is the price calculated?',
    answer:
      'We start with the tyre cost and a £15-per-tyre fitting fee. Then we add distance (free under 10 km, £1 per km after), any time-slot or weather adjustments, and 20% VAT. The quote screen shows every line item before you confirm.',
  },
  {
    question: 'Is there a minimum callout charge?',
    answer:
      'There is no separate callout fee for jobs within 10 km of our depot. Beyond that, a distance charge of £1 per additional kilometre applies. This is shown clearly in your quote before you book.',
  },
  {
    question: 'Do you charge more at weekends?',
    answer:
      'Weekend bookings carry a 15% surcharge on the fitting fee. Evening slots (after 6 pm) are 20% extra. Standard weekday daytime slots have no surcharge. You can see the exact difference when you select a time slot in the booking flow.',
  },
  {
    question: 'Can I get a quote before booking?',
    answer:
      'Absolutely. Our online booking wizard gives you a full price breakdown — tyre cost, fitting, distance, surcharges and VAT — before you enter any payment details. The quote is valid for 30 minutes so you can compare with other options.',
  },
  {
    question: 'Are your prices competitive with garages?',
    answer:
      'In most cases, yes. We carry budget, mid-range and premium tyres at trade prices. Because we come to you, there is no need to pay for recovery or lose half a day at a garage. Our transparent breakdown lets you compare like-for-like with any quote.',
  },
  {
    question: 'Do prices include VAT?',
    answer:
      'Every price shown in your final quote includes 20% VAT. The breakdown separates the VAT line so you can see the net cost. Business customers can request a VAT invoice after payment.',
  },
  {
    question: 'What if the price changes after I book?',
    answer:
      'Once you confirm and pay, your price is locked. We will never ask for more on arrival. If we discover an issue that needs additional work (e.g. a corroded valve), we will explain the cost and get your approval before proceeding.',
  },
];

export default function PricingFAQPage() {
  return (
    <>
      <JsonLd data={getFAQSchema(faqs)} />
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Pricing FAQ', path: '/pricing-faq' },
        ])}
      />

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 1rem' }}>
        <h1>Tyre Fitting Pricing FAQ</h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.7, marginBottom: '2rem' }}>
          Straightforward answers about how we price mobile tyre fitting across
          Glasgow, Edinburgh and Central Scotland.
        </p>

        <dl>
          {faqs.map((faq, i) => (
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
