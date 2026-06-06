import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, tyreProducts } from '@/lib/db';
import {
  isAuthorizedIntegrationRequest,
  integrationUnauthorized,
} from '../../_lib';

export const dynamic = 'force-dynamic';

const SEASONS = ['allseason', 'summer', 'winter'] as const;
type Season = (typeof SEASONS)[number];

function isSeason(value: unknown): value is Season {
  return typeof value === 'string' && (SEASONS as readonly string[]).includes(value);
}

function toIntOrUndefined(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 1_000_000) return NaN;
  return n;
}

/**
 * Inbound endpoint: tyrerepair.uk admin writes stock / season / availability
 * back to tyrerescue (the source of truth). Additive; guarded by shared secret.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isAuthorizedIntegrationRequest(request)) return integrationUnauthorized();

  const { id } = await context.params;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const body = (raw ?? {}) as Record<string, unknown>;

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.season !== undefined) {
    if (!isSeason(body.season)) {
      return NextResponse.json(
        { error: "season must be one of 'allseason', 'summer', 'winter'" },
        { status: 400 },
      );
    }
    updates.season = body.season;
  }

  if (body.stockNew !== undefined) {
    const v = toIntOrUndefined(body.stockNew);
    if (Number.isNaN(v)) {
      return NextResponse.json({ error: 'stockNew must be a non-negative integer' }, { status: 400 });
    }
    updates.stockNew = v;
  }

  if (body.stockOrdered !== undefined) {
    const v = toIntOrUndefined(body.stockOrdered);
    if (Number.isNaN(v)) {
      return NextResponse.json({ error: 'stockOrdered must be a non-negative integer' }, { status: 400 });
    }
    updates.stockOrdered = v;
  }

  if (body.availableNew !== undefined) {
    if (typeof body.availableNew !== 'boolean') {
      return NextResponse.json({ error: 'availableNew must be a boolean' }, { status: 400 });
    }
    updates.availableNew = body.availableNew;
  }

  if (body.priceNew !== undefined) {
    const n = Number(body.priceNew);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'priceNew must be a non-negative number' }, { status: 400 });
    }
    updates.priceNew = n.toFixed(2);
  }

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const updated = await db
    .update(tyreProducts)
    .set(updates)
    .where(eq(tyreProducts.id, id))
    .returning({
      id: tyreProducts.id,
      season: tyreProducts.season,
      stockNew: tyreProducts.stockNew,
      stockOrdered: tyreProducts.stockOrdered,
      availableNew: tyreProducts.availableNew,
      priceNew: tyreProducts.priceNew,
    });

  const row = updated[0];
  if (!row) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    id: row.id,
    season: row.season,
    stockNew: row.stockNew ?? 0,
    stockOrdered: row.stockOrdered ?? 0,
    availableNew: Boolean(row.availableNew),
    priceNew: row.priceNew != null ? Number(row.priceNew) : null,
  });
}
