import { asc, eq } from 'drizzle-orm';

import { db, bookings, invoiceItems, type Invoice } from '@/lib/db';
import type { InvoicePdfData } from '@/lib/invoice-pdf';
import { getBookingPaymentSummary } from '@/lib/payments/payment-summary';
import {
  buildBookingCustomerInvoiceFromStoredInvoice,
  type BookingCustomerInvoice,
} from '@/lib/invoices/invoice-domain';

export async function buildStandaloneAdminInvoicePdfData(invoice: Invoice): Promise<InvoicePdfData> {
  const [booking] = invoice.bookingId
    ? await db.select().from(bookings).where(eq(bookings.id, invoice.bookingId)).limit(1)
    : [];
  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoice.id))
    .orderBy(asc(invoiceItems.sortOrder));

  const paymentSummary = booking
    ? await getBookingPaymentSummary({
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
      })
    : null;

  return {
    invoiceNumber: invoice.invoiceNumber,
    issueDate: (invoice.issueDate ?? new Date()).toISOString(),
    dueDate: (invoice.dueDate ?? invoice.issueDate ?? new Date()).toISOString(),
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
    items: items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
    })),
    subtotal: Number(invoice.subtotal),
    vatRate: Number(invoice.vatRate),
    vatAmount: Number(invoice.vatAmount),
    totalAmount: Number(invoice.totalAmount),
    bookingReference: booking?.refNumber ?? null,
    vehicleRegistration: booking?.vehicleReg ?? null,
    vehicleMake: booking?.vehicleMake ?? null,
    vehicleModel: booking?.vehicleModel ?? null,
    tyreSizeDisplay: booking?.tyreSizeDisplay ?? null,
    paymentStatus: paymentSummary?.label ?? invoice.status,
    paymentMethod: paymentSummary?.methodLabel ?? null,
  };
}

export async function buildBookingCustomerInvoicePdfData(
  invoice: Invoice,
  options: { requireFullPayment?: boolean } = {},
): Promise<BookingCustomerInvoice | null> {
  if (!invoice.bookingId) return null;

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, invoice.bookingId)).limit(1);
  if (!booking) return null;

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

  return buildBookingCustomerInvoiceFromStoredInvoice({
    invoice,
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
    source: `invoice:${invoice.id}`,
    requireFullPayment: options.requireFullPayment,
  });
}

/** @deprecated Use buildStandaloneAdminInvoicePdfData or buildBookingCustomerInvoicePdfData explicitly. */
export const buildInvoicePdfData = buildStandaloneAdminInvoicePdfData;
