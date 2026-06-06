/**
 * Shared driver-facing payment summary helper.
 *
 * Consumed by /api/driver/jobs (list) and /api/driver/jobs/[ref] (detail) so
 * both surfaces compute "amount the driver should collect" identically.
 */

export type PaymentType = 'cash' | 'full' | 'deposit' | null;
export type PaymentStatus = 'unpaid' | 'deposit_paid' | 'paid' | 'unknown';

export interface PaymentSummary {
  type: PaymentType;
  status: PaymentStatus;
  subtotalPence: number | null;
  vatAmountPence: number | null;
  totalAmountPence: number | null;
  depositAmountPence: number | null;
  remainingBalancePence: number | null;
  amountToCollectPence: number;
  depositPaidAt: string | null;
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
   * Current booking lifecycle status. Used to reconcile a missing `paymentType`
   * against the same payment truth admin relies on (admin shows "Paid" when the
   * booking has reached a post-payment lifecycle status). A booking can be fully
   * paid online yet have `paymentType` still null — e.g. it was confirmed via
   * client-side verification before the Stripe webhook persisted
   * `paymentType='full'`. Optional so existing callers keep compiling.
   */
  bookingStatus?: string | null;
}

/**
 * Booking lifecycle statuses that are only reachable AFTER a successful full
 * online payment. Mirrors the admin "Paid" badge logic so the driver sees the
 * same payment truth. `deposit_paid` is intentionally excluded because those
 * bookings always carry an explicit `paymentType='deposit'`.
 *
 * Stripe identifiers are accepted as internal input only; they are never
 * returned in the driver-facing summary.
 */
const PAID_LIFECYCLE_STATUSES: ReadonlySet<string> = new Set([
  'paid',
  'driver_assigned',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
]);

function poundsStringToPence(value: string | null): number | null {
  if (value == null) return null;
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function computeDriverPaymentSummary(input: PaymentSummaryInput): PaymentSummary {
  const totalPence = poundsStringToPence(input.totalAmount);
  const subtotalPence = poundsStringToPence(input.subtotal);
  const vatPence = poundsStringToPence(input.vatAmount);
  const rawType = input.paymentType;
  // `payment_type` is written by two backend paths that mean the SAME thing:
  //   - Stripe webhook persists 'full' (app/api/stripe/webhook on payment_intent.succeeded)
  //   - Admin quick-book finalize persists the raw checkout choice 'stripe'
  //     (app/api/admin/quick-book/[id]/finalize writes paymentType: paymentMethod)
  // Both denote "customer pays the full amount online; driver collects nothing".
  // Normalise 'stripe' -> 'full' so the driver payment truth matches the admin
  // booking, which never collects cash for an online payment.
  const normalisedType = rawType === 'stripe' ? 'full' : rawType;
  let type: PaymentType =
    normalisedType === 'cash' || normalisedType === 'full' || normalisedType === 'deposit'
      ? normalisedType
      : null;

  // Source-of-truth reconciliation: when `paymentType` was never persisted but
  // the booking has a Stripe PaymentIntent AND has advanced into a post-payment
  // lifecycle status, it has been fully paid online. This is exactly the signal
  // admin uses to render the green "Paid" badge, so the driver must agree.
  // Cash bookings never carry a `stripePiId`; deposit bookings carry an explicit
  // `paymentType='deposit'`, so neither is misclassified here.
  if (
    type === null &&
    input.stripePiId != null &&
    input.bookingStatus != null &&
    PAID_LIFECYCLE_STATUSES.has(input.bookingStatus)
  ) {
    type = 'full';
  }

  let status: PaymentStatus = 'unknown';
  let amountToCollect = 0;

  if (type === 'full') {
    status = 'paid';
    amountToCollect = 0;
  } else if (type === 'deposit') {
    if (input.depositPaidAt) {
      status = 'deposit_paid';
      if (
        typeof input.remainingBalancePence === 'number' &&
        Number.isFinite(input.remainingBalancePence)
      ) {
        amountToCollect = input.remainingBalancePence;
      } else if (totalPence != null && typeof input.depositAmountPence === 'number') {
        amountToCollect = totalPence - input.depositAmountPence;
      } else if (totalPence != null) {
        amountToCollect = totalPence;
      }
    } else {
      status = 'unpaid';
      amountToCollect = totalPence ?? 0;
    }
  } else if (type === 'cash') {
    status = 'unpaid';
    amountToCollect = totalPence ?? 0;
  } else {
    status = 'unknown';
    amountToCollect = totalPence ?? 0;
  }

  if (!Number.isFinite(amountToCollect) || amountToCollect < 0) {
    amountToCollect = 0;
  }

  return {
    type,
    status,
    subtotalPence,
    vatAmountPence: vatPence,
    totalAmountPence: totalPence,
    depositAmountPence: input.depositAmountPence ?? null,
    remainingBalancePence: input.remainingBalancePence ?? null,
    amountToCollectPence: amountToCollect,
    depositPaidAt: input.depositPaidAt ? input.depositPaidAt.toISOString() : null,
  };
}
