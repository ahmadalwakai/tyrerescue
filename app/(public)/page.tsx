import type { Metadata } from 'next';
import { HomePage } from './HomePage';
import { db, homepageMedia } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';
import type { HomeSlide } from '@/components/home/homeImageSlides';

export async function generateMetadata(): Promise<Metadata> {
  // Fetch first active hero image for OG
  const [firstSlide] = await db
    .select({ src: homepageMedia.src, alt: homepageMedia.alt })
    .from(homepageMedia)
    .where(eq(homepageMedia.isActive, true))
    .orderBy(asc(homepageMedia.sortOrder))
    .limit(1);

  const ogImage = firstSlide?.src || '/og-image.svg';

  return {
    title: 'Mobile Tyre Fitting Glasgow | Tyres Near Me | 24/7 Emergency | Tyre Rescue',
    description:
      'Mobile tyre fitting in Glasgow and Edinburgh with AI-powered dispatch. Emergency tyre repair near me, 24 hours a day. Flat tyre? Our mobile tyre fitters come to your exact location in under 45 minutes. AI-optimised driver assignment for fastest response. Call 0141 266 0690. Duke Street Tyres.',
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
      'ai tyre dispatch',
      'smart tyre fitting',
      'intelligent mobile tyre service',
    ].join(', '),
    alternates: {
      canonical: 'https://www.tyrerescue.uk',
    },
    openGraph: {
      images: [{ url: ogImage, width: 1200, height: 630, alt: firstSlide?.alt || 'Tyre Rescue — Mobile Tyre Fitting' }],
    },
  };
}

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
  email: 'support@tyrerescue.uk',
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



export default async function Page() {
  // Fetch active hero slides from DB
  const dbSlides = await db
    .select({
      id: homepageMedia.id,
      src: homepageMedia.src,
      alt: homepageMedia.alt,
      eyebrow: homepageMedia.eyebrow,
      title: homepageMedia.title,
      caption: homepageMedia.caption,
      objectPosition: homepageMedia.objectPosition,
      animationStyle: homepageMedia.animationStyle,
    })
    .from(homepageMedia)
    .where(eq(homepageMedia.isActive, true))
    .orderBy(asc(homepageMedia.sortOrder));

  // Only pass DB slides if there are any; otherwise undefined falls back to hardcoded
  const heroSlides: HomeSlide[] | undefined =
    dbSlides.length > 0
      ? dbSlides.map((s, i) => ({
          ...s,
          caption: s.caption ?? undefined,
          priority: i === 0,
        }))
      : undefined;

  return (
    <>
      <HomePage heroSlides={heroSlides} />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'Tyre Rescue AI Dispatch',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          description: 'AI-powered mobile tyre fitting dispatch system for Glasgow and Scotland. Smart driver assignment, demand-based pricing, and intelligent inventory management.',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'GBP',
          },
        }) }}
      />
      {dbSlides.length > 0 && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ImageGallery',
              name: 'Tyre Rescue Mobile Tyre Fitting Gallery',
              description: 'Professional mobile tyre fitting service images showcasing our team, equipment, and service quality.',
              image: dbSlides.map((s) => ({
                '@type': 'ImageObject',
                url: s.src,
                name: s.title,
                description: s.alt,
                caption: s.caption ?? s.alt,
              })),
            }),
          }}
        />
      )}
    </>
  );
}
