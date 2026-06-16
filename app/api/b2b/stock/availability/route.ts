import { NextResponse } from 'next/server';
import { validateB2BApiKey } from '@/lib/b2b/auth';
import { db } from '@/lib/db';
import { tyreProducts, inventoryReservations } from '@/lib/db/schema';
import { eq, and, gt, ilike, sql } from 'drizzle-orm';
import { z } from 'zod';

const querySchema = z.object({
  size: z.string().min(1).max(20),
});

export async function GET(request: Request) {
  const auth = await validateB2BApiKey(request, 'stock:availability:read');
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: { code: auth.code, message: auth.message } },
      { status: auth.status },
    );
  }

  const url = new URL(request.url);
  const parseResult = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parseResult.success) {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_params', message: 'Required: ?size=205/55R16' } },
      { status: 400 },
    );
  }

  const { size } = parseResult.data;
  const includePrice = auth.scopes.includes('stock:prices:read');

  try {
    // Normalise size string for matching (e.g. "205/55R16" or "205/55/16")
    const normalisedSize = size.replace(/\s+/g, '').toUpperCase();

    const products = await db
      .select({
        id: tyreProducts.id,
        brand: tyreProducts.brand,
        pattern: tyreProducts.pattern,
        sizeDisplay: tyreProducts.sizeDisplay,
        season: tyreProducts.season,
        runFlat: tyreProducts.runFlat,
        isLocalStock: tyreProducts.isLocalStock,
        stockNew: tyreProducts.stockNew,
        priceNew: includePrice ? tyreProducts.priceNew : sql<null>`NULL`,
        updatedAt: tyreProducts.updatedAt,
      })
      .from(tyreProducts)
      .where(
        and(
          eq(tyreProducts.availableNew, true),
          ilike(tyreProducts.sizeDisplay, `%${normalisedSize}%`),
        ),
      )
      .orderBy(tyreProducts.brand);

    if (products.length === 0) {
      return NextResponse.json({
        ok: true,
        available: false,
        totalQty: 0,
        matches: [],
      });
    }

    // Compute reserved quantities
    const now = new Date();
    const ids = products.map((p) => p.id);

    let reservedMap: Map<string, number> = new Map();
    if (ids.length > 0) {
      const reservations = await db
        .select({
          tyreId: inventoryReservations.tyreId,
          total: sql<number>`SUM(${inventoryReservations.quantity})::int`,
        })
        .from(inventoryReservations)
        .where(
          and(
            eq(inventoryReservations.released, false),
            gt(inventoryReservations.expiresAt, now),
          ),
        )
        .groupBy(inventoryReservations.tyreId);

      for (const r of reservations) {
        if (r.tyreId) reservedMap.set(r.tyreId, r.total);
      }
    }

    const matches = products.map((p) => {
      const reserved = reservedMap.get(p.id) ?? 0;
      const availableQty = Math.max(0, (p.stockNew ?? 0) - reserved);
      return {
        id: p.id,
        brand: p.brand,
        pattern: p.pattern,
        sizeDisplay: p.sizeDisplay,
        season: p.season,
        runFlat: p.runFlat,
        isLocalStock: p.isLocalStock,
        availableQty,
        ...(includePrice ? { priceNew: p.priceNew } : {}),
        updatedAt: p.updatedAt,
      };
    });

    const totalQty = matches.reduce((sum, m) => sum + m.availableQty, 0);

    return NextResponse.json({
      ok: true,
      available: totalQty > 0,
      totalQty,
      matches,
    });
  } catch (err) {
    console.error('[GET /api/b2b/stock/availability]', err);
    return NextResponse.json(
      { ok: false, error: { code: 'internal_error', message: 'Internal server error.' } },
      { status: 500 },
    );
  }
}
