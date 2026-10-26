import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { synchronizeBookingInvoices } from '@/lib/invoices/booking-invoice-sync';
import { notifyCustomerBookingStatus } from '@/lib/notifications/customer-push';
import { recordManualPaymentForBooking } from '@/lib/payments/manual-payment';

interface Props { params: Promise<{ ref: string }> }

const bodySchema = z.object({
  kind: z.enum(['full', 'deposit']),
  note: z.string().trim().max(500).optional(),
});

/**
 * POST /api/mobile/admin/bookings/[ref]/manual-payment — staff confirm that the
 * deposit or the full balance was paid outside Tyre Rescue's Stripe links.
 * Repeating the call never records a second payment.
 */
export async function POST(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();
  const { ref } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose deposit or full payment.' }, { status: 400 });

  try {
    const result = await recordManualPaymentForBooking({
      refNumber: ref.trim().toUpperCase(), kind: parsed.data.kind, actorUserId: user.id, note: parsed.data.note ?? null,
    });
    if (result.status === 'not_found') return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    if (result.status === 'not_payable') return NextResponse.json({ error: result.reason }, { status: 409 });
    if (result.status === 'recorded') {
      try {
        await synchronizeBookingInvoices(result.bookingId, { actorUserId: user.id, reason: 'manual_payment_confirmed' });
      } catch (syncError) {
        // The receipt is committed; a later invoice read retries synchronisation.
        console.error('Invoice sync after manual payment failed:', syncError);
      }
      if (result.bookingStatus !== result.previousStatus) {
        await notifyCustomerBookingStatus({ bookingId: result.bookingId, status: result.bookingStatus }).catch(() => undefined);
      }
    }
    return NextResponse.json(result.status === 'recorded'
      ? { status: result.status, kind: result.kind, amountPence: result.amountPence, bookingStatus: result.bookingStatus }
      : result);
  } catch (error) {
    console.error('Manual payment confirmation failed:', error);
    return NextResponse.json({ error: 'Could not record the payment.' }, { status: 500 });
  }
}
