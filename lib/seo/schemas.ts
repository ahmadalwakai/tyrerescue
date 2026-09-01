/**
 * Centralised JSON-LD structured data generators.
 * Every function returns a plain object ready for JSON.stringify.
 */

import { SERVICE_PRICING, PRICE_RANGE_DISPLAY } from '@/lib/pricing';

const DEFAULT_BASE_URL = 'https://www.tyrerescue.uk';
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
      '24/7 mobile tyre fitting, emergency tyre replacement, and puncture repair across all of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness, Highlands, Islands and every postcode in between.',
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
    priceRange: PRICE_RANGE_DISPLAY,
    areaServed: [
      { '@type': 'AdministrativeArea', name: 'Scotland' },
      { '@type': 'City', name: 'Glasgow' },
      { '@type': 'City', name: 'Edinburgh' },
      { '@type': 'City', name: 'Aberdeen' },
      { '@type': 'City', name: 'Inverness' },
      { '@type': 'City', name: 'Dundee' },
      { '@type': 'City', name: 'Stirling' },
      { '@type': 'City', name: 'Perth' },
      { '@type': 'City', name: 'Paisley' },
      { '@type': 'City', name: 'Hamilton' },
      { '@type': 'City', name: 'Motherwell' },
      { '@type': 'City', name: 'East Kilbride' },
      { '@type': 'City', name: 'Cumbernauld' },
      { '@type': 'City', name: 'Livingston' },
      { '@type': 'City', name: 'Kirkcaldy' },
      { '@type': 'City', name: 'Dunfermline' },
      { '@type': 'City', name: 'Falkirk' },
      { '@type': 'City', name: 'Kilmarnock' },
      { '@type': 'City', name: 'Ayr' },
      { '@type': 'City', name: 'Irvine' },
      { '@type': 'City', name: 'Elgin' },
      { '@type': 'City', name: 'Fort William' },
      { '@type': 'City', name: 'Galashiels' },
      { '@type': 'City', name: 'Oban' },
      { '@type': 'City', name: 'Wick' },
      { '@type': 'City', name: 'Stornoway' },
      { '@type': 'City', name: 'Lerwick' },
      { '@type': 'City', name: 'Arbroath' },
      { '@type': 'City', name: 'Dumfries' },
      { '@type': 'City', name: 'Greenock' },
      { '@type': 'City', name: 'Dingwall' },
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
      areaServed: ['Scotland'],
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
          description:
            '24/7 emergency tyre replacement at your location across all of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness and beyond. Callout fee from £49 + tyre price.',
        },
        priceCurrency: 'GBP',
        priceSpecification: {
          '@type': 'PriceSpecification',
          priceCurrency: 'GBP',
          minPrice: SERVICE_PRICING.emergency.from,
          maxPrice: SERVICE_PRICING.emergency.typicalMax,
          description:
            'Includes £49 emergency callout fee. Tyre price varies by size and brand.',
        },
        availability: 'https://schema.org/InStock',
      },
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: 'Mobile Tyre Fitting',
          description:
            'Scheduled tyre fitting at home, work, or roadside. Fitting fee from £20 per tyre + tyre price.',
        },
        priceCurrency: 'GBP',
        priceSpecification: {
          '@type': 'PriceSpecification',
          priceCurrency: 'GBP',
          minPrice: SERVICE_PRICING.fitting.from,
          maxPrice: SERVICE_PRICING.fitting.typicalMax,
          description:
            'Includes £20 per-tyre fitting fee. Tyre price varies by size and brand.',
        },
      },
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: 'Puncture Repair',
          description: 'On-the-spot puncture repair where possible. Complete service price.',
        },
        priceCurrency: 'GBP',
        priceSpecification: {
          '@type': 'PriceSpecification',
          priceCurrency: 'GBP',
          minPrice: SERVICE_PRICING.punctureRepair.from,
          maxPrice: SERVICE_PRICING.punctureRepair.typicalMax,
        },
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
    name: 'Tyre Rescue — 24/7 Emergency Tyre Fitting Scotland',
    description:
      'Emergency mobile tyre fitting service covering all of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness, Dundee, Perth, Highlands, Islands and every postcode from G to ZE. Average 45-minute response in Central Scotland.',
    serviceType: 'Emergency Tyre Fitting',
    provider: {
      '@type': 'AutoRepair',
      name: 'Tyre Rescue',
      url: baseUrl,
    },
    areaServed: [
      { '@type': 'AdministrativeArea', name: 'Scotland' },
      { '@type': 'City', name: 'Glasgow' },
      { '@type': 'City', name: 'Edinburgh' },
      { '@type': 'City', name: 'Aberdeen' },
      { '@type': 'City', name: 'Inverness' },
      { '@type': 'City', name: 'Dundee' },
      { '@type': 'City', name: 'Stirling' },
      { '@type': 'City', name: 'Perth' },
      { '@type': 'City', name: 'Paisley' },
      { '@type': 'City', name: 'Hamilton' },
      { '@type': 'City', name: 'Motherwell' },
      { '@type': 'City', name: 'Kirkcaldy' },
      { '@type': 'City', name: 'Falkirk' },
      { '@type': 'City', name: 'Kilmarnock' },
      { '@type': 'City', name: 'Ayr' },
      { '@type': 'City', name: 'Irvine' },
      { '@type': 'City', name: 'Cumbernauld' },
      { '@type': 'City', name: 'Livingston' },
      { '@type': 'City', name: 'Dunfermline' },
      { '@type': 'City', name: 'Elgin' },
      { '@type': 'City', name: 'Fort William' },
      { '@type': 'City', name: 'Galashiels' },
      { '@type': 'City', name: 'Oban' },
      { '@type': 'City', name: 'Wick' },
      { '@type': 'City', name: 'Stornoway' },
      { '@type': 'City', name: 'Lerwick' },
      { '@type': 'City', name: 'Arbroath' },
      { '@type': 'City', name: 'Dumfries' },
      { '@type': 'City', name: 'Greenock' },
      { '@type': 'City', name: 'East Kilbride' },
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
  faqs: readonly { question: string; answer: string }[],
  _baseUrl?: string,
) {
  void _baseUrl;

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
    image: {
      '@type': 'ImageObject',
      url: `${url}/images/home/slide-1.webp`,
      width: 1200,
      height: 630,
    },
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
        width: 600,
        height: 60,
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
/*  City-specific LocalBusiness — for /[service]/[city] pages         */
/* ------------------------------------------------------------------ */
export function getCityLocalBusinessSchema(opts: {
  cityName: string;
  serviceSlug: string;
  serviceName: string;
  pageUrl: string;
  avgResponseMin: number;
  priceFrom: string;
  baseUrl?: string;
}) {
  const url = opts.baseUrl ?? DEFAULT_BASE_URL;
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'AutoRepair'],
    name: `Tyre Rescue — ${opts.serviceName} ${opts.cityName}`,
    url: opts.pageUrl,
    telephone: PHONE,
    email: EMAIL,
    address: ADDRESS,
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 55.8547,
      longitude: -4.2206,
    },
    openingHours: 'Mo-Su 00:00-23:59',
    priceRange: PRICE_RANGE_DISPLAY,
    areaServed: { '@type': 'City', name: opts.cityName },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `${opts.serviceName} in ${opts.cityName}`,
      itemListElement: [
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: `${opts.serviceName} in ${opts.cityName}`,
            description: `Professional ${opts.serviceName.toLowerCase()} in ${opts.cityName}. Average ${opts.avgResponseMin} minute response. Call 0141 266 0690.`,
          },
          priceCurrency: 'GBP',
          price: opts.priceFrom,
          availability: 'https://schema.org/InStock',
          seller: {
            '@type': 'Organization',
            name: 'Tyre Rescue',
            url,
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
    sameAs: [
      'https://www.facebook.com/share/1Bt1ZFNkXN/',
      'https://uk.trustpilot.com/review/tyrerescue.uk',
    ],
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
