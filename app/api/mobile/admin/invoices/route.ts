import { NextResponse } from 'next/server';
import { and, count, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { db, invoices, invoiceItems, auditLogs } from '@/lib/db';
import { getMobileAdminUser, parsePageParams, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';

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
  notes: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  items: z.array(itemSchema).min(1),
});

async function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const [row] = await db.select({ cnt: count() }).from(invoices).where(ilike(invoices.invoiceNumber, `${prefix}%`));
  const next = (row?.cnt ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

const COMPANY = {
  name: 'Tyre Rescue',
  address: '3, 10 Gateside St, Glasgow G31 1PD',
  phone: '0141 266 0690',
  email: 'support@tyrerescue.uk',
};

export async function GET(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || '';
  const showDeleted = url.searchParams.get('showDeleted') === 'true';
  const { page, perPage, offset } = parsePageParams(url, { page: 1, perPage: 25, maxPerPage: 100 });

  const conditions = [];
  if (!showDeleted) conditions.push(isNull(invoices.deletedAt));
  if (status && status !== 'all') conditions.push(eq(invoices.status, status));
  if (search) {
    conditions.push(
      or(
        ilike(invoices.invoiceNumber, `%${search}%`),
        ilike(invoices.customerName, `%${search}%`),
        ilike(invoices.customerEmail, `%${search}%`),
      ),
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
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
      .where(whereClause)
      .orderBy(desc(invoices.createdAt))
      .limit(perPage)
      .offset(offset),
    db.select({ cnt: count() }).from(invoices).where(whereClause),
  ]);

  const total = Number(totalRows[0]?.cnt || 0);

  return NextResponse.json({
    items: rows.map((row) => ({
      ...row,
      totalAmount: row.totalAmount?.toString() ?? '0',
      issueDate: row.issueDate?.toISOString() ?? null,
      dueDate: row.dueDate?.toISOString() ?? null,
      sentAt: row.sentAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      createdAt: row.createdAt?.toISOString() ?? null,
    })),
    page,
    perPage,
    totalCount: total,
    totalPages: Math.ceil(total / perPage),
  });
}

export async function POST(request: Request) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const subtotal = data.items.reduce((sum, item) => sum + item.totalPrice, 0);
  const invoiceNumber = await generateInvoiceNumber();

  const [created] = await db
    .insert(invoices)
    .values({
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
      vatRate: '0.00',
      vatAmount: '0.00',
      totalAmount: subtotal.toFixed(2),
      notes: data.notes ?? null,
      internalNotes: data.internalNotes ?? null,
      createdBy: user.id,
      updatedBy: user.id,
    })
    .returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber });

  await db.insert(invoiceItems).values(
    data.items.map((item, index) => ({
      invoiceId: created.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      totalPrice: item.totalPrice.toFixed(2),
      sortOrder: item.sortOrder ?? index,
    })),
  );

  await db.insert(auditLogs).values({
    actorUserId: user.id,
    actorRole: 'admin',
    entityType: 'invoice',
    entityId: created.id,
    action: 'create_invoice_mobile',
    afterJson: { invoiceNumber: created.invoiceNumber },
  });

  return NextResponse.json({ success: true, invoice: created }, { status: 201 });
}
