import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import {
  getCustomerMobileUser,
  isInvoiceableBookingStatus,
  verifyCustomerInvoiceToken,
} from '@/app/api/mobile/customer/_lib';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { generateBookingCustomerInvoicePdf } from '@/lib/invoice-pdf';
import { buildBookingCustomerInvoiceFromBooking, InvoiceDomainError } from '@/lib/invoices/invoice-domain';
import { getBookingPaymentSummary } from '@/lib/payments/payment-summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COMPANY = {
  name: 'Tyre Rescue',
  address: '3, 10 Gateside St, Glasgow G31 1PD',
  phone: '0141 266 0690',
  email: 'support@tyrerescue.uk',
};

type Props = { params: Promise<{ ref: string }> };

export async function GET(request: Request, props: Props) {
  try {
    const { ref } = await props.params;
    const refNumber = ref.trim().toUpperCase();

    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.refNumber, refNumber))
      .limit(1);

    if (!booking) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (!isInvoiceableBookingStatus(booking.status)) {
      return NextResponse.json({ error: 'Invoice is available after payment.' }, { status: 409 });
    }

    const user = await getCustomerMobileUser(request);
    const url = new URL(request.url);
    const invoiceToken = url.searchParams.get('token');
    let allowed = Boolean(user && booking.userId === user.id);

    if (!allowed && invoiceToken) {
      try {
        const payload = await verifyCustomerInvoiceToken(invoiceToken);
        allowed =
          payload.bookingId === booking.id &&
          payload.refNumber === booking.refNumber &&
          payload.email.toLowerCase() === booking.customerEmail.toLowerCase();
      } catch {
        allowed = false;
      }
    }

    if (!allowed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const paymentSummary = await getBookingPaymentSummary({
      id: booking.id,
      refNumber: booking.refNumber,
      status: booking.status,
      paymentType: booking.paymentType,
      totalAmount: booking.totalAmount.toString(),
      subtotal: booking.subtotal.toString(),
      vatAmount: booking.vatAmount.toString(),
      depositAmountPence: booking.depositAmountPence,
      remainingBalancePence: booking.remainingBalancePence,
      depositPaidAt: booking.depositPaidAt,
      stripePiId: booking.stripePiId,
      stripeDepositPiId: booking.stripeDepositPiId,
    });
    const invoice = buildBookingCustomerInvoiceFromBooking({
      booking: {
        id: booking.id,
        refNumber: booking.refNumber,
        status: booking.status,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        customerPhone: booking.customerPhone,
        addressLine: booking.addressLine,
        totalAmount: booking.totalAmount.toString(),
        createdAt: booking.createdAt,
        vehicleReg: booking.vehicleReg,
        vehicleMake: booking.vehicleMake,
        vehicleModel: booking.vehicleModel,
        tyreSizeDisplay: booking.tyreSizeDisplay,
        serviceType: booking.serviceType,
        vatAmount: booking.vatAmount.toString(),
      },
      paymentSummary,
      company: COMPANY,
      invoiceNumber: `INV-${booking.refNumber}`,
      source: `mobile-customer:${booking.refNumber}`,
    });
    const pdfBytes = await generateBookingCustomerInvoicePdf(invoice);

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="INV-${booking.refNumber}.pdf"`,
        'Content-Length': String(pdfBytes.length),
      },
    });
  } catch (error) {
    if (error instanceof InvoiceDomainError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[mobile-customer:invoice] error:', error);
    return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 500 });
  }
}
