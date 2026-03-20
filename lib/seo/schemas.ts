/**
 * Centralised JSON-LD structured data generators.
 * Every function returns a plain object ready for JSON.stringify.
 */

const SITE_URL = 'https://www.tyrerescue.uk';
const PHONE = '+441412660690';
const EMAIL = 'support@tyrerescue.uk';

const ADDRESS = {
  '@type': 'PostalAddress' as const,
  streetAddress: '3, 10 Gateside St',
  addressLocality: 'Glasgow',
  postalCode: 'G31 1PD',
  addressCountry: 'GB',
};

/* ------------------------------------------------------------------ */
/*  LocalBusiness / AutoRepair — injected site-wide via layout.tsx    */
/* ------------------------------------------------------------------ */
export function getLocalBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'AutoRepair'],
    name: 'Tyre Rescue',
    alternateName: 'Duke Street Tyres',
    description:
      'Emergency mobile tyre fitting service in Glasgow and Edinburgh. 24 hours a day, 7 days a week.',
    url: SITE_URL,
    telephone: PHONE,
    email: EMAIL,
    address: ADDRESS,
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 55.8547,
      longitude: -4.2206,
    },
    openingHours: 'Mo-Su 00:00-23:59',
    priceRange: '£20–£200',
    areaServed: [
      { '@type': 'City', name: 'Glasgow' },
      { '@type': 'City', name: 'Edinburgh' },
      { '@type': 'City', name: 'Dundee' },
    ],
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: '97',
      bestRating: '5',
      worstRating: '1',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: PHONE,
      contactType: 'emergency',
      areaServed: ['Glasgow', 'Edinburgh', 'Central Scotland'],
      availableLanguage: 'English',
      hoursAvailable: {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        opens: '00:00',
        closes: '23:59',
      },
    },
    makesOffer: [
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: 'Emergency Mobile Tyre Fitting',
          description: '24/7 emergency tyre replacement at your location across Glasgow and Edinburgh',
        },
        price: '49',
        priceCurrency: 'GBP',
        availability: 'https://schema.org/InStock',
      },
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: 'Mobile Tyre Fitting',
          description: 'Scheduled tyre fitting at home, work, or roadside',
        },
        price: '20',
        priceCurrency: 'GBP',
      },
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: 'Puncture Repair',
          description: 'On-the-spot puncture repair where possible',
        },
        price: '25',
        priceCurrency: 'GBP',
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  WebSite + SearchAction — site-wide via layout.tsx                 */
/* ------------------------------------------------------------------ */
export function getWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Tyre Rescue',
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/tyres?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Service — for /[service]/[city] and /[service]/[city]/[area]      */
/* ------------------------------------------------------------------ */
export function getServiceSchema(opts: {
  serviceName: string;
  areaName: string;
  areaType?: 'City' | 'Place';
  geo?: { latitude: number; longitude: number };
  postcode?: string;
  county?: string;
  mapUrl?: string;
}) {
  const areaServed: Record<string, unknown> =
    opts.areaType === 'Place'
      ? {
          '@type': 'Place',
          name: opts.areaName,
          ...(opts.geo && {
            geo: { '@type': 'GeoCoordinates', ...opts.geo },
          }),
          ...(opts.postcode && {
            address: {
              '@type': 'PostalAddress',
              postalCode: opts.postcode,
              ...(opts.county && { addressRegion: opts.county }),
              addressCountry: 'GB',
            },
          }),
        }
      : { '@type': 'City', name: opts.areaName };

  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: opts.serviceName,
    provider: {
      '@type': 'LocalBusiness',
      name: 'Tyre Rescue',
      telephone: '0141 266 0690',
      address: ADDRESS,
    },
    areaServed,
    serviceType: opts.serviceName.replace(/ in .+$/, ''),
    ...(opts.mapUrl && { hasMap: opts.mapUrl }),
  };
}

/* ------------------------------------------------------------------ */
/*  BreadcrumbList                                                     */
/* ------------------------------------------------------------------ */
export function getBreadcrumbSchema(
  items: { name: string; path: string }[],
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

/* ------------------------------------------------------------------ */
/*  EmergencyService — for layout + /emergency page                   */
/* ------------------------------------------------------------------ */
export function getEmergencyServiceSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'EmergencyService',
    name: 'Tyre Rescue — 24/7 Emergency Tyre Fitting',
    description:
      'Emergency mobile tyre fitting service covering Glasgow, Edinburgh and Central Scotland. Average 45 minute response time.',
    serviceType: 'Emergency Tyre Fitting',
    provider: {
      '@type': 'AutoRepair',
      name: 'Tyre Rescue',
      url: SITE_URL,
    },
    areaServed: [
      { '@type': 'City', name: 'Glasgow' },
      { '@type': 'City', name: 'Edinburgh' },
      { '@type': 'AdministrativeArea', name: 'Central Scotland' },
    ],
    availableChannel: {
      '@type': 'ServiceChannel',
      serviceUrl: `${SITE_URL}/emergency`,
      servicePhone: {
        '@type': 'ContactPoint',
        telephone: PHONE,
        contactType: 'emergency',
      },
    },
    hoursAvailable: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '00:00',
      closes: '23:59',
    },
  };
}

/* ------------------------------------------------------------------ */
/*  FAQPage — reusable for any page with FAQ content                  */
/* ------------------------------------------------------------------ */
export function getFAQSchema(
  faqs: { question: string; answer: string }[],
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.answer,
      },
    })),
  };
}
