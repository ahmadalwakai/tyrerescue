import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, invoices } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { generateBookingCustomerInvoicePdf, generateStandaloneAdminInvoicePdf } from '@/lib/invoice-pdf';
import {
  buildBookingCustomerInvoicePdfData,
  buildStandaloneAdminInvoicePdfData,
} from '@/lib/invoice-pdf-data';
import { InvoiceDomainError } from '@/lib/invoices/invoice-domain';

type Props = { params: Promise<{ id: string }> };

export async function GET(_request: Request, props: Props) {
  try {
    await requireAdmin();
    const { id } = await props.params;

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const bookingInvoice = await buildBookingCustomerInvoicePdfData(invoice, { requireFullPayment: false });
    const pdfBytes = bookingInvoice
      ? await generateBookingCustomerInvoicePdf(bookingInvoice)
      : await generateStandaloneAdminInvoicePdf(await buildStandaloneAdminInvoicePdfData(invoice));

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
    if (error instanceof InvoiceDomainError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('GET /api/admin/invoices/[id]/pdf error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
