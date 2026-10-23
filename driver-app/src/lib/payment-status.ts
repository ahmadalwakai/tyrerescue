/**
 * Driver-facing payment status normalizer.
 *
 * Turns the backend `PaymentSummary` (see `src/api/client.ts`, computed by the
 * shared server helper `lib/payments/payment-summary.ts`) into a single,
 * human-readable display object the cockpit can render in one glance.
 *
 * IMPORTANT: this uses ONLY fields that actually exist on the driver payload.
 * The backend payment model exposes canonical state + method + linkStatus from
 * the payment ledger. This file only maps those facts to driver-facing copy.
 */

/** Minimal API facts needed by this pure formatter (no auth/network imports). */
export interface DriverPaymentSummaryInput {
  state: string;
  method: string;
  totalPence: number | null;
  paidPence: number | null;
  remainingBalancePence: number | null;
  amountToCollectPence: number | null;
  settlementVerified?: boolean;
  cashToCollectPence?: number | null;
}

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

const gbpFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

/** Format a pence integer to a GBP string, or null when not a finite number. */
export function formatGbpFromPence(pence: number | null | undefined): string | null {
  if (pence == null || !Number.isSafeInteger(pence) || pence < 0) return null;
  return gbpFormatter.format(pence / 100);
}

/** Cash-only balance, checked against the authoritative server receipt total. */
export function getDriverCashToCollectPence(payment: DriverPaymentSummaryInput | null | undefined): number | null {
  if (!payment || payment.method !== 'cash' || payment.state !== 'cash_to_collect') return null;
  const due = payment.cashToCollectPence;
  const total = payment.totalPence;
  const paid = payment.paidPence;
  if (due == null || total == null || paid == null || !Number.isSafeInteger(due) ||
    !Number.isSafeInteger(total) || !Number.isSafeInteger(paid) || due <= 0 || total <= 0 || paid < 0) return null;
  return due === Math.max(0, total - paid) && payment.amountToCollectPence === due &&
    payment.remainingBalancePence === due ? due : null;
}

/**
 * Map a (possibly missing) PaymentSummary to a driver display.
 *
 * Rules:
 * Paid requires an explicit server settlement decision AND consistent amounts.
 * Every other booking says Not paid. Only cash bookings show money, and that
 * amount is the confirmed remaining cash, never the original/deposit price.
 */
export function getDriverPaymentDisplay(
  payment: DriverPaymentSummaryInput | null | undefined,
  ref?: string | null,
): DriverPaymentDisplay {
  void ref;

  const safePence = (value: number | null | undefined): value is number =>
    value != null && Number.isSafeInteger(value) && value >= 0;
  const fullyPaid = payment?.settlementVerified === true && payment.state === 'paid' &&
    safePence(payment.totalPence) && payment.totalPence > 0 &&
    safePence(payment.paidPence) && payment.paidPence >= payment.totalPence &&
    payment.amountToCollectPence === 0 && payment.remainingBalancePence === 0;

  if (fullyPaid) {
    return {
      labelKey: 'payment.paid',
      tone: 'paid',
      descriptionKey: 'payment.noneToCollect',
    };
  }

  const cashDue = getDriverCashToCollectPence(payment);
  const hasSafeCashBalance = cashDue != null;
  const needsReview = !payment || payment.state === 'unknown' || payment.state === 'needs_checking' ||
    payment.state === 'paid';
  return {
    labelKey: 'payment.notPaid',
    tone: needsReview ? 'warning' : payment.state === 'failed' ? 'failed' : hasSafeCashBalance ? 'action' : 'pending',
    descriptionKey: needsReview ? 'payment.checkWithAdmin'
      : hasSafeCashBalance ? 'payment.cashRemainingDesc'
      : payment.state === 'failed' ? 'payment.failedDesc' : 'payment.pendingDesc',
    amountLabel: hasSafeCashBalance ? formatGbpFromPence(cashDue) ?? undefined : undefined,
  };
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
