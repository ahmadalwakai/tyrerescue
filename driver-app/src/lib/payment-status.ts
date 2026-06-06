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
 *   - status: 'unpaid' | 'deposit_paid' | 'paid' | 'unknown'
 *   - amountToCollectPence, totalAmountPence, remainingBalancePence, depositPaidAt
 *
 * There is NO "payment link", "checkout session", or Stripe identifier field
 * on the driver payload, so link-specific labels ("Payment link sent" / "Paid
 * by payment link") are intentionally NOT produced — we never fake a state we
 * cannot prove. If those fields are added to the backend payment summary later,
 * extend this mapping.
 */

import type { PaymentSummary } from '@/api/client';

/** Visual tone for the payment badge. */
export type PaymentTone = 'paid' | 'pending' | 'action' | 'unknown' | 'failed';

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
  if (pence == null || !Number.isFinite(pence)) return null;
  return gbpFormatter.format(pence / 100);
}

/**
 * Map a (possibly missing) PaymentSummary to a driver display.
 *
 * Rules:
 * - Paid in full online            -> green "paid", nothing to collect.
 * - Deposit paid, balance due      -> amber "action", collect the balance.
 * - Cash / deposit-unpaid          -> amber "action"/"pending", collect total.
 * - Unknown or missing             -> grey "unknown", confirm with admin.
 * Never returns a green/paid tone unless the payment is genuinely settled.
 */
export function getDriverPaymentDisplay(
  payment: PaymentSummary | null | undefined,
): DriverPaymentDisplay {
  if (!payment) {
    return {
      labelKey: 'payment.unknownLabel',
      tone: 'unknown',
      descriptionKey: 'payment.checkWithAdmin',
    };
  }

  const collect = formatGbpFromPence(payment.amountToCollectPence) ?? undefined;

  // Paid in full online (Stripe full payment).
  if (payment.type === 'full' && payment.status === 'paid') {
    return {
      labelKey: 'payment.paidOnline',
      tone: 'paid',
      descriptionKey: 'payment.noneToCollect',
    };
  }

  // Deposit taken online, remaining balance due on arrival.
  if (payment.type === 'deposit' && payment.status === 'deposit_paid') {
    const hasBalance = payment.amountToCollectPence > 0;
    return {
      labelKey: hasBalance ? 'payment.depositBalanceDue' : 'payment.depositPaid',
      tone: hasBalance ? 'action' : 'paid',
      descriptionKey: hasBalance
        ? 'payment.collectBalance'
        : 'payment.noneToCollect',
      amountLabel: hasBalance ? collect : undefined,
    };
  }

  // Cash job — full amount collected on arrival.
  if (payment.type === 'cash') {
    return {
      labelKey: 'payment.payOnArrival',
      tone: 'action',
      descriptionKey: 'payment.collectFromCustomer',
      amountLabel: payment.amountToCollectPence > 0 ? collect : undefined,
    };
  }

  // Deposit selected but not yet paid, or any other unpaid state.
  if (payment.status === 'unpaid') {
    return {
      labelKey: 'payment.awaitingPayment',
      tone: 'pending',
      descriptionKey: 'payment.confirmIfUnsure',
      amountLabel: payment.amountToCollectPence > 0 ? collect : undefined,
    };
  }

  // Anything we cannot positively classify stays neutral — never green.
  return {
    labelKey: 'payment.unknownLabel',
    tone: 'unknown',
    descriptionKey: 'payment.checkWithAdmin',
    amountLabel: payment.amountToCollectPence > 0 ? collect : undefined,
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
    case 'failed':
      return { bg: 'rgba(239,68,68,0.16)', text: '#FCA5A5', border: 'rgba(239,68,68,0.5)' };
    case 'unknown':
    default:
      return { bg: 'rgba(161,161,170,0.16)', text: '#D4D4D8', border: 'rgba(161,161,170,0.45)' };
  }
}
