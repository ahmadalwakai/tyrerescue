import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { db, bookings } from '@/lib/db';
import { InvoiceDomainError } from '@/lib/invoices/invoice-domain';
import { InvoicePresentationError, readInvoicePresentation } from '@/lib/invoices/invoice-presentation';
import { ensureBookingInvoice, updateBookingInvoicePresentation } from '@/lib/invoices/booking-invoice-sync';

interface Props { params: Promise<{ ref: string }> }

function presentationResponse(booking: typeof bookings.$inferSelect) {
  const totalPence = Math.round(Number(booking.totalAmount) * 100);
  if (!Number.isSafeInteger(totalPence) || totalPence < 0) throw new InvoiceDomainError('Booking has an invalid final amount.', 409);
  return {
    ...readInvoicePresentation(booking.priceSnapshot, totalPence), totalPence,
    bookingUpdatedAt: booking.updatedAt?.toISOString() ?? null,
  };
}

function failure(error: unknown) {
  if (error instanceof InvoiceDomainError || error instanceof InvoicePresentationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error('Booking invoice operation failed:', error);
  return NextResponse.json({ error: 'Could not update booking invoice.' }, { status: 500 });
}

export async function GET(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();
  try {
    const { ref } = await params;
    const [booking] = await db.select().from(bookings).where(eq(bookings.refNumber, ref.trim().toUpperCase())).limit(1);
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    return NextResponse.json(presentationResponse(booking), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid invoice presentation.' }, { status: 400 });
    const record = body as Record<string, unknown>;
    if (Object.keys(record).some((key) => key !== 'invoicePresentation' && key !== 'expectedUpdatedAt') ||
      !Object.hasOwn(record, 'invoicePresentation') || !Object.hasOwn(record, 'expectedUpdatedAt') ||
      (record.expectedUpdatedAt !== null && (typeof record.expectedUpdatedAt !== 'string' || !Number.isFinite(new Date(record.expectedUpdatedAt).getTime())))) {
      return NextResponse.json({ error: 'Invoice presentation and the current booking version are required.' }, { status: 400 });
    }
    const { ref } = await params;
    const result = await updateBookingInvoicePresentation(ref, record.invoicePresentation, {
      actorUserId: user.id, expectedUpdatedAt: record.expectedUpdatedAt as string | null,
    });
    return NextResponse.json(presentationResponse(result.booking), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();
  try {
    const { ref } = await params;
    const result = await ensureBookingInvoice(ref, { actorUserId: user.id, reason: 'generate_booking_invoice' });
    return NextResponse.json({
      invoice: { id: result.invoice.id, invoiceNumber: result.invoice.invoiceNumber,
        status: result.invoice.status, totalAmount: result.invoice.totalAmount.toString() },
      reused: result.reused,
    }, { status: result.reused ? 200 : 201 });
  } catch (error) { return failure(error); }
}
