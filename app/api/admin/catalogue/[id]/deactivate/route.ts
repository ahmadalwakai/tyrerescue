import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tyreProducts, auditLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const [product] = await db
    .select()
    .from(tyreProducts)
    .where(eq(tyreProducts.catalogueId, id))
    .limit(1);

  if (!product) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await db.delete(tyreProducts).where(eq(tyreProducts.id, product.id));

  await db.insert(auditLogs).values({
    actorUserId: session.user.id,
    actorRole: 'admin',
    entityType: 'tyre_product',
    entityId: product.id,
    action: 'deactivate_product',
    beforeJson: product,
    afterJson: null,
  });

  return NextResponse.json({ success: true });
}
