import type { CustomerBookingSummary } from './customer-account';

const ACTIVE_STATUSES: Record<string, { order: number; label: string }> = {
  paid: { order: 0, label: 'Payment confirmed' },
  deposit_paid: { order: 0, label: 'Deposit paid' },
  driver_assigned: { order: 1, label: 'Driver assigned' },
  en_route: { order: 2, label: 'On the way' },
  arrived: { order: 3, label: 'Driver arrived' },
  in_progress: { order: 4, label: 'Service in progress' },
};

function bookingTime(booking: CustomerBookingSummary) {
  const date = booking.scheduledAt || booking.createdAt;
  const time = date ? Date.parse(date) : Number.NaN;
  return Number.isFinite(time) ? time : null;
}

/** Confirmed service bookings only; drafts and unsuccessful payments are not dispatched jobs. */
export function selectCustomerActiveBooking(bookings: readonly CustomerBookingSummary[], now = Date.now()): CustomerBookingSummary | null {
  const active = bookings.filter((booking) => Object.hasOwn(ACTIVE_STATUSES, booking.status) && booking.bookingId && booking.refNumber);
  active.sort((left, right) => {
    const progress = ACTIVE_STATUSES[right.status].order - ACTIVE_STATUSES[left.status].order;
    if (progress) return progress;
    const leftTime = bookingTime(left);
    const rightTime = bookingTime(right);
    const leftUrgent = left.bookingType === 'emergency' || (leftTime !== null && leftTime <= now);
    const rightUrgent = right.bookingType === 'emergency' || (rightTime !== null && rightTime <= now);
    if (leftUrgent !== rightUrgent) return leftUrgent ? -1 : 1;
    if (leftTime === null || rightTime === null) {
      if (leftTime !== rightTime) return leftTime === null ? 1 : -1;
    } else if (leftTime !== rightTime) {
      // Current jobs use the most recent service date; upcoming jobs use the nearest appointment.
      return leftUrgent ? rightTime - leftTime : leftTime - rightTime;
    }
    return left.refNumber.localeCompare(right.refNumber);
  });
  return active[0] ?? null;
}

export function customerActiveBookingStatus(status: string) {
  return Object.hasOwn(ACTIVE_STATUSES, status) ? ACTIVE_STATUSES[status].label : null;
}

export function customerActiveBookingDate(scheduledAt: string | null) {
  if (!scheduledAt || !Number.isFinite(Date.parse(scheduledAt))) return null;
  return new Date(scheduledAt).toLocaleString('en-GB', {
    timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
