import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, invoices, auditLogs } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { sendEmail } from '@/lib/email/resend';
import { invoiceEmail } from '@/lib/email/templates/invoice';
import { generateBookingCustomerInvoicePdf, generateStandaloneAdminInvoicePdf } from '@/lib/invoice-pdf';
import { getOutboundUrl } from '@/lib/config/site';
import {
  buildBookingCustomerInvoicePdfData,
  buildStandaloneAdminInvoicePdfData,
} from '@/lib/invoice-pdf-data';
import { InvoiceDomainError } from '@/lib/invoices/invoice-domain';

interface Props { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { id } = await params;
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (invoice.deletedAt) return NextResponse.json({ error: 'Invoice is deleted' }, { status: 400 });
  if (invoice.status === 'cancelled') return NextResponse.json({ error: 'Cannot send a cancelled invoice' }, { status: 400 });

  let pdfBytes: Uint8Array;
  try {
    const bookingInvoice = await buildBookingCustomerInvoicePdfData(invoice, { requireFullPayment: false });
    pdfBytes = bookingInvoice
      ? await generateBookingCustomerInvoicePdf(bookingInvoice)
      : await generateStandaloneAdminInvoicePdf(await buildStandaloneAdminInvoicePdfData(invoice));
  } catch (error) {
    if (error instanceof InvoiceDomainError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

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
