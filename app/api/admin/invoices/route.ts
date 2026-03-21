import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, invoices, invoiceItems, users, bookings } from '@/lib/db';
import { eq, desc, and, isNull, ilike, or, sql, count } from 'drizzle-orm';
import { z } from 'zod/v4';

const itemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  totalPrice: z.number().min(0),
  sortOrder: z.number().int().optional(),
});

const createSchema = z.object({
  bookingId: z.string().uuid().nullable().optional(),
  customerName: z.string().min(1).max(255),
  customerEmail: z.string().email().max(255),
  customerPhone: z.string().max(20).nullable().optional(),
  customerAddress: z.string().nullable().optional(),
  issueDate: z.string(),
  dueDate: z.string(),
  vatRate: z.number().min(0).max(100).optional(),
  notes: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  items: z.array(itemSchema).min(1),
  // Optional: link to existing user
  userId: z.string().uuid().nullable().optional(),
});

async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const [result] = await db
    .select({ cnt: count() })
    .from(invoices)
    .where(ilike(invoices.invoiceNumber, `${prefix}%`));
  const next = (result?.cnt ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

// Company defaults
const COMPANY = {
  name: 'Tyre Rescue',
  address: '3, 10 Gateside St, Glasgow G31 1PD',
  phone: '0141 266 0690',
  email: 'support@tyrerescue.uk',
};

async function getVatInfo() {
  const { pricingRules } = await import('@/lib/db');
  const rules = await db.select().from(pricingRules);
  const ruleMap = Object.fromEntries(rules.map((r) => [r.key, r.value]));
  return {
    vatNumber: ruleMap['vat_number'] || null,
    vatRate: parseFloat(ruleMap['vat_rate'] || '20'),
  };
}

export async function GET(request: Request) {
  try {
    const session = await requireAdmin();

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const perPage = 25;
    const offset = (page - 1) * perPage;
    const search = url.searchParams.get('search') || '';
    const status = url.searchParams.get('status') || '';
    const showDeleted = url.searchParams.get('showDeleted') === 'true';

    const conditions = [];
    if (!showDeleted) {
      conditions.push(isNull(invoices.deletedAt));
    }
    if (status && status !== 'all') {
      conditions.push(eq(invoices.status, status));
    }
    if (search) {
      conditions.push(
        or(
          ilike(invoices.invoiceNumber, `%${search}%`),
          ilike(invoices.customerName, `%${search}%`),
          ilike(invoices.customerEmail, `%${search}%`)
        )
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db
      .select({ cnt: count() })
      .from(invoices)
      .where(where);

    const rows = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        bookingId: invoices.bookingId,
        status: invoices.status,
        customerName: invoices.customerName,
        customerEmail: invoices.customerEmail,
        totalAmount: invoices.totalAmount,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        sentAt: invoices.sentAt,
        archivedAt: invoices.archivedAt,
        deletedAt: invoices.deletedAt,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .where(where)
      .orderBy(desc(invoices.createdAt))
      .limit(perPage)
      .offset(offset);

    const total = totalResult?.cnt ?? 0;

    return NextResponse.json({
      invoices: rows.map((r) => ({
        ...r,
        totalAmount: r.totalAmount?.toString() ?? '0',
        issueDate: r.issueDate?.toISOString() ?? null,
        dueDate: r.dueDate?.toISOString() ?? null,
        sentAt: r.sentAt?.toISOString() ?? null,
        archivedAt: r.archivedAt?.toISOString() ?? null,
        deletedAt: r.deletedAt?.toISOString() ?? null,
        createdAt: r.createdAt?.toISOString() ?? null,
      })),
      total,
      page,
      totalPages: Math.ceil(Number(total) / perPage),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message.includes('Forbidden'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('GET /api/admin/invoices error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;

    // Compute totals from items (VAT not applied)
    const subtotal = data.items.reduce((sum, it) => sum + it.totalPrice, 0);
    const vatRate = 0;
    const vatAmount = 0;
    const totalAmount = subtotal;

    const invoiceNumber = await generateInvoiceNumber();

    const [created] = await db.insert(invoices).values({
      invoiceNumber,
      bookingId: data.bookingId ?? null,
      userId: data.userId ?? null,
      status: 'draft',
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone ?? null,
      customerAddress: data.customerAddress ?? null,
      companyName: COMPANY.name,
      companyAddress: COMPANY.address,
      companyPhone: COMPANY.phone,
      companyEmail: COMPANY.email,
      companyVatNumber: null,
      issueDate: new Date(data.issueDate),
      dueDate: new Date(data.dueDate),
      subtotal: subtotal.toFixed(2),
      vatRate: vatRate.toFixed(2),
      vatAmount: vatAmount.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      notes: data.notes ?? null,
      internalNotes: data.internalNotes ?? null,
      createdBy: session.user.id,
      updatedBy: session.user.id,
    }).returning();

    // Insert line items
    if (data.items.length > 0) {
      await db.insert(invoiceItems).values(
        data.items.map((it, i) => ({
          invoiceId: created.id,
          description: it.description,
          quantity: it.quantity,
          unitPrice: it.unitPrice.toFixed(2),
          totalPrice: it.totalPrice.toFixed(2),
          sortOrder: it.sortOrder ?? i,
        }))
      );
    }

    // Audit log
    const { auditLogs } = await import('@/lib/db');
    await db.insert(auditLogs).values({
      actorUserId: session.user.id,
      actorRole: 'admin',
      entityType: 'invoice',
      entityId: created.id,
      action: 'create_invoice',
      afterJson: { invoiceNumber, customerName: data.customerName, totalAmount },
    });

    // Admin notification
    const { createAdminNotification } = await import('@/lib/notifications');
    await createAdminNotification({
      type: 'invoice.created',
      title: 'Invoice Created',
      body: `Invoice ${invoiceNumber} for £${totalAmount.toFixed(2)} — ${data.customerName}`,
      entityType: 'invoice',
      entityId: created.id,
      link: `/admin/invoices/${created.id}`,
      severity: 'info',
    });

    return NextResponse.json({ invoice: { id: created.id, invoiceNumber } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message.includes('Forbidden'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('POST /api/admin/invoices error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
