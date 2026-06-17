/**
 * Driver-facing payment status normalizer.
 *
 * Turns the backend `PaymentSummary` (see `src/api/client.ts`, computed by the
 * shared server helper `lib/payments/driver-payment.ts`) into a single,
 * human-readable display object the cockpit can render in one glance.
 *
 * IMPORTANT: this uses ONLY fields that actually exist on the driver payload.
 * The backend payment model currently exposes:
 *   - type:   'cash' | 'full' | 'deposit' | null
 *   - status: 'unpaid' | 'deposit_paid' | 'paid' | 'pending'
 *             | 'needs_checking' | 'failed' | 'unknown'
 *   - amountToCollectPence, totalAmountPence, remainingBalancePence, depositPaidAt
 *   - bookingStatus
 *
 * There is NO "payment link", "checkout session", or Stripe identifier field
 * on the driver payload, so link-specific labels ("Payment link sent" / "Paid
 * by payment link") are intentionally NOT produced — we never fake a state we
 * cannot prove. If those fields are added to the backend payment summary later,
 * extend this mapping.
 */

import type { PaymentSummary } from '@/api/client';

/** Visual tone for the payment badge. */
export type PaymentTone = 'paid' | 'pending' | 'action' | 'warning' | 'failed' | 'unknown';

export interface DriverPaymentDisplay {
  /** i18n key for the short headline, e.g. "payment.paidOnline". */
  labelKey: string;
  /** Drives the badge colour. */
  tone: PaymentTone;
  /** i18n key for the one human sentence explaining what the driver should do. */
  descriptionKey: string;
  /** Money string when there is a balance to collect, otherwise undefined. */
  amountLabel?: string;
}

const DEBUG_REF = 'TYR-2026-16396';

const gbpFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

const SETTLED_BOOKING_STATUSES = new Set([
  'paid',
  'driver_assigned',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
]);

function withDevPaymentLog(
  payment: PaymentSummary | null | undefined,
  display: DriverPaymentDisplay,
  ref?: string | null,
  reason?: string,
): DriverPaymentDisplay {
  if (__DEV__) {
    const debugReason = reason ?? getDebugReason(payment, display, ref);
    if (debugReason != null) {
      console.log('[driver-payment-debug]', {
        ref: ref ?? null,
        paymentStatus: payment?.status ?? null,
        paymentMethod: payment?.type ?? null,
        paymentType: payment?.type ?? null,
        total: payment?.totalAmountPence ?? null,
        totalPaid: payment?.totalPaidPence ?? null,
        paidAmount: payment?.totalPaidPence ?? null,
        remainingBalance: payment?.remainingBalancePence ?? null,
        amountToCollect: payment?.amountToCollectPence ?? null,
        displayTone: display.tone,
        displayLabel: display.labelKey,
        reason: debugReason,
      });
    }
  }
  return display;
}

function getDebugReason(
  payment: PaymentSummary | null | undefined,
  display: DriverPaymentDisplay,
  ref?: string | null,
): string | null {
  const reasons: string[] = [];

  if (ref === DEBUG_REF) reasons.push('target_job_probe');

  if (payment == null) {
    if (display.tone === 'paid') reasons.push('missing_payment_marked_paid');
    return reasons.length > 0 ? reasons.join(',') : null;
  }

  if (payment.status !== 'paid' && display.tone === 'paid') {
    reasons.push('non_paid_status_marked_paid');
  }
  if (payment.status === 'paid' && display.tone !== 'paid') {
    reasons.push('paid_status_rejected');
  }
  if (payment.status === 'paid' && payment.amountToCollectPence > 0) {
    reasons.push('paid_status_with_amount_due');
  }
  if (
    payment.status === 'paid' &&
    payment.remainingBalancePence != null &&
    payment.remainingBalancePence > 0
  ) {
    reasons.push('paid_status_with_remaining_balance');
  }
  if (
    payment.status === 'paid' &&
    payment.bookingStatus != null &&
    !SETTLED_BOOKING_STATUSES.has(payment.bookingStatus)
  ) {
    reasons.push('paid_status_unsettled_booking_lifecycle');
  }
  return reasons.length > 0 ? reasons.join(',') : null;
}

function pendingDescriptionKey(payment: PaymentSummary): string {
  return payment.type === 'full'
    ? 'payment.onlineNotReceived'
    : 'payment.pendingDesc';
}

/** Format a pence integer to a GBP string, or null when not a finite number. */
export function formatGbpFromPence(pence: number | null | undefined): string | null {
  if (pence == null || !Number.isFinite(pence)) return null;
  return gbpFormatter.format(pence / 100);
}

/**
 * Map a (possibly missing) PaymentSummary to a driver display.
 *
 * Rules:
 * - status = paid + no due balance  -> green "paid", nothing to collect.
 * - Deposit paid, balance due       -> amber "action", collect the balance.
 * - Cash / deposit-unpaid           -> amber "action"/"pending", collect total.
 * - Unknown or missing              -> grey "unknown", confirm with admin.
 * Never returns a green/paid tone unless the payment is genuinely settled.
 */
export function getDriverPaymentDisplay(
  payment: PaymentSummary | null | undefined,
  ref?: string | null,
): DriverPaymentDisplay {
  if (!payment) {
    return withDevPaymentLog(payment, {
      labelKey: 'payment.unknownLabel',
      tone: 'unknown',
      descriptionKey: 'payment.checkWithAdmin',
    }, ref);
  }

  const collect = formatGbpFromPence(payment.amountToCollectPence) ?? undefined;

  const needsChecking = (): DriverPaymentDisplay => ({
    labelKey: 'payment.needsChecking',
    tone: 'warning',
    descriptionKey: 'payment.checkBeforeFitting',
    amountLabel: payment.amountToCollectPence > 0 ? collect : undefined,
  });

  if (payment.status === 'needs_checking') {
    return withDevPaymentLog(payment, needsChecking(), ref, 'backend_needs_checking');
  }

  if (payment.status === 'failed') {
    return withDevPaymentLog(payment, {
      labelKey: 'payment.failed',
      tone: 'failed',
      descriptionKey: 'payment.failedDesc',
      amountLabel: payment.amountToCollectPence > 0 ? collect : undefined,
    }, ref);
  }

  // Paid only wins when the backend summary and lifecycle agree that the
  // outstanding balance is settled.
  if (payment.status === 'paid') {
    if (
      payment.amountToCollectPence > 0 ||
      (payment.remainingBalancePence != null && payment.remainingBalancePence > 0) ||
      (payment.bookingStatus != null && !SETTLED_BOOKING_STATUSES.has(payment.bookingStatus))
    ) {
      return withDevPaymentLog(payment, needsChecking(), ref);
    }
    return withDevPaymentLog(payment, {
      labelKey: 'payment.paid',
      tone: 'paid',
      descriptionKey: 'payment.noneToCollect',
    }, ref);
  }

  // Deposit taken online, remaining balance due on arrival.
  if (payment.type === 'deposit' && payment.status === 'deposit_paid') {
    const hasBalance = payment.amountToCollectPence > 0;
    return withDevPaymentLog(payment, {
      labelKey: hasBalance ? 'payment.balanceDue' : 'payment.depositPaid',
      tone: hasBalance ? 'action' : 'pending',
      descriptionKey: hasBalance
        ? 'payment.collectBalance'
        : 'payment.confirmIfUnsure',
      amountLabel: hasBalance ? collect : undefined,
    }, ref);
  }

  // Cash job — full amount collected on arrival.
  if (payment.type === 'cash') {
    return withDevPaymentLog(payment, {
      labelKey: 'payment.payOnArrival',
      tone: 'action',
      descriptionKey: 'payment.collectFromCustomer',
      amountLabel: payment.amountToCollectPence > 0 ? collect : undefined,
    }, ref);
  }

  if (payment.status === 'pending') {
    return withDevPaymentLog(payment, {
      labelKey: 'payment.paymentPending',
      tone: 'pending',
      descriptionKey: pendingDescriptionKey(payment),
      amountLabel: payment.amountToCollectPence > 0 ? collect : undefined,
    }, ref);
  }

  // Deposit selected but not yet paid, or any other unpaid state.
  if (payment.status === 'unpaid') {
    return withDevPaymentLog(payment, {
      labelKey: 'payment.awaitingPayment',
      tone: 'pending',
      descriptionKey: payment.type === 'full'
        ? 'payment.onlineNotReceived'
        : 'payment.confirmIfUnsure',
      amountLabel: payment.amountToCollectPence > 0 ? collect : undefined,
    }, ref);
  }

  // Anything we cannot positively classify stays neutral — never green.
  return withDevPaymentLog(payment, {
    labelKey: 'payment.unknownLabel',
    tone: 'unknown',
    descriptionKey: 'payment.checkWithAdmin',
    amountLabel: payment.amountToCollectPence > 0 ? collect : undefined,
  }, ref);
}

/** Badge background + text + border colours per tone (matches app theme). */
export function paymentToneColors(tone: PaymentTone): {
  bg: string;
  text: string;
  border: string;
} {
  switch (tone) {
    case 'paid':
      return { bg: 'rgba(34,197,94,0.16)', text: '#86EFAC', border: 'rgba(34,197,94,0.5)' };
    case 'action':
      return { bg: 'rgba(249,115,22,0.16)', text: '#FDBA74', border: 'rgba(249,115,22,0.5)' };
    case 'pending':
      return { bg: 'rgba(234,179,8,0.16)', text: '#FDE68A', border: 'rgba(234,179,8,0.5)' };
    case 'warning':
      return { bg: 'rgba(251,146,60,0.18)', text: '#FDBA74', border: 'rgba(251,146,60,0.6)' };
    case 'failed':
      return { bg: 'rgba(239,68,68,0.16)', text: '#FCA5A5', border: 'rgba(239,68,68,0.55)' };
    case 'unknown':
    default:
      return { bg: 'rgba(161,161,170,0.16)', text: '#D4D4D8', border: 'rgba(161,161,170,0.45)' };
  }
}
