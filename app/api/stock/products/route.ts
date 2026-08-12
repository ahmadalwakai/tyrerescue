import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { z } from 'zod';

import { db, tyreProducts } from '@/lib/db';
import {
  forbiddenResponse,
  getStockApiUser,
  stockCorsPreflight,
  stockJsonResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  search: z.string().trim().max(80).optional().default(''),
  perPage: z.coerce.number().int().min(1).max(20).optional().default(8),
  available: z.enum(['true', 'false', 'all']).optional().default('true'),
});

export async function GET(request: Request) {
  const user = await getStockApiUser(request);
  if (!user) return unauthorizedResponse(request);
  if (user.role !== 'admin') return forbiddenResponse('Admin access required', request);

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    search: url.searchParams.get('search') ?? '',
    perPage: url.searchParams.get('perPage') ?? '8',
    available: url.searchParams.get('available') ?? 'true',
  });
  if (!parsed.success) return validationErrorResponse(parsed.error.flatten(), request);

  const { search, perPage, available } = parsed.data;
  const conditions = [];
  if (search) {
    conditions.push(
      or(
        ilike(tyreProducts.sizeDisplay, `%${search}%`),
        ilike(tyreProducts.brand, `%${search}%`),
        ilike(tyreProducts.pattern, `%${search}%`),
      ),
    );
  }
  if (available !== 'all') {
    conditions.push(eq(tyreProducts.availableNew, available === 'true'));
  }

  const rows = await db
    .select({
      id: tyreProducts.id,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      sizeDisplay: tyreProducts.sizeDisplay,
      season: tyreProducts.season,
      stockNew: tyreProducts.stockNew,
      availableNew: tyreProducts.availableNew,
    })
    .from(tyreProducts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(tyreProducts.sizeDisplay), asc(tyreProducts.brand), asc(tyreProducts.pattern))
    .limit(perPage);

  return stockJsonResponse(request, {
    items: rows.map((row) => ({
      id: row.id,
      brand: row.brand,
      pattern: row.pattern,
      sizeDisplay: row.sizeDisplay,
      season: row.season,
      stockNew: row.stockNew ?? 0,
      availableNew: row.availableNew ?? false,
    })),
  });
}

export async function OPTIONS(request: Request) {
  return stockCorsPreflight(request);
}
