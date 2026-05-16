/**
 * Shared types for the live tracking experience (customer page, driver
 * page, and the assisted-chat admin card). These intentionally describe
 * the wire/response shape, not the database row.
 */

export type TrackingStatus =
  | 'pending'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'expired';

export type TrackingRouteMode = 'route' | 'direct' | 'none';

export type TrackingMapMarkerType = 'driver' | 'customer';

export interface TrackingPoint {
  lat: number;
  lng: number;
}

export interface TrackingActorLocation extends TrackingPoint {
  /** Best-effort accuracy radius in metres. */
  accuracyMeters: number | null;
  /** Heading in degrees (0 = north), if available. */
  headingDegrees: number | null;
  /** Speed in m/s, if available. */
  speedMetersPerSecond: number | null;
  /** ISO timestamp of the last successful location report. */
  lastUpdatedAt: string | null;
}

/**
 * Snapshot returned by both the public customer/driver endpoints and the
 * admin endpoint. Fields are optional so each endpoint can return a
 * narrower projection (e.g. customer page never includes raw driver phone).
 */
export interface TrackingSnapshot {
  status: TrackingStatus;
  startedAt: string | null;
  completedAt: string | null;
  lastUpdatedAt: string | null;
  driver: TrackingActorLocation | null;
  customer: TrackingPoint | null;
  customerAddress: string | null;
  refNumber: string | null;
}
