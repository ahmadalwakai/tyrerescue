import { NextResponse } from 'next/server';
import { and, count, desc, eq, ilike, isNull } from 'drizzle-orm';

import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { db, auditLogs, bookings, invoices } from '@/lib/db';
import { GARAGE_ADDRESS } from '@/lib/garage';
import { getBookingPaymentSummary } from '@/lib/payments/payment-summary';
import { assertBookingInvoiceTotalMatches, InvoiceDomainError } from '@/lib/invoices/invoice-domain';

interface Props {
  params: Promise<{ ref: string }>;
}

const COMPANY = {
  name: 'Tyre Rescue',
  address: GARAGE_ADDRESS,
  phone: '0141 266 0690',
  email: 'support@tyrerescue.uk',
};

async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const [result] = await db
    .select({ cnt: count() })
    .from(invoices)
    .where(ilike(invoices.invoiceNumber, `${prefix}%`));
  const next = (result?.cnt ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export async function POST(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { ref } = await params;
  const refNumber = ref.trim().toUpperCase();
  const [booking] = await db.select().from(bookings).where(eq(bookings.refNumber, refNumber)).limit(1);
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

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

  const [existing] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.bookingId, booking.id), isNull(invoices.deletedAt)))
    .orderBy(desc(invoices.createdAt))
    .limit(1);

  const finalTotal = Number(booking.totalAmount);
  if (existing) {
    const existingTotal = Number(existing.totalAmount);
    try {
      assertBookingInvoiceTotalMatches({
        booking: {
          refNumber: booking.refNumber,
          totalAmount: booking.totalAmount.toString(),
        },
        invoiceTotalAmount: existing.totalAmount.toString(),
      });
    } catch (error) {
      if (error instanceof InvoiceDomainError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }

    return NextResponse.json({
      invoice: {
        id: existing.id,
        invoiceNumber: existing.invoiceNumber,
        status: existing.status,
        totalAmount: existingTotal.toFixed(2),
      },
      reused: true,
    });
  }

  const now = new Date();
  const invoiceNumber = await generateInvoiceNumber();
  const totalAmount = Number.isFinite(finalTotal) ? finalTotal : 0;
  const [created] = await db
    .insert(invoices)
    .values({
      invoiceNumber,
      bookingId: booking.id,
      userId: booking.userId,
      status: paymentSummary.state === 'paid' ? 'paid' : 'issued',
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone,
      customerAddress: booking.addressLine,
      companyName: COMPANY.name,
      companyAddress: COMPANY.address,
      companyPhone: COMPANY.phone,
      companyEmail: COMPANY.email,
      companyVatNumber: null,
      issueDate: now,
      dueDate: now,
      subtotal: totalAmount.toFixed(2),
      vatRate: '0.00',
      vatAmount: '0.00',
      totalAmount: totalAmount.toFixed(2),
      notes: null,
      internalNotes: `Generated from booking ${booking.refNumber} final payable amount.`,
      createdBy: user.id,
      updatedBy: user.id,
    })
    .returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, status: invoices.status, totalAmount: invoices.totalAmount });

  await db.insert(auditLogs).values({
    actorUserId: user.id,
    actorRole: 'admin',
    entityType: 'invoice',
    entityId: created.id,
    action: 'create_booking_invoice_mobile',
    afterJson: {
      bookingRef: booking.refNumber,
      invoiceNumber: created.invoiceNumber,
      totalAmount: totalAmount.toFixed(2),
    },
  });

  return NextResponse.json({
    invoice: {
      id: created.id,
      invoiceNumber: created.invoiceNumber,
      status: created.status,
      totalAmount: created.totalAmount?.toString() ?? totalAmount.toFixed(2),
    },
    reused: false,
  }, { status: 201 });
}
