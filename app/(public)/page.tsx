import { Metadata } from 'next';
import { HomePage } from './HomePage';

export const metadata: Metadata = {
  title: 'Mobile Tyre Fitting Glasgow | Tyres Near Me | 24/7 Emergency | Tyre Rescue',
  description:
    'Mobile tyre fitting in Glasgow and Edinburgh. Emergency tyre repair near me, 24 hours a day. Flat tyre? Our mobile tyre fitters come to your exact location in under 45 minutes. Call 0141 266 0690. Duke Street Tyres.',
  keywords: [
    'mobile tyre fitting glasgow',
    'mobile tyre fitting near me',
    'emergency tyre fitting glasgow',
    'tyre repair near me',
    'tyres near me',
    'tyre shop near me',
    'tyres glasgow',
    'mobile tyres near me',
    'mobile tyre repair near me',
    'mobile tyre fitters glasgow',
    'tyre repair glasgow',
    'puncture repair near me',
    'mobile tyre fitter glasgow',
    'mobile tyres glasgow',
    'mobile tyre repair',
    'glasgow mobile tyres',
    'tyre fitting near me',
    'tyre shop glasgow',
    'duke street tyres',
    '24 hour tyre fitting glasgow',
    'emergency tyre fitting edinburgh',
    'roadside tyre fitting scotland',
  ].join(', '),
  alternates: {
    canonical: 'https://www.tyrerescue.uk',
  },
};

// JSON-LD structured data for LocalBusiness
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Tyre Rescue',
  alternateName: 'Duke Street Tyres',
  description:
    'Emergency mobile tyre fitting service in Glasgow and Edinburgh. 24 hours a day, 7 days a week.',
  url: 'https://www.tyrerescue.uk',
  telephone: '+441412660690',
  email: 'info@tyrerescue.uk',
  keywords: 'mobile tyre fitting glasgow, tyre repair near me, mobile tyre fitter glasgow',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '3, 10 Gateside St',
    addressLocality: 'Glasgow',
    postalCode: 'G31 1PD',
    addressCountry: 'GB',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 55.8547,
    longitude: -4.2206,
  },
  openingHours: 'Mo-Su 08:00-23:59',
  priceRange: '£20–£200',
  areaServed: [
    {
      '@type': 'City',
      name: 'Glasgow',
    },
    {
      '@type': 'City',
      name: 'Edinburgh',
    },
    {
      '@type': 'City',
      name: 'Dundee',
    },
  ],
  serviceType: [
    'Emergency Mobile Tyre Fitting',
    'Scheduled Mobile Tyre Fitting',
    'Puncture Repair',
    'Tyre Sales',
  ],
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Mobile Tyre Services',
    itemListElement: [
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: 'Emergency Mobile Tyre Fitting',
          description: '24/7 emergency tyre fitting at your location in Glasgow and Edinburgh',
        },
      },
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: 'Puncture Repair',
          description: 'Mobile puncture repair service across Glasgow and surrounding areas',
        },
      },
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: 'Scheduled Tyre Fitting',
          description: 'Book a convenient mobile tyre fitting appointment at your home or workplace',
        },
      },
    ],
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    reviewCount: '97',
    bestRating: '5',
    worstRating: '1',
  },
};

// FAQ structured data for rich results
const faqJsonLd = {
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
  ],
};

export default function Page() {
  return (
    <>
      <HomePage />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </>
  );
}
