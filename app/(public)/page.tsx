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
    title: {
      absolute: 'Mobile Tyre Fitting Glasgow & Scotland | 24/7 | From £20 | Tyre Rescue',
    },
    description:
      'Mobile tyre fitting across Glasgow, Edinburgh and Central Scotland — 24/7. Flat tyre? We come to you in 45 minutes. New tyres fitted at your home, work or roadside. Call 0141 266 0690 now.',
    keywords: [
      'mobile tyre fitting glasgow',
      'mobile tyre fitting near me',
      'emergency tyre fitting glasgow',
      'tyre repair near me',
      'tyres near me',
      'mobile tyres glasgow',
      'mobile tyre fitters glasgow',
      'tyre repair glasgow',
      'puncture repair near me',
      'mobile tyre fitter glasgow',
      'tyre fitting near me',
      '24 hour tyre fitting glasgow',
      'emergency tyre fitting edinburgh',
      'roadside tyre fitting scotland',
      'mobile tyre fitting scotland',
      'flat tyre glasgow',
      'tyre fitting at home glasgow',
    ].join(', '),
    alternates: {
      canonical: 'https://www.tyrerescue.uk',
    },
    openGraph: {
      title: 'Mobile Tyre Fitting Glasgow & Scotland | 24/7 | Tyre Rescue',
      description: 'Flat tyre in Glasgow or Edinburgh? We come to you in 45 minutes, 24/7. Mobile tyre fitting from £20. Call 0141 266 0690.',
      images: [{ url: ogImage, width: 1200, height: 630, alt: firstSlide?.alt || 'Tyre Rescue — Mobile Tyre Fitting Glasgow' }],
    },
    twitter: {
      card: 'summary_large_image' as const,
      title: 'Mobile Tyre Fitting Glasgow & Scotland | 24/7 | Tyre Rescue',
      description: 'Flat tyre? We come to you in 45 minutes across Glasgow, Edinburgh and Scotland. Call 0141 266 0690.',
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
      {dbSlides.length > 0 && (
        <JsonLd
          data={{
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
          }}
        />
      )}
    </>
  );
}
