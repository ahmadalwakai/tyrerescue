/**
 * Centralised JSON-LD structured data generators.
 * Every function returns a plain object ready for JSON.stringify.
 */

const DEFAULT_BASE_URL = 'https://www.tyrerescue.uk';
const SITE_URL = DEFAULT_BASE_URL;
const PHONE = '+441412660690';
const EMAIL = 'support@tyrerescue.uk';

const ADDRESS = {
  '@type': 'PostalAddress' as const,
  streetAddress: '3, 10 Gateside St',
  addressLocality: 'Glasgow',
  postalCode: 'G31 1PD',
  addressRegion: 'Scotland',
  addressCountry: 'GB',
};

/* ------------------------------------------------------------------ */
/*  LocalBusiness / AutoRepair — injected site-wide via layout.tsx    */
/* ------------------------------------------------------------------ */
export function getLocalBusinessSchema(baseUrl: string = DEFAULT_BASE_URL) {
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'AutoRepair'],
    name: 'Tyre Rescue',
    alternateName: 'Duke Street Tyres',
    description:
      '24/7 mobile tyre fitting, emergency tyre replacement, and puncture repair across Scotland. Fast coverage in Glasgow and Edinburgh.',
    url: baseUrl,
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
      { '@type': 'AdministrativeArea', name: 'Scotland' },
      { '@type': 'City', name: 'Glasgow' },
      { '@type': 'City', name: 'Edinburgh' },
      { '@type': 'City', name: 'Dundee' },
      { '@type': 'City', name: 'Stirling' },
    ],
    sameAs: [
      'https://www.facebook.com/share/1Bt1ZFNkXN/',
      'https://www.instagram.com/dukestreettyres/',
      'https://wa.me/447423262955',
      'https://uk.trustpilot.com/review/tyrerescue.uk',
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
export function getWebSiteSchema(baseUrl: string = DEFAULT_BASE_URL) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Tyre Rescue',
    url: baseUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseUrl}/tyres?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Organization — site-wide brand identity                           */
/* ------------------------------------------------------------------ */
export function getOrganizationSchema(baseUrl: string = DEFAULT_BASE_URL) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Tyre Rescue',
    alternateName: 'Duke Street Tyres',
    url: baseUrl,
    logo: `${baseUrl}/icon-512x512.png`,
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: PHONE,
      contactType: 'customer service',
      areaServed: 'GB',
      availableLanguage: 'English',
    },
    address: ADDRESS,
    sameAs: [
      'https://www.facebook.com/share/1Bt1ZFNkXN/',
      'https://www.instagram.com/dukestreettyres/',
      'https://uk.trustpilot.com/review/tyrerescue.uk',
    ],
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
  baseUrl?: string;
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

  const url = opts.baseUrl ?? DEFAULT_BASE_URL;

  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: opts.serviceName,
    provider: {
      '@type': 'LocalBusiness',
      name: 'Tyre Rescue',
      url,
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
  baseUrl: string = DEFAULT_BASE_URL,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${baseUrl}${item.path}`,
    })),
  };
}

/* ------------------------------------------------------------------ */
/*  EmergencyService — for layout + /emergency page                   */
/* ------------------------------------------------------------------ */
export function getEmergencyServiceSchema(baseUrl: string = DEFAULT_BASE_URL) {
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
      url: baseUrl,
    },
    areaServed: [
      { '@type': 'City', name: 'Glasgow' },
      { '@type': 'City', name: 'Edinburgh' },
      { '@type': 'City', name: 'Dundee' },
      { '@type': 'City', name: 'Stirling' },
      { '@type': 'AdministrativeArea', name: 'Central Scotland' },
    ],
    availableChannel: {
      '@type': 'ServiceChannel',
      serviceUrl: `${baseUrl}/emergency`,
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
  _baseUrl?: string,
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

/* ------------------------------------------------------------------ */
/*  Article — for /blog/[slug] pages                                  */
/* ------------------------------------------------------------------ */
export function getArticleSchema(opts: {
  title: string;
  description: string;
  slug: string;
  publishDate: string;
  lastModified: string;
  keywords: string[];
  baseUrl?: string;
}) {
  const url = opts.baseUrl ?? DEFAULT_BASE_URL;

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.title,
    description: opts.description,
    url: `${url}/blog/${opts.slug}`,
    datePublished: opts.publishDate,
    dateModified: opts.lastModified,
    keywords: opts.keywords.join(', '),
    author: {
      '@type': 'Organization',
      name: 'Tyre Rescue',
      url,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Tyre Rescue',
      url,
      logo: {
        '@type': 'ImageObject',
        url: `${url}/logo.svg`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${url}/blog/${opts.slug}`,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  HowTo — e.g. "How we calculate your price"                        */
/* ------------------------------------------------------------------ */
export function getHowToSchema(
  opts: {
    name: string;
    description?: string;
    steps: { name: string; text: string }[];
  },
  baseUrl: string = DEFAULT_BASE_URL,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: opts.name,
    ...(opts.description && { description: opts.description }),
    step: opts.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
      url: `${baseUrl}#step-${i + 1}`,
    })),
  };
}

/* ------------------------------------------------------------------ */
/*  Aliases matching generate* naming convention                       */
/* ------------------------------------------------------------------ */
export const generateLocalBusinessSchema = getLocalBusinessSchema;
export const generateServiceSchema = getServiceSchema;
export const generateFAQSchema = getFAQSchema;
export const generateBreadcrumbSchema = getBreadcrumbSchema;
export const generateHowToSchema = getHowToSchema;
