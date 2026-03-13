import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { z } from 'zod';

const createSchema = z.object({
  brand: z.string().min(1).max(100),
  pattern: z.string().min(1).max(200),
  width: z.number().int().positive(),
  aspect: z.number().int().positive(),
  rim: z.number().int().positive(),
  season: z.string().min(1),
  speedRating: z.string().max(5).nullable().optional(),
  loadIndex: z.number().int().nullable().optional(),
  priceNew: z.union([z.string(), z.number()]).nullable().optional(),
  priceUsed: z.union([z.string(), z.number()]).nullable().optional(),
  stockNew: z.number().int().min(0).default(0),
  stockUsed: z.number().int().min(0).default(0),
  runFlat: z.boolean().default(false),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const sizeDisplay = `${d.width}/${d.aspect}R${d.rim}`;
  const slug = `${d.brand}-${d.pattern}-${sizeDisplay}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  await db.insert(tyreProducts).values({
    brand: d.brand,
    pattern: d.pattern,
    width: d.width,
    aspect: d.aspect,
    rim: d.rim,
    sizeDisplay,
    season: d.season,
    speedRating: d.speedRating ?? null,
    loadIndex: d.loadIndex ?? null,
    priceNew: d.priceNew != null ? String(d.priceNew) : null,
    priceUsed: d.priceUsed != null ? String(d.priceUsed) : null,
    stockNew: d.stockNew,
    stockUsed: d.stockUsed,
    runFlat: d.runFlat,
    slug,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
