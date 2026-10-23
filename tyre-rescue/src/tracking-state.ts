export const DRIVER_LOCATION_STALE_MS = 180_000;

export function isTrackingStatusActive(status: string) {
  return !['completed', 'cancelled', 'cancelled_refund_pending', 'refunded', 'refunded_partial'].includes(status);
}

export function trackingFinishedSummary(status: string) {
  switch (status) {
    case 'completed':
      return { title: 'Service completed', detail: 'Your tyre service is complete. Driver tracking has ended.' };
    case 'cancelled':
      return { title: 'Booking cancelled', detail: 'This booking has been cancelled. Driver tracking has ended. Contact us if you need help.' };
    case 'cancelled_refund_pending':
      return { title: 'Booking cancelled', detail: 'Your booking is cancelled and your refund is being processed. Driver tracking has ended.' };
    case 'refunded':
      return { title: 'Booking refunded', detail: 'This booking has been refunded. Driver tracking has ended.' };
    case 'refunded_partial':
      return { title: 'Booking partially refunded', detail: 'This booking has been partially refunded. Driver tracking has ended.' };
    default:
      return null;
  }
}

export function isTrackingLocationFresh(updatedAt: string | null, now = Date.now()) {
  if (!updatedAt) return false;
  const timestamp = Date.parse(updatedAt);
  return Number.isFinite(timestamp) && timestamp <= now + 30_000 && now - timestamp <= DRIVER_LOCATION_STALE_MS;
}

// Each foreground lookup replaces its predecessor. Polls for a loaded booking
// never change the selected reference, and late responses cannot replace it.
export function createTrackingRequestScope() {
  let generation = 0;
  return {
    begin: () => ++generation,
    current: (request: number) => request === generation,
    invalidate: () => { generation += 1; },
  };
}
