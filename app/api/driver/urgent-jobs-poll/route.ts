import { NextResponse } from 'next/server';
import { eq, and, desc, gt } from 'drizzle-orm';
import { db, bookings } from '@/lib/db';
import { requireDriverMobile } from '@/lib/auth';
import { getBookingPaymentSummary } from '@/lib/payments/payment-summary';

// Native polling fallback for the driver app's foreground watcher service.
// Returns the newest `driver_assigned` booking for the authenticated driver
// so the native service can raise a full-screen alert if the FCM data
// message was delayed or dropped.
//
// No new DB columns. No new env vars. Reads only existing bookings/drivers.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PollJob {
  bookingRef: string;
  jobId: string;
  address: string;
  title: string;
  body: string;
  paymentStatus: string;
  paymentType: string;
  jobPricePence: string;
  amountToCollectPence: string;
  depositAmountPence: string;
  confirmWithAdmin: string;
  assignedAt: string | null;
}

export async function GET(request: Request) {
  try {
    const { driverId } = await requireDriverMobile(request);

    // Optional ?since=<unixMs>: caller (native watcher) passes its armed
    // timestamp so we only return jobs assigned after the watcher armed.
    // Mirrors the assisted-chat-app urgent-poll contract.
    const url = new URL(request.url);
    const sinceParam = url.searchParams.get('since');
    const sinceMs = sinceParam ? Number(sinceParam) : NaN;
    const sinceDate =
      Number.isFinite(sinceMs) && sinceMs > 0 ? new Date(sinceMs) : null;

    const whereClauses = [
      eq(bookings.driverId, driverId),
      eq(bookings.status, 'driver_assigned'),
    ];
    if (sinceDate) {
      whereClauses.push(gt(bookings.assignedAt, sinceDate));
    }

    const [row] = await db
      .select({
        id: bookings.id,
        refNumber: bookings.refNumber,
        status: bookings.status,
        addressLine: bookings.addressLine,
        assignedAt: bookings.assignedAt,
        paymentType: bookings.paymentType,
        totalAmount: bookings.totalAmount,
        subtotal: bookings.subtotal,
        vatAmount: bookings.vatAmount,
        depositAmountPence: bookings.depositAmountPence,
        remainingBalancePence: bookings.remainingBalancePence,
        depositPaidAt: bookings.depositPaidAt,
        stripePiId: bookings.stripePiId,
        stripeDepositPiId: bookings.stripeDepositPiId,
      })
      .from(bookings)
      .where(and(...whereClauses))
      .orderBy(desc(bookings.assignedAt), desc(bookings.createdAt))
      .limit(1);

    if (!row) {
      return NextResponse.json({ job: null }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const payment = await getBookingPaymentSummary({
      id: row.id,
      refNumber: row.refNumber,
      status: row.status,
      paymentType: row.paymentType,
      totalAmount: row.totalAmount?.toString() ?? null,
      subtotal: row.subtotal?.toString() ?? null,
      vatAmount: row.vatAmount?.toString() ?? null,
      depositAmountPence: row.depositAmountPence,
      remainingBalancePence: row.remainingBalancePence,
      depositPaidAt: row.depositPaidAt,
      stripePiId: row.stripePiId,
      stripeDepositPiId: row.stripeDepositPiId,
    });

    const job: PollJob = {
      bookingRef: row.refNumber,
      jobId: row.id,
      address: row.addressLine,
      title: 'New Job Assigned',
      body: `Job ${row.refNumber} at ${row.addressLine}. Tap to accept.`,
      paymentStatus: String(payment.state ?? 'unknown'),
      paymentType: String(payment.method ?? 'unknown'),
      jobPricePence: String(payment.totalPence ?? 0),
      amountToCollectPence: String(payment.amountToCollectPence ?? 0),
      depositAmountPence: String(payment.depositAmountPence ?? 0),
      confirmWithAdmin: payment.state === 'unknown' || payment.state === 'needs_checking' ? '1' : '0',
      assignedAt: row.assignedAt ? row.assignedAt.toISOString() : null,
    };

    return NextResponse.json({ job }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('[urgent-jobs-poll] failed', error);
    return NextResponse.json({ error: 'Failed to poll urgent jobs' }, { status: 500 });
  }
}
