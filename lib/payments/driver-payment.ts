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
  stripePiId: string | null;
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
}

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
  const type: PaymentType =
    rawType === 'cash' || rawType === 'full' || rawType === 'deposit' ? rawType : null;

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
    stripePiId: input.stripePiId ?? null,
    depositPaidAt: input.depositPaidAt ? input.depositPaidAt.toISOString() : null,
  };
}
