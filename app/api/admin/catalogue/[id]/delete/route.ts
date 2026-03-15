import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tyreCatalogue, tyreProducts, bookingTyres, auditLogs } from '@/lib/db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';

/**
 * DELETE /api/admin/catalogue/[id]/delete
 * Hard-delete a tyre from both catalogue and products.
 * Blocks if there are existing booking references.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: catalogueId } = await params;

  // Find the product row (if activated)
  const [product] = await db
    .select()
    .from(tyreProducts)
    .where(eq(tyreProducts.catalogueId, catalogueId))
    .limit(1);

  // Check for existing booking references
  if (product) {
    const refs = await db
      .select({ id: bookingTyres.id })
      .from(bookingTyres)
      .where(and(eq(bookingTyres.tyreId, product.id), isNotNull(bookingTyres.bookingId)))
      .limit(1);

    if (refs.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete: this tyre has existing booking references. Deactivate instead.' },
        { status: 409 }
      );
    }

    // Delete product row first (child)
    await db.delete(tyreProducts).where(eq(tyreProducts.id, product.id));
  }

  // Delete catalogue row
  const [catalogue] = await db
    .select()
    .from(tyreCatalogue)
    .where(eq(tyreCatalogue.id, catalogueId))
    .limit(1);

  if (!catalogue) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await db.delete(tyreCatalogue).where(eq(tyreCatalogue.id, catalogueId));

  await db.insert(auditLogs).values({
    actorUserId: session.user.id,
    actorRole: 'admin',
    entityType: 'tyre_catalogue',
    entityId: catalogueId,
    action: 'hard_delete_catalogue',
    beforeJson: catalogue,
    afterJson: null,
  });

  return NextResponse.json({ success: true });
}
