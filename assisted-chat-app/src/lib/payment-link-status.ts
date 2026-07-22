export type PaymentLinkLiveStatus =
  | 'awaiting'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'checking'
  | 'expired'
  | 'partial';

export type PaymentLinkAutoCheckState =
  | 'idle'
  | 'watching'
  | 'checking'
  | 'paused'
  | 'offline'
  | 'stopped'
  | 'settled'
  | 'error';

export const STRIPE_AUTO_CHECK_FIRST_MINUTE_MS = 60_000;
export const STRIPE_AUTO_CHECK_STOP_AFTER_MS = 5 * 60_000;
export const STRIPE_AUTO_CHECK_INITIAL_DELAY_MS = 0;
export const STRIPE_AUTO_CHECK_FAST_INTERVAL_MS = 10_000;
export const STRIPE_AUTO_CHECK_SLOW_INTERVAL_MS = 30_000;

export interface PaymentLinkStatusResponse {
  status: string;
  state?: string;
  linkStatus?: string;
  checkStatus?: string;
  message?: string;
  amountToCollectPence: number | null;
  totalPaidPence?: number | null;
  paymentSummary?: {
    state?: string;
    linkStatus?: string;
    amountToCollectPence?: number | null;
    paidPence?: number | null;
  } | null;
}

export function derivePaymentLinkLiveStatus(res: PaymentLinkStatusResponse): PaymentLinkLiveStatus {
  const state = res.paymentSummary?.state ?? res.state ?? res.status;
  const linkStatus = res.paymentSummary?.linkStatus ?? res.linkStatus;
  const amountToCollectPence =
    res.paymentSummary?.amountToCollectPence ?? res.amountToCollectPence;
  const paidPence = res.paymentSummary?.paidPence ?? res.totalPaidPence ?? null;

  if (
    state === 'refunded' ||
    state === 'refunded_partial' ||
    res.status === 'refunded' ||
    res.status === 'refunded_partial' ||
    linkStatus === 'refunded'
  ) {
    return 'refunded';
  }

  if (state === 'paid' || amountToCollectPence === 0) return 'paid';

  if (
    state === 'balance_due' ||
    state === 'deposit_paid' ||
    (paidPence != null && paidPence > 0 && (amountToCollectPence ?? 0) > 1)
  ) {
    return 'partial';
  }

  if (res.checkStatus === 'expired' || linkStatus === 'expired') return 'expired';
  if (
    res.checkStatus === 'cancelled' ||
    state === 'cancelled' ||
    res.status === 'cancelled' ||
    (res.checkStatus === 'failed' && /\bcancell?ed\b/i.test(res.message ?? ''))
  ) {
    return 'cancelled';
  }
  if (res.checkStatus === 'failed' || state === 'failed' || linkStatus === 'failed') return 'failed';
  if (res.checkStatus === 'needs_checking' || state === 'needs_checking') return 'checking';

  return 'awaiting';
}

export function isPaymentLinkTerminalStatus(status: PaymentLinkLiveStatus | null): boolean {
  return status === 'paid' || status === 'failed' || status === 'cancelled' || status === 'expired' || status === 'refunded';
}

export function isPaymentLinkEligibleForAutoCheck(status: PaymentLinkLiveStatus | null): boolean {
  return status == null || status === 'awaiting' || status === 'checking' || status === 'partial';
}

export function getStripeAutoCheckDelayMs(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return STRIPE_AUTO_CHECK_INITIAL_DELAY_MS;
  return elapsedMs < STRIPE_AUTO_CHECK_FIRST_MINUTE_MS
    ? STRIPE_AUTO_CHECK_FAST_INTERVAL_MS
    : STRIPE_AUTO_CHECK_SLOW_INTERVAL_MS;
}

export function shouldIgnoreStalePaymentLinkStatus(
  current: PaymentLinkLiveStatus | null,
  incoming: PaymentLinkLiveStatus | null,
): boolean {
  if (!current || !incoming || current === incoming) return false;
  if (current === 'paid' || current === 'refunded') return incoming !== current;
  if (isPaymentLinkTerminalStatus(current)) {
    return incoming === 'awaiting' || incoming === 'checking' || incoming === 'partial';
  }
  if (current === 'partial') return incoming === 'awaiting' || incoming === 'checking';
  return false;
}

export function getPaymentLinkStatusLabel(status: PaymentLinkLiveStatus | null): string {
  switch (status) {
    case 'paid':
      return 'Payment received';
    case 'failed':
      return 'Payment failed';
    case 'cancelled':
      return 'Payment cancelled';
    case 'refunded':
      return 'Payment refunded';
    case 'expired':
      return 'Payment link expired';
    case 'partial':
      return 'Partial payment received';
    case 'checking':
      return 'Payment needs checking';
    case 'awaiting':
    default:
      return 'Awaiting payment';
  }
}

export function getStripeCheckButtonLabel(status: PaymentLinkLiveStatus | null): string {
  switch (status) {
    case 'paid':
      return 'Payment confirmed';
    case 'failed':
      return 'Recheck Stripe payment';
    case 'cancelled':
      return 'Recheck cancelled payment';
    case 'refunded':
      return 'Payment refunded';
    case 'expired':
      return 'Check expired payment';
    case 'partial':
      return 'Check remaining balance';
    case 'checking':
      return 'Check Stripe payment';
    case 'awaiting':
    default:
      return 'Check Stripe payment';
  }
}
