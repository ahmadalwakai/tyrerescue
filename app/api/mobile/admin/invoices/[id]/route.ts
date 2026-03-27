import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, invoices, invoiceItems, auditLogs } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

interface Props {
  params: Promise<{ id: string }>;
}

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  totalPrice: z.number().min(0),
  sortOrder: z.number().int().optional(),
});

const updateSchema = z.object({
  customerName: z.string().min(1).max(255).optional(),
  customerEmail: z.string().email().max(255).optional(),
  customerPhone: z.string().max(20).nullable().optional(),
  customerAddress: z.string().nullable().optional(),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  status: z.enum(['draft', 'issued', 'sent', 'paid', 'overdue', 'archived', 'cancelled']).optional(),
  items: z.array(itemSchema).min(1).optional(),
  bookingId: z.string().uuid().nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
});

export async function GET(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { id } = await params;

  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.sortOrder));

  return NextResponse.json({
    invoice: {
      ...invoice,
      subtotal: invoice.subtotal?.toString() ?? '0',
      vatRate: invoice.vatRate?.toString() ?? '0',
      vatAmount: invoice.vatAmount?.toString() ?? '0',
      totalAmount: invoice.totalAmount?.toString() ?? '0',
      issueDate: invoice.issueDate?.toISOString() ?? null,
      dueDate: invoice.dueDate?.toISOString() ?? null,
      sentAt: invoice.sentAt?.toISOString() ?? null,
      archivedAt: invoice.archivedAt?.toISOString() ?? null,
      deletedAt: invoice.deletedAt?.toISOString() ?? null,
      createdAt: invoice.createdAt?.toISOString() ?? null,
      updatedAt: invoice.updatedAt?.toISOString() ?? null,
    },
    items: items.map((item) => ({
      ...item,
      unitPrice: item.unitPrice?.toString() ?? '0',
      totalPrice: item.totalPrice?.toString() ?? '0',
    })),
  });
}

export async function PATCH(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [existing] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const data = parsed.data;
  const updates: Record<string, unknown> = { updatedBy: user.id, updatedAt: new Date() };

  if (data.customerName !== undefined) updates.customerName = data.customerName;
  if (data.customerEmail !== undefined) updates.customerEmail = data.customerEmail;
  if (data.customerPhone !== undefined) updates.customerPhone = data.customerPhone;
  if (data.customerAddress !== undefined) updates.customerAddress = data.customerAddress;
  if (data.issueDate !== undefined) updates.issueDate = new Date(data.issueDate);
  if (data.dueDate !== undefined) updates.dueDate = new Date(data.dueDate);
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.internalNotes !== undefined) updates.internalNotes = data.internalNotes;
  if (data.status !== undefined) updates.status = data.status;
  if (data.bookingId !== undefined) updates.bookingId = data.bookingId;
  if (data.userId !== undefined) updates.userId = data.userId;

  if (data.items) {
    const subtotal = data.items.reduce((sum, item) => sum + item.totalPrice, 0);
    updates.subtotal = subtotal.toFixed(2);
    updates.vatRate = '0.00';
    updates.vatAmount = '0.00';
    updates.totalAmount = subtotal.toFixed(2);

    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    await db.insert(invoiceItems).values(
      data.items.map((item, index) => ({
        invoiceId: id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        totalPrice: item.totalPrice.toFixed(2),
        sortOrder: item.sortOrder ?? index,
      })),
    );
  }

  await db.update(invoices).set(updates).where(eq(invoices.id, id));

  await db.insert(auditLogs).values({
    actorUserId: user.id,
    actorRole: 'admin',
    entityType: 'invoice',
    entityId: id,
    action: 'update_invoice_mobile',
    beforeJson: { status: existing.status },
    afterJson: updates,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { id } = await params;

  const [existing] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!existing) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  await db
    .update(invoices)
    .set({ deletedAt: new Date(), updatedBy: user.id, updatedAt: new Date() })
    .where(eq(invoices.id, id));

  await db.insert(auditLogs).values({
    actorUserId: user.id,
    actorRole: 'admin',
    entityType: 'invoice',
    entityId: id,
    action: 'delete_invoice_mobile',
    beforeJson: { invoiceNumber: existing.invoiceNumber },
  });

  return NextResponse.json({ success: true });
}
