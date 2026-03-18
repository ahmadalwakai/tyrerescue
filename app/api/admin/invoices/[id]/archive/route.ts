import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, invoices, auditLogs } from '@/lib/db';
import { eq } from 'drizzle-orm';

type Props = { params: Promise<{ id: string }> };

export async function POST(_request: Request, props: Props) {
  try {
    const session = await requireAdmin();
    const { id } = await props.params;

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    if (invoice.deletedAt) return NextResponse.json({ error: 'Invoice is deleted' }, { status: 400 });
    if (invoice.status === 'archived') return NextResponse.json({ error: 'Already archived' }, { status: 400 });

    await db.update(invoices).set({
      status: 'archived',
      archivedAt: new Date(),
      updatedBy: session.user.id,
      updatedAt: new Date(),
    }).where(eq(invoices.id, id));

    await db.insert(auditLogs).values({
      actorUserId: session.user.id,
      actorRole: 'admin',
      entityType: 'invoice',
      entityId: id,
      action: 'archive_invoice',
      beforeJson: { status: invoice.status, invoiceNumber: invoice.invoiceNumber },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message.includes('Forbidden'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('POST /api/admin/invoices/[id]/archive error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
