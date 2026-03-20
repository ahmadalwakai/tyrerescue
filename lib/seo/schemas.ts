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
    openingHours: 'Mo-Su 08:00-23:59',
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
