import type { PaymentSummary } from '@/lib/payments/payment-summary';
import type { BookingStatus } from '@/lib/state-machine';

export const ACTIVE_ASSIGNMENT_STATUSES = [
  'driver_assigned',
  'en_route',
  'arrived',
  'in_progress',
] as const;

const ASSIGNABLE_STATUSES = new Set<string>([
  'awaiting_payment',
  'deposit_paid',
  'paid',
]);

export function isActiveAssignmentStatus(status: string | null | undefined): boolean {
  return status != null && ACTIVE_ASSIGNMENT_STATUSES.includes(status as (typeof ACTIVE_ASSIGNMENT_STATUSES)[number]);
}

export function canAssignDriverFromStatus(status: string | null | undefined): boolean {
  return status != null && ASSIGNABLE_STATUSES.has(status);
}

export function getStatusAfterDriverUnassignment(payment: PaymentSummary): BookingStatus {
  switch (payment.state) {
    case 'paid':
      return 'paid';
    case 'deposit_paid':
    case 'balance_due':
      return 'deposit_paid';
    case 'failed':
      return 'payment_failed';
    case 'cash_to_collect':
    case 'pending':
    case 'needs_checking':
    case 'unknown':
    default:
      return 'awaiting_payment';
  }
}
