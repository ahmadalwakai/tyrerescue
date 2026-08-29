import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, tyreProducts, tyreCatalogue } from '@/lib/db';
import { getProjectSourceForRequest } from '../_auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const source = getProjectSourceForRequest(request);
  if (source instanceof NextResponse) return source;

  const rows = await db
    .select({
      id: tyreProducts.id,
      catalogueId: tyreProducts.catalogueId,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      width: tyreProducts.width,
      aspect: tyreProducts.aspect,
      rim: tyreProducts.rim,
      sizeDisplay: tyreProducts.sizeDisplay,
      season: tyreProducts.season,
      barcode: tyreProducts.barcode,
      priceNew: tyreProducts.priceNew,
      stockNew: tyreProducts.stockNew,
      stockOrdered: tyreProducts.stockOrdered,
      isLocalStock: tyreProducts.isLocalStock,
      availableNew: tyreProducts.availableNew,
      tier: tyreCatalogue.tier,
      updatedAt: tyreProducts.updatedAt,
    })
    .from(tyreProducts)
    .leftJoin(tyreCatalogue, eq(tyreCatalogue.id, tyreProducts.catalogueId));

  const items = rows.map((row) => ({
    id: row.id,
    brand: row.brand,
    pattern: row.pattern,
    width: row.width,
    aspect: row.aspect,
    rim: row.rim,
    sizeDisplay: row.sizeDisplay,
    season: row.season,
    tier: row.tier ?? 'mid',
    barcode: row.barcode ?? null,
    priceNew: row.priceNew != null ? Number(row.priceNew) : null,
    stockNew: row.stockNew ?? 0,
    stockOrdered: row.stockOrdered ?? 0,
    isLocalStock: Boolean(row.isLocalStock),
    availableNew: Boolean(row.availableNew),
    updatedAt: row.updatedAt?.toISOString() ?? null,
  }));

  return NextResponse.json({
    sourceApp: source.app,
    sourceLabel: source.label,
    items,
  });
}
