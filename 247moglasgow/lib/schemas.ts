const PHONE = '+441412660690';
const EMAIL = 'support@tyrerescue.uk';
const BASE_URL = 'https://www.247moglasgow.uk';

const ADDRESS = {
  '@type': 'PostalAddress',
  streetAddress: '3 Gateside Street',
  addressLocality: 'Glasgow',
  postalCode: 'G31 1PD',
  addressRegion: 'Scotland',
  addressCountry: 'GB',
};

export function getLocalBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'AutoRepair'],
    name: '247 Mo Glasgow',
    description:
      '24/7 mobile tyre fitting and emergency tyre replacement across all Glasgow postcodes G1-G78. Average 35 minute response.',
    url: BASE_URL,
    telephone: PHONE,
    email: EMAIL,
    address: ADDRESS,
    geo: { '@type': 'GeoCoordinates', latitude: 55.8547, longitude: -4.2206 },
    openingHours: 'Mo-Su 00:00-23:59',
    priceRange: '££',
    areaServed: [
      { '@type': 'City', name: 'Glasgow' },
      { '@type': 'AdministrativeArea', name: 'Greater Glasgow' },
    ],
    sameAs: ['https://wa.me/447423262955', 'https://www.tyrerescue.uk'],
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: PHONE,
      contactType: 'emergency',
      areaServed: 'Glasgow',
      availableLanguage: 'English',
    },
  };
}

export function getWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: '247 Mo Glasgow',
    url: BASE_URL,
  };
}

export function getServiceSchema(serviceName: string, areaName: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `${serviceName} in ${areaName}`,
    provider: {
      '@type': 'LocalBusiness',
      name: '247 Mo Glasgow',
      url: BASE_URL,
      telephone: PHONE,
      address: ADDRESS,
    },
    areaServed: { '@type': 'City', name: areaName },
    serviceType: serviceName,
  };
}

export function getFAQSchema(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

export function getBreadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${BASE_URL}${item.path}`,
    })),
  };
}
