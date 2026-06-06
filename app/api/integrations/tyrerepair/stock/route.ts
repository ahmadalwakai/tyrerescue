import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, tyreProducts, tyreCatalogue } from '@/lib/db';
import {
  isAuthorizedIntegrationRequest,
  integrationUnauthorized,
} from '../_lib';

export const dynamic = 'force-dynamic';

/**
 * Inbound endpoint: tyrerepair.uk fetches the live tyrerescue tyre inventory so
 * the tyrerepair admin app can mirror stock 1:1. Tyre Rescue is the single
 * source of truth — quantities, season and availability all originate here.
 *
 * Read-only; additive. Server-to-server, guarded by the shared secret.
 */
export async function GET(request: Request) {
  if (!isAuthorizedIntegrationRequest(request)) return integrationUnauthorized();

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

  const items = rows.map((r) => ({
    id: r.id,
    brand: r.brand,
    pattern: r.pattern,
    width: r.width,
    aspect: r.aspect,
    rim: r.rim,
    sizeDisplay: r.sizeDisplay,
    season: r.season,
    tier: r.tier ?? 'mid',
    barcode: r.barcode ?? null,
    priceNew: r.priceNew != null ? Number(r.priceNew) : null,
    stockNew: r.stockNew ?? 0,
    stockOrdered: r.stockOrdered ?? 0,
    isLocalStock: Boolean(r.isLocalStock),
    availableNew: Boolean(r.availableNew),
    updatedAt: r.updatedAt?.toISOString() ?? null,
  }));

  return NextResponse.json({ items });
}
