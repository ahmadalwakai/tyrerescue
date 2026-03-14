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
        text: 'For emergency callouts in Glasgow and Edinburgh city centres, we typically arrive within 45 minutes. For surrounding areas, arrival times vary based on distance but we always provide an accurate ETA when you book.',
      },
    },
    {
      '@type': 'Question',
      name: 'What areas do you cover?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'We cover Glasgow, Edinburgh, and all surrounding areas within 50 miles of our base. This includes Paisley, East Kilbride, Hamilton, Livingston, Falkirk, and more.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do you fit tyres I have already purchased?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'We primarily fit tyres purchased through our service to ensure quality and warranty coverage. If you have tyres you need fitted, please call us to discuss.',
      },
    },
    {
      '@type': 'Question',
      name: 'What payment methods do you accept?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'We accept all major credit and debit cards, Apple Pay, and Google Pay through our secure online checkout. Payment is taken at the time of booking.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can you repair my puncture or do I need a new tyre?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Our fitters assess every puncture on arrival. Repairs are only possible when the damage is in the central tread area and the tyre structure is intact. Sidewall damage or multiple punctures require replacement.',
      },
    },
    {
      '@type': 'Question',
      name: 'What brands of tyres do you stock?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'We stock a wide range of brands including Michelin, Continental, Goodyear, Pirelli, Bridgestone, Dunlop, and quality budget options. We also carry quality part-worn tyres.',
      },
    },
    {
      '@type': 'Question',
      name: 'How long does a mobile tyre fitting take?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A standard tyre fitting takes approximately 30 minutes per tyre. Emergency callouts including travel time typically take under an hour from booking to completion.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do you provide a warranty on fitted tyres?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, all new tyres come with the manufacturer warranty. Our fitting work is also guaranteed. If you experience any issues related to our fitting, we will resolve them at no extra cost.',
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
