/**
 * Typed label formatting for admin-facing UI.
 * Converts snake_case backend enum values to human-readable display strings.
 * Single source of truth — use across all screens, chips, and list rows.
 */

const BOOKING_STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: 'Pending',
  awaiting_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  assigned: 'Assigned',
  driver_assigned: 'Driver assigned',
  pricing_ready: 'Pricing ready',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  failed: 'Failed',
  no_show: 'No show',
  rescheduled: 'Rescheduled',
  on_hold: 'On hold',
};

const DRIVER_STATUS_LABELS: Readonly<Record<string, string>> = {
  online: 'Online',
  offline: 'Offline',
  busy: 'Busy',
  on_break: 'On break',
  unavailable: 'Unavailable',
  available: 'Available',
  en_route: 'En route',
  arrived: 'Arrived',
  in_progress: 'In progress',
};

const INVENTORY_STATUS_LABELS: Readonly<Record<string, string>> = {
  active: 'Active',
  inactive: 'Inactive',
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
};

/**
 * Convert any snake_case key to a human-readable label.
 * Checks booking statuses, driver statuses, and inventory statuses first,
 * then falls back to capitalising the first word.
 */
export function formatLabel(key: string): string {
  const mapped =
    BOOKING_STATUS_LABELS[key] ??
    DRIVER_STATUS_LABELS[key] ??
    INVENTORY_STATUS_LABELS[key];
  if (mapped !== undefined) return mapped;
  return key
    .split('_')
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        : word.toLowerCase(),
    )
    .join(' ');
}

/** Format a booking status for display. */
export function formatBookingStatus(status: string): string {
  return BOOKING_STATUS_LABELS[status] ?? formatLabel(status);
}

/** Format a driver status for display. */
export function formatDriverStatus(status: string): string {
  return DRIVER_STATUS_LABELS[status] ?? formatLabel(status);
}

/**
 * Format an array of valid next-status transitions to a readable string.
 * e.g. ["confirmed", "in_progress"] -> "Confirmed, In progress"
 */
export function formatNextStatuses(statuses: string[]): string {
  if (statuses.length === 0) return 'No transitions available';
  return statuses.map(formatBookingStatus).join(', ');
}
