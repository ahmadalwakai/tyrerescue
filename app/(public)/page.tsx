import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { HomePage } from './HomePage';
import { DukeHomePage } from '@/components/duke/DukeHomePage';
import { db, homepageMedia } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';
import { JsonLd } from '@/components/seo/JsonLd';
import { getFAQSchema } from '@/lib/seo/schemas';
import { homepageFAQItems } from '@/lib/content/faq';
import { resolveBrandFromHeaders } from '@/lib/config/site';

export async function generateMetadata(): Promise<Metadata> {
  const brand = resolveBrandFromHeaders(await headers());

  if (brand.key === 'duke_street_tyres') {
    return {
      title: {
        absolute: 'Duke Street Tyres | Mobile Tyre Fitting Glasgow, Edinburgh & Dundee',
      },
      description:
        'Book emergency call-out or scheduled mobile tyre fitting with Duke Street Tyres across Glasgow, Edinburgh and Dundee using the shared live dispatch platform.',
      keywords: [
        'Duke Street Tyres',
        'mobile tyre fitting Glasgow',
        'mobile tyre fitting Edinburgh',
        'mobile tyre fitting Dundee',
        'emergency tyre fitting Glasgow',
        'tyres Glasgow',
        'puncture repair Glasgow',
        'roadside tyre fitting Scotland',
      ].join(', '),
      alternates: {
        canonical: brand.productionUrl,
      },
      authors: [{ name: brand.name }],
      creator: brand.name,
      publisher: brand.name,
      metadataBase: new URL(brand.productionUrl),
      openGraph: {
        title: 'Duke Street Tyres | Mobile Tyre Fitting',
        description:
          'Book mobile tyre fitting through the same live dispatch platform used by the Tyre Rescue operations team.',
        url: brand.productionUrl,
        siteName: brand.name,
        images: [
          {
            url: '/duke-street-tyres-van.webp',
            width: 1200,
            height: 630,
            alt: 'Duke Street Tyres mobile tyre fitting',
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Duke Street Tyres | Mobile Tyre Fitting',
        description:
          'Book emergency call-out or scheduled mobile tyre fitting with Duke Street Tyres across Glasgow, Edinburgh and Dundee.',
        images: ['/duke-street-tyres-van.webp'],
      },
    };
  }

  // Fetch first active hero image for OG
  const [firstSlide] = await db
    .select({ src: homepageMedia.src, alt: homepageMedia.alt })
    .from(homepageMedia)
    .where(eq(homepageMedia.isActive, true))
    .orderBy(asc(homepageMedia.sortOrder))
    .limit(1);

  const ogImage = firstSlide?.src || '/og-image.svg';

  return {
    description:
      '24/7 mobile tyre fitting, emergency tyre replacement, puncture repair, battery replacement, and roadside assistance across Scotland. Fast coverage in Glasgow and Edinburgh. Call 0141 266 0690.',
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


// Cap the number of hero slides to limit JS hydration cost and image bytes.
const MAX_HERO_SLIDES = 5;
const HERO_BACKGROUND_SRC = '/images/home/slide-2.webp';

export default async function Page() {
  const brand = resolveBrandFromHeaders(await headers());

  if (brand.key === 'duke_street_tyres') {
    return <DukeHomePage />;
  }

  // Fetch active hero slides from DB (cap to MAX_HERO_SLIDES)
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
    .orderBy(asc(homepageMedia.sortOrder))
    .limit(MAX_HERO_SLIDES);

  return (
    <>
      <link
        rel="preload"
        as="image"
        href={HERO_BACKGROUND_SRC}
        fetchPriority="high"
      />
      <HomePage />
      <JsonLd data={getFAQSchema(homepageFAQItems)} />
      <script
        type="application/ld+json"
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
