import { db, tyreProducts } from '@/lib/db';
import { desc, ilike, or, sql } from 'drizzle-orm';
import { InventoryClient } from './InventoryClient';

interface Props {
  searchParams: Promise<{ page?: string; search?: string }>;
}

export default async function AdminInventoryPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parseInt(params.page || '1', 10);
  const perPage = 25;
  const offset = (page - 1) * perPage;
  const search = params.search || '';

  const where = search
    ? or(
        ilike(tyreProducts.brand, `%${search}%`),
        ilike(tyreProducts.pattern, `%${search}%`),
        ilike(tyreProducts.sizeDisplay, `%${search}%`)
      )
    : undefined;

  const [tyres, countResult] = await Promise.all([
    db
      .select({
        id: tyreProducts.id,
        brand: tyreProducts.brand,
        pattern: tyreProducts.pattern,
        sizeDisplay: tyreProducts.sizeDisplay,
        season: tyreProducts.season,
        priceNew: tyreProducts.priceNew,
        priceUsed: tyreProducts.priceUsed,
        stockNew: tyreProducts.stockNew,
        stockUsed: tyreProducts.stockUsed,
        slug: tyreProducts.slug,
      })
      .from(tyreProducts)
      .where(where)
      .orderBy(desc(tyreProducts.updatedAt))
      .limit(perPage)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(tyreProducts).where(where),
  ]);

  const totalCount = Number(countResult[0]?.count || 0);
  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <InventoryClient
      tyres={tyres}
      page={page}
      totalPages={totalPages}
      search={search}
    />
  );
}
