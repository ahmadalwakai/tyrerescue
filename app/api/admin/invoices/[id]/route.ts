import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, invoices, invoiceItems, auditLogs } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';
import { z } from 'zod/v4';

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
  vatRate: z.number().min(0).max(100).optional(),
  notes: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  status: z.enum(['draft', 'issued', 'sent', 'paid', 'overdue', 'archived', 'cancelled']).optional(),
  items: z.array(itemSchema).min(1).optional(),
  bookingId: z.string().uuid().nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
});

type Props = { params: Promise<{ id: string }> };

export async function GET(_request: Request, props: Props) {
  try {
    await requireAdmin();
    const { id } = await props.params;

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const items = await db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, id))
      .orderBy(asc(invoiceItems.sortOrder));

    return NextResponse.json({
      invoice: {
        ...invoice,
        subtotal: invoice.subtotal?.toString() ?? '0',
        vatRate: invoice.vatRate?.toString() ?? '20',
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
      items: items.map((it) => ({
        ...it,
        unitPrice: it.unitPrice?.toString() ?? '0',
        totalPrice: it.totalPrice?.toString() ?? '0',
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message.includes('Forbidden'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('GET /api/admin/invoices/[id] error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, props: Props) {
  try {
    const session = await requireAdmin();
    const { id } = await props.params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const [existing] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    if (existing.deletedAt) return NextResponse.json({ error: 'Invoice is deleted' }, { status: 400 });

    const data = parsed.data;
    const updates: Record<string, unknown> = { updatedBy: session.user.id, updatedAt: new Date() };

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

    // Recalculate totals if items changed (VAT not applied)
    if (data.items) {
      const subtotal = data.items.reduce((sum, it) => sum + it.totalPrice, 0);
      updates.subtotal = subtotal.toFixed(2);
      updates.vatRate = '0.00';
      updates.vatAmount = '0.00';
      updates.totalAmount = subtotal.toFixed(2);

      // Replace items: delete old, insert new
      await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
      await db.insert(invoiceItems).values(
        data.items.map((it, i) => ({
          invoiceId: id,
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice.toFixed(2),
          totalPrice: it.totalPrice.toFixed(2),
          sortOrder: it.sortOrder ?? i,
        }))
      );
    }

    await db.update(invoices).set(updates).where(eq(invoices.id, id));

    // Audit
    await db.insert(auditLogs).values({
      actorUserId: session.user.id,
      actorRole: 'admin',
      entityType: 'invoice',
      entityId: id,
      action: 'update_invoice',
      beforeJson: { status: existing.status, totalAmount: existing.totalAmount?.toString() },
      afterJson: updates,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message.includes('Forbidden'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('PATCH /api/admin/invoices/[id] error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// Soft delete
export async function DELETE(_request: Request, props: Props) {
  try {
    const session = await requireAdmin();
    const { id } = await props.params;

    const [existing] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    if (existing.deletedAt) return NextResponse.json({ error: 'Already deleted' }, { status: 400 });

    await db.update(invoices).set({
      deletedAt: new Date(),
      updatedBy: session.user.id,
      updatedAt: new Date(),
    }).where(eq(invoices.id, id));

    await db.insert(auditLogs).values({
      actorUserId: session.user.id,
      actorRole: 'admin',
      entityType: 'invoice',
      entityId: id,
      action: 'soft_delete_invoice',
      beforeJson: { invoiceNumber: existing.invoiceNumber, status: existing.status },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message.includes('Forbidden'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('DELETE /api/admin/invoices/[id] error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
