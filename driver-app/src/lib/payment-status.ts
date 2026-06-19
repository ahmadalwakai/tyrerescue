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

const gbpFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

function pendingDescriptionKey(payment: PaymentSummary): string {
  if (payment.method === 'deposit_link') return 'payment.depositPendingDesc';
  return payment.method === 'card_link'
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
  void ref;

  if (!payment) {
    return {
      labelKey: 'payment.unknownLabel',
      tone: 'unknown',
      descriptionKey: 'payment.checkWithAdmin',
    };
  }

  const collect = formatGbpFromPence(payment.amountToCollectPence) ?? undefined;

  const needsChecking = (): DriverPaymentDisplay => ({
    labelKey: 'payment.needsChecking',
    tone: 'warning',
    descriptionKey: 'payment.checkBeforeFitting',
    amountLabel: (payment.amountToCollectPence ?? 0) > 0 ? collect : undefined,
  });

  if (payment.state === 'needs_checking') {
    return needsChecking();
  }

  if (payment.state === 'failed') {
    return {
      labelKey: 'payment.failed',
      tone: 'failed',
      descriptionKey: 'payment.failedDesc',
      amountLabel: (payment.amountToCollectPence ?? 0) > 0 ? collect : undefined,
    };
  }

  if (payment.state === 'paid') {
    return {
      labelKey: 'payment.paid',
      tone: 'paid',
      descriptionKey: 'payment.noneToCollect',
    };
  }

  // Deposit taken online, remaining balance due on arrival.
  if (payment.state === 'balance_due' || payment.state === 'deposit_paid') {
    const hasBalance = (payment.amountToCollectPence ?? 0) > 0;
    return {
      labelKey: hasBalance ? 'payment.balanceDue' : 'payment.depositPaid',
      tone: hasBalance ? 'action' : 'pending',
      descriptionKey: hasBalance
        ? 'payment.collectBalance'
        : 'payment.confirmIfUnsure',
      amountLabel: hasBalance ? collect : undefined,
    };
  }

  // Cash job — full amount collected on arrival.
  if (payment.state === 'cash_to_collect' || payment.method === 'cash') {
    return {
      labelKey: 'payment.payOnArrival',
      tone: 'action',
      descriptionKey: 'payment.collectFromCustomer',
      amountLabel: (payment.amountToCollectPence ?? 0) > 0 ? collect : undefined,
    };
  }

  if (payment.state === 'pending') {
    if (payment.method === 'deposit_link') {
      const depositDue = formatGbpFromPence(payment.depositAmountPence ?? payment.amountToCollectPence) ?? undefined;
      return {
        labelKey: 'payment.depositPending',
        tone: 'pending',
        descriptionKey: pendingDescriptionKey(payment),
        amountLabel: ((payment.depositAmountPence ?? payment.amountToCollectPence ?? 0) > 0) ? depositDue : undefined,
      };
    }

    return {
      labelKey: payment.linkStatus === 'sent' ? 'payment.paymentLinkSent' : 'payment.paymentPending',
      tone: 'pending',
      descriptionKey: pendingDescriptionKey(payment),
      amountLabel: (payment.amountToCollectPence ?? 0) > 0 ? collect : undefined,
    };
  }

  // Anything we cannot positively classify stays neutral — never green.
  return {
    labelKey: 'payment.unknownLabel',
    tone: 'unknown',
    descriptionKey: 'payment.checkWithAdmin',
    amountLabel: (payment.amountToCollectPence ?? 0) > 0 ? collect : undefined,
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
