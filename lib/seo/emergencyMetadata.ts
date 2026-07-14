import type { Metadata } from 'next';
import { getSiteUrl } from '@/lib/config/site';
import {
  EMERGENCY_PHONE_DISPLAY,
  emergencyCampaign,
  type CampaignService,
  type ServiceArea,
} from '@/lib/ads/emergencyCampaign';

type EmergencyLocalKind = 'emergency' | 'puncture';

const siteUrl = getSiteUrl();
const ogImage = '/images/home/slide-1.webp';

function absoluteUrl(path: string): string {
  return `${siteUrl}${path}`;
}

function serviceName(kind: EmergencyLocalKind): string {
  return kind === 'puncture' ? 'Puncture Repair' : 'Emergency Tyre Fitting';
}

function servicePath(area: ServiceArea, kind: EmergencyLocalKind): string {
  if (kind === 'puncture') {
    return area.punctureRepairPath ?? area.emergencyPath;
  }
  return area.emergencyPath;
}

export function buildEmergencyMetadata(): Metadata {
  const title = 'Emergency Tyre Fitting Scotland | 24/7';
  const description =
    'Flat tyre or puncture? Call Tyre Rescue for 24/7 emergency mobile tyre fitting across mainland Scotland, 45-minute response, and callout from \u00a349.';

  return {
    title,
    description,
    alternates: {
      canonical: absoluteUrl('/emergency'),
    },
    openGraph: {
      title,
      description,
      url: absoluteUrl('/emergency'),
      type: 'website',
      siteName: 'Tyre Rescue',
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: 'Tyre Rescue emergency mobile tyre fitting',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}

export function buildEmergencyLocalMetadata(
  area: ServiceArea,
  kind: EmergencyLocalKind,
): Metadata {
  const name = serviceName(kind);
  const path = servicePath(area, kind);
  const title =
    kind === 'puncture'
      ? `${name} ${area.cityName} ${area.areaName} | From \u00a325`
      : `${name} ${area.cityName} ${area.areaName} | 24/7`;
  const description =
    kind === 'puncture'
      ? `Mobile puncture repair in ${area.areaName}, ${area.cityName}. Repair from \u00a325 where safe, 24/7 help, and mainland Scotland coverage. Call ${EMERGENCY_PHONE_DISPLAY}.`
      : `Emergency tyre fitting in ${area.areaName}, ${area.cityName}. 24/7 mobile tyre fitter, 45-minute response, callout from \u00a349, mainland Scotland only.`;

  return {
    title,
    description,
    alternates: {
      canonical: absoluteUrl(path),
    },
    openGraph: {
      title,
      description,
      url: absoluteUrl(path),
      type: 'website',
      siteName: 'Tyre Rescue',
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${name} in ${area.areaName}, ${area.cityName}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}

export function buildEmergencyServiceJsonLd(
  area?: ServiceArea,
  kind: EmergencyLocalKind = 'emergency',
) {
  const name = area
    ? `${serviceName(kind)} in ${area.areaName}, ${area.cityName}`
    : 'Tyre Rescue - 24/7 Emergency Tyre Fitting';
  const serviceType: CampaignService =
    kind === 'puncture' ? 'puncture-repair' : 'emergency-tyre-fitting';
  const path = area ? servicePath(area, kind) : '/emergency';
  const priceItem =
    kind === 'puncture'
      ? emergencyCampaign.priceItems.find((item) => item.id === 'punctureRepair')
      : emergencyCampaign.priceItems.find((item) => item.id === 'emergency');

  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'AutoRepair'],
    name,
    url: absoluteUrl(path),
    telephone: '+441412660690',
    description: area
      ? `${serviceName(kind)} covering ${area.areaName}, ${area.cityName} and mainland Scotland. Scottish islands are excluded.`
      : '24/7 emergency mobile tyre fitting across mainland Scotland. Scottish islands are excluded.',
    openingHours: 'Mo-Su 00:00-23:59',
    priceRange: '\u00a320-\u00a3220',
    areaServed: area
      ? {
          '@type': 'Place',
          name: `${area.areaName}, ${area.cityName}`,
          address: {
            '@type': 'PostalAddress',
            postalCode: area.postcode,
            addressRegion: area.county,
            addressCountry: 'GB',
          },
        }
      : [
          { '@type': 'AdministrativeArea', name: 'Mainland Scotland' },
          ...emergencyCampaign.serviceAreas.map((item) => ({
            '@type': 'City',
            name: item.cityName,
          })),
        ],
    makesOffer: {
      '@type': 'Offer',
      availability: 'https://schema.org/InStock',
      priceCurrency: 'GBP',
      price: priceItem?.fromAmount,
      itemOffered: {
        '@type': 'Service',
        name: serviceName(kind),
        serviceType,
      },
    },
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+441412660690',
      contactType: 'emergency',
      areaServed: 'Mainland Scotland',
      hoursAvailable: {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday',
        ],
        opens: '00:00',
        closes: '23:59',
      },
    },
  };
}

export function buildEmergencyBreadcrumbJsonLd(
  items: readonly { name: string; path: string }[],
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
