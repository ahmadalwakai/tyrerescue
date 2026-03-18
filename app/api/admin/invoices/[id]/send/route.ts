import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, invoices, invoiceItems, auditLogs } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';
import { sendEmail } from '@/lib/email/resend';
import { invoiceEmail } from '@/lib/email/templates/invoice';
import { generateInvoicePdf } from '@/lib/invoice-pdf';

type Props = { params: Promise<{ id: string }> };

export async function POST(_request: Request, props: Props) {
  try {
    const session = await requireAdmin();
    const { id } = await props.params;

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    if (invoice.deletedAt) return NextResponse.json({ error: 'Invoice is deleted' }, { status: 400 });
    if (invoice.status === 'cancelled') return NextResponse.json({ error: 'Cannot send a cancelled invoice' }, { status: 400 });

    // Get items for PDF
    const items = await db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, id))
      .orderBy(asc(invoiceItems.sortOrder));

    // Generate PDF
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
      vatRate: parseFloat(invoice.vatRate?.toString() ?? '20'),
      vatAmount: parseFloat(invoice.vatAmount?.toString() ?? '0'),
      totalAmount: parseFloat(invoice.totalAmount?.toString() ?? '0'),
      notes: invoice.notes,
    });

    // Build email
    const siteUrl = process.env.NEXTAUTH_URL || 'https://www.tyrerescue.uk';
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

    // Update status + sentAt
    const newStatus = invoice.status === 'draft' || invoice.status === 'issued' ? 'sent' : invoice.status;
    await db.update(invoices).set({
      status: newStatus,
      sentAt: new Date(),
      updatedBy: session.user.id,
      updatedAt: new Date(),
    }).where(eq(invoices.id, id));

    await db.insert(auditLogs).values({
      actorUserId: session.user.id,
      actorRole: 'admin',
      entityType: 'invoice',
      entityId: id,
      action: 'send_invoice',
      afterJson: { sentTo: invoice.customerEmail, invoiceNumber: invoice.invoiceNumber },
    });

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message.includes('Forbidden'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('POST /api/admin/invoices/[id]/send error:', error);
    return NextResponse.json({ error: 'Failed to send invoice' }, { status: 500 });
  }
}
