import type { Metadata } from 'next';
import { HomePage } from './HomePage';
import { db, homepageMedia } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';
import type { HomeSlide } from '@/components/home/homeImageSlides';
import { JsonLd } from '@/components/seo/JsonLd';
import { getFAQSchema } from '@/lib/seo/schemas';
import { homepageFAQItems } from '@/lib/content/faq';

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
    description:
      '24/7 emergency mobile tyre fitting in Glasgow & Edinburgh. From £49. Average 45 min response. Fully insured fitters. Call 0141 266 0690.',
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
      <JsonLd data={getFAQSchema(homepageFAQItems)} />
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
