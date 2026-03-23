/**
 * Driver Presence Service — server-side only
 *
 * Centralises all logic for determining whether a driver is operationally
 * available, has stale location, or should be treated as offline.
 *
 * This replaces the old model where `drivers.isOnline` was the sole source
 * of truth and browser lifecycle events could instantly kill availability.
 *
 * The new model uses:
 *   1. Explicit driver intent  (`isOnline` flag – explicit toggle only)
 *   2. Location freshness      (`locationAt` timestamp)
 *   3. Active booking state    (driver_assigned / en_route / arrived / in_progress)
 *
 * Nothing in this file touches the database directly — it receives a
 * lightweight driver snapshot and returns computed presence state.
 */

// ─── Thresholds ─────────────────────────────────────────

/** Minutes without a heartbeat before location is considered stale */
export const STALE_THRESHOLD_MINUTES = 5;

/** Minutes without a heartbeat before driver is considered offline (grace window) */
export const OFFLINE_GRACE_MINUTES = 10;

/**
 * When the driver has an active booking, we allow a much longer grace
 * window before treating them as genuinely offline.  A technician doing
 * a tyre fitting won't be sending GPS pings the whole time.
 */
export const ACTIVE_JOB_GRACE_MINUTES = 60;

/** Statuses that mean the driver is actively working a booking */
const ACTIVE_BOOKING_STATUSES = [
  'driver_assigned',
  'en_route',
  'arrived',
  'in_progress',
] as const;

// ─── Types ──────────────────────────────────────────────

export type DriverPresenceState =
  | 'online_fresh'       // Online, GPS updating normally
  | 'online_stale'       // Online intent, but GPS stale (browser backgrounded, etc.)
  | 'active_job_fresh'   // Has an active booking, GPS fresh
  | 'active_job_stale'   // Has an active booking, GPS stale — still operationally present
  | 'offline';           // Explicitly offline OR exceeded grace window

/** Human-readable labels for the UI */
export const PRESENCE_LABELS: Record<DriverPresenceState, string> = {
  online_fresh: 'Online',
  online_stale: 'Online (signal stale)',
  active_job_fresh: 'On Active Job',
  active_job_stale: 'On Active Job (signal stale)',
  offline: 'Offline',
};

export const PRESENCE_COLORS: Record<DriverPresenceState, string> = {
  online_fresh: 'green',
  online_stale: 'yellow',
  active_job_fresh: 'blue',
  active_job_stale: 'orange',
  offline: 'gray',
};

/** Minimal driver shape needed for presence evaluation */
export interface DriverSnapshot {
  isOnline: boolean;
  locationAt: Date | string | null;
  status: string | null;
  locationSource?: string | null;  // 'mobile_app' | 'web_portal'
}

/** Active booking shape — only need the status */
export interface ActiveBookingSnapshot {
  status: string;
}

// ─── Core evaluators ────────────────────────────────────

/** How many minutes since the last location update */
export function minutesSinceLastLocation(locationAt: Date | string | null): number | null {
  if (!locationAt) return null;
  const ts = typeof locationAt === 'string' ? new Date(locationAt) : locationAt;
  return (Date.now() - ts.getTime()) / 60_000;
}

/** Is the driver's GPS location considered fresh? */
export function isDriverLocationFresh(locationAt: Date | string | null): boolean {
  const mins = minutesSinceLastLocation(locationAt);
  if (mins === null) return false; // never sent location
  return mins <= STALE_THRESHOLD_MINUTES;
}

/** Has the driver exceeded the grace window? */
export function hasExceededGraceWindow(
  locationAt: Date | string | null,
  hasActiveBooking: boolean,
): boolean {
  const mins = minutesSinceLastLocation(locationAt);
  if (mins === null) return true; // never sent any location
  const graceMinutes = hasActiveBooking ? ACTIVE_JOB_GRACE_MINUTES : OFFLINE_GRACE_MINUTES;
  return mins > graceMinutes;
}

/**
 * Determine the effective presence state for a driver.
 *
 *  driver       – row from `drivers` table (isOnline, locationAt, status)
 *  activeBooking – the driver's current active booking (if any)
 */
export function getDriverPresenceState(
  driver: DriverSnapshot,
  activeBooking: ActiveBookingSnapshot | null = null,
): DriverPresenceState {
  const hasActiveJob =
    activeBooking !== null &&
    ACTIVE_BOOKING_STATUSES.includes(activeBooking.status as typeof ACTIVE_BOOKING_STATUSES[number]);

  // 1. Driver explicitly offline & no active booking → offline
  if (!driver.isOnline && !hasActiveJob) {
    return 'offline';
  }

  const fresh = isDriverLocationFresh(driver.locationAt);
  const exceededGrace = hasExceededGraceWindow(driver.locationAt, hasActiveJob);

  // 2. Active job path — never collapse to plain offline within 60-min grace
  if (hasActiveJob) {
    if (fresh) return 'active_job_fresh';
    if (!exceededGrace) return 'active_job_stale';
    // Even after 60-min grace, if they have an active job, keep them in
    // active_job_stale rather than dropping them. Admin will see the warning.
    return 'active_job_stale';
  }

  // 3. Online by intent, no active job
  if (driver.isOnline) {
    if (fresh) return 'online_fresh';
    if (!exceededGrace) return 'online_stale';
    // Grace window exceeded → auto-offline
    return 'offline';
  }

  return 'offline';
}

/**
 * Should this driver appear as operationally "online" for dispatch, UI, etc.?
 * Returns true for all states except 'offline'.
 */
export function shouldDriverAppearOnline(
  driver: DriverSnapshot,
  activeBooking: ActiveBookingSnapshot | null = null,
): boolean {
  return getDriverPresenceState(driver, activeBooking) !== 'offline';
}

/**
 * Can this driver receive a NEW booking assignment?
 *
 * Rules:
 *  - Must be online with fresh or stale-but-within-grace location
 *  - Must NOT already have an active booking
 *  - Stale-but-online drivers are deprioritised but not excluded
 *    (the suggest-driver AI handles ranking)
 */
export function canDriverReceiveNewBooking(
  driver: DriverSnapshot,
  activeBooking: ActiveBookingSnapshot | null = null,
): boolean {
  const state = getDriverPresenceState(driver, activeBooking);

  // Already working a job → can't accept another
  if (state === 'active_job_fresh' || state === 'active_job_stale') {
    return false;
  }

  // Online (fresh or stale within grace) → available
  return state === 'online_fresh' || state === 'online_stale';
}

/**
 * For dispatch/availability queries: should this driver be counted as
 * "available" (i.e. ready for new work)?
 *
 * More restrictive than `shouldDriverAppearOnline`:
 *  - excludes drivers with active jobs
 *  - excludes offline
 */
export function isDriverAvailableForDispatch(
  driver: DriverSnapshot,
  activeBooking: ActiveBookingSnapshot | null = null,
): boolean {
  return canDriverReceiveNewBooking(driver, activeBooking);
}

/**
 * Should location data (lat/lng) be trusted for routing/ETA calculations?
 * Only if the location is truly fresh (within STALE_THRESHOLD_MINUTES).
 */
export function isLocationTrustworthy(locationAt: Date | string | null): boolean {
  return isDriverLocationFresh(locationAt);
}

/**
 * Is this driver's location sourced from the native mobile app?
 * Mobile app location is the authoritative operational source.
 * Web portal location is treated as a weaker fallback.
 */
export function isLocationFromMobileApp(locationSource: string | null | undefined): boolean {
  return locationSource === 'mobile_app';
}
