/**
 * Shared driver-facing payment summary helper.
 *
 * Consumed by /api/driver/jobs (list) and /api/driver/jobs/[ref] (detail) so
 * both surfaces compute "amount the driver should collect" identically.
 */

export type PaymentType = 'cash' | 'full' | 'deposit' | null;
export type PaymentStatus =
  | 'unpaid'
  | 'deposit_paid'
  | 'paid'
  | 'pending'
  | 'needs_checking'
  | 'failed'
  | 'unknown';

export interface PaymentSummary {
  type: PaymentType;
  status: PaymentStatus;
  paymentStatus: string | null;
  subtotalPence: number | null;
  vatAmountPence: number | null;
  totalAmountPence: number | null;
  totalPaidPence: number;
  depositAmountPence: number | null;
  remainingBalancePence: number | null;
  amountToCollectPence: number;
  depositPaidAt: string | null;
  bookingStatus: string | null;
}

export interface PaymentSummaryInput {
  paymentType: string | null;
  totalAmount: string | null;
  subtotal: string | null;
  vatAmount: string | null;
  depositAmountPence: number | null;
  remainingBalancePence: number | null;
  depositPaidAt: Date | null;
  stripePiId: string | null;
  /**
   * Canonical persisted payment status from the payments table, when known.
   * Stripe uses `succeeded`; some legacy/manual flows may use `paid`.
   */
  paymentStatus?: string | null;
  /**
   * Sum of succeeded/paid payment rows for the booking. This is stronger than
   * payment method and stronger than lifecycle status for driver-facing truth.
   */
  totalPaidPence?: number | null;
  /**
   * Latest/known paid amount. Kept for compatibility with callers that only
   * have one payment row; totalPaidPence wins when both are supplied.
   */
  paidAmountPence?: number | null;
  /**
   * Current booking lifecycle status. Used to reconcile a missing `paymentType`
   * against explicit payment evidence. Lifecycle status helps choose between
   * pending, failed, and "needs checking", but it is never proof of payment on
   * its own. Optional so existing callers keep compiling.
   */
  bookingStatus?: string | null;
}

/**
 * Booking lifecycle statuses that are only reachable after payment has been
 * accepted by the backend. Driver UI can only show Paid from these statuses
 * when the payment method/amount data also reconciles.
 *
 * Stripe identifiers are accepted as internal input only; they are never
 * returned in the driver-facing summary.
 */
const ACTIVE_OR_SETTLED_LIFECYCLE_STATUSES: ReadonlySet<string> = new Set([
  'paid',
  'driver_assigned',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
]);

const PAYMENT_PENDING_STATUSES: ReadonlySet<string> = new Set([
  'draft',
  'pending',
  'pending_payment',
  'pricing_ready',
  'awaiting_payment',
]);

const PAYMENT_FAILED_STATUSES: ReadonlySet<string> = new Set([
  'failed',
  'payment_failed',
]);

const SUCCEEDED_PAYMENT_STATUSES: ReadonlySet<string> = new Set([
  'succeeded',
  'paid',
]);

const PENDING_PAYMENT_ROW_STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'processing',
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
]);

function poundsStringToPence(value: string | null): number | null {
  if (value == null) return null;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function hasSettledLifecycle(status: string | null | undefined): boolean {
  return status != null && ACTIVE_OR_SETTLED_LIFECYCLE_STATUSES.has(status);
}

function hasPendingLifecycle(status: string | null | undefined): boolean {
  return status == null || PAYMENT_PENDING_STATUSES.has(status);
}

function hasFailedLifecycle(status: string | null | undefined): boolean {
  return status != null && PAYMENT_FAILED_STATUSES.has(status);
}

function normaliseAmount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function optionalPence(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function isSucceededPaymentStatus(status: string | null | undefined): boolean {
  return status != null && SUCCEEDED_PAYMENT_STATUSES.has(status);
}

function isPendingPaymentStatus(status: string | null | undefined): boolean {
  return status != null && PENDING_PAYMENT_ROW_STATUSES.has(status);
}

function amountCoversTotal(totalPence: number | null, paidPence: number): boolean {
  // When the booking has no recorded total we cannot confirm the amount is
  // covered — returning true here would mark every booking with any payment
  // evidence as "paid" regardless of the actual outstanding balance.
  if (totalPence == null) return false;
  // Stripe/decimal conversions can differ by a penny, so allow a 1p tolerance.
  return paidPence >= Math.max(0, totalPence - 1);
}

export function computeDriverPaymentSummary(input: PaymentSummaryInput): PaymentSummary {
  const totalPence = poundsStringToPence(input.totalAmount);
  const subtotalPence = poundsStringToPence(input.subtotal);
  const vatPence = poundsStringToPence(input.vatAmount);
  const bookingStatus = input.bookingStatus ?? null;
  const paymentStatus = input.paymentStatus ?? null;
  const totalPaidPence =
    optionalPence(input.totalPaidPence) ??
    optionalPence(input.paidAmountPence) ??
    0;
  const rawType = input.paymentType;
  // `payment_type` is written by two backend paths that mean the SAME thing:
  //   - Stripe webhook persists 'full' (app/api/stripe/webhook on payment_intent.succeeded)
  //   - Admin quick-book finalize persists the raw checkout choice 'stripe'
  //     (app/api/admin/quick-book/[id]/finalize writes paymentType: paymentMethod)
  // Both denote "customer selected full online payment". They do not prove the
  // payment has settled; bookingStatus below decides whether the driver can
  // see Paid or must see a pending/checking state.
  const normalisedType = rawType === 'stripe' ? 'full' : rawType;
  let type: PaymentType =
    normalisedType === 'cash' || normalisedType === 'full' || normalisedType === 'deposit'
      ? normalisedType
      : null;

  // Source-of-truth reconciliation: when `paymentType` was never persisted but
  // persisted payment rows prove the full amount has succeeded, treat it as a
  // full online payment. A lifecycle status or Stripe id alone is not proof.
  // Cash bookings never carry a `stripePiId`; deposit bookings carry an explicit
  // `paymentType='deposit'`, so neither is misclassified here.
  if (
    type === null &&
    input.stripePiId != null &&
    amountCoversTotal(totalPence, totalPaidPence)
  ) {
    type = 'full';
  }

  let status: PaymentStatus = 'unknown';
  let amountToCollect = 0;
  const totalOutstanding = totalPence ?? 0;
  const hasFullPaidEvidence =
    amountCoversTotal(totalPence, totalPaidPence) &&
    (isSucceededPaymentStatus(paymentStatus) || totalPaidPence > 0);
  const hasAnyPaidEvidence =
    totalPaidPence > 0 || isSucceededPaymentStatus(paymentStatus);

  if (type === 'full') {
    if (hasFullPaidEvidence) {
      status = 'paid';
      amountToCollect = 0;
    } else if (hasFailedLifecycle(bookingStatus) || paymentStatus === 'failed') {
      status = 'failed';
      amountToCollect = totalOutstanding;
    } else if (hasPendingLifecycle(bookingStatus) || isPendingPaymentStatus(paymentStatus)) {
      status = 'pending';
      amountToCollect = totalOutstanding;
    } else {
      status = 'needs_checking';
      amountToCollect = totalOutstanding;
    }
  } else if (type === 'deposit') {
    const explicitRemainingSettled =
      input.remainingBalancePence != null &&
      normaliseAmount(input.remainingBalancePence) === 0 &&
      hasAnyPaidEvidence;
    if (hasFullPaidEvidence || explicitRemainingSettled) {
      status = 'paid';
      amountToCollect = 0;
    } else if (hasFailedLifecycle(bookingStatus) || paymentStatus === 'failed') {
      status = 'failed';
      amountToCollect = totalOutstanding;
    } else if (input.depositPaidAt || hasAnyPaidEvidence) {
      const remaining =
        typeof input.remainingBalancePence === 'number' &&
        Number.isFinite(input.remainingBalancePence)
          ? input.remainingBalancePence
          : totalPence != null && totalPaidPence > 0
            ? totalPence - totalPaidPence
          : totalPence != null && typeof input.depositAmountPence === 'number'
            ? totalPence - input.depositAmountPence
            : totalPence ?? 0;

      if (normaliseAmount(remaining) === 0 && hasAnyPaidEvidence) {
        status = 'paid';
        amountToCollect = 0;
      } else {
        status = 'deposit_paid';
        amountToCollect = remaining;
      }
    } else if (hasPendingLifecycle(bookingStatus)) {
      status = 'unpaid';
      amountToCollect = totalOutstanding;
    } else {
      status = 'needs_checking';
      amountToCollect = totalOutstanding;
    }
  } else if (type === 'cash') {
    if (hasFullPaidEvidence) {
      status = 'paid';
      amountToCollect = 0;
    } else if (hasFailedLifecycle(bookingStatus) || paymentStatus === 'failed') {
      status = 'failed';
      amountToCollect = totalOutstanding;
    } else {
      status = 'unpaid';
      amountToCollect = totalOutstanding;
    }
  } else {
    if (hasFullPaidEvidence) {
      type = 'full';
      status = 'paid';
      amountToCollect = 0;
    } else if (input.stripePiId != null && (hasPendingLifecycle(bookingStatus) || isPendingPaymentStatus(paymentStatus))) {
      status = 'pending';
      amountToCollect = totalOutstanding;
    } else if (hasFailedLifecycle(bookingStatus) || paymentStatus === 'failed') {
      status = 'failed';
      amountToCollect = totalOutstanding;
    } else if (hasSettledLifecycle(bookingStatus)) {
      status = 'needs_checking';
      amountToCollect = totalOutstanding;
    } else {
      status = 'unknown';
      amountToCollect = totalOutstanding;
    }
  }

  if (!Number.isFinite(amountToCollect) || amountToCollect < 0) {
    amountToCollect = 0;
  }

  return {
    type,
    status,
    paymentStatus,
    subtotalPence,
    vatAmountPence: vatPence,
    totalAmountPence: totalPence,
    totalPaidPence,
    depositAmountPence: input.depositAmountPence ?? null,
    remainingBalancePence: input.remainingBalancePence ?? null,
    amountToCollectPence: amountToCollect,
    depositPaidAt: input.depositPaidAt ? input.depositPaidAt.toISOString() : null,
    bookingStatus,
  };
}
