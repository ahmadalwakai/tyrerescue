import { Metadata } from 'next';
import { HomePage } from './HomePage';

export const metadata: Metadata = {
  title: 'Emergency Mobile Tyre Fitting Glasgow & Edinburgh | Tyre Rescue',
  description:
    'Emergency mobile tyre fitting service in Glasgow and Edinburgh. 24 hours a day, 7 days a week. Professional tyre replacement and puncture repair. Call 0141 266 0690.',
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
  priceRange: '££',
  areaServed: [
    {
      '@type': 'City',
      name: 'Glasgow',
    },
    {
      '@type': 'City',
      name: 'Edinburgh',
    },
  ],
  serviceType: [
    'Emergency Mobile Tyre Fitting',
    'Scheduled Mobile Tyre Fitting',
    'Puncture Repair',
    'Tyre Sales',
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
    </>
  );
}
