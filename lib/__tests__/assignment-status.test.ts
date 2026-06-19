import { describe, expect, it } from 'vitest';
import {
  canAssignDriverFromStatus,
  getStatusAfterDriverUnassignment,
  isActiveAssignmentStatus,
} from '../bookings/assignment-status';
import type { PaymentSummary } from '../payments/payment-summary';

function paymentSummary(state: PaymentSummary['state']): PaymentSummary {
  return {
    state,
    label: state,
    instruction: '',
    tone: 'neutral',
    method: 'unknown',
    methodLabel: 'Unknown',
    linkStatus: 'unknown',
    paidVia: null,
    totalPence: 12000,
    paidPence: null,
    depositAmountPence: null,
    depositPaidPence: null,
    remainingBalancePence: null,
    amountToCollectPence: 12000,
    paymentUpdatedAt: null,
    depositPaidAt: null,
    linkSentAt: null,
    linkOpenedAt: null,
    linkExpiresAt: null,
    reason: 'unknown',
  };
}

describe('assignment status helpers', () => {
  it('allows dispatchable statuses and distinguishes active reassignments', () => {
    expect(canAssignDriverFromStatus('awaiting_payment')).toBe(true);
    expect(canAssignDriverFromStatus('deposit_paid')).toBe(true);
    expect(canAssignDriverFromStatus('paid')).toBe(true);
    expect(canAssignDriverFromStatus('draft')).toBe(false);

    expect(isActiveAssignmentStatus('driver_assigned')).toBe(true);
    expect(isActiveAssignmentStatus('en_route')).toBe(true);
    expect(isActiveAssignmentStatus('awaiting_payment')).toBe(false);
  });

  it('does not invent paid status when an unpaid assigned job is unassigned', () => {
    expect(getStatusAfterDriverUnassignment(paymentSummary('pending'))).toBe('awaiting_payment');
    expect(getStatusAfterDriverUnassignment(paymentSummary('cash_to_collect'))).toBe('awaiting_payment');
    expect(getStatusAfterDriverUnassignment(paymentSummary('needs_checking'))).toBe('awaiting_payment');
  });

  it('preserves genuine payment states when an assigned job is unassigned', () => {
    expect(getStatusAfterDriverUnassignment(paymentSummary('paid'))).toBe('paid');
    expect(getStatusAfterDriverUnassignment(paymentSummary('balance_due'))).toBe('deposit_paid');
    expect(getStatusAfterDriverUnassignment(paymentSummary('failed'))).toBe('payment_failed');
  });
});
