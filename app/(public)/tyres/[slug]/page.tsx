import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { eq, and, ne, or } from 'drizzle-orm';
import { TyreDetailClient } from './TyreDetailClient';

interface Props {
  params: Promise<{ slug: string }>;
}

async function getTyre(slug: string) {
  const [tyre] = await db
    .select()
    .from(tyreProducts)
    .where(eq(tyreProducts.slug, slug))
    .limit(1);

  return tyre || null;
}

async function getRelatedTyres(tyre: NonNullable<Awaited<ReturnType<typeof getTyre>>>) {
  const related = await db
    .select()
    .from(tyreProducts)
    .where(
      and(
        ne(tyreProducts.id, tyre.id),
        or(
          eq(tyreProducts.brand, tyre.brand),
          and(
            eq(tyreProducts.width, tyre.width),
            eq(tyreProducts.rim, tyre.rim)
          )
        )
      )
    )
    .limit(4);

  return related;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tyre = await getTyre(slug);

  if (!tyre) {
    return {
      title: 'Tyre Not Found | Tyre Rescue',
    };
  }

  const title = `${tyre.brand} ${tyre.pattern} ${tyre.sizeDisplay} | Tyre Rescue`;
  const description = `Buy ${tyre.brand} ${tyre.pattern} ${tyre.sizeDisplay} ${tyre.season} tyres online. ${
    tyre.runFlat ? 'Run-flat technology. ' : ''
  }${tyre.wetGrip ? `Wet grip: ${tyre.wetGrip}. ` : ''}Mobile fitting service across Glasgow and Edinburgh. 24/7 emergency callout available.`;

  return {
    title,
    description,
    keywords: [
      tyre.brand,
      tyre.pattern,
      tyre.sizeDisplay,
      `${tyre.season} tyres`,
      'mobile tyre fitting',
      'Glasgow tyres',
      'Edinburgh tyres',
      '24/7 tyre service',
    ],
    openGraph: {
      title,
      description,
      type: 'website',
      url: `https://tyrerescue.co.uk/tyres/${slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function TyreDetailPage({ params }: Props) {
  const { slug } = await params;
  const tyre = await getTyre(slug);

  if (!tyre) {
    notFound();
  }

  const relatedTyres = await getRelatedTyres(tyre);

  const seasonLabel =
    tyre.season === 'summer'
      ? 'Summer'
      : tyre.season === 'winter'
      ? 'Winter'
      : 'All Season';

  // Build JSON-LD Product schema
  const priceNew = tyre.priceNew ? parseFloat(tyre.priceNew) : null;

  const offersArray = [];
  if (priceNew && tyre.availableNew) {
    offersArray.push({
      '@type': 'Offer',
      name: 'Tyre',
      price: priceNew,
      priceCurrency: 'GBP',
      availability: (tyre.stockNew ?? 0) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      url: `https://tyrerescue.co.uk/tyres/${slug}`,
    });
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${tyre.brand} ${tyre.pattern} ${tyre.sizeDisplay}`,
    description: `${tyre.brand} ${tyre.pattern} ${tyre.sizeDisplay} ${seasonLabel} tyre with mobile fitting service.`,
    brand: {
      '@type': 'Brand',
      name: tyre.brand,
    },
    sku: tyre.slug,
    mpn: tyre.slug,
    category: 'Tyres',
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Tyre Size', value: tyre.sizeDisplay },
      { '@type': 'PropertyValue', name: 'Season', value: seasonLabel },
      ...(tyre.speedRating ? [{ '@type': 'PropertyValue', name: 'Speed Rating', value: tyre.speedRating }] : []),
      ...(tyre.loadIndex ? [{ '@type': 'PropertyValue', name: 'Load Index', value: tyre.loadIndex.toString() }] : []),
      ...(tyre.wetGrip ? [{ '@type': 'PropertyValue', name: 'Wet Grip', value: tyre.wetGrip }] : []),
      ...(tyre.fuelEfficiency ? [{ '@type': 'PropertyValue', name: 'Fuel Efficiency', value: tyre.fuelEfficiency }] : []),
      ...(tyre.noiseDb ? [{ '@type': 'PropertyValue', name: 'Noise Level', value: `${tyre.noiseDb} dB` }] : []),
      { '@type': 'PropertyValue', name: 'Run Flat', value: tyre.runFlat ? 'Yes' : 'No' },
    ],
    offers: offersArray.length === 1 ? offersArray[0] : {
      '@type': 'AggregateOffer',
      lowPrice: priceNew,
      highPrice: priceNew,
      priceCurrency: 'GBP',
      offerCount: offersArray.length,
      offers: offersArray,
    },
  };

  const tyreData = {
    id: tyre.id,
    brand: tyre.brand,
    pattern: tyre.pattern,
    sizeDisplay: tyre.sizeDisplay,
    season: tyre.season,
    seasonLabel,
    speedRating: tyre.speedRating,
    loadIndex: tyre.loadIndex,
    wetGrip: tyre.wetGrip,
    fuelEfficiency: tyre.fuelEfficiency,
    noiseDb: tyre.noiseDb,
    runFlat: tyre.runFlat ?? false,
    priceNew,
    stockNew: tyre.stockNew ?? 0,
    availableNew: tyre.availableNew ?? false,
    slug: tyre.slug,
  };

  const relatedData = relatedTyres.map((t) => ({
    id: t.id,
    brand: t.brand,
    pattern: t.pattern,
    sizeDisplay: t.sizeDisplay,
    season: t.season,
    priceNew: t.priceNew ? parseFloat(t.priceNew) : null,
    availableNew: t.availableNew ?? false,
    slug: t.slug,
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TyreDetailClient tyre={tyreData} relatedTyres={relatedData} />
    </>
  );
}
