import { asc, eq } from 'drizzle-orm';

import { db, bookings, bookingTyres, invoiceItems, tyreProducts, type Invoice } from '@/lib/db';
import type { InvoicePdfData } from '@/lib/invoice-pdf';
import { getBookingPaymentSummary } from '@/lib/payments/payment-summary';
import {
  buildBookingCustomerInvoiceFromStoredInvoice,
  type BookingCustomerInvoice,
} from '@/lib/invoices/invoice-domain';
import { displayStringsForBookingTyres } from '@/lib/bookings/tyre-line-display';

async function loadBookingTyreLines(booking: typeof bookings.$inferSelect | undefined): Promise<string[]> {
  if (!booking) return [];

  const tyreRows = await db
    .select({
      quantity: bookingTyres.quantity,
      unitPrice: bookingTyres.unitPrice,
      service: bookingTyres.service,
      brand: tyreProducts.brand,
      pattern: tyreProducts.pattern,
      sizeDisplay: tyreProducts.sizeDisplay,
      width: tyreProducts.width,
      aspect: tyreProducts.aspect,
      rim: tyreProducts.rim,
    })
    .from(bookingTyres)
    .leftJoin(tyreProducts, eq(bookingTyres.tyreId, tyreProducts.id))
    .where(eq(bookingTyres.bookingId, booking.id));

  return displayStringsForBookingTyres({
    priceSnapshot: booking.priceSnapshot,
    tyreRows,
    tyreSizeDisplay: booking.tyreSizeDisplay,
    quantity: booking.quantity,
  });
}

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
  const tyreLines = await loadBookingTyreLines(booking);

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
    tyreLines,
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
  const tyreLines = await loadBookingTyreLines(booking);

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
      quantity: booking.quantity,
      priceSnapshot: booking.priceSnapshot,
      tyreLines,
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
