import { db, tyreProducts } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { EditProductClient } from './EditProductClient';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: Props) {
  const { id } = await params;

  const [tyre] = await db
    .select({
      id: tyreProducts.id,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      width: tyreProducts.width,
      aspect: tyreProducts.aspect,
      rim: tyreProducts.rim,
      season: tyreProducts.season,
      speedRating: tyreProducts.speedRating,
      loadIndex: tyreProducts.loadIndex,
      priceNew: tyreProducts.priceNew,
      priceUsed: tyreProducts.priceUsed,
      stockNew: tyreProducts.stockNew,
      stockUsed: tyreProducts.stockUsed,
      runFlat: tyreProducts.runFlat,
    })
    .from(tyreProducts)
    .where(eq(tyreProducts.id, id))
    .limit(1);

  if (!tyre) notFound();

  return <EditProductClient tyre={tyre} />;
}
