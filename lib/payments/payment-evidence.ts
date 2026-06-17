import { inArray, eq } from 'drizzle-orm';
import { db, payments } from '@/lib/db';

export interface BookingPaymentEvidence {
  paymentStatus: string | null;
  totalPaidPence: number;
}

const SUCCEEDED_STATUSES = new Set(['succeeded', 'paid']);
const PENDING_STATUSES = new Set([
  'pending',
  'processing',
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
]);

function amountToPence(value: string | number | null): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function emptyEvidence(): BookingPaymentEvidence {
  return { paymentStatus: null, totalPaidPence: 0 };
}

function summariseRows(
  rows: Array<{ status: string; amount: string | number | null }>,
): BookingPaymentEvidence {
  let totalPaidPence = 0;
  let hasSucceeded = false;
  let hasPending = false;
  let hasFailed = false;

  for (const row of rows) {
    if (SUCCEEDED_STATUSES.has(row.status)) {
      hasSucceeded = true;
      totalPaidPence += amountToPence(row.amount);
    } else if (PENDING_STATUSES.has(row.status)) {
      hasPending = true;
    } else if (row.status === 'failed') {
      hasFailed = true;
    }
  }

  return {
    paymentStatus: hasSucceeded
      ? 'succeeded'
      : hasFailed
        ? 'failed'
        : hasPending
          ? 'pending'
          : null,
    totalPaidPence,
  };
}

export async function getBookingPaymentEvidence(
  bookingId: string,
): Promise<BookingPaymentEvidence> {
  const rows = await db
    .select({
      status: payments.status,
      amount: payments.amount,
    })
    .from(payments)
    .where(eq(payments.bookingId, bookingId));

  return summariseRows(rows);
}

export async function getBookingPaymentEvidenceMap(
  bookingIds: string[],
): Promise<Map<string, BookingPaymentEvidence>> {
  const uniqueIds = Array.from(new Set(bookingIds.filter(Boolean)));
  const map = new Map<string, BookingPaymentEvidence>();
  for (const id of uniqueIds) map.set(id, emptyEvidence());
  if (uniqueIds.length === 0) return map;

  const rows = await db
    .select({
      bookingId: payments.bookingId,
      status: payments.status,
      amount: payments.amount,
    })
    .from(payments)
    .where(inArray(payments.bookingId, uniqueIds));

  const grouped = new Map<string, Array<{ status: string; amount: string | number | null }>>();
  for (const row of rows) {
    if (row.bookingId == null) continue;
    const list = grouped.get(row.bookingId) ?? [];
    list.push({ status: row.status, amount: row.amount });
    grouped.set(row.bookingId, list);
  }

  for (const [bookingId, list] of grouped) {
    map.set(bookingId, summariseRows(list));
  }

  return map;
}
