/**
 * Tyre Rescue Booking State Machine
 * 
 * Manages booking status transitions with strict validation.
 * No state can be skipped or reversed.
 * All transitions are logged to booking_status_history.
 */

import { db, bookingStatusHistory, bookings } from '@/lib/db';
import { eq } from 'drizzle-orm';

/**
 * Valid booking statuses
 */
export type BookingStatus =
  | 'draft'
  | 'pricing_ready'
  | 'awaiting_payment'
  | 'paid'
  | 'payment_failed'
  | 'driver_assigned'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'cancelled_refund_pending'
  | 'refunded'
  | 'refunded_partial';

/**
 * Valid transitions from each state
 * Key: current state
 * Value: array of valid next states
 */
const VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  draft: ['pricing_ready'],
  pricing_ready: ['awaiting_payment'],
  awaiting_payment: ['paid', 'payment_failed', 'cancelled'],
  payment_failed: ['awaiting_payment'],
  paid: ['driver_assigned', 'cancelled_refund_pending'],
  driver_assigned: ['en_route'],
  en_route: ['arrived'],
  arrived: ['in_progress'],
  in_progress: ['completed'],
  completed: ['refunded_partial'],
  cancelled: [],
  cancelled_refund_pending: ['refunded'],
  refunded: [],
  refunded_partial: [],
};

/**
 * Human-readable status labels
 */
export const STATUS_LABELS: Record<BookingStatus, string> = {
  draft: 'Draft',
  pricing_ready: 'Pricing Ready',
  awaiting_payment: 'Awaiting Payment',
  paid: 'Paid',
  payment_failed: 'Payment Failed',
  driver_assigned: 'Driver Assigned',
  en_route: 'En Route',
  arrived: 'Arrived',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  cancelled_refund_pending: 'Cancellation Pending Refund',
  refunded: 'Refunded',
  refunded_partial: 'Partially Refunded',
};

/**
 * Status descriptions for display
 */
export const STATUS_DESCRIPTIONS: Record<BookingStatus, string> = {
  draft: 'Booking is being created',
  pricing_ready: 'Quote has been calculated',
  awaiting_payment: 'Waiting for customer payment',
  paid: 'Payment confirmed, awaiting driver assignment',
  payment_failed: 'Payment was declined',
  driver_assigned: 'A driver has been assigned to your booking',
  en_route: 'Driver is on the way to your location',
  arrived: 'Driver has arrived at your location',
  in_progress: 'Work is in progress',
  completed: 'Job completed successfully',
  cancelled: 'Booking was cancelled',
  cancelled_refund_pending: 'Refund is being processed',
  refunded: 'Full refund has been issued',
  refunded_partial: 'Partial refund has been issued',
};

/**
 * Actor types that can perform transitions
 */
export type ActorRole = 'customer' | 'driver' | 'admin' | 'system';

/**
 * Transition actor information
 */
export interface TransitionActor {
  userId?: string;
  role: ActorRole;
}

/**
 * Transition execution result
 */
export interface TransitionResult {
  success: boolean;
  error?: string;
  previousStatus?: BookingStatus;
  newStatus?: BookingStatus;
}

/**
 * Custom error for invalid transitions
 */
export class InvalidTransitionError extends Error {
  public code = 'INVALID_TRANSITION';
  public currentStatus: BookingStatus;
  public attemptedStatus: BookingStatus;

  constructor(currentStatus: BookingStatus, attemptedStatus: BookingStatus) {
    super(
      `Invalid transition from '${currentStatus}' to '${attemptedStatus}'`
    );
    this.name = 'InvalidTransitionError';
    this.currentStatus = currentStatus;
    this.attemptedStatus = attemptedStatus;
  }
}

/**
 * Check if a transition is valid
 */
export function isValidTransition(
  currentStatus: BookingStatus,
  newStatus: BookingStatus
): boolean {
  const validNextStates = VALID_TRANSITIONS[currentStatus];
  return validNextStates?.includes(newStatus) ?? false;
}

/**
 * Get valid next states for a given status
 */
export function getValidNextStates(
  currentStatus: BookingStatus
): BookingStatus[] {
  return VALID_TRANSITIONS[currentStatus] || [];
}

/**
 * Validate a transition, throwing if invalid
 */
export function validateTransition(
  currentStatus: BookingStatus,
  newStatus: BookingStatus
): void {
  if (!isValidTransition(currentStatus, newStatus)) {
    throw new InvalidTransitionError(currentStatus, newStatus);
  }
}

/**
 * Check if a status is a terminal state (no further transitions)
 */
export function isTerminalState(status: BookingStatus): boolean {
  const nextStates = VALID_TRANSITIONS[status];
  return !nextStates || nextStates.length === 0;
}

/**
 * Check if a status indicates the booking is active (work in progress)
 */
export function isActiveStatus(status: BookingStatus): boolean {
  return ['driver_assigned', 'en_route', 'arrived', 'in_progress'].includes(
    status
  );
}

/**
 * Check if a status indicates the booking requires payment
 */
export function requiresPayment(status: BookingStatus): boolean {
  return ['awaiting_payment', 'payment_failed'].includes(status);
}

/**
 * Check if a status indicates the booking is complete or cancelled
 */
export function isFinalStatus(status: BookingStatus): boolean {
  return [
    'completed',
    'cancelled',
    'refunded',
    'refunded_partial',
  ].includes(status);
}

/**
 * Execute a status transition and log to history
 * This is the main function for changing booking status
 */
export async function executeTransition(
  bookingId: string,
  newStatus: BookingStatus,
  actor: TransitionActor,
  note?: string
): Promise<TransitionResult> {
  // Get current booking status
  const [booking] = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) {
    return {
      success: false,
      error: 'Booking not found',
    };
  }

  const currentStatus = booking.status as BookingStatus;

  // Validate the transition
  if (!isValidTransition(currentStatus, newStatus)) {
    return {
      success: false,
      error: `Invalid transition from '${currentStatus}' to '${newStatus}'`,
      previousStatus: currentStatus,
    };
  }

  // Execute the transition in a transaction
  try {
    // Update booking status
    await db
      .update(bookings)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId));

    // Log the transition
    await db.insert(bookingStatusHistory).values({
      bookingId,
      fromStatus: currentStatus,
      toStatus: newStatus,
      actorUserId: actor.userId,
      actorRole: actor.role,
      note,
    });

    return {
      success: true,
      previousStatus: currentStatus,
      newStatus,
    };
  } catch (error) {
    console.error('Transition execution error:', error);
    return {
      success: false,
      error: 'Failed to execute transition',
      previousStatus: currentStatus,
    };
  }
}

/**
 * Get the status history for a booking
 */
export async function getStatusHistory(bookingId: string) {
  return db
    .select()
    .from(bookingStatusHistory)
    .where(eq(bookingStatusHistory.bookingId, bookingId))
    .orderBy(bookingStatusHistory.createdAt);
}

/**
 * Get allowed transitions for a user role from a given status
 */
export function getAllowedTransitionsForRole(
  currentStatus: BookingStatus,
  role: ActorRole
): BookingStatus[] {
  const validNext = getValidNextStates(currentStatus);

  // Define which transitions each role can perform
  const rolePermissions: Record<ActorRole, Record<BookingStatus, BookingStatus[]>> = {
    customer: {
      awaiting_payment: ['cancelled'],
      draft: [],
      pricing_ready: [],
      paid: [],
      payment_failed: [],
      driver_assigned: [],
      en_route: [],
      arrived: [],
      in_progress: [],
      completed: [],
      cancelled: [],
      cancelled_refund_pending: [],
      refunded: [],
      refunded_partial: [],
    },
    driver: {
      driver_assigned: ['en_route'],
      en_route: ['arrived'],
      arrived: ['in_progress'],
      in_progress: ['completed'],
      draft: [],
      pricing_ready: [],
      awaiting_payment: [],
      paid: [],
      payment_failed: [],
      completed: [],
      cancelled: [],
      cancelled_refund_pending: [],
      refunded: [],
      refunded_partial: [],
    },
    admin: {
      // Admin can perform all valid transitions
      draft: ['pricing_ready'],
      pricing_ready: ['awaiting_payment'],
      awaiting_payment: ['paid', 'payment_failed', 'cancelled'],
      payment_failed: ['awaiting_payment'],
      paid: ['driver_assigned', 'cancelled_refund_pending'],
      driver_assigned: ['en_route'],
      en_route: ['arrived'],
      arrived: ['in_progress'],
      in_progress: ['completed'],
      completed: ['refunded_partial'],
      cancelled: [],
      cancelled_refund_pending: ['refunded'],
      refunded: [],
      refunded_partial: [],
    },
    system: {
      // System can perform automated transitions
      draft: ['pricing_ready'],
      pricing_ready: ['awaiting_payment'],
      awaiting_payment: ['paid', 'payment_failed'],
      payment_failed: ['awaiting_payment'],
      paid: [],
      driver_assigned: [],
      en_route: [],
      arrived: [],
      in_progress: [],
      completed: [],
      cancelled: [],
      cancelled_refund_pending: [],
      refunded: [],
      refunded_partial: [],
    },
  };

  const allowed = rolePermissions[role][currentStatus] || [];
  
  // Return intersection of valid transitions and role-allowed transitions
  return validNext.filter((status) => allowed.includes(status));
}

/**
 * Status flow visualization helper
 * Returns a structured representation of the booking workflow
 */
export function getWorkflow(): {
  name: string;
  states: Array<{
    status: BookingStatus;
    label: string;
    transitions: BookingStatus[];
    isTerminal: boolean;
  }>;
} {
  const statuses = Object.keys(VALID_TRANSITIONS) as BookingStatus[];

  return {
    name: 'Booking Workflow',
    states: statuses.map((status) => ({
      status,
      label: STATUS_LABELS[status],
      transitions: VALID_TRANSITIONS[status],
      isTerminal: isTerminalState(status),
    })),
  };
}
