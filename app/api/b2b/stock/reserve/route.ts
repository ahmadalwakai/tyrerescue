import { NextResponse } from 'next/server';
import { validateB2BApiKey } from '@/lib/b2b/auth';
import { db } from '@/lib/db';
import { b2bApiKeyAuditLogs, tyreProducts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { reserveStock } from '@/lib/inventory/stock-service';

const bodySchema = z.object({
  tyreId: z.string().uuid(),
  quantity: z.number().int().min(1).max(1000),
  reference: z.string().min(1).max(255),
  expiryMinutes: z.number().int().min(1).max(10080).default(60), // max 7 days
});

export async function POST(request: Request) {
  const auth = await validateB2BApiKey(request, 'stock:reserve');
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: { code: auth.code, message: auth.message } },
      { status: auth.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: 'invalid_body', message: 'Invalid JSON body.' } },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'invalid_params',
          message: 'Validation failed',
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  const { tyreId, quantity, reference, expiryMinutes } = parsed.data;

  // Verify the product exists and is available
  const [product] = await db
    .select({
      id: tyreProducts.id,
      sizeDisplay: tyreProducts.sizeDisplay,
      brand: tyreProducts.brand,
      availableNew: tyreProducts.availableNew,
      stockNew: tyreProducts.stockNew,
    })
    .from(tyreProducts)
    .where(and(eq(tyreProducts.id, tyreId), eq(tyreProducts.availableNew, true)))
    .limit(1);

  if (!product) {
    return NextResponse.json(
      { ok: false, error: { code: 'product_not_found', message: 'Product not found or not available.' } },
      { status: 404 },
    );
  }

  const expiresAt = new Date(Date.now() + expiryMinutes * 60_000);

  // Delegate to the existing transactional stock service — atomic, race-safe
  const result = await reserveStock({
    tyreId,
    quantity,
    expiresAt,
    actor: 'webhook', // B2B external actor
    note: `B2B reserve: ref=${reference} client=${auth.clientId}`,
  });

  if (!result.success) {
    // Write a failure audit log
    await db.insert(b2bApiKeyAuditLogs).values({
      apiKeyId: auth.keyId,
      clientId: auth.clientId,
      action: 'reserve_failed',
      route: '/api/b2b/stock/reserve',
      statusCode: result.code === 'INSUFFICIENT_STOCK' ? 409 : 422,
      metadata: { tyreId, quantity, reference, error: result.error, code: result.code },
    }).catch(() => {});

    if (result.code === 'INSUFFICIENT_STOCK') {
      return NextResponse.json(
        { ok: false, error: { code: 'insufficient_stock', message: result.error } },
        { status: 409 },
      );
    }

    if (result.code === 'UNAVAILABLE') {
      return NextResponse.json(
        { ok: false, error: { code: 'product_unavailable', message: result.error } },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { ok: false, error: { code: 'reserve_failed', message: 'Failed to reserve stock.' } },
      { status: 500 },
    );
  }

  // Write success audit log
  await db.insert(b2bApiKeyAuditLogs).values({
    apiKeyId: auth.keyId,
    clientId: auth.clientId,
    action: 'reserve_success',
    route: '/api/b2b/stock/reserve',
    statusCode: 200,
    metadata: {
      tyreId,
      quantity,
      reference,
      reservationId: result.reservationId,
      stockAfter: result.stockAfter,
      expiresAt: expiresAt.toISOString(),
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    reservationId: result.reservationId,
    tyreId,
    sizeDisplay: product.sizeDisplay,
    brand: product.brand,
    quantity,
    stockAfter: result.stockAfter,
    expiresAt: expiresAt.toISOString(),
    reference,
  });
}
