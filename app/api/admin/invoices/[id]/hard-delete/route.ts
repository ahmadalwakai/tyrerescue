import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, invoices, invoiceItems, auditLogs } from '@/lib/db';
import { eq } from 'drizzle-orm';

type Props = { params: Promise<{ id: string }> };

// Hard delete — restricted to admin only, requires invoice to already be soft-deleted
export async function DELETE(_request: Request, props: Props) {
  try {
    const session = await requireAdmin();
    const { id } = await props.params;

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    if (!invoice.deletedAt) {
      return NextResponse.json(
        { error: 'Invoice must be soft-deleted before hard delete. Delete it first.' },
        { status: 400 }
      );
    }

    // Audit before permanent removal
    await db.insert(auditLogs).values({
      actorUserId: session.user.id,
      actorRole: 'admin',
      entityType: 'invoice',
      entityId: id,
      action: 'hard_delete_invoice',
      beforeJson: {
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
        totalAmount: invoice.totalAmount?.toString(),
        deletedAt: invoice.deletedAt?.toISOString(),
      },
    });

    // Items CASCADE, but be explicit
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    await db.delete(invoices).where(eq(invoices.id, id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message.includes('Forbidden'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('DELETE /api/admin/invoices/[id]/hard-delete error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
