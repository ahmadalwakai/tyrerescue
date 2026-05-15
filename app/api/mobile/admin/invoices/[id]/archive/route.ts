import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, invoices, auditLogs } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

interface Props { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (invoice.deletedAt) return NextResponse.json({ error: 'Invoice is deleted' }, { status: 400 });
  if (invoice.status === 'archived') return NextResponse.json({ error: 'Already archived' }, { status: 400 });

  await db.update(invoices).set({
    status: 'archived',
    archivedAt: new Date(),
    updatedBy: user.id,
    updatedAt: new Date(),
  }).where(eq(invoices.id, id));

  await db.insert(auditLogs).values({
    actorUserId: user.id,
    actorRole: 'admin',
    entityType: 'invoice',
    entityId: id,
    action: 'archive_invoice',
    afterJson: { status: 'archived' },
  });

  return NextResponse.json({ ok: true });
}
