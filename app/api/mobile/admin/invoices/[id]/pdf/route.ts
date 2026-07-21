import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, invoices } from '@/lib/db';
import { verifyMobileToken } from '@/lib/auth';
import { getMobileAdminUser } from '@/app/api/mobile/admin/_lib';
import { generateBookingCustomerInvoicePdf, generateStandaloneAdminInvoicePdf } from '@/lib/invoice-pdf';
import {
  buildBookingCustomerInvoicePdfData,
  buildStandaloneAdminInvoicePdfData,
} from '@/lib/invoice-pdf-data';
import { InvoiceDomainError } from '@/lib/invoices/invoice-domain';

type Props = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Props) {
  try {
    // Allow auth via Bearer header (in-app fetch) OR ?token=<jwt> query
    // (Linking.openURL opens the device browser which can't set headers).
    let authorized = false;
    const user = await getMobileAdminUser(request);
    if (user) {
      authorized = true;
    } else {
      const url = new URL(request.url);
      const queryToken = url.searchParams.get('token');
      if (queryToken) {
        try {
          const payload = await verifyMobileToken(queryToken);
          if (payload.role === 'admin') authorized = true;
        } catch {
          // fall through to 401
        }
      }
    }
    if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
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
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof InvoiceDomainError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('GET /api/mobile/admin/invoices/[id]/pdf error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
