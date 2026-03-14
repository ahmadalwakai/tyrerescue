import { Metadata } from 'next';
import { FAQContent } from './FAQContent';

export const metadata: Metadata = {
  title: 'FAQ | Mobile Tyre Fitting Questions | Tyre Rescue Glasgow',
  description:
    'Answers to common questions about our mobile tyre fitting service. Pricing, coverage, response times and how to book.',
  alternates: { canonical: 'https://www.tyrerescue.uk/faq' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How quickly can you get to me in an emergency?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'For emergency callouts in Glasgow and Edinburgh city centres, we typically arrive within 45 minutes.',
      },
    },
    {
      '@type': 'Question',
      name: 'What areas do you cover?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'We cover Glasgow, Edinburgh, and all surrounding areas within 50 miles of our base.',
      },
    },
    {
      '@type': 'Question',
      name: 'How long does a mobile tyre fitting take?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A standard tyre fitting takes approximately 30 minutes per tyre.',
      },
    },
  ],
};

export default function FAQPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FAQContent />
    </>
  );
}
