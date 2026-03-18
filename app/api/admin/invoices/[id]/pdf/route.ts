import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, invoices, invoiceItems } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';
import { generateInvoicePdf } from '@/lib/invoice-pdf';

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

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"`,
        'Content-Length': String(pdfBytes.length),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (error instanceof Error && error.message.includes('Forbidden'))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('GET /api/admin/invoices/[id]/pdf error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
