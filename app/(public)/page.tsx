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

// Build an imageSrcSet matching the Next/Image `sizes` attribute used in
// HomeImageShowcase so the preload hints the optimal width.
const HERO_IMAGE_SIZES = '(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 45vw';

function nextImageOptimizedUrl(src: string, width: number, quality = 60): string {
  // Mirror Next.js _next/image URL format for the LCP preload so the browser
  // fetches the same optimized variant Next/Image will render.
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
}

export default async function Page() {
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

  // Only pass DB slides if there are any; otherwise undefined falls back to hardcoded
  const heroSlides: HomeSlide[] | undefined =
    dbSlides.length > 0
      ? dbSlides.map((s, i) => ({
          ...s,
          caption: s.caption ?? undefined,
          priority: i === 0,
        }))
      : undefined;

  // Server-side preload of the LCP hero image. Next/Image's `priority` only
  // injects the preload after the client component mounts, which on slow
  // mobile networks delays LCP by 2–4s. Emitting a `<link rel="preload">`
  // here makes the browser start the fetch during HTML parse.
  const lcpSrc = heroSlides?.[0]?.src ?? '/images/home/slide-1.webp';

  return (
    <>
      <link
        rel="preload"
        as="image"
        href={nextImageOptimizedUrl(lcpSrc, 1080)}
        imageSrcSet={
          [640, 750, 828, 1080, 1200].map((w) => `${nextImageOptimizedUrl(lcpSrc, w)} ${w}w`).join(', ')
        }
        imageSizes={HERO_IMAGE_SIZES}
        fetchPriority="high"
      />
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
