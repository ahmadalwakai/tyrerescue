import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tyreCatalogue, tyreProducts, auditLogs } from '@/lib/db/schema';
import { z } from 'zod';

const customTyreSchema = z.object({
  brand: z.string().min(1).max(100),
  pattern: z.string().min(1).max(200),
  width: z.number().int().min(100).max(400),
  aspect: z.number().int().min(20).max(90),
  rim: z.number().int().min(10).max(26),
  season: z.enum(['summer', 'winter', 'allseason']),
  speedRating: z.string().max(5).optional(),
  loadIndex: z.number().int().optional(),
  tier: z.enum(['budget', 'mid', 'premium']),
  priceNew: z.number().min(0),
  stockNew: z.number().int().min(0),
  stockOrdered: z.number().int().min(0).optional().default(0),
  isLocalStock: z.boolean().optional().default(true),
});

/**
 * POST /api/admin/inventory/custom
 * Create a custom tyre in both catalogue and products tables.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = customTyreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const sizeDisplay = `${d.width}/${d.aspect}/R${d.rim}`;
  const slug = `${d.brand}-${d.pattern}-${sizeDisplay}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  // Insert into catalogue first
  const [catItem] = await db.insert(tyreCatalogue).values({
    brand: d.brand,
    pattern: d.pattern,
    width: d.width,
    aspect: d.aspect,
    rim: d.rim,
    sizeDisplay,
    season: d.season,
    speedRating: d.speedRating ?? null,
    loadIndex: d.loadIndex ?? null,
    tier: d.tier,
    suggestedPriceNew: String(d.priceNew),
    slug: `${slug}-${Date.now()}`,
  }).returning();

  // Insert into products
  const [product] = await db.insert(tyreProducts).values({
    catalogueId: catItem.id,
    brand: d.brand,
    pattern: d.pattern,
    width: d.width,
    aspect: d.aspect,
    rim: d.rim,
    sizeDisplay,
    season: d.season,
    speedRating: d.speedRating ?? null,
    loadIndex: d.loadIndex ?? null,
    priceNew: String(d.priceNew),
    stockNew: d.stockNew,
    stockOrdered: d.stockOrdered,
    isLocalStock: d.isLocalStock,
    availableNew: true,
    slug: `${slug}-${Date.now()}`,
  }).returning();

  // Audit log
  await db.insert(auditLogs).values({
    actorUserId: session.user.id,
    actorRole: 'admin',
    entityType: 'tyre_product',
    entityId: product.id,
    action: 'create_custom_tyre',
    beforeJson: null,
    afterJson: product,
  });

  return NextResponse.json({ success: true, product }, { status: 201 });
}
