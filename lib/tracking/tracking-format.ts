import type { TrackingPoint } from '@/types/tracking';

/** Default staleness threshold for the UI ("Tracking paused" copy). */
export const TRACKING_STALE_SECONDS = 90;
/** Below this many seconds → "Good signal". */
export const TRACKING_GOOD_SECONDS = 30;

const METERS_PER_MILE = 1609.344;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Formats a miles distance for display. Returns a safe fallback string if
 * the input is null/NaN. Customer-friendly: no decimal noise for long trips.
 */
export function formatDistanceMiles(distanceMiles: number | null): string {
  if (!isFiniteNumber(distanceMiles) || distanceMiles < 0) return '—';
  if (distanceMiles < 0.1) return 'less than 0.1 miles';
  if (distanceMiles < 10) return `${distanceMiles.toFixed(1)} miles`;
  return `${Math.round(distanceMiles)} miles`;
}

/**
 * Human-readable "X seconds/minutes ago" using clock-time fallback after an
 * hour. Returns an empty string for null input so callers can render
 * conditionally without extra guards.
 */
export function formatLastUpdated(value: string | Date | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'just now';
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.round(diff / 1_000)} seconds ago`;
  if (diff < 3_600_000) {
    const mins = Math.round(diff / 60_000);
    return mins === 1 ? '1 minute ago' : `${mins} minutes ago`;
  }
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Returns `true` when the last driver fix is older than the threshold.
 * Used to drive the "Tracking paused" UI state without polluting the DB.
 */
export function isTrackingStale(
  lastUpdatedAt: string | Date | null,
  thresholdSeconds: number = TRACKING_STALE_SECONDS,
): boolean {
  if (!lastUpdatedAt) return false;
  const date = lastUpdatedAt instanceof Date ? lastUpdatedAt : new Date(lastUpdatedAt);
  const ms = Date.now() - date.getTime();
  return ms > thresholdSeconds * 1_000;
}

/**
 * Great-circle distance (haversine) in miles. Returns `null` if either
 * point is missing or non-finite — callers must handle the fallback.
 */
export function calculateDirectDistanceMiles(
  a: TrackingPoint | null | undefined,
  b: TrackingPoint | null | undefined,
): number | null {
  if (!a || !b) return null;
  if (!isFiniteNumber(a.lat) || !isFiniteNumber(a.lng)) return null;
  if (!isFiniteNumber(b.lat) || !isFiniteNumber(b.lng)) return null;
  const R = 6_371_000; // earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const meters = 2 * R * Math.asin(Math.sqrt(h));
  return meters / METERS_PER_MILE;
}

// ── Live-feel helpers ─────────────────────────────────────────────────────

/**
 * Coarse health bucket derived from the age of the last GPS fix. Drives
 * the human-friendly "Good signal / Weak signal / Tracking paused" copy
 * shown on customer, driver and admin tracking surfaces.
 */
export type TrackingHealth = 'good' | 'weak' | 'lost' | 'completed' | 'idle';

export function getTrackingHealth(
  lastUpdatedAt: string | Date | null,
  opts?: { isCompleted?: boolean; isActive?: boolean },
): TrackingHealth {
  if (opts?.isCompleted) return 'completed';
  if (!lastUpdatedAt) return opts?.isActive ? 'lost' : 'idle';
  const date = lastUpdatedAt instanceof Date ? lastUpdatedAt : new Date(lastUpdatedAt);
  const secs = (Date.now() - date.getTime()) / 1_000;
  if (!Number.isFinite(secs) || secs < 0) return 'good';
  if (secs <= TRACKING_GOOD_SECONDS) return 'good';
  if (secs <= TRACKING_STALE_SECONDS) return 'weak';
  return 'lost';
}

/** Distance in miles below which we call the driver "nearby". */
export const NEARBY_MILES = 0.5;

