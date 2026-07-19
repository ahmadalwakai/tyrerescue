import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateBookingCustomerInvoicePdf } from '@/lib/invoice-pdf';
import { buildBookingCustomerInvoiceFromBooking, InvoiceDomainError } from '@/lib/invoices/invoice-domain';
import { getBookingPaymentSummary } from '@/lib/payments/payment-summary';

const COMPANY = {
  name: 'Tyre Rescue',
  address: '3, 10 Gateside St, Glasgow G31 1PD',
  phone: '0141 266 0690',
  email: 'support@tyrerescue.uk',
};

export async function GET(
  _request: Request,
  props: { params: Promise<{ ref: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ref } = await props.params;

  const [booking] = await db
    .select({
      id: bookings.id,
      refNumber: bookings.refNumber,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      customerPhone: bookings.customerPhone,
      addressLine: bookings.addressLine,
      subtotal: bookings.subtotal,
      vatAmount: bookings.vatAmount,
      totalAmount: bookings.totalAmount,
      createdAt: bookings.createdAt,
      status: bookings.status,
      paymentType: bookings.paymentType,
      depositAmountPence: bookings.depositAmountPence,
      remainingBalancePence: bookings.remainingBalancePence,
      depositPaidAt: bookings.depositPaidAt,
      stripePiId: bookings.stripePiId,
      stripeDepositPiId: bookings.stripeDepositPiId,
      userId: bookings.userId,
      vehicleReg: bookings.vehicleReg,
      vehicleMake: bookings.vehicleMake,
      vehicleModel: bookings.vehicleModel,
    })
    .from(bookings)
    .where(and(eq(bookings.refNumber, ref), eq(bookings.userId, session.user.id)))
    .limit(1);

  if (!booking) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
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

  try {
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
      },
      paymentSummary,
      company: COMPANY,
      invoiceNumber: `INV-${booking.refNumber}`,
      source: `dashboard:${booking.refNumber}`,
    });
    const pdfBytes = await generateBookingCustomerInvoicePdf(invoice);

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="INV-${booking.refNumber}.pdf"`,
        'Content-Length': String(pdfBytes.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof InvoiceDomainError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
