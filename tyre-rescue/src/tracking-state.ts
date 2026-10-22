export const DRIVER_LOCATION_STALE_MS = 180_000;

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
