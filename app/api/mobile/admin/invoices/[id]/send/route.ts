import { NextResponse } from 'next/server';
import { eq, asc } from 'drizzle-orm';
import { db, invoices, invoiceItems, auditLogs } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { sendEmail } from '@/lib/email/resend';
import { invoiceEmail } from '@/lib/email/templates/invoice';
import { generateInvoicePdf } from '@/lib/invoice-pdf';
import { getOutboundUrl } from '@/lib/config/site';

interface Props { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (invoice.deletedAt) return NextResponse.json({ error: 'Invoice is deleted' }, { status: 400 });
  if (invoice.status === 'cancelled') return NextResponse.json({ error: 'Cannot send a cancelled invoice' }, { status: 400 });

  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, id))
    .orderBy(asc(invoiceItems.sortOrder));

  const pdfBytes = await generateInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate!.toISOString(),
    dueDate: invoice.dueDate!.toISOString(),
    status: invoice.status,
    companyName: invoice.companyName,
    companyAddress: invoice.companyAddress,
    companyPhone: invoice.companyPhone,
    companyEmail: invoice.companyEmail,
    companyVatNumber: invoice.companyVatNumber,
    customerName: invoice.customerName,
    customerEmail: invoice.customerEmail,
    customerPhone: invoice.customerPhone,
    customerAddress: invoice.customerAddress,
    items: items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unitPrice: parseFloat(it.unitPrice?.toString() ?? '0'),
      totalPrice: parseFloat(it.totalPrice?.toString() ?? '0'),
    })),
    subtotal: parseFloat(invoice.subtotal?.toString() ?? '0'),
    vatRate: parseFloat(invoice.vatRate?.toString() ?? '0'),
    vatAmount: parseFloat(invoice.vatAmount?.toString() ?? '0'),
    totalAmount: parseFloat(invoice.totalAmount?.toString() ?? '0'),
    notes: invoice.notes,
  });

  const siteUrl = getOutboundUrl();
  const emailData = invoiceEmail({
    customerName: invoice.customerName,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate!,
    dueDate: invoice.dueDate!,
    totalAmount: parseFloat(invoice.totalAmount?.toString() ?? '0'),
    companyName: invoice.companyName,
    viewUrl: `${siteUrl}/admin/invoices/${invoice.id}`,
  });

  await sendEmail({
    to: invoice.customerEmail,
    subject: emailData.subject,
    html: emailData.html,
    attachments: [
      {
        filename: `${invoice.invoiceNumber}.pdf`,
        content: Buffer.from(pdfBytes),
        contentType: 'application/pdf',
      },
    ],
  });

  await db.update(invoices).set({
    status: 'sent',
    sentAt: new Date(),
    updatedBy: user.id,
    updatedAt: new Date(),
  }).where(eq(invoices.id, id));

  await db.insert(auditLogs).values({
    actorUserId: user.id,
    actorRole: 'admin',
    entityType: 'invoice',
    entityId: id,
    action: 'send_invoice',
    afterJson: { status: 'sent' },
  });

  return NextResponse.json({ ok: true });
}
