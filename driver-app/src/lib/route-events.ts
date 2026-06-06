/**
 * Smart route-event engine (driver cockpit intelligence layer).
 *
 * Pure, framework-free state machine that turns a stream of raw route/GPS
 * snapshots into a small set of *debounced* driver-facing events. The route
 * screen feeds it one snapshot per evaluation and plays sound/haptics for the
 * events it returns — keeping all "when should something fire" logic OUT of the
 * React component so `route.tsx` stays readable.
 *
 * Design rules (per spec):
 * - Events are debounced; the same event never spams on every GPS tick.
 * - Each proximity event fires ONCE per route session, and only re-arms if the
 *   driver moves significantly back AWAY from that band (hysteresis) — e.g. a
 *   detour that increases distance, then returns.
 * - Transition events (rerouting / off-route / connection) fire on edges only.
 * - A global minimum gap prevents two events stacking in the same instant.
 *
 * The engine holds NO geometry and does NO network work; the component computes
 * the primitive inputs (distance to route, distance to customer, GPS fix age)
 * using the existing helpers in `services/directions.ts`.
 */

export type RouteEventType =
  | 'route_started'
  | 'rerouting'
  | 'reroute_failed'
  | 'near_customer_300m'
  | 'near_customer_100m'
  | 'prepare_stop_50m'
  | 'arrived_zone_25m'
  | 'off_route'
  | 'maneuver_approaching'
  | 'gps_waiting'
  | 'connection_lost'
  | 'route_restored';

/** Raw per-tick snapshot the component feeds into {@link RouteEventEngine}. */
export interface RouteEventInput {
  /** Current route source — `none` means no usable route yet. */
  source: 'mapbox' | 'fallback' | 'none';
  /** True while a reroute request is in flight. */
  rerouting: boolean;
  /** True when a reroute degraded to the straight-line fallback. */
  rerouteFailed: boolean;
  /** Distance (m) from the driver to the route polyline, or null if unknown. */
  metersToRoute: number | null;
  /** Straight-line distance (m) to the customer, or null if unknown. */
  metersToCustomer: number | null;
  /** Age (ms) of the most recent GPS fix, or null when no fix exists yet. */
  fixAgeMs: number | null;
  /** True when the last route fetch failed due to a network/offline error. */
  networkError: boolean;
  /**
   * Distance (m) to the NEXT turn-by-turn maneuver, or null when unknown / no
   * live step. Drives the pre-maneuver vibration cue.
   */
  metersToManeuver: number | null;
  /**
   * Stable identity of the upcoming maneuver (the active step index). Used to
   * fire the maneuver cue exactly once per step. null when there is no step.
   */
  maneuverStepIndex: number | null;
  /** True when the upcoming maneuver is a real turn/junction (not a plain continue). */
  maneuverIsActionable: boolean;
  /** Driver speed (m/s) if known, used to widen the warning distance at speed. */
  speedMps: number | null;
  /** Monotonic-ish timestamp for this snapshot (Date.now()). */
  now: number;
}

// ── Tuning constants ────────────────────────────────────────────────────────

/** Proximity bands (metres) for customer-approach cues. */
const BAND_300 = 300;
const BAND_100 = 100;
const BAND_50 = 50;
const BAND_25 = 25;

/**
 * A proximity band re-arms only once the driver is this multiple of the band
 * distance back away from it, so small GPS jitter near a threshold cannot make
 * the cue fire repeatedly.
 */
const REARM_FACTOR = 1.8;

/** Pre-maneuver warning distance (m) on normal roads. */
const MANEUVER_WARN_M = 120;
/** Wider warning distance (m) when the driver is moving fast. */
const MANEUVER_WARN_FAST_M = 200;
/** Speed (m/s, ~45 mph) above which the wider warning distance is used. */
const MANEUVER_FAST_SPEED_MPS = 20;

/** Distance the driver must stray from the route before "off route" fires. */
const OFF_ROUTE_M = 70;
/** Driver must be back within this to clear the off-route latch. */
const ON_ROUTE_M = 45;

/** No GPS fix for longer than this counts as "GPS waiting/weak". */
const GPS_WAIT_MS = 12_000;

/** Global minimum gap between any two emitted events (anti-stack). */
const MIN_EVENT_GAP_MS = 1_200;

/** Debounce for the rerouting edge so a flicker does not double-fire. */
const REROUTE_EDGE_DEBOUNCE_MS = 1_500;

interface ProximityLatch {
  band: number;
  event: RouteEventType;
  fired: boolean;
}

/**
 * Stateful detector. Create one per route session (per job). Call
 * {@link update} on each evaluation; it returns the events that became true on
 * THIS tick (usually zero or one).
 */
export class RouteEventEngine {
  private started = false;

  private prevRerouting = false;
  private prevRerouteFailed = false;
  private prevNetworkError = false;

  private offRouteLatched = false;
  private gpsWaitingLatched = false;
  /** Step index the maneuver cue has already fired for (fire once per step). */
  private maneuverFiredStep: number | null = null;
  /** True once we have emitted a "lost" event awaiting a matching restore. */
  private degraded = false;

  private lastEmitAt = 0;
  private lastReroutingEdgeAt = 0;

  private readonly proximity: ProximityLatch[] = [
    { band: BAND_300, event: 'near_customer_300m', fired: false },
    { band: BAND_100, event: 'near_customer_100m', fired: false },
    { band: BAND_50, event: 'prepare_stop_50m', fired: false },
    { band: BAND_25, event: 'arrived_zone_25m', fired: false },
  ];

  /** Reset all latches — call when the destination/session changes. */
  reset(): void {
    this.started = false;
    this.prevRerouting = false;
    this.prevRerouteFailed = false;
    this.prevNetworkError = false;
    this.offRouteLatched = false;
    this.gpsWaitingLatched = false;
    this.maneuverFiredStep = null;
    this.degraded = false;
    this.lastEmitAt = 0;
    this.lastReroutingEdgeAt = 0;
    for (const p of this.proximity) p.fired = false;
  }

  /**
   * Feed one snapshot. Returns events newly detected this tick, already
   * de-duplicated and rate-limited. Order is meaningful: connectivity first,
   * then route lifecycle, then proximity (closest band last).
   */
  update(input: RouteEventInput): RouteEventType[] {
    const out: RouteEventType[] = [];
    const hasRoute = input.source !== 'none';

    // ── Connectivity / GPS health ──
    if (input.networkError && !this.prevNetworkError) {
      out.push('connection_lost');
      this.degraded = true;
    } else if (!input.networkError && this.prevNetworkError && this.degraded) {
      out.push('route_restored');
      this.degraded = false;
    }
    this.prevNetworkError = input.networkError;

    const gpsWaiting = input.fixAgeMs == null || input.fixAgeMs > GPS_WAIT_MS;
    if (gpsWaiting && !this.gpsWaitingLatched) {
      this.gpsWaitingLatched = true;
      out.push('gps_waiting');
    } else if (!gpsWaiting && this.gpsWaitingLatched) {
      this.gpsWaitingLatched = false;
      // Quietly recovered — only announce restore if we had a network drop too.
    }

    // ── Route lifecycle ──
    if (!this.started && hasRoute && input.source === 'mapbox') {
      this.started = true;
      out.push('route_started');
    }

    // Rerouting edge (false -> true), debounced.
    if (input.rerouting && !this.prevRerouting) {
      if (input.now - this.lastReroutingEdgeAt > REROUTE_EDGE_DEBOUNCE_MS) {
        this.lastReroutingEdgeAt = input.now;
        out.push('rerouting');
      }
    }
    this.prevRerouting = input.rerouting;

    // Reroute failure edge.
    if (input.rerouteFailed && !this.prevRerouteFailed) {
      out.push('reroute_failed');
    }
    this.prevRerouteFailed = input.rerouteFailed;

    // Off-route latch with hysteresis (only meaningful on a real road route).
    if (
      input.source === 'mapbox' &&
      input.metersToRoute != null &&
      Number.isFinite(input.metersToRoute)
    ) {
      if (!this.offRouteLatched && input.metersToRoute > OFF_ROUTE_M) {
        this.offRouteLatched = true;
        out.push('off_route');
      } else if (this.offRouteLatched && input.metersToRoute < ON_ROUTE_M) {
        this.offRouteLatched = false;
      }
    }

    // Pre-maneuver warning — fires ONCE per step index as the driver closes in
    // on an actionable turn/junction/roundabout/merge/exit.
    if (
      input.maneuverStepIndex != null &&
      input.maneuverIsActionable &&
      input.metersToManeuver != null &&
      Number.isFinite(input.metersToManeuver)
    ) {
      const warnAt =
        input.speedMps != null && input.speedMps > MANEUVER_FAST_SPEED_MPS
          ? MANEUVER_WARN_FAST_M
          : MANEUVER_WARN_M;
      if (
        this.maneuverFiredStep !== input.maneuverStepIndex &&
        input.metersToManeuver <= warnAt
      ) {
        this.maneuverFiredStep = input.maneuverStepIndex;
        out.push('maneuver_approaching');
      }
    }

    // ── Proximity bands (once per session, re-arm on significant retreat) ──
    const dist = input.metersToCustomer;
    if (dist != null && Number.isFinite(dist)) {
      for (const latch of this.proximity) {
        if (!latch.fired && dist <= latch.band) {
          latch.fired = true;
          out.push(latch.event);
        } else if (latch.fired && dist > latch.band * REARM_FACTOR) {
          latch.fired = false;
        }
      }
    }

    if (out.length === 0) return out;

    // Global anti-stack: emit at most one event per MIN_EVENT_GAP window,
    // preferring the LAST (most urgent / closest) detected this tick.
    if (input.now - this.lastEmitAt < MIN_EVENT_GAP_MS) {
      return [];
    }
    this.lastEmitAt = input.now;
    return [out[out.length - 1]];
  }
}
