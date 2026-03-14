import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const [tyre] = await db
      .select()
      .from(tyreProducts)
      .where(eq(tyreProducts.slug, slug))
      .limit(1);

    if (!tyre) {
      return NextResponse.json({ error: 'Tyre not found' }, { status: 404 });
    }

    return NextResponse.json({
      tyre: {
        id: tyre.id,
        brand: tyre.brand,
        pattern: tyre.pattern,
        width: tyre.width,
        aspect: tyre.aspect,
        rim: tyre.rim,
        sizeDisplay: tyre.sizeDisplay,
        season: tyre.season,
        speedRating: tyre.speedRating,
        loadIndex: tyre.loadIndex,
        wetGrip: tyre.wetGrip,
        fuelEfficiency: tyre.fuelEfficiency,
        noiseDb: tyre.noiseDb,
        runFlat: tyre.runFlat,
        priceNew: tyre.priceNew ? parseFloat(tyre.priceNew) : null,
        stockNew: tyre.stockNew,
        availableNew: tyre.availableNew,
        images: tyre.images,
        slug: tyre.slug,
      },
    });
  } catch (error) {
    console.error('Error fetching tyre:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tyre' },
      { status: 500 }
    );
  }
}
