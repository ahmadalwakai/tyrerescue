import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  AccessibilityInfo,
  Easing,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DriverNavigationMap from '@/components/navigation/DriverNavigationMap';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import { driverApi, JobDetail, ApiError } from '@/api/client';
import { DriverPaymentCard } from '@/components/DriverPaymentCard';
import { LoadingScreen } from '@/components/LoadingScreen';
import { mediumHaptic, heavyHaptic, lightHaptic, successHaptic, maneuverHaptic } from '@/services/haptics';
import { playSound, stopAlertSound, type SoundEvent } from '@/services/sound';
import { useI18n } from '@/i18n';
import {
  getDriverPaymentDisplay,
  paymentToneColors,
} from '@/lib/payment-status';
import {
  formatJobTyreLinesSummary,
  getJobTyreLines,
  hasJobTyreDetails,
  totalJobTyreQuantity,
} from '@/lib/tyre-lines';
import { RouteEventEngine, type RouteEventType } from '@/lib/route-events';
import {
  Coordinates,
  DirectionsRoute,
  NavigationPhase,
  RouteError,
  RouteLane,
  RouteSource,
  RouteState,
  RouteStep,
  ARRIVAL_HERE_M,
  ARRIVAL_VERY_CLOSE_M,
  arrivalPhrase,
  fallbackGuidance,
  fetchReturnToGarageDirections,
  formatGuidanceDistance,
  GARAGE_LOCATION,
  haversineMeters,
  humanizeInstruction,
  isValidCoord,
  metersToMiles,
  secondsToMinutes,
} from '@/services/directions';
import { fetchProtectedJobDirections } from '@/services/protected-directions';
import {
  loadVoiceEnabled,
  setVoiceEnabled,
  speak as speakGuidance,
  stopVoice,
} from '@/services/voice';
import {
  armBackgroundLocationForJob,
  clearActiveBookingTracking,
} from '@/services/background-location';
import {
  buildWazeNavigationUrl,
  isValidNavigationCoordinate,
} from '@/lib/navigation/waze';
import { buildAppleMapsNavigationUrl } from '@/lib/navigation/apple-maps';
import {
  buildNavigationProgress,
  getManeuverShimmerSpec,
  splitInstructionRoadName,
  validateRouteGeometry,
  type NavigationProgress,
  type RerouteOrigin,
} from '@/lib/navigation/navigationProgress';
import {
  bearingDegrees,
  distanceToRouteMeters,
  snapPointToRoute,
} from '@/lib/navigation/routeGeometry';
import {
  emptyRouteDeviation, evaluateRouteDeviation, REROUTE_COOLDOWN_MS,
} from '@/lib/navigation/routeDeviation';
import { resolveCompassHeading } from '@/lib/navigation/heading';
import {
  getSmartDriverReminder,
  type SmartDriverReminder,
  type SmartReminderAction,
} from '@/lib/driver-smart-reminders';
import {
  createDriverGpsSimulator,
  type DriverLocationUpdate,
} from '@/lib/dev/driverGpsSimulator';
import {
  calculateJobTimeEstimate,
  formatDueBackTime,
  formatMinutesCompact,
  type JobTimeEstimate,
  type JobTimeGpsState,
} from '@/lib/navigation/jobTimeEstimate';

/** Big, unambiguous label for the primary cockpit action button (i18n keys). */
const NEXT_ACTION_LABEL: Record<string, string> = {
  driver_assigned: 'route.startDriving',
  en_route: 'route.markArrived',
  arrived: 'route.startWork',
  in_progress: 'route.completeJob',
};

/**
 * Clean a raw phone string into a dial-safe value (digits and a leading +).
 * Returns null when there is nothing usable so the call button can show an
 * empty state instead of crashing.
 */
function cleanPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 5) return null;
  return `${hasPlus ? '+' : ''}${digits}`;
}

// ── Tuning constants ────────────────────────────────────────────────────────
// Wake-lock tag for the navigation screen, so our lock is independent of any
// other keep-awake usage elsewhere in the app.
const KEEP_AWAKE_TAG = 'driver-route';
const JOB_POLL_INTERVAL_MS = 15_000;
// Refresh the road route only when the driver has moved meaningfully AND a
// minimum interval has elapsed — keeps the Directions API usage low.
const ROUTE_REFRESH_MIN_MOVE_M = 25;
const ROUTE_MIN_INTERVAL_MS = 8_000;
// Off-route / reroute.
const GPS_DRIFT_METERS = 35;
const OFF_ROUTE_METERS = 75;
const POOR_ACCURACY_METERS = 50;
const PROVISIONAL_ACCURACY_METERS = 100;
// Force a route refresh when the route is stale AND the driver has moved far.
const ROUTE_STALE_WHILE_MOVING_MS = 45_000;
const ROUTE_FORCE_REFRESH_MOVE_M = 120;
// Snap the displayed driver marker onto the route ONLY when the perpendicular
// drift from the raw GPS fix is within this many metres — i.e. normal GPS
// jitter while genuinely on the road. Beyond this the driver is treated as
// truly off-route and the raw fix is shown (so "Off route" reads honestly).
const SNAP_TO_ROUTE_MAX_DRIFT_M = OFF_ROUTE_METERS;
const STEP_MAX_PROGRESS_DRIFT_METERS = OFF_ROUTE_METERS;
// GPS is considered "weak" for the route-health pill after this many seconds
// without a fresh fix.
const GPS_WEAK_SECONDS = 12;
const ROUTE_INSTRUCTION_STALE_SECONDS = 45;
// How long the transient payment banner stays on screen.
const PAYMENT_BANNER_MS = 6_000;
// Cadence the smart route-event engine is evaluated at. Runs on a timer (not
// just per GPS fix) so stalled-GPS / connection events are still detected.
const ROUTE_EVENT_TICK_MS = 2_000;
// Bottom map padding (px) reserved for the cockpit sheet when framing the
// route, so the destination is never hidden behind the panel. The expanded
// sheet covers much more screen than the collapsed bar.
const COCKPIT_PAD_COLLAPSED = 280;
const COCKPIT_PAD_EXPANDED = 460;
const NAVIGATION_PROGRESS_STALE_MS = GPS_WEAK_SECONDS * 1000;
const ROUTE_ORIGIN_MAX_RAW_ACCURACY_M = POOR_ACCURACY_METERS;
const DEV_GPS_PANEL_STACK_HEIGHT = 188;
// ── Offline / weak-network handling ─────────────────────────────────────────
// While a network failure is latched we suppress reroute/refresh spam, but
// still allow ONE probe this often so recovery is detected without a busy loop.
const OFFLINE_RETRY_MS = 15_000;
// ── Monotonic GPS guard / adaptive accuracy ─────────────────────────────────
// A fix implying a speed above this (~168 mph) is treated as a teleport/stale
// outlier and rejected UNLESS the fix is highly accurate (genuine motorway).
const MAX_PLAUSIBLE_SPEED_MPS = 75;
const DEV_GPS_SPEEDS = [10, 20, 30, 50] as const;
type DevGpsSpeedMph = (typeof DEV_GPS_SPEEDS)[number];
const DEV_GPS_LOST_MS = 30_000;
const DEV_GPS_BACKEND_MIN_INTERVAL_MS = 9_000;
const DEV_GPS_TERMINAL_STATUSES = new Set([
  'completed',
  'cancelled',
  'cancelled_refund_pending',
  'refunded',
  'refunded_partial',
]);
const MAP_LOAD_WATCHDOG_MS = Platform.OS === 'ios' ? 12_000 : 8_000;
// ── Auto "mark arrived" prompt ──────────────────────────────────────────────
// Suggest marking arrived when within this distance of the customer and the
// driver has been essentially stationary for the dwell period below.
const ARRIVAL_PROMPT_M = 50;
const ARRIVAL_PROMPT_SPEED_MPS = 1.5;
const ARRIVAL_PROMPT_DWELL_MS = 6_000;

/**
 * Map a smart route event to its in-app cue. Sounds are the subtle, NON-urgent
 * cockpit cues only — they never reuse the full-screen new-job alert. Some
 * events are intentionally silent (visual-only) so the driver is never nagged.
 */
const ROUTE_EVENT_CUES: Record<
  RouteEventType,
  { sound: SoundEvent | null; haptic: 'light' | 'medium' | 'success' | 'maneuver' | null }
> = {  route_started: { sound: null, haptic: 'light' },
  rerouting: { sound: 'route_rerouting', haptic: 'light' },
  reroute_failed: { sound: 'route_warning', haptic: 'medium' },
  off_route: { sound: 'route_warning', haptic: 'medium' },
  maneuver_approaching: { sound: null, haptic: 'maneuver' },
  near_customer_300m: { sound: null, haptic: null },
  near_customer_100m: { sound: 'near_customer', haptic: 'light' },
  prepare_stop_50m: { sound: null, haptic: 'light' },
  arrived_zone_25m: { sound: 'arrived_zone', haptic: 'medium' },
  gps_waiting: { sound: null, haptic: null },
  connection_lost: { sound: 'route_warning', haptic: 'medium' },
  route_restored: { sound: null, haptic: 'light' },
};

/**
 * Short spoken phrase (i18n key) for the subset of route events worth voicing.
 * `null` = never spoken aloud. Turn-by-turn maneuver instructions are voiced
 * separately (per active step) so `maneuver_approaching` stays null here to
 * avoid double-speaking. Speech is debounced + mutable inside the voice service.
 */
const ROUTE_EVENT_VOICE: Record<RouteEventType, string | null> = {
  route_started: 'route.voiceStarted',
  rerouting: 'route.voiceRerouting',
  reroute_failed: null,
  off_route: 'route.voiceOffRoute',
  maneuver_approaching: null,
  near_customer_300m: null,
  near_customer_100m: 'route.voiceNearCustomer',
  prepare_stop_50m: null,
  arrived_zone_25m: 'route.voiceArrived',
  gps_waiting: null,
  connection_lost: null,
  route_restored: null,
};

// Native map styling is separate from the existing road-directions provider.
const NAV_ROUTE_BLUE = '#1A73E8';
const ROUTE_VISUAL_VERSION = 'authoritative-live-route-v6';
const FOLLOW_ZOOM_URBAN_MIN = 17.05;
const FOLLOW_ZOOM_URBAN_MAX = 17.85;
const FOLLOW_ZOOM_MOTORWAY_MIN = 16.25;
const FOLLOW_ZOOM_MOTORWAY_MAX = 16.85;
const FOLLOW_ZOOM_NEAR_MANEUVER = 18.05;
const FOLLOW_ZOOM_2D = 17.25;
const FOLLOW_ZOOM_3D = 17.45;

/**
 * Camera behaviour while navigating.
 * - `north_up`   — map fixed to north, marker rotates to heading.
 * - `heading_up` — map rotates so travel direction is up (default driving).
 * - `overview`   — whole route framed, camera does not chase the driver.
 */
export type FollowMode = 'north_up' | 'heading_up' | 'overview';
type MapDepthMode = '2d' | '3d';
type MapStyleMode = 'streets' | 'satellite';

type RoutePreferences = {
  motorways: boolean;
  tolls: boolean;
  ferries: boolean;
};

type RouteOptionLabel = 'Fastest' | 'Avoid motorways' | 'Balanced';

type RouteOption = {
  id: string;
  index: number;
  label: RouteOptionLabel;
  coordinates: [number, number][];
  distanceMiles: number;
  durationMinutes: number;
  trafficDurationMinutes?: number;
  trafficDelayMinutes?: number;
  congestion?: unknown;
  warnings: string[];
  avoids?: {
    motorways?: boolean;
    tolls?: boolean;
    ferries?: boolean;
  };
};

type DriverFixSource = 'last-known' | 'watch' | 'dev-simulator' | 'tracking-fallback';
type DriverFixQuality = 'accepted' | 'provisional';
type NavigationLocationState =
  | 'requesting'
  | 'permission-denied'
  | 'unavailable'
  | 'weak'
  | 'accepted'
  | 'stale'
  | 'error';

type AcceptedDriverFix = {
  coordinate: Coordinates;
  timestampMs: number;
  accuracyMeters: number | null;
  heading: number | null;
  speedMps: number | null;
  source: DriverFixSource;
  quality: DriverFixQuality;
};

type TrackingRouteFallback = Awaited<ReturnType<typeof driverApi.getTrackingData>> & {
  driverLocationAt?: string | null;
  routeCoordinates?: [number, number][] | null;
  estimatedArrivalAt?: string | null;
  distanceMiles?: number | null;
};

type ReturnRouteEstimateState = {
  key: string | null;
  loading: boolean;
  durationMinutes: number | null;
  trafficDelayMinutes: number | null;
  error: 'missing-garage' | 'failed' | null;
  calculatedAt: number | null;
};

const DEFAULT_ROUTE_PREFERENCES: RoutePreferences = {
  motorways: false,
  tolls: false,
  ferries: false,
};

const INITIAL_RETURN_ROUTE_ESTIMATE_STATE: ReturnRouteEstimateState = {
  key: null,
  loading: false,
  durationMinutes: null,
  trafficDelayMinutes: null,
  error: null,
  calculatedAt: null,
};

const INITIAL_ROUTE_STATE: RouteState = {
  source: 'none',
  routes: [],
  selectedIndex: 0,
  geometry: null,
  distanceMeters: null,
  durationSeconds: null,
  steps: [],
  congestion: null,
  destinationSnap: null,
  routeJobRef: null,
  routeDestinationKey: null,
  routeCalculatedAt: null,
  routeOriginFixAt: null,
  error: null,
  loading: false,
};

function coordKey(coord: Coordinates | null): string | null {
  return coord ? `${coord.lat.toFixed(6)},${coord.lng.toFixed(6)}` : null;
}

function lngLatToCoordinates(coord: [number, number] | null | undefined): Coordinates | null {
  if (!coord || coord.length < 2) return null;
  const c = { lng: coord[0], lat: coord[1] };
  return isValidCoord(c) ? c : null;
}

function formatCoordForDebug(coord: Coordinates | null): string {
  return coord ? `${coord.lat.toFixed(6)},${coord.lng.toFixed(6)}` : 'n/a';
}

function logRouteDiagnostic(event: string, details: Record<string, unknown> = {}): void {
  if (!__DEV__) return;
  const redacted = Object.fromEntries(
    Object.entries(details).map(([key, value]) => {
      if (key.toLowerCase().includes('coord')) return [key, '[coord]'];
      return [key, value];
    }),
  );
  console.info('[route-nav]', event, redacted);
}

function routePreferencesKey(preferences: RoutePreferences): string {
  return [
    preferences.motorways ? 'no-motorways' : 'motorways',
    preferences.tolls ? 'no-tolls' : 'tolls',
    preferences.ferries ? 'no-ferries' : 'ferries',
  ].join('|');
}

function getMapboxToken(): string {
  return (process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '').trim();
}

/**
 * Build a {@link RouteState} whose flat convenience fields mirror the currently
 * selected route. Keeps the array of alternatives intact for the chips/map
 * while the render code keeps reading `geometry`/`steps`/etc. directly.
 */
function makeRouteState(
  source: RouteSource,
  routes: DirectionsRoute[],
  selectedIndex: number,
  error: RouteError | null,
  meta: {
    routeJobRef?: string | null;
    routeDestinationKey?: string | null;
    routeCalculatedAt?: number | null;
    routeOriginFixAt?: number | null;
  } = {},
): RouteState {
  const idx = routes[selectedIndex] ? selectedIndex : 0;
  const sel = routes[idx] ?? null;
  return {
    source,
    routes,
    selectedIndex: idx,
    geometry: sel ? sel.geometry : null,
    distanceMeters: sel ? sel.distanceMeters : null,
    durationSeconds: sel ? sel.durationSeconds : null,
    steps: sel ? sel.steps : [],
    congestion: sel ? sel.congestion : null,
    destinationSnap: sel ? sel.destinationSnap : null,
    routeJobRef: meta.routeJobRef ?? null,
    routeDestinationKey: meta.routeDestinationKey ?? null,
    routeCalculatedAt: meta.routeCalculatedAt ?? null,
    routeOriginFixAt: meta.routeOriginFixAt ?? null,
    error,
    loading: false,
  };
}

function parseTrackingTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(parsed, Date.now());
}

function geometryDistanceMeters(geometry: [number, number][]): number {
  let total = 0;
  for (let index = 1; index < geometry.length; index += 1) {
    const prev = lngLatToCoordinates(geometry[index - 1]);
    const next = lngLatToCoordinates(geometry[index]);
    if (prev && next) total += haversineMeters(prev, next);
  }
  return total;
}

function makeTrackingFallbackRoute(
  tracking: TrackingRouteFallback,
  destination: Coordinates,
): DirectionsRoute | null {
  const geometry = Array.isArray(tracking.routeCoordinates)
    ? tracking.routeCoordinates.filter((coord): coord is [number, number] =>
        Array.isArray(coord) &&
        coord.length >= 2 &&
        Number.isFinite(coord[0]) &&
        Number.isFinite(coord[1]) &&
        isValidCoord({ lng: coord[0], lat: coord[1] }),
      )
    : [];
  if (geometry.length < 2) return null;
  const first = lngLatToCoordinates(geometry[0]);
  if (!first) return null;
  const distanceMeters =
    typeof tracking.distanceMiles === 'number' && Number.isFinite(tracking.distanceMiles)
      ? tracking.distanceMiles * 1609.344
      : geometryDistanceMeters(geometry);
  const durationSeconds =
    typeof tracking.etaMinutes === 'number' && Number.isFinite(tracking.etaMinutes)
      ? Math.max(0, Math.round(tracking.etaMinutes * 60))
      : 0;
  const route: DirectionsRoute = {
    geometry,
    distanceMeters,
    durationSeconds,
    trafficDurationSeconds: null,
    typicalDurationSeconds: null,
    steps: [],
    congestion: null,
    maxspeeds: null,
    roadClasses: {
      motorways: false,
      tolls: false,
      ferries: false,
    },
    destinationSnap: geometry[geometry.length - 1] ?? [destination.lng, destination.lat],
  };
  const validation = validateRouteGeometry({ route, origin: first, destination });
  return validation.ok ? route : null;
}

function trafficMinutes(route: DirectionsRoute): {
  trafficDurationMinutes?: number;
  trafficDelayMinutes?: number;
} {
  if (
    route.trafficDurationSeconds == null ||
    route.typicalDurationSeconds == null
  ) {
    return {};
  }
  const trafficDurationMinutes = secondsToMinutes(route.trafficDurationSeconds);
  const trafficDelayMinutes = Math.max(
    0,
    Math.round((route.trafficDurationSeconds - route.typicalDurationSeconds) / 60),
  );
  return { trafficDurationMinutes, trafficDelayMinutes };
}

function buildRouteOption(
  route: DirectionsRoute,
  index: number,
  preferences: RoutePreferences,
): RouteOption {
  const traffic = trafficMinutes(route);
  const warnings: string[] = [];
  if (!preferences.motorways && route.roadClasses.motorways) {
    warnings.push('May include motorway');
  }
  if (!preferences.tolls && route.roadClasses.tolls) {
    warnings.push('May include toll road');
  }
  if (!preferences.ferries && route.roadClasses.ferries) {
    warnings.push('May include ferry');
  }

  return {
    id: `${index}:${route.geometry.length}:${route.distanceMeters.toFixed(0)}`,
    index,
    label:
      index === 0
        ? preferences.motorways
          ? 'Avoid motorways'
          : 'Fastest'
        : 'Balanced',
    coordinates: route.geometry,
    distanceMiles: metersToMiles(route.distanceMeters),
    durationMinutes: secondsToMinutes(route.durationSeconds),
    ...traffic,
    congestion: route.congestion ?? undefined,
    warnings,
    avoids: {
      motorways: preferences.motorways,
      tolls: preferences.tolls,
      ferries: preferences.ferries,
    },
  };
}

type RouteMeasure = {
  alongMeters: number;
  distanceMeters: number;
  segmentIndex: number;
};

function measurePointAlongRoute(
  point: Coordinates,
  routeCoordinates: [number, number][] | null,
): RouteMeasure | null {
  if (!isValidCoord(point) || !routeCoordinates || routeCoordinates.length < 2) {
    return null;
  }
  const snap = snapPointToRoute(point, routeCoordinates);
  if (!snap || snap.segmentIndex < 0) return null;

  let alongMeters = 0;
  for (let i = 0; i < snap.segmentIndex; i += 1) {
    const a = lngLatToCoordinates(routeCoordinates[i]);
    const b = lngLatToCoordinates(routeCoordinates[i + 1]);
    if (a && b) alongMeters += haversineMeters(a, b);
  }
  const segmentStart = lngLatToCoordinates(routeCoordinates[snap.segmentIndex]);
  if (segmentStart) {
    alongMeters += haversineMeters(segmentStart, snap.point);
  }

  return {
    alongMeters,
    distanceMeters: snap.distanceMeters,
    segmentIndex: snap.segmentIndex,
  };
}

function routeDistanceToStep(
  driver: Coordinates | null,
  step: RouteStep | null,
  routeCoordinates: [number, number][] | null,
): number | null {
  if (!driver || !step || !routeCoordinates || routeCoordinates.length < 2) {
    return null;
  }
  const stepPoint = { lng: step.location[0], lat: step.location[1] };
  if (!isValidCoord(stepPoint)) return null;
  const driverMeasure = measurePointAlongRoute(driver, routeCoordinates);
  const stepMeasure = measurePointAlongRoute(stepPoint, routeCoordinates);
  if (
    !driverMeasure ||
    !stepMeasure ||
    driverMeasure.distanceMeters > STEP_MAX_PROGRESS_DRIFT_METERS
  ) {
    return null;
  }
  return Math.max(0, stepMeasure.alongMeters - driverMeasure.alongMeters);
}

/**
 * Whether a maneuver is a real, vibration-worthy event (a bend, junction,
 * roundabout, merge, ramp, exit or arrival) rather than a plain "carry on".
 */
function isActionableManeuver(step: RouteStep): boolean {
  const type = step.maneuverType;
  const mod = step.maneuverModifier ?? '';
  const actionable = [
    'turn',
    'fork',
    'merge',
    'on ramp',
    'off ramp',
    'roundabout',
    'rotary',
    'roundabout turn',
    'exit roundabout',
    'exit rotary',
    'end of road',
    'arrive',
  ];
  if (actionable.includes(type)) return true;
  if (type === 'continue' && mod.length > 0 && mod !== 'straight') return true;
  return false;
}

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/** Map a Mapbox maneuver to a directional icon for the guidance card. */
function maneuverIcon(step: RouteStep): IoniconName {
  const type = step.maneuverType;
  const mod = step.maneuverModifier ?? '';
  if (type === 'arrive') return 'flag';
  if (type === 'depart') return 'navigate';
  if (type === 'fork') return mod.includes('left') ? 'git-branch-outline' : 'git-branch';
  if (type === 'on ramp' || type === 'off ramp') return 'trail-sign-outline';
  if (type === 'roundabout' || type === 'rotary' || type === 'roundabout turn') {
    return 'sync';
  }
  if (type === 'exit roundabout' || type === 'exit rotary') return 'exit-outline';
  if (type === 'merge') return 'git-merge';
  if (mod.includes('uturn')) return 'arrow-undo';
  if (mod.includes('left')) return 'arrow-back';
  if (mod.includes('right')) return 'arrow-forward';
  return 'arrow-up';
}

function laneIndicationIcon(lane: RouteLane): IoniconName {
  const indication = lane.validIndication ?? lane.indications[0] ?? 'straight';
  if (indication.includes('uturn')) return 'arrow-undo';
  if (indication.includes('left')) return 'arrow-back';
  if (indication.includes('right')) return 'arrow-forward';
  return 'arrow-up';
}

function roadClassLabel(roadClass: string | null | undefined): string | null {
  if (!roadClass) return null;
  if (roadClass.includes('motorway')) return 'Motorway';
  if (roadClass.includes('trunk')) return 'Trunk road';
  if (roadClass.includes('primary')) return 'Primary road';
  if (roadClass.includes('secondary')) return 'Secondary road';
  if (roadClass.includes('tertiary')) return 'Local road';
  return roadClass.replace(/_/g, ' ');
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isMotorwayLikeRoadClass(roadClass: string | null | undefined): boolean {
  if (!roadClass) return false;
  return /motorway|trunk/.test(roadClass);
}

function navigationFollowZoom(params: {
  mapDepthMode: MapDepthMode;
  roadClass: string | null;
  speedMps: number | null;
  distanceToManeuverMeters: number | null;
}): number {
  const depthFloor = params.mapDepthMode === '3d' ? FOLLOW_ZOOM_3D : FOLLOW_ZOOM_2D;
  if (
    typeof params.distanceToManeuverMeters === 'number' &&
    Number.isFinite(params.distanceToManeuverMeters) &&
    params.distanceToManeuverMeters >= 0 &&
    params.distanceToManeuverMeters <= 90
  ) {
    return FOLLOW_ZOOM_NEAR_MANEUVER;
  }

  const speed = clampNumber(
    typeof params.speedMps === 'number' && Number.isFinite(params.speedMps)
      ? params.speedMps
      : 0,
    0,
    34,
  );
  if (isMotorwayLikeRoadClass(params.roadClass)) {
    const ratio = speed / 34;
    return clampNumber(
      FOLLOW_ZOOM_MOTORWAY_MAX - (FOLLOW_ZOOM_MOTORWAY_MAX - FOLLOW_ZOOM_MOTORWAY_MIN) * ratio,
      FOLLOW_ZOOM_MOTORWAY_MIN,
      Math.max(FOLLOW_ZOOM_MOTORWAY_MAX, depthFloor),
    );
  }

  const urbanTarget = FOLLOW_ZOOM_URBAN_MAX - Math.min(0.5, speed * 0.024);
  return clampNumber(
    Math.max(depthFloor, urbanTarget),
    FOLLOW_ZOOM_URBAN_MIN,
    FOLLOW_ZOOM_URBAN_MAX,
  );
}

type RoundaboutDiagramBranch = {
  key: string;
  bearing: number;
  selected: boolean;
  incoming: boolean;
  allowed: boolean;
};

function isRoundaboutStep(step: RouteStep | null | undefined): boolean {
  const type = step?.maneuverType ?? '';
  return (
    type === 'roundabout' ||
    type === 'rotary' ||
    type === 'roundabout turn' ||
    type === 'exit roundabout' ||
    type === 'exit rotary'
  );
}

function roundaboutDiagramBranches(step: RouteStep | null): RoundaboutDiagramBranch[] {
  if (!step || !isRoundaboutStep(step)) return [];
  const intersection =
    step.intersections.find((candidate) => candidate.bearings.length > 0 && candidate.outIndex != null) ??
    step.intersections.find((candidate) => candidate.bearings.length > 0);
  if (intersection && intersection.bearings.length > 0) {
    return intersection.bearings.map((bearing, index) => ({
      key: `bearing-${index}-${bearing}`,
      bearing,
      selected: intersection.outIndex === index,
      incoming: intersection.inIndex === index,
      allowed: intersection.entry[index] !== false,
    }));
  }

  const exitCount = Math.max(3, Math.min(6, step.exit ?? 3));
  const selectedIndex = Math.max(0, Math.min(exitCount - 1, (step.exit ?? 1) - 1));
  return Array.from({ length: exitCount }, (_, index) => ({
    key: `exit-${index + 1}`,
    bearing: (360 / exitCount) * index,
    selected: index === selectedIndex,
    incoming: index === 0,
    allowed: true,
  }));
}

function parseLatLng(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

const STATUS_ACTIONS: Record<string, { next: string; key: string }> = {
  driver_assigned: { next: 'en_route', key: 'startEnRoute' },
  en_route: { next: 'arrived', key: 'markArrived' },
  arrived: { next: 'in_progress', key: 'startWork' },
  in_progress: { next: 'completed', key: 'completeJob' },
};

const STATUS_PROGRESS: Record<string, number> = {
  driver_assigned: 1,
  en_route: 2,
  arrived: 3,
  in_progress: 4,
  completed: 5,
};

const STATUS_TIMESTAMP_FIELD: Partial<Record<string, keyof JobDetail>> = {
  en_route: 'enRouteAt',
  arrived: 'arrivedAt',
  in_progress: 'inProgressAt',
  completed: 'completedAt',
};

function hasReachedStatus(currentStatus: string | null | undefined, targetStatus: string): boolean {
  const currentRank = currentStatus ? STATUS_PROGRESS[currentStatus] : undefined;
  const targetRank = STATUS_PROGRESS[targetStatus];
  return currentRank != null && targetRank != null && currentRank >= targetRank;
}

function applyLocalStatus(job: JobDetail, nextStatus: string): JobDetail {
  const updated: JobDetail = { ...job, status: nextStatus };
  const timestampField = STATUS_TIMESTAMP_FIELD[nextStatus];
  if (timestampField && updated[timestampField] == null) {
    (updated as unknown as Record<string, unknown>)[timestampField] = new Date().toISOString();
  }
  return updated;
}

export default function JobRouteScreen() {
  const { ref, devGps } = useLocalSearchParams<{ ref: string; devGps?: string }>();
  const router = useRouter();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const token = useMemo(() => getMapboxToken(), []);
  const currentRouteJobRef = typeof ref === 'string' && ref.length > 0 ? ref : null;
  const devGpsParam = Array.isArray(devGps) ? devGps[0] : devGps;
  const devGpsAllowed = process.env.NODE_ENV !== 'production' && devGpsParam === '1';

  useEffect(() => {
    if (!currentRouteJobRef) return;
    armBackgroundLocationForJob(currentRouteJobRef).catch(() => false);
  }, [currentRouteJobRef]);

  const [job, setJob] = useState<JobDetail | null>(null);
  const [trackingCustomerCoord, setTrackingCustomerCoord] = useState<Coordinates | null>(null);
  const [driverLoc, setDriverLoc] = useState<Coordinates | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [navigationLocationState, setNavigationLocationState] =
    useState<NavigationLocationState>('requesting');
  const [permRetry, setPermRetry] = useState(0);
  const [actioning, setActioning] = useState(false);

  const [routeState, setRouteState] = useState<RouteState>(INITIAL_ROUTE_STATE);
  const [phase, setPhase] = useState<NavigationPhase>('preview');
  const [isFollowingDriver, setIsFollowingDriver] = useState(true);
  const [followMode, setFollowMode] = useState<FollowMode>('heading_up');
  const [mapDepthMode, setMapDepthMode] = useState<MapDepthMode>('3d');
  const [mapStyleMode, setMapStyleMode] = useState<MapStyleMode>('streets');
  // Bumped on recenter / follow-mode change to authorise a one-off camera zoom
  // reset in the native map. Plain GPS fixes keep the same epoch (no auto-zoom).
  const [cameraEpoch, setCameraEpoch] = useState(0);
  const [, setRouteSequence] = useState(0);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const [routeScreenAppState, setRouteScreenAppState] =
    useState<'active' | 'background' | 'inactive'>(
      AppState.currentState === 'active'
        ? 'active'
        : AppState.currentState === 'background'
          ? 'background'
          : 'inactive',
    );
  // Collapsible bottom cockpit so the map can occupy the full screen.
  // Default to COLLAPSED so the map is the dominant full-screen visual and the
  // bottom panel is only a small floating bar (status + ETA + action).
  const [cockpitCollapsed, setCockpitCollapsed] = useState(true);
  const [rerouting, setRerouting] = useState(false);
  const [, setCurrentStepIndex] = useState(0);
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);
  const [compass, setCompass] = useState<{ heading: number | null; at: number } | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  // Auto "mark arrived" suggestion (Phase A). A non-blocking prompt shown when
  // the driver is parked at the customer — it NEVER changes status by itself.
  const [showArrivalPrompt, setShowArrivalPrompt] = useState(false);
  // Transient cockpit banner (e.g. "Payment received") shown over the map.
  const [paymentBanner, setPaymentBanner] = useState<string | null>(null);
  // Spoken voice-guidance mute toggle (persisted). Default ON for safety;
  // the persisted preference (if any) is applied on mount.
  const [voiceEnabled, setVoiceEnabledState] = useState(true);
  // Inline error for the arrival status update (replaces Alert.alert so the
  // driver sees it in context rather than a modal that blocks the map).
  const [arrivalError, setArrivalError] = useState<string | null>(null);
  const [routePreferences, setRoutePreferences] = useState<RoutePreferences>(
    DEFAULT_ROUTE_PREFERENCES,
  );
  const [returnRouteEstimate, setReturnRouteEstimate] =
    useState<ReturnRouteEstimateState>(INITIAL_RETURN_ROUTE_ESTIMATE_STATE);
  const [routeDeviation, setRouteDeviation] = useState<{
    kind: 'gps-drift' | 'off-route';
    distanceMeters: number;
    recalculating: boolean;
  } | null>(null);
  const [devGpsRunning, setDevGpsRunning] = useState(false);
  const [devGpsPaused, setDevGpsPaused] = useState(false);
  const [devGpsSpeedMph, setDevGpsSpeedMph] = useState<DevGpsSpeedMph>(20);
  const [devGpsWeak, setDevGpsWeak] = useState(false);
  const [devGpsLostUntil, setDevGpsLostUntil] = useState<number | null>(null);
  const [devGpsError, setDevGpsError] = useState<string | null>(null);
  const [devGpsLastUpdate, setDevGpsLastUpdate] = useState<DriverLocationUpdate | null>(null);
  const devGpsTerminal = job?.status ? DEV_GPS_TERMINAL_STATUSES.has(job.status) : false;

  // ── Pre-job safety checklist (shown before driver_assigned → en_route) ──
  const [showPreJobChecklist, setShowPreJobChecklist] = useState(false);
  const [preJobChecks, setPreJobChecks] = useState({
    tyreSizeChecked: false,
    addressChecked: false,
    paymentChecked: false,
  });

  // ── Completion checklist (shown before in_progress → completed) ──
  const [showCompletionChecklist, setShowCompletionChecklist] = useState(false);
  const [completionChecks, setCompletionChecks] = useState({
    tyreFitted: false,
    wheelNuts: false,
    customerInformed: false,
    paymentChecked: false,
  });
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completionActioning, setCompletionActioning] = useState(false);

  // ── Smart driver reminder ──
  const [activeReminder, setActiveReminder] = useState<SmartDriverReminder | null>(null);

  // Map lifecycle state, keyed to the current native map instance so a remount
  // (status change / retry / watchdog) implicitly resets to "loading".
  const [mapStatus, setMapStatus] = useState<{
    key: string;
    phase: 'loading' | 'loaded' | 'fatal';
  }>({ key: '', phase: 'loading' });
  const [mapReloadKey, setMapReloadKey] = useState(0);

  // ── Refs (stable across renders / used inside async callbacks) ──
  const mapDiagRef = useRef('');
  const maneuverShimmer = useRef(new Animated.Value(0)).current;
  const routeAbortRef = useRef<AbortController | null>(null);
  const routeRequestSeqRef = useRef(0);
  const returnRouteAbortRef = useRef<AbortController | null>(null);
  const destinationRef = useRef<Coordinates | null>(null);
  const driverLocRef = useRef<Coordinates | null>(null);
  const driverFixRef = useRef<AcceptedDriverFix | null>(null);
  const lastAcceptedDriverFixRef = useRef<AcceptedDriverFix | null>(null);
  const navigationLocationStateRef = useRef<NavigationLocationState>('requesting');
  // Heading/speed/accuracy derived from the GPS stream, read by the camera
  // push effect (kept in refs so a fix doesn't force the effect to re-subscribe).
  const headingRef = useRef<number | null>(null);
  const speedRef = useRef<number | null>(null);
  const accuracyRef = useRef<number | null>(null);
  const prevLocRef = useRef<Coordinates | null>(null);
  const routeStateRef = useRef<RouteState>(INITIAL_ROUTE_STATE);
  const routeSequenceRef = useRef(0);
  const currentRouteRevisionRef = useRef('');
  const navigationProgressRef = useRef<NavigationProgress | null>(null);
  const phaseRef = useRef<NavigationPhase>('preview');
  const stepIndexRef = useRef(0);
  const lastRouteOriginRef = useRef<Coordinates | null>(null);
  const lastRouteAtRef = useRef<number>(0);
  const deviationStateRef = useRef(emptyRouteDeviation());
  const lastOffRouteRerouteAtRef = useRef<number>(0);
  const routePreferencesRef = useRef<RoutePreferences>(DEFAULT_ROUTE_PREFERENCES);
  // Timestamp (Date.now) of the last route fetch that failed for NETWORK
  // reasons; 0 means "online". While set we keep the last good route on screen
  // and suppress reroute/refresh spam (one probe per OFFLINE_RETRY_MS only).
  const networkFailRef = useRef<number>(0);
  // Monotonic GPS guard: timestamp (ms, from the OS fix) of the last displayed
  // fix, and the last fix we actually PROCESSED (used to throttle when parked).
  const lastFixTimeRef = useRef<number>(0);
  const lastProcessedFixTimeRef = useRef<number>(0);
  const fitPendingRef = useRef(false);
  const hasRequestedRef = useRef(false);
  const recoveryAttemptsRef = useRef(0);
  const actionLockRef = useRef(false);
  const extNavLockRef = useRef(false);
  const wazeNavLockRef = useRef(false);
  const handlersRef = useRef<{ onFix: (c: Coordinates) => void }>({ onFix: () => {} });
  const devGpsSimulatorRef = useRef<ReturnType<typeof createDriverGpsSimulator> | null>(null);
  const devGpsActiveRef = useRef(false);
  const devGpsInFlightRef = useRef(false);
  const devGpsNextSendAtRef = useRef(0);
  const devGpsLostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const devGpsRouteRevRef = useRef<string>('');
  const devGpsPauseOnRouteChangeRef = useRef(false);
  // Phase 2 intelligence layer: smart route-event engine + mirror refs read
  // from the evaluation timer (kept in refs so the timer never re-subscribes).
  const engineRef = useRef(new RouteEventEngine());
  const reroutingRef = useRef(false);
  const lastFixAtRef = useRef<number | null>(null);
  const prevPayStatusRef = useRef<{ jobRef: string; paid: boolean } | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Voice guidance: the step index last spoken aloud, so a maneuver is voiced
  // exactly once as it becomes active (not repeated on every GPS tick).
  const spokenStepRef = useRef<number>(-1);
  const voiceEnabledRef = useRef(true);
  const localeRef = useRef<'en' | 'ar'>('en');
  // Current job status mirrored into a ref so the timer-driven arrival check
  // can read it without re-subscribing.
  const jobStatusRef = useRef<string | null>(null);
  // Auto-arrival prompt latches: when the parked-at-customer condition first
  // became true, and whether the driver already acted on/dismissed the prompt
  // this session (so it is shown at most once unless they drive away first).
  const arrivalDwellSinceRef = useRef<number | null>(null);
  const arrivalPromptDismissedRef = useRef(false);
  const showArrivalPromptRef = useRef(false);

  // Mirror job to a ref so the 2-second timer can read it without re-subscribing.
  const jobRef = useRef<JobDetail | null>(null);
  // Cooldown tracking: maps reminder id → timestamp when it was dismissed.
  const reminderDismissedRef = useRef<Record<string, number>>({});
  // Mirror active reminder id so the timer can compare without state reads.
  const activeReminderIdRef = useRef<string | null>(null);
  // Follow mode mirrored to a ref so requestRoute can read it without closure stale issues.
  const followModeRef = useRef<FollowMode>('heading_up');

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotionEnabled(enabled);
      })
      .catch(() => {});
    const motionSub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );
    const appSub = AppState.addEventListener('change', (next) => {
      setRouteScreenAppState(
        next === 'active' ? 'active' : next === 'background' ? 'background' : 'inactive',
      );
    });
    return () => {
      mounted = false;
      motionSub.remove();
      appSub.remove();
    };
  }, []);
  useEffect(() => { routeStateRef.current = routeState; }, [routeState]);
  useEffect(() => { followModeRef.current = followMode; }, [followMode]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { reroutingRef.current = rerouting; }, [rerouting]);
  useEffect(() => { lastFixAtRef.current = lastFixAt; }, [lastFixAt]);
  useEffect(() => { navigationLocationStateRef.current = navigationLocationState; }, [navigationLocationState]);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);
  useEffect(() => { localeRef.current = locale === 'ar' ? 'ar' : 'en'; }, [locale]);
  useEffect(() => { jobStatusRef.current = job?.status ?? null; }, [job?.status]);
  useEffect(() => { showArrivalPromptRef.current = showArrivalPrompt; }, [showArrivalPrompt]);
  useEffect(() => { routePreferencesRef.current = routePreferences; }, [routePreferences]);

  const acceptDriverFix = useCallback(
    (params: {
      coordinate: Coordinates;
      timestampMs?: number | null;
      accuracyMeters?: number | null;
      heading?: number | null;
      speedMps?: number | null;
      source: DriverFixSource;
    }): AcceptedDriverFix | null => {
      const coordinate = params.coordinate;
      const now = Date.now();
      const timestampMs =
        typeof params.timestampMs === 'number' &&
        Number.isFinite(params.timestampMs) &&
        params.timestampMs > 0
          ? params.timestampMs
          : now;
      const accuracyMeters =
        typeof params.accuracyMeters === 'number' &&
        Number.isFinite(params.accuracyMeters) &&
        params.accuracyMeters >= 0
          ? params.accuracyMeters
          : null;
      const speedMps =
        typeof params.speedMps === 'number' &&
        Number.isFinite(params.speedMps) &&
        params.speedMps >= 0
          ? params.speedMps
          : null;
      const gpsHeading =
        typeof params.heading === 'number' &&
        Number.isFinite(params.heading) &&
        params.heading >= 0
          ? params.heading
          : null;
      const ageMs = now - timestampMs;

      logRouteDiagnostic('gps-fix-received', {
        source: params.source,
        ageMs,
        accuracyMeters,
        speedMps,
      });

      if (!isValidCoord(coordinate)) {
        logRouteDiagnostic('gps-fix-rejected', {
          reason: 'invalid-coordinate',
          source: params.source,
        });
        return null;
      }

      if (ageMs < 0 || ageMs > NAVIGATION_PROGRESS_STALE_MS) {
        logRouteDiagnostic('gps-fix-rejected', {
          reason: 'stale',
          source: params.source,
          ageMs,
          accuracyMeters,
        });
        setNavigationLocationState('stale');
        return null;
      }

      const quality: DriverFixQuality =
        accuracyMeters != null && accuracyMeters <= ROUTE_ORIGIN_MAX_RAW_ACCURACY_M
          ? 'accepted'
          : 'provisional';
      const provisionalAccuracyAllowed =
        accuracyMeters == null || accuracyMeters <= PROVISIONAL_ACCURACY_METERS;
      if (quality === 'provisional' && !provisionalAccuracyAllowed) {
        logRouteDiagnostic('gps-fix-rejected', {
          reason: 'accuracy',
          source: params.source,
          ageMs,
          accuracyMeters,
        });
        setNavigationLocationState('weak');
        return null;
      }

      if (lastFixTimeRef.current > 0 && timestampMs <= lastFixTimeRef.current) {
        logRouteDiagnostic('gps-fix-rejected', {
          reason: 'older-than-current',
          source: params.source,
          ageMs,
          accuracyMeters,
        });
        return null;
      }

      const previousAcceptedFix = lastAcceptedDriverFixRef.current;
      if (previousAcceptedFix) {
        const elapsedSec = (timestampMs - previousAcceptedFix.timestampMs) / 1000;
        const highlyAccurate =
          quality === 'accepted' &&
          accuracyMeters != null &&
          accuracyMeters <= 30;
        if (elapsedSec > 0) {
          const impliedSpeed = haversineMeters(previousAcceptedFix.coordinate, coordinate) / elapsedSec;
          if (impliedSpeed > MAX_PLAUSIBLE_SPEED_MPS && !highlyAccurate) {
            logRouteDiagnostic('gps-fix-rejected', {
              reason: 'impossible-jump',
              source: params.source,
              ageMs,
              accuracyMeters,
              impliedSpeed,
            });
            return null;
          }
        }
      }

      const previousCoordinate = prevLocRef.current;
      let heading: number | null = null;
      if (gpsHeading != null && speedMps != null && speedMps > 1) {
        heading = gpsHeading;
      } else if (previousCoordinate && haversineMeters(previousCoordinate, coordinate) > 5) {
        heading = bearingDegrees(previousCoordinate, coordinate);
      }

      if (heading != null) headingRef.current = heading;
      speedRef.current = speedMps;
      accuracyRef.current = accuracyMeters;
      lastFixTimeRef.current = timestampMs;
      lastProcessedFixTimeRef.current = timestampMs;
      lastFixAtRef.current = timestampMs;
      prevLocRef.current = coordinate;
      driverLocRef.current = coordinate;
      const fix: AcceptedDriverFix = {
        coordinate,
        timestampMs,
        accuracyMeters,
        heading: headingRef.current,
        speedMps,
        source: params.source,
        quality,
      };
      driverFixRef.current = fix;
      if (quality === 'accepted') {
        lastAcceptedDriverFixRef.current = fix;
      }
      setDriverLoc(coordinate);
      setLastFixAt(timestampMs);
      setNavigationLocationState(quality === 'accepted' ? 'accepted' : 'weak');
      logRouteDiagnostic(
        quality === 'accepted' ? 'gps-fix-accepted' : 'gps-fix-provisional',
        {
          source: params.source,
          ageMs,
          accuracyMeters,
          speedMps,
        },
      );
      if (quality === 'provisional') {
        logRouteDiagnostic('route-origin-rejected', {
          reason: 'provisional',
          source: params.source,
          ageMs,
          accuracyMeters,
        });
      }
      return fix;
    },
    [],
  );
  // When the job status changes, clear cooldowns so next-phase reminders surface
  // immediately. The 2-second timer will naturally discard any stale reminder on
  // its next tick — no direct setState needed here.
  useEffect(() => {
    reminderDismissedRef.current = {};
  }, [job?.status]);
  useEffect(() => { jobRef.current = job; }, [job]);
  useEffect(() => { activeReminderIdRef.current = activeReminder?.id ?? null; }, [activeReminder]);

  const clearDevGpsLostTimer = useCallback(() => {
    if (devGpsLostTimerRef.current) {
      clearTimeout(devGpsLostTimerRef.current);
      devGpsLostTimerRef.current = null;
    }
  }, []);

  const stopDevGpsSimulation = useCallback(() => {
    devGpsSimulatorRef.current?.stop();
    devGpsSimulatorRef.current = null;
    devGpsActiveRef.current = false;
    devGpsInFlightRef.current = false;
    devGpsNextSendAtRef.current = 0;
    devGpsRouteRevRef.current = '';
    clearDevGpsLostTimer();
    setDevGpsRunning(false);
    setDevGpsPaused(false);
    setDevGpsLostUntil(null);
  }, [clearDevGpsLostTimer]);

  useEffect(() => stopDevGpsSimulation, [stopDevGpsSimulation]);

  useEffect(() => {
    if (devGpsTerminal) {
      stopDevGpsSimulation();
    }
  }, [devGpsTerminal, stopDevGpsSimulation]);

  useEffect(() => {
    if (!devGpsAllowed) stopDevGpsSimulation();
  }, [devGpsAllowed, stopDevGpsSimulation]);

  // Load the persisted voice-guidance mute preference once on mount and stop
  // any speech when leaving the screen.
  useEffect(() => {
    let cancelled = false;
    loadVoiceEnabled().then((on) => {
      if (!cancelled) setVoiceEnabledState(on);
    });
    return () => {
      cancelled = true;
      stopVoice();
    };
  }, []);

  const logMapDiag = useCallback((reason: string, severity: 'warn' | 'error' = 'warn') => {
    if (mapDiagRef.current === reason) return;
    mapDiagRef.current = reason;
    if (__DEV__ && severity === 'error') {
      console.error('[route-map]', reason);
    }
  }, []);

  const customerCoord: Coordinates | null = useMemo(() => {
    const lat = parseLatLng(job?.lat);
    const lng = parseLatLng(job?.lng);
    if (lat == null || lng == null) return trackingCustomerCoord;
    const c = { lat, lng };
    return isValidCoord(c) ? c : trackingCustomerCoord;
  }, [job?.lat, job?.lng, trackingCustomerCoord]);
  const currentDestinationKey = useMemo(() => coordKey(customerCoord), [customerCoord]);

  const bumpRouteSequence = useCallback(() => {
    const next = routeSequenceRef.current + 1;
    routeSequenceRef.current = next;
    setRouteSequence(next);
    return next;
  }, []);

  useEffect(() => {
    destinationRef.current = customerCoord;
    routeAbortRef.current?.abort();
    routeRequestSeqRef.current += 1;
    bumpRouteSequence();
    hasRequestedRef.current = false;
    lastRouteOriginRef.current = null;
    lastRouteAtRef.current = 0;
    deviationStateRef.current = emptyRouteDeviation();
    lastOffRouteRerouteAtRef.current = 0;
    networkFailRef.current = 0;
    navigationProgressRef.current = null;
    stepIndexRef.current = 0;
    spokenStepRef.current = -1;
    let clearRouteTimer: ReturnType<typeof setTimeout> | null = null;
    const existing = routeStateRef.current;
    const hasExistingRoute =
      existing.loading ||
      existing.source !== 'none' ||
      existing.routes.length > 0 ||
      existing.geometry != null ||
      existing.error != null;
    if (hasExistingRoute) {
      const next: RouteState = {
        ...INITIAL_ROUTE_STATE,
        // Do not pre-mark as loading here. `requestRoute` owns the loading
        // transition; otherwise the first GPS fix can think a request is already
        // active and never start Mapbox Directions.
        loading: false,
      };
      routeStateRef.current = next;
      clearRouteTimer = setTimeout(() => setRouteState(next), 0);
    }
    // New destination => fresh route session: clear all event latches so the
    // proximity/lifecycle cues fire correctly for the new journey.
    engineRef.current.reset();
    // Fresh journey also re-arms the auto-arrival suggestion.
    arrivalDwellSinceRef.current = null;
    arrivalPromptDismissedRef.current = false;
    // Defer to avoid synchronous setState inside an effect body.
    const id = setTimeout(() => setShowArrivalPrompt(false), 0);
    const deviationId = setTimeout(() => setRouteDeviation(null), 0);
    return () => {
      if (clearRouteTimer) clearTimeout(clearRouteTimer);
      clearTimeout(id);
      clearTimeout(deviationId);
    };
  }, [bumpRouteSequence, customerCoord, currentDestinationKey, currentRouteJobRef]);

  const mapKey = `${job?.id ?? 'job'}:${mapReloadKey}`;
  const mapLoaded = mapStatus.key === mapKey && mapStatus.phase === 'loaded';
  const mapFatal = mapStatus.key === mapKey && mapStatus.phase === 'fatal';
  const handleNativeMapReady = useCallback(() => {
    recoveryAttemptsRef.current = 0;
    setMapStatus({ key: mapKey, phase: 'loaded' });
  }, [mapKey]);
  const handleNativeMapPan = useCallback(() => { setIsFollowingDriver(false); }, []);
  const routeIsCurrent =
    routeState.source === 'mapbox' &&
    routeState.routeJobRef === currentRouteJobRef &&
    routeState.routeDestinationKey === currentDestinationKey;
  const selectedRouteCoordinates = routeIsCurrent ? routeState.geometry : null;
  const routeEndPosition = useMemo(() => {
    const coords = selectedRouteCoordinates;
    return coords && coords.length > 0
      ? lngLatToCoordinates(coords[coords.length - 1])
      : null;
  }, [selectedRouteCoordinates]);
  // Booking/customer destination marker is intentionally separate from driver
  // display snapping and from Mapbox's destination snap point.
  const customerMarkerPosition = customerCoord;

  const makeRerouteOrigin = useCallback((driver: Coordinates | null): RerouteOrigin | null => {
    void driver;
    const now = Date.now();
    const fix = driverFixRef.current;
    if (!fix) {
      logRouteDiagnostic('route-origin-rejected', { reason: 'missing-fix' });
      return null;
    }
    if (fix.quality !== 'accepted') {
      logRouteDiagnostic('route-origin-rejected', {
        reason: 'provisional',
        source: fix.source,
        accuracyMeters: fix.accuracyMeters,
      });
      return null;
    }
    const coordinate = fix.coordinate;
    const timestampMs = fix.timestampMs;
    const accuracyMeters = fix.accuracyMeters;
    const timestamp =
      typeof timestampMs === 'number' && Number.isFinite(timestampMs)
        ? timestampMs
        : null;
    if (timestamp == null) {
      logRouteDiagnostic('route-origin-rejected', { reason: 'missing-timestamp' });
      return null;
    }
    const ageMs = now - timestamp;
    if (!coordinate || !isValidCoord(coordinate)) {
      logRouteDiagnostic('route-origin-rejected', { reason: 'invalid-coordinate' });
      return null;
    }
    if (ageMs < 0 || ageMs > NAVIGATION_PROGRESS_STALE_MS) {
      logRouteDiagnostic('route-origin-rejected', {
        reason: 'stale',
        ageMs,
      });
      return null;
    }
    if (
      typeof accuracyMeters !== 'number' ||
      !Number.isFinite(accuracyMeters) ||
      accuracyMeters < 0 ||
      accuracyMeters > ROUTE_ORIGIN_MAX_RAW_ACCURACY_M
    ) {
      logRouteDiagnostic('route-origin-rejected', {
        reason: 'accuracy',
        ageMs,
        accuracyMeters,
      });
      return null;
    }
    return {
      coordinate,
      source: 'raw',
      routeRevision: currentRouteRevisionRef.current,
      locationTimestamp: timestamp,
      segmentIndex: null,
      confidence: null,
    };
  }, []);

  // ── Route request (client-side Mapbox Directions, road-following) ──
  const requestRoute = useCallback(
    async (origin: RerouteOrigin, destination: Coordinates) => {
      routeAbortRef.current?.abort();
      const requestId = routeRequestSeqRef.current + 1;
      routeRequestSeqRef.current = requestId;
      const controller = new AbortController();
      routeAbortRef.current = controller;
      // Update the ref immediately so evaluateRoute's loading guard works before React re-renders.
      routeStateRef.current = { ...routeStateRef.current, loading: true };
      setRouteState((prev) => ({ ...prev, loading: true }));
      const routeJobRef = currentRouteJobRef;
      const routeDestinationKey = coordKey(destination);
      const routeOriginFixAt = origin.locationTimestamp;
      logRouteDiagnostic('route-request-origin', {
        requestId,
        source: origin.source,
        lat: Number(origin.coordinate.lat.toFixed(6)),
        lng: Number(origin.coordinate.lng.toFixed(6)),
        segmentIndex: origin.segmentIndex,
        confidence: origin.confidence,
      });

      const result = await fetchProtectedJobDirections(
        routeJobRef ?? '',
        origin.coordinate,
        destination,
        controller.signal,
        { language: locale === 'ar' ? 'ar' : 'en', avoid: routePreferencesRef.current },
      );
      if (controller.signal.aborted) return;
      if (requestId !== routeRequestSeqRef.current) {
        logRouteDiagnostic('stale-route-response-discarded', { requestId });
        return;
      }

      if ('routes' in result) {
        const validations = result.routes.map((route) =>
          validateRouteGeometry({ route, origin: origin.coordinate, destination }),
        );
        const routes = result.routes.filter((_, index) => validations[index]?.ok);
        const rejected = validations.filter((validation) => !validation.ok);
        if (rejected.length > 0) {
          logRouteDiagnostic('route-geometry-rejected', {
            requestId,
            rejected: rejected.map((validation) => validation.reason).join(','),
            accepted: routes.length,
          });
        }
        if (routes.length === 0) {
          const err: RouteError = {
            kind: 'no-route',
            message: 'Directions returned invalid route geometry.',
          };
          setRerouting(false);
          devGpsPauseOnRouteChangeRef.current = false;
          const prev = routeStateRef.current;
          const canKeepPreviousRoute =
            prev.source === 'mapbox' &&
            prev.geometry != null &&
            prev.geometry.length >= 2 &&
            prev.routeJobRef === routeJobRef &&
            prev.routeDestinationKey === routeDestinationKey;
          if (canKeepPreviousRoute) {
            const next: RouteState = { ...prev, error: err, loading: false };
            routeStateRef.current = next;
            setRouteState(next);
            return;
          }
          lastRouteAtRef.current = Date.now();
          bumpRouteSequence();
          const next = makeRouteState('none', [], 0, err, {
            routeJobRef,
            routeDestinationKey,
          });
          routeStateRef.current = next;
          setRouteState(next);
          return;
        }
        // A successful fetch means we are back online — clear the latch so
        // reroute/refresh is allowed again.
        // Only fit the whole route on the very first fetch for this session or when in
        // overview mode. Fitting during active navigation zooms out and disorients the driver.
        networkFailRef.current = 0;
        lastRouteOriginRef.current = origin.coordinate;
        lastRouteAtRef.current = Date.now();
        fitPendingRef.current = followModeRef.current === 'overview';
        stepIndexRef.current = 0;
        navigationProgressRef.current = null;
        setCurrentStepIndex(stepIndexRef.current);
        setRerouting(false);
        bumpRouteSequence();
        const next = makeRouteState('mapbox', routes, 0, null, {
          routeJobRef,
          routeDestinationKey,
          routeCalculatedAt: Date.now(),
          routeOriginFixAt,
        });
        routeStateRef.current = next;
        setRouteState(next);
        return;
      }

      const err = result.error;
      if (err.kind === 'aborted') return;
      setRerouting(false);
      devGpsPauseOnRouteChangeRef.current = false;
      if (err.kind === 'network') {
        networkFailRef.current = Date.now();
      }

      const prev = routeStateRef.current;
      const canKeepPreviousRoute =
        prev.source === 'mapbox' &&
        prev.geometry != null &&
        prev.geometry.length >= 2 &&
        prev.routeJobRef === routeJobRef &&
        prev.routeDestinationKey === routeDestinationKey;
      if (canKeepPreviousRoute) {
        const next: RouteState = { ...prev, error: err, loading: false };
        routeStateRef.current = next;
        setRouteState(next);
        return;
      }

      if (err.kind === 'invalid-coords') {
        bumpRouteSequence();
        const next = makeRouteState('none', [], 0, err, {
          routeJobRef,
          routeDestinationKey,
        });
        routeStateRef.current = next;
        setRouteState(next);
        return;
      }

      // All attempts failed and no previous valid route to preserve.
      // A straight-line is NOT drawn — it must never be presented as navigation.
      // Rate-limit the next retry so we do not spam the Directions API.
      lastRouteAtRef.current = Date.now();
      bumpRouteSequence();
      const next = makeRouteState('none', [], 0, err, {
        routeJobRef,
        routeDestinationKey,
      });
      routeStateRef.current = next;
      setRouteState(next);
    },
    [bumpRouteSequence, currentRouteJobRef, locale],
  );

  useEffect(() => {
    return () => {
      routeAbortRef.current?.abort();
      returnRouteAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    returnRouteAbortRef.current?.abort();

    if (job?.status && DEV_GPS_TERMINAL_STATUSES.has(job.status)) {
      setReturnRouteEstimate(INITIAL_RETURN_ROUTE_ESTIMATE_STATE);
      return undefined;
    }
    if (!token || !customerCoord) {
      setReturnRouteEstimate(INITIAL_RETURN_ROUTE_ESTIMATE_STATE);
      return undefined;
    }
    if (!isValidCoord(GARAGE_LOCATION)) {
      setReturnRouteEstimate({
        ...INITIAL_RETURN_ROUTE_ESTIMATE_STATE,
        key: currentDestinationKey,
        error: 'missing-garage',
      });
      return undefined;
    }

    const key = `${currentDestinationKey ?? 'no-destination'}|${coordKey(
      GARAGE_LOCATION,
    )}|${routePreferencesKey(routePreferences)}`;
    const controller = new AbortController();
    returnRouteAbortRef.current = controller;
    setReturnRouteEstimate((prev) => ({
      ...prev,
      key,
      loading: true,
      error: null,
    }));

    fetchReturnToGarageDirections(
      customerCoord,
      controller.signal,
      locale === 'ar' ? 'ar' : 'en',
      { avoid: routePreferences },
    ).then((result) => {
      if (controller.signal.aborted) return;
      if ('routes' in result) {
        const route = result.routes[0];
        const trafficDurationSeconds =
          route.trafficDurationSeconds ?? route.durationSeconds;
        const typicalDurationSeconds = route.typicalDurationSeconds;
        setReturnRouteEstimate({
          key,
          loading: false,
          durationMinutes: secondsToMinutes(trafficDurationSeconds),
          trafficDelayMinutes:
            typicalDurationSeconds != null
              ? Math.max(
                  0,
                  Math.round((trafficDurationSeconds - typicalDurationSeconds) / 60),
                )
              : null,
          error: null,
          calculatedAt: Date.now(),
        });
        return;
      }
      if (result.error.kind === 'aborted') return;
      setReturnRouteEstimate({
        key,
        loading: false,
        durationMinutes: null,
        trafficDelayMinutes: null,
        error: result.error.message === 'Garage location not configured' ? 'missing-garage' : 'failed',
        calculatedAt: Date.now(),
      });
    });

    return () => {
      controller.abort();
    };
  }, [
    token,
    customerCoord,
    currentDestinationKey,
    job?.status,
    locale,
    routePreferences,
  ]);

  const markRouteOriginUnavailable = useCallback(
    (destination: Coordinates) => {
      const prev = routeStateRef.current;
      const destinationKey = coordKey(destination);
      const canKeepPreviousRoute =
        prev.source === 'mapbox' &&
        prev.geometry != null &&
        prev.geometry.length >= 2 &&
        prev.routeJobRef === currentRouteJobRef &&
        prev.routeDestinationKey === destinationKey;
      setRerouting(false);
      devGpsPauseOnRouteChangeRef.current = false;
      lastRouteAtRef.current = Date.now();
      const err: RouteError = {
        kind: 'no-route',
        message: 'Waiting for an accurate GPS position before requesting a route.',
      };
      if (canKeepPreviousRoute) {
        const next: RouteState = { ...prev, error: err, loading: false };
        routeStateRef.current = next;
        setRouteState(next);
        return;
      }
      bumpRouteSequence();
      const next = makeRouteState('none', [], 0, err, {
        routeJobRef: currentRouteJobRef,
        routeDestinationKey: destinationKey,
      });
      routeStateRef.current = next;
      setRouteState(next);
    },
    [bumpRouteSequence, currentRouteJobRef],
  );

  // ── Per-GPS-fix evaluation: step advance, off-route reroute, refresh ──
  const evaluateRoute = useCallback(
    (driver: Coordinates) => {
      const dest = destinationRef.current;
      if (!dest) return;
      const rs = routeStateRef.current;
      const now = Date.now();
      const destKey = coordKey(dest);
      const routeBelongsToCurrentJob =
        rs.source === 'mapbox' &&
        rs.routeJobRef === currentRouteJobRef &&
        rs.routeDestinationKey === destKey;

      if (rs.source === 'mapbox' && !routeBelongsToCurrentJob) {
        bumpRouteSequence();
        const next: RouteState = {
          ...INITIAL_ROUTE_STATE,
          loading: true,
        };
        routeStateRef.current = next;
        setRouteState(next);
        const origin = makeRerouteOrigin(driver);
        if (origin) requestRoute(origin, dest);
        else markRouteOriginUnavailable(dest);
        return;
      }

      // While a network failure is latched, suppress reroute/refresh attempts
      // (keeping the last good route on screen) and only allow a single probe
      // every OFFLINE_RETRY_MS so connectivity recovery is still detected
      // without an infinite retry loop.
      const offline = networkFailRef.current !== 0;
      const networkAllowed =
        !offline || now - networkFailRef.current > OFFLINE_RETRY_MS;

      // Confirm against accurate raw fixes, including nearby wrong turns and
      // reverse travel. Timer evaluations never invent extra GPS samples.
      if (routeBelongsToCurrentJob && rs.geometry) {
        const fix = driverFixRef.current;
        if (!fix || fix.quality !== 'accepted') return;
        const deviation = evaluateRouteDeviation({
          revision: `${rs.routeJobRef}:${rs.routeDestinationKey}`,
          geometry: rs.geometry, coordinate: fix.coordinate, fixAt: fix.timestampMs,
          accuracy: fix.accuracyMeters, speed: fix.speedMps, heading: fix.heading,
          now, previous: deviationStateRef.current, loading: rs.loading,
          networkAllowed, lastRerouteAt: lastOffRouteRerouteAtRef.current,
        });
        deviationStateRef.current = deviation.state;
        const d = deviation.distance;
        logRouteDiagnostic('route-distance-sample', {
          distanceMeters: Math.round(d),
          accuracyMeters: fix.accuracyMeters,
          loading: rs.loading,
          routeRevision: currentRouteRevisionRef.current,
        });
        setRouteDeviation(deviation.suspected ? {
          kind: deviation.confirmed ? 'off-route' : 'gps-drift',
          distanceMeters: d, recalculating: rs.loading || deviation.shouldReroute,
        } : d > GPS_DRIFT_METERS ? {
          kind: 'gps-drift', distanceMeters: d, recalculating: false,
        } : null);
        if (deviation.suspected) {
          if (deviation.shouldReroute) {
            const origin = makeRerouteOrigin(driver);
            if (origin) {
              lastOffRouteRerouteAtRef.current = now;
              setRerouting(true);
              void requestRoute(origin, dest);
            }
          }
          return;
        }
      } else {
        setRouteDeviation(null);
      }

      // Periodic refresh blocked while a request is already in-flight.
      if (rs.loading) return;
      // During dev simulation, keep normal movement on the loaded route geometry
      // and let only the explicit off-route debounce above recalculate. This
      // avoids a generic refresh loop that would look like duplicate reroutes.
      if (devGpsActiveRef.current) return;

      // Periodic refresh when the driver has moved meaningfully, or upgrade
      // attempts when we are currently on a fallback / no route. Gated on the
      // network probe window so we never spam Directions while offline.
      // Also force-refresh when the route is stale and the driver has moved far.
      const lastOrigin = lastRouteOriginRef.current;
      const movedEnough =
        !lastOrigin || haversineMeters(driver, lastOrigin) > ROUTE_REFRESH_MIN_MOVE_M;
      const intervalOk = now - lastRouteAtRef.current > ROUTE_MIN_INTERVAL_MS;
      const routeAgeMs = rs.routeCalculatedAt != null ? now - rs.routeCalculatedAt : null;
      const movedFarFromOrigin =
        lastOrigin != null && haversineMeters(driver, lastOrigin) > ROUTE_FORCE_REFRESH_MOVE_M;
      const staleWhileMoving =
        movedFarFromOrigin && routeAgeMs != null && routeAgeMs > ROUTE_STALE_WHILE_MOVING_MS;
      const offRouteRerouteCooldown =
        lastOffRouteRerouteAtRef.current !== 0 &&
        now - lastOffRouteRerouteAtRef.current < REROUTE_COOLDOWN_MS;
      if (
        networkAllowed &&
        !offRouteRerouteCooldown &&
        ((rs.source === 'none' && intervalOk) || (movedEnough && intervalOk) || staleWhileMoving)
      ) {
        const origin = makeRerouteOrigin(driver);
        if (origin) requestRoute(origin, dest);
        else if (rs.source === 'none') markRouteOriginUnavailable(dest);
      }
    },
    [bumpRouteSequence, currentRouteJobRef, makeRerouteOrigin, markRouteOriginUnavailable, requestRoute],
  );

  // First fix / subsequent fixes funnel through here.
  const onFix = useCallback(
    (driver: Coordinates) => {
      const dest = destinationRef.current;
      if (!dest) return;
      if (phaseRef.current !== 'to_dropoff') {
        phaseRef.current = 'to_dropoff';
        setPhase('to_dropoff');
      }
      if (
        routeStateRef.current.source === 'none' &&
        !routeStateRef.current.loading &&
        !hasRequestedRef.current
      ) {
        hasRequestedRef.current = true;
        const origin = makeRerouteOrigin(driver);
        if (origin) requestRoute(origin, dest);
        else markRouteOriginUnavailable(dest);
        return;
      }
      evaluateRoute(driver);
    },
    [evaluateRoute, makeRerouteOrigin, markRouteOriginUnavailable, requestRoute],
  );

  useEffect(() => { handlersRef.current.onFix = onFix; }, [onFix]);

  // Finish a confirmed deviation even if the driver stops and the distance-
  // filtered native watcher emits no more fixes. Never route from stale GPS.
  useEffect(() => {
    if (routeScreenAppState !== 'active') return;
    const evaluateLatest = () => {
      const fix = driverFixRef.current;
      if (fix?.quality === 'accepted' && Date.now() - fix.timestampMs <= NAVIGATION_PROGRESS_STALE_MS) {
        handlersRef.current.onFix(fix.coordinate);
      }
    };
    const timer = setInterval(evaluateLatest, 1_000);
    return () => clearInterval(timer);
  }, [routeScreenAppState]);

  // ── Job detail load + lightweight status polling ──
  useEffect(() => {
    if (!ref) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await driverApi.getJob(ref);
        if (!cancelled) setJob(data);
      } catch {
        // handled on the main jobs screen
      }
    };
    load();
    const id = setInterval(load, JOB_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ref]);

  useFocusEffect(
    useCallback(() => {
      if (!ref) return undefined;
      let cancelled = false;
      driverApi.getJob(ref)
        .then((data) => {
          if (!cancelled) setJob(data);
        })
        .catch(() => {
          // The polling effect and main jobs screen handle fetch failures.
        });
      return () => {
        cancelled = true;
      };
    }, [ref]),
  );

  // When the destination becomes known after a fix already exists, kick a
  // route. Deferred via microtask so this effect never setStates synchronously.
  useEffect(() => {
    const fix = driverFixRef.current;
    if (customerCoord && fix?.quality === 'accepted') {
      const driver = fix.coordinate;
      Promise.resolve().then(() => handlersRef.current.onFix(driver));
    }
  }, [customerCoord, currentDestinationKey, currentRouteJobRef]);

  useEffect(() => {
    if (!currentRouteJobRef) return undefined;
    let cancelled = false;

    const hydrateTrackingFallback = async () => {
      if (lastAcceptedDriverFixRef.current?.quality === 'accepted') return;
      try {
        const tracking = (await driverApi.getTrackingData(
          currentRouteJobRef,
        )) as TrackingRouteFallback;
        if (cancelled) return;

        const trackingDestination =
          typeof tracking.customerLat === 'number' &&
          Number.isFinite(tracking.customerLat) &&
          typeof tracking.customerLng === 'number' &&
          Number.isFinite(tracking.customerLng)
            ? { lat: tracking.customerLat, lng: tracking.customerLng }
            : null;
        const destination =
          customerCoord && isValidCoord(customerCoord)
            ? customerCoord
            : trackingDestination && isValidCoord(trackingDestination)
              ? trackingDestination
              : null;
        if (!destination) {
          logRouteDiagnostic('tracking-fallback-skipped', {
            reason: 'missing-customer-location',
          });
          return;
        }
        if (trackingDestination && isValidCoord(trackingDestination)) {
          setTrackingCustomerCoord((prev) =>
            coordKey(prev) === coordKey(trackingDestination) ? prev : trackingDestination,
          );
        }

        const driver =
          typeof tracking.driverLat === 'number' &&
          Number.isFinite(tracking.driverLat) &&
          typeof tracking.driverLng === 'number' &&
          Number.isFinite(tracking.driverLng)
            ? { lat: tracking.driverLat, lng: tracking.driverLng }
            : null;
        if (!driver || !isValidCoord(driver)) {
          logRouteDiagnostic('tracking-fallback-skipped', {
            reason: 'missing-driver-location',
          });
          return;
        }

        const trackingTimestampMs = parseTrackingTimestamp(tracking.driverLocationAt);
        const displayTimestampMs = Date.now();
        const fix: AcceptedDriverFix = {
          coordinate: driver,
          timestampMs: displayTimestampMs,
          accuracyMeters: null,
          heading: null,
          speedMps: null,
          source: 'tracking-fallback',
          quality: 'provisional',
        };
        driverFixRef.current = fix;
        driverLocRef.current = driver;
        prevLocRef.current = prevLocRef.current ?? driver;
        accuracyRef.current = null;
        speedRef.current = null;
        lastFixAtRef.current = displayTimestampMs;
        setDriverLoc(driver);
        setLastFixAt(displayTimestampMs);
        if (
          navigationLocationStateRef.current !== 'permission-denied' &&
          navigationLocationStateRef.current !== 'accepted'
        ) {
          setNavigationLocationState('weak');
        }

        const route = makeTrackingFallbackRoute(tracking, destination);
        if (!route) {
          logRouteDiagnostic('tracking-fallback-route-skipped', {
            reason: 'missing-or-invalid-route',
          });
          return;
        }

        const destinationKey = coordKey(destination);
        const prev = routeStateRef.current;
        const canSkip =
          prev.source === 'mapbox' &&
          prev.routeJobRef === currentRouteJobRef &&
          prev.routeDestinationKey === destinationKey &&
          prev.geometry != null &&
          prev.geometry.length === route.geometry.length &&
          prev.geometry[0]?.[0] === route.geometry[0]?.[0] &&
          prev.geometry[0]?.[1] === route.geometry[0]?.[1] &&
          prev.geometry[prev.geometry.length - 1]?.[0] ===
            route.geometry[route.geometry.length - 1]?.[0] &&
          prev.geometry[prev.geometry.length - 1]?.[1] ===
            route.geometry[route.geometry.length - 1]?.[1];
        if (canSkip) return;

        networkFailRef.current = 0;
        lastRouteOriginRef.current = driver;
        lastRouteAtRef.current = Date.now();
        hasRequestedRef.current = true;
        deviationStateRef.current = emptyRouteDeviation();
        bumpRouteSequence();
        const next = makeRouteState('mapbox', [route], 0, null, {
          routeJobRef: currentRouteJobRef,
          routeDestinationKey: destinationKey,
          routeCalculatedAt: Date.now(),
          routeOriginFixAt: trackingTimestampMs ?? displayTimestampMs,
        });
        routeStateRef.current = next;
        setRouteState(next);
        logRouteDiagnostic('tracking-fallback-route-applied', {
          source: 'tracking-fallback',
          coords: route.geometry.length,
        });
      } catch (error) {
        logRouteDiagnostic('tracking-fallback-error', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    hydrateTrackingFallback();
    const interval = setInterval(hydrateTrackingFallback, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [bumpRouteSequence, currentRouteJobRef, customerCoord, currentDestinationKey]);

  // ── Foreground GPS watcher (single subscription, cleaned up on unmount) ──
  useEffect(() => {
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      if (
        navigationLocationStateRef.current !== 'accepted' &&
        navigationLocationStateRef.current !== 'weak'
      ) {
        setNavigationLocationState('requesting');
      }
      logRouteDiagnostic('gps-watch-start', { source: 'foreground' });

      let granted = false;
      try {
        const current = await Location.getForegroundPermissionsAsync();
        logRouteDiagnostic('gps-permission-state', {
          phase: 'current',
          status: current.status,
          granted: current.granted,
          canAskAgain: current.canAskAgain,
        });
        granted = current.status === 'granted';
        if (!granted) {
          const requested = await Location.requestForegroundPermissionsAsync();
          logRouteDiagnostic('gps-permission-state', {
            phase: 'requested',
            status: requested.status,
            granted: requested.granted,
            canAskAgain: requested.canAskAgain,
          });
          granted = requested.status === 'granted';
        }
      } catch (error) {
        logRouteDiagnostic('gps-permission-error', {
          message: error instanceof Error ? error.message : String(error),
        });
        if (!cancelled) {
          setPermissionDenied(false);
          setNavigationLocationState('unavailable');
        }
        return;
      }

      if (cancelled) return;
      if (!granted) {
        setPermissionDenied(true);
        setNavigationLocationState('permission-denied');
        return;
      }
      setPermissionDenied(false);

      const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(
        (error) => {
          logRouteDiagnostic('gps-last-known-error', {
            message: error instanceof Error ? error.message : String(error),
          });
          return null;
        },
      );
      if (!cancelled && last && !devGpsActiveRef.current) {
        const c = { lat: last.coords.latitude, lng: last.coords.longitude };
        logRouteDiagnostic('gps-last-known-received', {
          ageMs: Date.now() - last.timestamp,
          accuracyMeters: last.coords.accuracy,
        });
        const accepted = acceptDriverFix({
          coordinate: c,
          timestampMs: last.timestamp,
          accuracyMeters: last.coords.accuracy,
          speedMps: last.coords.speed,
          heading: last.coords.heading,
          source: 'last-known',
        });
        if (accepted?.quality === 'accepted') {
          handlersRef.current.onFix(accepted.coordinate);
        }
      } else if (!cancelled && !last) {
        logRouteDiagnostic('gps-last-known-missing', { source: 'last-known' });
      }

      try {
        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 2_000,
            distanceInterval: 5,
          },
          (loc) => {
            if (devGpsActiveRef.current) return;
            const c = { lat: loc.coords.latitude, lng: loc.coords.longitude };
            const fixTime =
              typeof loc.timestamp === 'number' ? loc.timestamp : Date.now();
            logRouteDiagnostic('gps-watch-fix-received', {
              ageMs: Date.now() - fixTime,
              accuracyMeters: loc.coords.accuracy,
              speedMps: loc.coords.speed,
            });
            const accepted = acceptDriverFix({
              coordinate: c,
              timestampMs: fixTime,
              accuracyMeters: loc.coords.accuracy,
              speedMps: loc.coords.speed,
              heading: loc.coords.heading,
              source: 'watch',
            });
            if (accepted?.quality === 'accepted') {
              handlersRef.current.onFix(accepted.coordinate);
            }
          },
        );
        logRouteDiagnostic('gps-watch-ready', { source: 'foreground' });
      } catch (error) {
        logRouteDiagnostic('gps-watch-error', {
          message: error instanceof Error ? error.message : String(error),
        });
        if (!cancelled) {
          setPermissionDenied(false);
          setNavigationLocationState('error');
        }
        return;
      }
      if (cancelled) {
        sub.remove();
        sub = null;
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
      logRouteDiagnostic('gps-watch-stop', { hadSubscription: sub != null });
    };
  }, [acceptDriverFix, permRetry]);

  useFocusEffect(useCallback(() => {
    if (Platform.OS === 'web' || routeScreenAppState !== 'active') return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let previous: { heading: number | null; at: number } | null = null;
    void Location.watchHeadingAsync((sample) => {
      if (cancelled || devGpsActiveRef.current) return;
      const heading = resolveCompassHeading(sample);
      const at = Date.now();
      const change = previous?.heading != null && heading != null
        ? Math.abs(((heading - previous.heading + 540) % 360) - 180) : 360;
      // Limit high-frequency sensor renders; refresh unchanged bearings before
      // they age out. An uncalibrated compass must not become a north heading.
      if (previous && at - previous.at < 250) return;
      if (previous?.heading === heading && at - previous.at < 2_000) return;
      if (change < 3 && previous && at - previous.at < 2_000) return;
      previous = { heading, at };
      setCompass(previous);
    }, () => {
      if (!cancelled) setCompass(null);
    }).then((next) => {
      if (cancelled) next.remove();
      else subscription = next;
    }).catch(() => {
      if (!cancelled) setCompass(null);
    });
    return () => { cancelled = true; subscription?.remove(); };
  }, [routeScreenAppState]));

  useEffect(() => {
    if (permissionDenied || lastFixAt == null) return;
    if (
      nowTick - lastFixAt > NAVIGATION_PROGRESS_STALE_MS &&
      navigationLocationStateRef.current !== 'stale'
    ) {
      setNavigationLocationState('stale');
    }
  }, [lastFixAt, nowTick, permissionDenied]);

  // Route signature changes only when actual route geometry changes, keeping
  // accepted GPS progress and route-overview framing consistent.
  const routeRev = useMemo(() => {
    const g = routeState.geometry;
    return `${ROUTE_VISUAL_VERSION}|${routeState.source}|${routeState.routeJobRef ?? ''}|${
      routeState.routeDestinationKey ?? ''
    }|${routeState.selectedIndex}|${g ? g.length : 0}|${
      routeState.routeCalculatedAt ?? ''
    }|${routeState.distanceMeters ?? ''}|${
      g && g.length
        ? `${g[0][0]},${g[0][1]},${g[g.length - 1][0]},${g[g.length - 1][1]}`
        : ''
    }`;
  }, [
    routeState.source,
    routeState.routeJobRef,
    routeState.routeDestinationKey,
    routeState.selectedIndex,
    routeState.geometry,
    routeState.routeCalculatedAt,
    routeState.distanceMeters,
  ]);

  const selectedRoute = routeIsCurrent
    ? routeState.routes[routeState.selectedIndex] ?? null
    : null;
  useEffect(() => {
    currentRouteRevisionRef.current = routeRev;
  }, [routeRev]);

  const navigationProgress = useMemo(
    () =>
      buildNavigationProgress({
        rawLocation: driverLoc && isValidCoord(driverLoc) ? driverLoc : null,
        route: selectedRoute,
        routeRevision: routeRev,
        routeIsCurrent,
        previous: navigationProgressRef.current,
        gpsHeading: headingRef.current,
        compassHeading: routeScreenAppState === 'active' && compass &&
          Date.now() - compass.at >= 0 && Date.now() - compass.at <= NAVIGATION_PROGRESS_STALE_MS
          ? compass.heading : null,
        speedMps: speedRef.current,
        accuracyMeters: accuracyRef.current,
        fixTimestampMs: lastFixAt,
        nowMs: nowTick,
        maxSnapDistanceMeters: SNAP_TO_ROUTE_MAX_DRIFT_M,
        maxDisplaySnapDistanceMeters: GPS_DRIFT_METERS,
        staleAfterMs: NAVIGATION_PROGRESS_STALE_MS,
        fallbackStepIndex: stepIndexRef.current,
        isRecalculating: rerouting,
        cameraMode:
          followMode === 'overview'
            ? 'overview'
            : isFollowingDriver
              ? 'following'
              : 'free-pan',
      }),
    [
      driverLoc,
      compass,
      followMode,
      isFollowingDriver,
      lastFixAt,
      nowTick,
      rerouting,
      routeScreenAppState,
      routeIsCurrent,
      routeRev,
      selectedRoute,
    ],
  );

  useEffect(() => {
    navigationProgressRef.current = navigationProgress;
    if (navigationProgress.currentStepIndex !== stepIndexRef.current) {
      stepIndexRef.current = navigationProgress.currentStepIndex;
      setCurrentStepIndex(navigationProgress.currentStepIndex);
    }
  }, [navigationProgress]);

  const rawDriverPosition = navigationProgress.rawLocation;
  const snappedDriverPosition = navigationProgress.snappedLocation;
  const distanceFromRouteMeters = navigationProgress.distanceFromRouteMeters;
  const displayDriverPosition = navigationProgress.displayLocation;
  const displayMode = navigationProgress.displayMode;
  const routeHeading = navigationProgress.routeHeading;
  const displayNavigationState = useMemo(() => {
    const displayLocation = displayDriverPosition
      ? ([displayDriverPosition.lng, displayDriverPosition.lat] as [number, number])
      : null;
    const rawLocation = rawDriverPosition
      ? ([rawDriverPosition.lng, rawDriverPosition.lat] as [number, number])
      : null;
    const displayHeading =
      navigationProgress.displayHeading ??
      (displayMode === 'snapped' && routeHeading != null
        ? routeHeading
        : headingRef.current);
    return {
      displayLocation,
      rawLocation,
      displayHeading,
      locationTimestamp: navigationProgress.fixTimestampMs,
      forceSnap: navigationProgress.forceSnap,
      followZoom: navigationFollowZoom({
        mapDepthMode,
        roadClass: navigationProgress.currentRoadClass,
        speedMps: navigationProgress.speedMps,
        distanceToManeuverMeters: navigationProgress.distanceToManeuverMeters,
      }),
    };
  }, [
    displayDriverPosition,
    displayMode,
    mapDepthMode,
    navigationProgress.currentRoadClass,
    navigationProgress.displayHeading,
    navigationProgress.distanceToManeuverMeters,
    navigationProgress.fixTimestampMs,
    navigationProgress.forceSnap,
    navigationProgress.speedMps,
    rawDriverPosition,
    routeHeading,
  ]);

  // When collapsing/expanding the cockpit changes the reserved bottom padding,
  // refit the camera ONLY in overview mode (where the whole route is framed) so
  // the destination stays visible above the panel. Follow modes are left alone
  // so we never fight the driver's manual pan/zoom.
  const didMountCockpitRef = useRef(false);
  useEffect(() => {
    if (!didMountCockpitRef.current) {
      didMountCockpitRef.current = true;
      return;
    }
    if (followMode === 'overview') {
      fitPendingRef.current = true;
      // Defer to avoid synchronous setState inside an effect body.
      const id = setTimeout(() => setCameraEpoch((e) => e + 1), 0);
      return () => clearTimeout(id);
    }
  }, [cockpitCollapsed, followMode]);

  // Keep the screen awake WHILE navigating this screen in the foreground. Tied
  // to focus + AppState (not raw mount) so it releases the lock when the app is
  // backgrounded or the driver leaves the route screen — a driver must never
  // have the screen sleep mid-route, but we don't hold a wake lock needlessly.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const apply = (on: boolean) => {
        if (!active) return;
        if (on) {
          activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
        } else {
          deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
        }
      };
      apply(AppState.currentState === 'active');
      const sub = AppState.addEventListener('change', (next) => {
        apply(next === 'active');
      });
      return () => {
        active = false;
        sub.remove();
        deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
      };
    }, []),
  );

  // Watchdog: if a freshly-mounted canvas never reports map-loaded, remount it
  // a couple of times, then surface the retry card.
  useEffect(() => {
    if (Platform.OS === 'web' || mapLoaded || mapFatal) return undefined;
    const id = setTimeout(() => {
      if (recoveryAttemptsRef.current < 2) {
        recoveryAttemptsRef.current += 1;
        setMapReloadKey((k) => k + 1);
      } else {
        logMapDiag('map-load-timeout (no map-loaded after retries)');
        setMapStatus({ key: mapKey, phase: 'fatal' });
      }
    }, MAP_LOAD_WATCHDOG_MS);
    return () => clearTimeout(id);
  }, [mapLoaded, mapFatal, mapKey, logMapDiag]);

  // 1s tick for the "updated Xs ago" line.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Play the subtle in-app cue (sound + haptic) for a smart route event.
  const playRouteCue = useCallback((event: RouteEventType) => {
    const cue = ROUTE_EVENT_CUES[event];
    if (cue.sound) playSound(cue.sound);
    if (cue.haptic === 'light') lightHaptic();
    else if (cue.haptic === 'medium') mediumHaptic();
    else if (cue.haptic === 'success') successHaptic();
    else if (cue.haptic === 'maneuver') maneuverHaptic();
    // Optional spoken phrase for major events (debounced in the voice service,
    // and gated on the driver's persisted mute preference). Never speaks
    // per-maneuver here — that is voiced by the dedicated per-step effect so
    // instructions are not duplicated.
    const voiceKey = ROUTE_EVENT_VOICE[event];
    if (voiceKey && voiceEnabledRef.current) {
      speakGuidance(t(voiceKey), { locale: localeRef.current, force: true });
    }
  }, [t]);

  // ── Smart route-event engine evaluation (timer-driven) ──
  // Runs on a steady cadence rather than per GPS fix so stalled-GPS and
  // connection events are still detected. All "when to fire" logic lives in
  // the engine; this effect only feeds primitives and plays the resulting cue.
  useEffect(() => {
    const id = setInterval(() => {
      const driver = driverLocRef.current;
      const dest = destinationRef.current;
      const rs = routeStateRef.current;
      const now = Date.now();
      const metersToCustomer =
        driver && dest ? haversineMeters(driver, dest) : null;
      const progress = navigationProgressRef.current;
      const metersToRoute =
        progress?.distanceFromRouteMeters ??
        (driver && rs.geometry ? distanceToRouteMeters(driver, rs.geometry) : null);
      const fixAge =
        lastFixAtRef.current == null ? null : now - lastFixAtRef.current;
      // A reroute has definitively failed when we have no usable geometry,
      // the error is not a transient network drop (handled separately), not
      // invalid coords, and we are not currently mid-request.
      const rerouteFailedNow =
        !reroutingRef.current &&
        rs.source === 'none' &&
        rs.error != null &&
        rs.error.kind !== 'network' &&
        rs.error.kind !== 'invalid-coords' &&
        rs.error.kind !== 'aborted';
      // Upcoming maneuver (the active turn step) → pre-turn vibration.
      const idx = stepIndexRef.current;
      const step =
        rs.source === 'mapbox' && rs.steps.length > 1
          ? rs.steps[Math.min(idx, rs.steps.length - 1)]
          : null;
      const metersToManeuver =
        progress?.distanceToManeuverMeters ??
        (step && driver
          ? routeDistanceToStep(progress?.displayLocation ?? driver, step, rs.geometry) ??
            haversineMeters(driver, { lng: step.location[0], lat: step.location[1] })
          : null);
      const events = engineRef.current.update({
        source: rs.source,
        rerouting: reroutingRef.current,
        rerouteFailed: rerouteFailedNow,
        metersToRoute,
        metersToCustomer,
        fixAgeMs: fixAge,
        networkError: rs.error?.kind === 'network',
        metersToManeuver,
        maneuverStepIndex: step ? idx : null,
        maneuverIsActionable: step ? isActionableManeuver(step) : false,
        speedMps: speedRef.current,
        now,
      });
      for (const e of events) playRouteCue(e);

      // ── Auto "mark arrived" suggestion (never auto-updates status) ──
      // When the driver is en route, parked within ARRIVAL_PROMPT_M of the
      // customer and essentially stationary for the dwell period, surface a
      // one-tap confirm. If they drive away the dwell latch clears and the
      // prompt hides; once they dismiss/confirm it does not return this session.
      const enRoute = jobStatusRef.current === 'en_route';
      const near =
        metersToCustomer != null && metersToCustomer <= ARRIVAL_PROMPT_M;
      const slow =
        speedRef.current == null || speedRef.current < ARRIVAL_PROMPT_SPEED_MPS;
      if (enRoute && near && slow && !arrivalPromptDismissedRef.current) {
        if (arrivalDwellSinceRef.current == null) {
          arrivalDwellSinceRef.current = now;
        } else if (
          now - arrivalDwellSinceRef.current > ARRIVAL_PROMPT_DWELL_MS &&
          !showArrivalPromptRef.current
        ) {
          setShowArrivalPrompt(true);
        }
      } else {
        arrivalDwellSinceRef.current = null;
        // Drove away / no longer en route → hide the suggestion.
        if (showArrivalPromptRef.current && (!enRoute || !near)) {
          setShowArrivalPrompt(false);
        }
      }

      // ── Smart driver reminder evaluation ──
      // Never show a reminder while the arrival prompt is visible (they collide).
      if (!showArrivalPromptRef.current) {
        const currentJob = jobRef.current;
        if (currentJob) {
          if (currentJob.status === 'driver_assigned') {
            if (activeReminderIdRef.current != null) setActiveReminder(null);
            return;
          }

          const payDisplay = getDriverPaymentDisplay(
            currentJob.paymentSummary ?? currentJob.payment ?? null,
            currentJob.refNumber,
          );
          const reminder = getSmartDriverReminder({
            jobStatus: currentJob.status,
            acceptedAt: currentJob.acceptedAt ?? currentJob.assignedAt,
            enRouteAt: currentJob.enRouteAt,
            arrivedAt: currentJob.arrivedAt,
            inProgressAt: currentJob.inProgressAt,
            nowMs: now,
            remainingDurationSeconds: rs.durationSeconds,
            metersToCustomer,
            speedMps: speedRef.current,
            paymentNeedsAttention:
              payDisplay.tone === 'pending' ||
              payDisplay.tone === 'unknown' ||
              payDisplay.tone === 'action' ||
              payDisplay.tone === 'warning' ||
              payDisplay.tone === 'failed',
            hasTyreSize: hasJobTyreDetails(currentJob),
            hasAddress: !!(currentJob.addressLine?.trim()),
            gpsStale: fixAge == null || fixAge > 12_000,
            routeFailed: rs.source === 'none' && rs.error != null,
          });

          const dismissed = reminderDismissedRef.current;
          const prevId = activeReminderIdRef.current;

          if (reminder == null) {
            if (prevId != null) setActiveReminder(null);
          } else {
            const dismissedAt = dismissed[reminder.id] ?? 0;
            const cooldownMs =
              reminder.severity === 'urgent' ? 5 * 60_000 : 10 * 60_000;
            const cooldownOver = now - dismissedAt > cooldownMs;
            if (cooldownOver && prevId !== reminder.id) {
              setActiveReminder(reminder);
            } else if (!cooldownOver && prevId === reminder.id) {
              setActiveReminder(null);
            }
          }
        }
      } else if (activeReminderIdRef.current != null) {
        setActiveReminder(null);
      }
    }, ROUTE_EVENT_TICK_MS);
    return () => clearInterval(id);
  }, [playRouteCue]);

  // Show a transient cockpit banner that auto-dismisses.
  const showBanner = useCallback((text: string) => {
    setPaymentBanner(text);
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(
      () => setPaymentBanner(null),
      PAYMENT_BANNER_MS,
    );
  }, []);

  // ── Payment live awareness ──
  // The existing JOB_POLL_INTERVAL_MS poll already refreshes `job` (and its
  // payment summary) while this screen is open — no realtime channel exists in
  // the driver app, so polling is the safe approach. Here we only react to a
  // genuine status transition, using the real backend canonical payment state.
  useEffect(() => {
    if (!job?.refNumber) return;
    const paid = getDriverPaymentDisplay(job.paymentSummary ?? job.payment ?? null).tone === 'paid';
    const prev = prevPayStatusRef.current;
    prevPayStatusRef.current = { jobRef: job.refNumber, paid };
    if (!prev || prev.jobRef !== job.refNumber) return;
    if (paid && !prev.paid) {
      // A server-verified complete settlement, never a deposit or stale paid flag.
      playSound('payment_received');
      successHaptic();
      const text = t('route.paymentReceived');
      // Defer banner setState to avoid synchronous setState inside an effect body.
      const id = setTimeout(() => showBanner(text), 0);
      return () => clearTimeout(id);
    }
  }, [job?.refNumber, job?.paymentSummary, job?.payment, showBanner, t]);

  // Clear the banner timer on unmount.
  useEffect(
    () => () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    },
    [],
  );


  // ── Actions ──
  const updateRouteStatus = useCallback(
    async (
      nextStatus: string,
      options: {
        busy?: (busy: boolean) => void;
        refresh?: boolean;
        onError?: (message: string) => void;
        onSuccess?: () => void;
      } = {},
    ): Promise<boolean> => {
      if (!ref || actionLockRef.current) return false;

      actionLockRef.current = true;
      setArrivalError(null);
      setActioning(true);
      options.busy?.(true);

      const finishSuccess = (resolvedStatus: string) => {
        setJob((prev) => (prev ? applyLocalStatus(prev, resolvedStatus) : prev));
        if (resolvedStatus === 'completed') {
          void clearActiveBookingTracking();
          heavyHaptic();
          playSound('job_completed');
        } else if (resolvedStatus === 'en_route') {
          void stopAlertSound();
          mediumHaptic();
        } else {
          mediumHaptic();
        }
        options.onSuccess?.();
        if (options.refresh !== false) {
          void driverApi.getJob(ref).then(setJob).catch(() => {});
        }
      };

      try {
        const result = await driverApi.updateJobStatus(ref, nextStatus);
        finishSuccess(result.newStatus || nextStatus);
        return true;
      } catch (err) {
        const isNetworkError = err instanceof ApiError && err.code === 'network';
        if (!isNetworkError) {
          const latest = await driverApi.getJob(ref).catch(() => null);
          if (latest) {
            setJob(latest);
            if (hasReachedStatus(latest.status, nextStatus)) {
              finishSuccess(latest.status);
              return true;
            }
          }
        }

        const msg =
          isNetworkError
            ? t('common.networkError')
            : err instanceof ApiError
              ? err.message
              : t('route.couldNotUpdateStatus');
        if (options.onError) {
          options.onError(msg);
        } else {
          Alert.alert(t('common.error'), msg);
        }
        return false;
      } finally {
        options.busy?.(false);
        setActioning(false);
        actionLockRef.current = false;
      }
    },
    [ref, t],
  );

  const openWheelNutConsent = useCallback(async () => {
    if (!ref) return;
    setActioning(true);
    try {
      await driverApi.markWheelNutConsentRequired(ref, 'driver_requested_wheel_nut_extraction_consent_from_route');
    } catch {
      // The consent screen retries this before signing.
    } finally {
      setActioning(false);
    }
    router.push(`/(tabs)/jobs/${ref}/wheel-nut-consent`);
  }, [ref, router]);

  const handleStatusAction = useCallback(
    (nextStatus: string) => {
      if (!ref || actionLockRef.current) return;

      // Completion checklist — shown before marking complete.
      if (nextStatus === 'completed') {
        if (job?.wheelNutConsent?.required && !job.wheelNutConsent.canComplete) {
          Alert.alert(t('wheelNutConsent.requiredTitle'), t('wheelNutConsent.requiredBeforeComplete'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('wheelNutConsent.openConsent'), onPress: () => void openWheelNutConsent() },
          ]);
          return;
        }
        setCompletionChecks({ tyreFitted: false, wheelNuts: false, customerInformed: false, paymentChecked: false });
        setCompletionError(null);
        setShowCompletionChecklist(true);
        return;
      }

      if (nextStatus === 'en_route' && job?.status === 'driver_assigned') {
        setPreJobChecks({ tyreSizeChecked: false, addressChecked: false, paymentChecked: false });
        setShowPreJobChecklist(true);
        return;
      }

      void updateRouteStatus(nextStatus, {
        onError:
          nextStatus === 'arrived'
            ? (message) => setArrivalError(message)
            : undefined,
      });
    },
    [job?.status, job?.wheelNutConsent, openWheelNutConsent, ref, t, updateRouteStatus],
  );

  // Confirms the pre-job checklist and starts travel (driver_assigned → en_route).
  const handleConfirmPreJob = useCallback(() => {
    if (!ref || actionLockRef.current) return;
    setShowPreJobChecklist(false);
    void updateRouteStatus('en_route');
  }, [ref, updateRouteStatus]);

  // Confirms the completion checklist and marks the job complete (in_progress → completed).
  const handleConfirmCompletion = useCallback(() => {
    if (!ref || actionLockRef.current) return;
    setCompletionError(null);
    void updateRouteStatus('completed', {
      busy: setCompletionActioning,
      refresh: false,
      onSuccess: () => {
        setShowCompletionChecklist(false);
        router.back();
      },
      onError: (message) => setCompletionError(message || t('completion.couldNotComplete')),
    });
  }, [ref, router, t, updateRouteStatus]);

  // Auto-arrival prompt confirm. The prompt itself IS the confirmation, so this
  // performs the en_route -> arrived transition directly via the SAME
  // `driverApi.updateJobStatus` mutation the status button uses (no second
  // dialog). Marks the prompt dismissed so it does not reappear this session.
  const handleConfirmArrival = useCallback(() => {
    if (!ref || actionLockRef.current) return;
    arrivalPromptDismissedRef.current = true;
    setShowArrivalPrompt(false);
    setArrivalError(null);
    void updateRouteStatus('arrived', {
      onError: (message) => setArrivalError(message),
    });
  }, [ref, updateRouteStatus]);

  // "Not yet" — driver declines the suggestion; do not show it again this
  // session (it only re-arms when the destination/session changes).
  const handleDismissArrival = useCallback(() => {
    arrivalPromptDismissedRef.current = true;
    setShowArrivalPrompt(false);
    setArrivalError(null);
  }, []);

  const prepareExternalNavigationTracking = useCallback(async () => {
    if (!currentRouteJobRef) return false;
    const ready = await armBackgroundLocationForJob(currentRouteJobRef, driverLocRef.current);
    if (!ready) {
      Alert.alert(
        t('route.externalTrackingRequiredTitle'),
        t('route.externalTrackingRequiredBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.openSettings'),
            onPress: () => { void Linking.openSettings(); },
          },
        ],
      );
    }
    return ready;
  }, [currentRouteJobRef, t]);

  // Google Maps fallback — phase-aware destination (single customer dropoff).
  const handleOpenExternal = useCallback(async () => {
    if (extNavLockRef.current) return;
    extNavLockRef.current = true;
    const lat = customerCoord?.lat ?? null;
    const lng = customerCoord?.lng ?? null;
    let url: string | undefined;
    if (lat != null && lng != null) {
      url = Platform.select({
        android: `google.navigation:q=${lat},${lng}`,
        default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
      });
    } else if (job?.addressLine) {
      const q = encodeURIComponent(job.addressLine);
      url = `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`;
    }
    if (!url) {
      extNavLockRef.current = false;
      return;
    }
    try {
      const trackingReady = await prepareExternalNavigationTracking();
      if (!trackingReady) return;
      await Linking.openURL(url).catch(() => {
        if (lat != null && lng != null) {
          return Linking.openURL(
            `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
          );
        }
        return undefined;
      });
    } finally {
      setTimeout(() => {
        extNavLockRef.current = false;
      }, 800);
    }
  }, [customerCoord, job, prepareExternalNavigationTracking]);

  // Waze external navigation — opens the official Waze deep link.
  // No Waze API key. No unofficial endpoint. No police/camera data.
  const handleOpenWaze = useCallback(async () => {
    if (wazeNavLockRef.current) return;
    const lat = customerCoord?.lat ?? null;
    const lng = customerCoord?.lng ?? null;
    if (lat == null || lng == null) return;
    const dest = { lat, lng };
    if (!isValidNavigationCoordinate(dest)) return;
    wazeNavLockRef.current = true;
    const url = buildWazeNavigationUrl(dest);
    try {
      const trackingReady = await prepareExternalNavigationTracking();
      if (!trackingReady) return;
      await Linking.openURL(url).catch(() => {
        // If Waze is not installed the system browser will handle the URL.
      });
    } finally {
      setTimeout(() => {
        wazeNavLockRef.current = false;
      }, 800);
    }
  }, [customerCoord, prepareExternalNavigationTracking]);

  const handleOpenAppleMaps = useCallback(async () => {
    if (extNavLockRef.current) return;
    const url = buildAppleMapsNavigationUrl(
      customerCoord ? [customerCoord.lng, customerCoord.lat] : null,
      job?.addressLine,
    );
    if (!url) return;
    extNavLockRef.current = true;
    try {
      const trackingReady = await prepareExternalNavigationTracking();
      if (!trackingReady) return;
      await Linking.openURL(url).catch(() => {});
    } finally {
      setTimeout(() => { extNavLockRef.current = false; }, 800);
    }
  }, [customerCoord, job?.addressLine, prepareExternalNavigationTracking]);

  // Manual retry for the road route, gated on the existing minimum interval so
  // the driver cannot spam the Directions API with repeated taps.
  const handleRetryRoute = useCallback(() => {
    const driver = driverLocRef.current;
    const dest = destinationRef.current;
    if (!driver || !dest) return;
    if (Date.now() - lastRouteAtRef.current < ROUTE_MIN_INTERVAL_MS) return;
    const origin = makeRerouteOrigin(driver);
    if (origin) requestRoute(origin, dest);
    else markRouteOriginUnavailable(dest);
  }, [makeRerouteOrigin, markRouteOriginUnavailable, requestRoute]);

  const handleToggleRoutePreference = useCallback(
    (key: keyof RoutePreferences) => {
      const nextPrefs = {
        ...routePreferencesRef.current,
        [key]: !routePreferencesRef.current[key],
      };
      routePreferencesRef.current = nextPrefs;
      setRoutePreferences(nextPrefs);
      const driver = driverLocRef.current;
      const dest = destinationRef.current;
      if (driver && dest) {
        if (devGpsSimulatorRef.current?.isRunning()) {
          devGpsPauseOnRouteChangeRef.current = true;
        }
        const origin = makeRerouteOrigin(driver);
        if (origin) requestRoute(origin, dest);
        else markRouteOriginUnavailable(dest);
      }
    },
    [makeRerouteOrigin, markRouteOriginUnavailable, requestRoute],
  );

  const handleCallCustomer = useCallback(() => {
    const dialable = cleanPhone(job?.customerPhone);
    if (!dialable) {
      Alert.alert(t('route.noPhoneTitle'), t('route.noPhoneBody'));
      return;
    }
    lightHaptic();
    Linking.openURL(`tel:${dialable}`).catch(() => {
      Alert.alert(t('route.callFailedTitle'), t('route.callFailedBody'));
    });
  }, [job, t]);

  const handleRecenter = useCallback(() => {
    setIsFollowingDriver(true);
    setFollowMode('heading_up');
    // A deliberate recenter restores navigation; GPS updates preserve manual zoom.
    setCameraEpoch((e) => e + 1);
  }, []);

  const handleToggleRouteOverview = useCallback(() => {
    lightHaptic();
    setFollowMode((m) => (m === 'overview' ? 'heading_up' : 'overview'));
    setIsFollowingDriver(true);
    setCameraEpoch((e) => e + 1);
  }, []);

  const handleToggleMapDepth = useCallback(() => {
    lightHaptic();
    setMapDepthMode((m) => (m === '3d' ? '2d' : '3d'));
    setCameraEpoch((e) => e + 1);
  }, []);

  const handleSelectMapStyle = useCallback((mode: MapStyleMode) => {
    lightHaptic();
    setMapStyleMode(mode);
  }, []);

  // Toggle spoken voice guidance (persisted). Stops any active speech on mute.
  const handleToggleVoice = useCallback(() => {
    const next = !voiceEnabledRef.current;
    setVoiceEnabledState(next);
    void setVoiceEnabled(next);
    if (next) {
      lightHaptic();
      spokenStepRef.current = -1; // allow the current maneuver to be re-spoken
    } else {
      stopVoice();
    }
  }, []);

  // Driver picked an alternative route from the cockpit chips (or by tapping a
  // muted line on the map). Switches the active guidance to that route.
  const handleSelectAlternative = useCallback((index: number) => {
    const rs = routeStateRef.current;
    if (rs.source !== 'mapbox' || !rs.routes[index] || index === rs.selectedIndex) {
      return;
    }
    if (devGpsSimulatorRef.current?.isRunning()) {
      devGpsPauseOnRouteChangeRef.current = true;
    }
    lightHaptic();
    stepIndexRef.current = rs.routes[index].steps.length > 1 ? 1 : 0;
    setCurrentStepIndex(stepIndexRef.current);
    fitPendingRef.current = followModeRef.current === 'overview';
    navigationProgressRef.current = null;
    bumpRouteSequence();
    const next = makeRouteState('mapbox', rs.routes, index, rs.error, {
      routeJobRef: rs.routeJobRef,
      routeDestinationKey: rs.routeDestinationKey,
      routeCalculatedAt: rs.routeCalculatedAt,
      routeOriginFixAt: rs.routeOriginFixAt,
    });
    routeStateRef.current = next;
    setRouteState(next);
  }, [bumpRouteSequence]);

  const handleEnableLocation = useCallback(() => {
    setPermissionDenied(false);
    setPermRetry((n) => n + 1);
  }, []);

  // Dismiss the current smart reminder and record cooldown.
  const handleDismissReminder = useCallback(() => {
    const id = activeReminderIdRef.current;
    if (id != null) {
      reminderDismissedRef.current = {
        ...reminderDismissedRef.current,
        [id]: Date.now(),
      };
    }
    setActiveReminder(null);
  }, []);

  // Execute a reminder action (navigation/call — never auto-changes status).
  const handleReminderAction = useCallback(
    (action: SmartReminderAction) => {
      switch (action) {
        case 'call_customer':
          handleCallCustomer();
          break;
        case 'open_waze':
          handleOpenWaze();
          break;
        case 'open_google_maps':
          handleOpenExternal();
          break;
        case 'mark_arrived':
          void handleConfirmArrival();
          break;
        case 'complete_job':
          handleStatusAction('completed');
          break;
        case 'check_payment':
          setCockpitCollapsed(false);
          break;
        default:
          break;
      }
      handleDismissReminder();
    },
    [
      handleCallCustomer,
      handleOpenWaze,
      handleOpenExternal,
      handleConfirmArrival,
      handleStatusAction,
      handleDismissReminder,
    ],
  );

  // ── Derived UI values ──
  const statusAction = job ? STATUS_ACTIONS[job.status] : null;
  const devGpsRouteCoordinates = useMemo(
    () =>
      devGpsAllowed &&
      routeIsCurrent &&
      routeState.geometry != null &&
      routeState.geometry.length >= 2
        ? routeState.geometry
        : [],
    [devGpsAllowed, routeIsCurrent, routeState.geometry],
  );
  const devGpsRouteReady = devGpsRouteCoordinates.length >= 2;
  const devGpsRouteRev =
    devGpsRouteReady
      ? `${routeState.selectedIndex}|${devGpsRouteCoordinates.length}|${
          devGpsRouteCoordinates[0][0]
        },${devGpsRouteCoordinates[0][1]}|${
          devGpsRouteCoordinates[devGpsRouteCoordinates.length - 1][0]
        },${devGpsRouteCoordinates[devGpsRouteCoordinates.length - 1][1]}`
      : '';
  const devGpsLostActive = devGpsLostUntil != null && nowTick < devGpsLostUntil;
  const devGpsDebugText = useMemo(() => {
    if (!devGpsAllowed) return null;
    const routeDistance =
      distanceFromRouteMeters == null
        ? 'n/a'
        : `${Math.round(distanceFromRouteMeters)}m`;
    const rawText = formatCoordForDebug(rawDriverPosition);
    const displayText = formatCoordForDebug(displayDriverPosition);
    const customerText = formatCoordForDebug(customerMarkerPosition);
    const routeEndText = formatCoordForDebug(routeEndPosition);
    const displaySource =
      displayMode === 'snapped' && snappedDriverPosition ? 'snapped' : 'raw';

    return [
      `routeDistance: ${routeDistance} | display: ${displaySource}`,
      `raw ${rawText} | display ${displayText}`,
      `customer ${customerText} | routeEnd ${routeEndText}`,
    ].join('\n');
  }, [
    customerMarkerPosition,
    devGpsAllowed,
    displayDriverPosition,
    displayMode,
    distanceFromRouteMeters,
    rawDriverPosition,
    routeEndPosition,
    snappedDriverPosition,
  ]);

  const applyDevGpsUpdate = useCallback(
    async (update: DriverLocationUpdate) => {
      if (!devGpsAllowed) return;
      const c = { lat: update.lat, lng: update.lng };

      const fixTime = Date.parse(update.recordedAt);
      const acceptedFixTime = Number.isFinite(fixTime) ? fixTime : Date.now();
      const speedMps = update.speedMph * 0.44704;
      const accepted = acceptDriverFix({
        coordinate: c,
        timestampMs: acceptedFixTime,
        accuracyMeters: update.accuracyMeters,
        heading: update.heading,
        speedMps,
        source: 'dev-simulator',
      });
      if (!accepted) return;
      setDevGpsLastUpdate(update);
      if (accepted.quality !== 'accepted') return;
      handlersRef.current.onFix(accepted.coordinate);

      if (!currentRouteJobRef) return;
      const now = Date.now();
      if (devGpsInFlightRef.current || now < devGpsNextSendAtRef.current) return;

      devGpsInFlightRef.current = true;
      try {
        await driverApi.updateLocation(accepted.coordinate.lat, accepted.coordinate.lng, currentRouteJobRef, {
          timestamp: new Date(acceptedFixTime).toISOString(),
          accuracy: update.accuracyMeters,
          heading: update.heading,
          speed: speedMps,
          source: 'foreground',
        });
        const sentAt = Date.now();
        devGpsNextSendAtRef.current = sentAt + DEV_GPS_BACKEND_MIN_INTERVAL_MS;
        setDevGpsError(null);
      } catch (error) {
        const retryMs =
          error instanceof ApiError && error.retryAfterSeconds != null
            ? error.retryAfterSeconds * 1000
            : DEV_GPS_BACKEND_MIN_INTERVAL_MS;
        devGpsNextSendAtRef.current = Date.now() + retryMs;
        const message =
          error instanceof Error ? error.message : 'Location update failed.';
        setDevGpsError(`Location update failed: ${message}`);
      } finally {
        devGpsInFlightRef.current = false;
      }
    },
    [acceptDriverFix, currentRouteJobRef, devGpsAllowed],
  );

  const ensureDevGpsSimulator = useCallback(() => {
    if (!devGpsAllowed) return null;
    if (devGpsTerminal) {
      setDevGpsError('Job closed.');
      return null;
    }
    if (!devGpsRouteReady) {
      setDevGpsError('Route not ready. Refresh route first.');
      return null;
    }

    if (!devGpsSimulatorRef.current) {
      devGpsSimulatorRef.current = createDriverGpsSimulator({
        routeCoordinates: devGpsRouteCoordinates,
        speedMph: devGpsSpeedMph,
        onUpdate: applyDevGpsUpdate,
        onError: (error) => {
          const message =
            error instanceof Error ? error.message : 'GPS simulator failed.';
          setDevGpsError(message.replace('[driverGpsSimulator] ', ''));
        },
        onComplete: () => {
          setDevGpsRunning(false);
          setDevGpsPaused(false);
        },
      });
    } else {
      devGpsSimulatorRef.current.setRouteCoordinates(devGpsRouteCoordinates);
      devGpsSimulatorRef.current.setSpeedMph(devGpsSpeedMph);
      devGpsSimulatorRef.current.setWeakGps(devGpsWeak);
    }

    devGpsRouteRevRef.current = devGpsRouteRev;
    return devGpsSimulatorRef.current;
  }, [
    applyDevGpsUpdate,
    devGpsAllowed,
    devGpsTerminal,
    devGpsRouteCoordinates,
    devGpsRouteRev,
    devGpsRouteReady,
    devGpsSpeedMph,
    devGpsWeak,
  ]);

  useEffect(() => {
    const simulator = devGpsSimulatorRef.current;
    if (!devGpsAllowed || !simulator || !devGpsRouteReady) return;
    const previousRev = devGpsRouteRevRef.current;
    devGpsRouteRevRef.current = devGpsRouteRev;
    if (!previousRev || previousRev === devGpsRouteRev) {
      simulator.setRouteCoordinates(devGpsRouteCoordinates);
      return;
    }

    if (simulator.isRunning() && devGpsPauseOnRouteChangeRef.current) {
      devGpsPauseOnRouteChangeRef.current = false;
      simulator.pause();
      simulator.setRouteCoordinates(devGpsRouteCoordinates);
      simulator.reset({ emit: false });
      setDevGpsRunning(false);
      setDevGpsPaused(true);
      setDevGpsError('Route changed. Restart GPS Simulation.');
      return;
    }

    devGpsPauseOnRouteChangeRef.current = false;
    simulator.setRouteCoordinates(devGpsRouteCoordinates);
    if (!simulator.isRunning()) {
      simulator.reset({ emit: false });
      setDevGpsLastUpdate(null);
    }
  }, [devGpsAllowed, devGpsRouteCoordinates, devGpsRouteReady, devGpsRouteRev]);

  useEffect(() => {
    devGpsSimulatorRef.current?.setWeakGps(devGpsWeak);
  }, [devGpsWeak]);

  useEffect(() => {
    devGpsSimulatorRef.current?.setSpeedMph(devGpsSpeedMph);
  }, [devGpsSpeedMph]);

  const handleDevGpsStart = useCallback(() => {
    const simulator = ensureDevGpsSimulator();
    if (!simulator) return;
    devGpsActiveRef.current = true;
    simulator.setSpeedMph(devGpsSpeedMph);
    simulator.setWeakGps(devGpsWeak);
    simulator.start();
    setDevGpsRunning(true);
    setDevGpsPaused(false);
    setDevGpsError(null);
  }, [devGpsSpeedMph, devGpsWeak, ensureDevGpsSimulator]);

  const handleDevGpsPause = useCallback(() => {
    const simulator = devGpsSimulatorRef.current;
    if (!simulator) return;
    simulator.pause();
    setDevGpsRunning(false);
    setDevGpsPaused(true);
  }, []);

  const handleDevGpsReset = useCallback(() => {
    const simulator = ensureDevGpsSimulator();
    if (!simulator) return;
    devGpsActiveRef.current = true;
    devGpsNextSendAtRef.current = 0;
    clearDevGpsLostTimer();
    setDevGpsLostUntil(null);
    setDevGpsLastUpdate(null);
    setDevGpsError(null);
    simulator.reset();
    setDevGpsRunning(simulator.isRunning());
    setDevGpsPaused(!simulator.isRunning());
  }, [clearDevGpsLostTimer, ensureDevGpsSimulator]);

  const handleDevGpsSpeed = useCallback((speed: DevGpsSpeedMph) => {
    setDevGpsSpeedMph(speed);
    devGpsSimulatorRef.current?.setSpeedMph(speed);
  }, []);

  const handleDevGpsWeakToggle = useCallback(() => {
    setDevGpsWeak((current) => {
      const next = !current;
      devGpsSimulatorRef.current?.setWeakGps(next);
      return next;
    });
  }, []);

  const handleDevGpsLost = useCallback(() => {
    const simulator = devGpsSimulatorRef.current;
    if (!simulator || !simulator.isRunning()) {
      setDevGpsError('Start GPS Simulation first.');
      return;
    }
    simulator.simulateGpsLost(DEV_GPS_LOST_MS);
    const until = Date.now() + DEV_GPS_LOST_MS;
    setDevGpsLostUntil(until);
    setDevGpsError(null);
    clearDevGpsLostTimer();
    devGpsLostTimerRef.current = setTimeout(() => {
      setDevGpsLostUntil(null);
    }, DEV_GPS_LOST_MS);
  }, [clearDevGpsLostTimer]);

  const handleDevGpsOffRoute = useCallback(() => {
    const simulator = devGpsSimulatorRef.current;
    if (!simulator || !simulator.isRunning()) {
      setDevGpsError('Start GPS Simulation first.');
      return;
    }
    // Force the first off-route sample through the normal backend path even if
    // a routine simulator tick was just sent, so admin/customer tracking can
    // see the same raw canonical coordinate during this test case.
    devGpsNextSendAtRef.current = 0;
    simulator.simulateOffRoute();
    setDevGpsError(null);
  }, []);

  const steps = routeIsCurrent ? routeState.steps : [];
  const activeStepIndex = navigationProgress.currentStepIndex;
  const upcomingStep =
    steps.length > 1 ? steps[Math.min(activeStepIndex, steps.length - 1)] : null;
  const nextStep =
    steps.length > activeStepIndex + 1 ? steps[activeStepIndex + 1] : null;
  const distanceToManeuver =
    navigationProgress.distanceToManeuverMeters ??
    (upcomingStep && driverLoc
      ? routeDistanceToStep(displayDriverPosition ?? driverLoc, upcomingStep, selectedRouteCoordinates) ??
        haversineMeters(driverLoc, {
          lng: upcomingStep.location[0],
          lat: upcomingStep.location[1],
        })
      : null);

  // Straight-line distance to the customer — drives arrival wording.
  const metersToCustomer =
    driverLoc && customerCoord ? haversineMeters(driverLoc, customerCoord) : null;
  const arrival = arrivalPhrase(metersToCustomer, t);
  const fixSeconds =
    lastFixAt == null ? null : Math.max(0, Math.round((nowTick - lastFixAt) / 1000));
  const routeUpdatedSeconds =
    routeIsCurrent && routeState.routeCalculatedAt != null
      ? Math.max(0, Math.round((nowTick - routeState.routeCalculatedAt) / 1000))
      : null;
  const routeOriginFixSeconds =
    routeIsCurrent && routeState.routeOriginFixAt != null
      ? Math.max(0, Math.round((nowTick - routeState.routeOriginFixAt) / 1000))
      : null;
  const routeInstructionStale =
    routeOriginFixSeconds != null &&
    routeOriginFixSeconds > ROUTE_INSTRUCTION_STALE_SECONDS;
  const routeOriginMovedMeters =
    routeIsCurrent && driverLoc && lastRouteOriginRef.current
      ? haversineMeters(driverLoc, lastRouteOriginRef.current)
      : null;
  const routeNeedsRefresh =
    routeIsCurrent &&
    routeInstructionStale &&
    routeOriginMovedMeters != null &&
    routeOriginMovedMeters > ROUTE_REFRESH_MIN_MOVE_M;

  // Primary headline: arrival wording wins; then the live Mapbox maneuver;
  // then a human fallback so the panel is never blank.
  // VOICE GUIDANCE (Part 3): IMPLEMENTED via `expo-speech` (SDK 55-compatible,
  // autolinked native TTS). Spoken guidance is OFF by default behind a persisted
  // mute toggle, debounced in `@/services/voice`, and limited to (a) the active
  // turn-by-turn maneuver — voiced once per step by the effect below — and
  // (b) a few major engine events in `playRouteCue`. It never reuses the urgent
  // full-screen new-job alert path. Requires a native rebuild to function.
  // hasLiveStep is false while rerouting so old turn instructions are never shown
  // or spoken while a new route is being fetched.
  const maneuverLocationTrusted =
    !navigationProgress.isOffRoute &&
    !navigationProgress.locationWeak &&
    !navigationProgress.isLocationStale &&
    routeDeviation?.kind !== 'off-route' &&
    (distanceFromRouteMeters == null || distanceFromRouteMeters <= OFF_ROUTE_METERS);
  const hasLiveStep =
    !rerouting &&
    routeIsCurrent &&
    maneuverLocationTrusted &&
    !!upcomingStep &&
    phase === 'to_dropoff';
  const locationStatusInstruction =
    permissionDenied || navigationLocationState === 'permission-denied'
      ? t('route.locationPermissionRequired')
      : navigationLocationState === 'requesting'
        ? t('route.findingLocation')
        : navigationLocationState === 'weak'
          ? t('route.gpsSignalWeak')
          : navigationLocationState === 'stale'
            ? t('route.locationStale')
            : navigationLocationState === 'unavailable'
              ? t('route.locationUnavailable')
              : navigationLocationState === 'error'
                ? t('route.locationError')
                : null;
  const primaryInstruction = arrival
    ? arrival
    : rerouting
      ? t('route.findingBetterRoute')
    : hasLiveStep && upcomingStep
      ? humanizeInstruction(upcomingStep, t)
      : routeState.loading
        ? t('route.calculatingRoute')
        : locationStatusInstruction != null
          ? locationStatusInstruction
      : fallbackGuidance(metersToCustomer, t);
  const primaryDistance =
    !arrival && hasLiveStep && distanceToManeuver != null
      ? formatGuidanceDistance(distanceToManeuver, t)
      : null;
  const nextInstruction =
    !arrival && hasLiveStep && nextStep ? humanizeInstruction(nextStep, t) : null;
  const maneuverShimmerSpec = getManeuverShimmerSpec({
    maneuverType: arrival ? 'arrive' : rerouting ? 'continue' : upcomingStep?.maneuverType ?? null,
    maneuverModifier: upcomingStep?.maneuverModifier ?? null,
    drivingSide: upcomingStep?.drivingSide ?? null,
    reducedMotion: reduceMotionEnabled,
    appState: routeScreenAppState,
  });
  const maneuverWarningPhase = navigationProgress.maneuverWarningPhase;
  const instructionCardPhaseStyle =
    maneuverWarningPhase === 'executing'
      ? styles.instructionCardExecuting
      : maneuverWarningPhase === 'imminent'
        ? styles.instructionCardImminent
        : maneuverWarningPhase === 'prepare'
          ? styles.instructionCardPrepare
          : null;
  const instructionIconPhaseStyle =
    maneuverWarningPhase === 'executing'
      ? styles.instructionIconExecuting
      : maneuverWarningPhase === 'imminent'
        ? styles.instructionIconImminent
        : maneuverWarningPhase === 'prepare'
          ? styles.instructionIconPrepare
          : null;
  const maneuverShimmerTranslateX = maneuverShimmer.interpolate({
    inputRange: [0, 1],
    outputRange: maneuverShimmerSpec.translateX,
  });
  const maneuverShimmerTranslateY = maneuverShimmer.interpolate({
    inputRange: [0, 1],
    outputRange: maneuverShimmerSpec.translateY,
  });
  const maneuverShimmerRotate = maneuverShimmer.interpolate({
    inputRange: [0, 1],
    outputRange: maneuverShimmerSpec.rotate,
  });
  const maneuverShimmerScale = maneuverShimmer.interpolate({
    inputRange: [0, 1],
    outputRange: maneuverShimmerSpec.scale,
  });
  const maneuverSignalTailOpacity = maneuverShimmer.interpolate({
    inputRange: [0, 0.28, 0.56, 1],
    outputRange: [0.08, 0.5, 0.18, 0.08],
  });
  const maneuverSignalMidOpacity = maneuverShimmer.interpolate({
    inputRange: [0, 0.28, 0.56, 1],
    outputRange: [0.14, 0.22, 0.62, 0.14],
  });
  const maneuverSignalLeadOpacity = maneuverShimmer.interpolate({
    inputRange: [0, 0.28, 0.56, 1],
    outputRange: [0.24, 0.14, 0.28, 0.74],
  });

  useEffect(() => {
    const shouldAnimate =
      Platform.OS !== 'web' &&
      !maneuverShimmerSpec.paused &&
      (arrival != null || hasLiveStep || rerouting);
    if (!shouldAnimate) {
      maneuverShimmer.stopAnimation();
      maneuverShimmer.setValue(0);
      return undefined;
    }
    const animation = Animated.loop(
      Animated.timing(maneuverShimmer, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => {
      animation.stop();
      maneuverShimmer.stopAnimation();
      maneuverShimmer.setValue(0);
    };
  }, [
    arrival,
    hasLiveStep,
    maneuverShimmer,
    maneuverShimmerSpec.category,
    maneuverShimmerSpec.mode,
    maneuverShimmerSpec.paused,
    rerouting,
  ]);

  // Speak the active maneuver aloud exactly once, as the step becomes current.
  // The step-index guard prevents re-speaking on every GPS tick; the voice
  // service additionally enforces a min gap + same-phrase suppression.
  useEffect(() => {
    if (!voiceEnabled || !hasLiveStep || !upcomingStep) {
      if (!hasLiveStep) spokenStepRef.current = -1;
      return;
    }
    if (activeStepIndex === spokenStepRef.current) return;
    spokenStepRef.current = activeStepIndex;
    const instruction = humanizeInstruction(upcomingStep, t);
    const phrase =
      distanceToManeuver != null
        ? `${formatGuidanceDistance(distanceToManeuver, t)}, ${instruction}`
        : instruction;
    speakGuidance(phrase, { locale: localeRef.current, force: true });
  }, [voiceEnabled, hasLiveStep, upcomingStep, activeStepIndex, distanceToManeuver, t]);

  // A route-fetch attempt has definitively failed (no fallback drawn).
  const rerouteFailed =
    routeState.source === 'none' &&
    routeState.error != null &&
    routeState.error.kind !== 'network' &&
    routeState.error.kind !== 'invalid-coords' &&
    routeState.error.kind !== 'aborted';

  const displayDistanceMeters =
    routeIsCurrent ? navigationProgress.remainingDistanceMeters ?? routeState.distanceMeters : null;
  const displayDurationSeconds =
    routeIsCurrent ? navigationProgress.remainingDurationSeconds ?? routeState.durationSeconds : null;

  const distanceMiles =
    displayDistanceMeters != null ? metersToMiles(displayDistanceMeters) : null;
  const durationMin =
    displayDurationSeconds != null ? secondsToMinutes(displayDurationSeconds) : null;
  const arrivalEtaLabel =
    displayDurationSeconds != null
      ? formatDueBackTime(new Date(nowTick + Math.max(0, displayDurationSeconds) * 1_000))
      : '--:--';
  const navigationFixStale =
    lastFixAt == null || nowTick - lastFixAt > NAVIGATION_PROGRESS_STALE_MS;
  const speedMph =
    !navigationFixStale &&
    navigationProgress.speedDisplayReliable &&
    navigationProgress.speedMph != null
      ? Math.max(0, Math.round(navigationProgress.speedMph))
      : null;
  const speedValueText = speedMph != null ? String(speedMph) : '--';
  const speedUnitText = 'mph';
  const speedLimitMph =
    !navigationFixStale && navigationProgress.speedLimitSource === 'mapbox-maxspeed'
      ? navigationProgress.currentSpeedLimitMph
      : null;
  const speedLimitReliable = speedLimitMph != null;
  const speedOverLimit =
    speedMph != null && speedLimitMph != null && speedMph > speedLimitMph + 2;
  const roadMetaText =
    navigationProgress.currentRoadName ??
    roadClassLabel(navigationProgress.currentRoadClass) ??
    '--';
  const laneGuidance = hasLiveStep ? navigationProgress.laneGuidance : null;
  const roundaboutBranches = hasLiveStep ? roundaboutDiagramBranches(upcomingStep ?? null) : [];

  const renderGuidanceText = (
    text: string,
    step: RouteStep | null,
    style: React.ComponentProps<typeof Text>['style'],
    numberOfLines: number,
  ) => {
    const parts = splitInstructionRoadName(text, step?.name);
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {parts ? (
          <>
            {parts.before}
            <Text style={styles.ltrText}>{parts.road}</Text>
            {parts.after}
          </>
        ) : (
          text
        )}
      </Text>
    );
  };

  const renderLaneGuidance = () => {
    if (!laneGuidance) return null;
    return (
      <View style={styles.laneGuidanceRow}>
        {laneGuidance.lanes.map((lane, index) => {
          const isActive = lane.active || lane.valid;
          return (
            <View
              key={`${index}-${lane.indications.join('-')}`}
              style={[
                styles.laneCell,
                isActive && styles.laneCellValid,
                lane.active && styles.laneCellActive,
              ]}
            >
              <Ionicons
                name={laneIndicationIcon(lane)}
                size={17}
                color={isActive ? '#FFFFFF' : '#5F6368'}
              />
            </View>
          );
        })}
      </View>
    );
  };

  const renderRoundaboutDiagram = () => {
    if (!hasLiveStep || !upcomingStep || roundaboutBranches.length === 0) return null;
    const circulation = upcomingStep.drivingSide === 'left' ? 'clockwise' : 'anticlockwise';
    const exitLabel = upcomingStep.exit != null ? String(upcomingStep.exit) : '–';
    return (
      <View
        style={styles.roundaboutDiagram}
        accessibilityLabel={`Roundabout ${circulation}, exit ${exitLabel}`}
      >
        <View style={styles.roundaboutStage}>
          <View style={styles.roundaboutCircle}>
            <Ionicons
              name={circulation === 'clockwise' ? 'arrow-redo' : 'arrow-undo'}
              size={20}
              color={NAV_ROUTE_BLUE}
            />
          </View>
          {roundaboutBranches.map((branch) => (
            <View
              key={branch.key}
              style={[
                styles.roundaboutBranch,
                branch.allowed && styles.roundaboutBranchAllowed,
                branch.incoming && styles.roundaboutApproachBranch,
                branch.selected && styles.roundaboutExitBranch,
                { transform: [{ rotate: `${branch.bearing}deg` }] },
              ]}
            />
          ))}
          <View style={styles.roundaboutExitBadge}>
            <Text style={styles.roundaboutExitBadgeText}>{exitLabel}</Text>
          </View>
        </View>
        <View style={styles.roundaboutTextWrap}>
          <Text style={styles.roundaboutLabel} numberOfLines={1}>
            {circulation === 'clockwise' ? 'UK clockwise roundabout' : 'Roundabout'}
          </Text>
          <Text style={styles.roundaboutSubLabel} numberOfLines={1}>
            {upcomingStep.exit != null ? `Take exit ${upcomingStep.exit}` : 'Follow highlighted exit'}
          </Text>
        </View>
      </View>
    );
  };

  // Cockpit data (all from the real driver job payload).
  const wheelNutConsent = job?.wheelNutConsent ?? null;
  const routeActionBlockedByConsent = Boolean(
    statusAction?.next === 'completed' &&
      wheelNutConsent?.required &&
      wheelNutConsent?.canComplete === false,
  );
  const nextActionLabel = routeActionBlockedByConsent
    ? t('wheelNutConsent.getConsentToComplete')
    : job && NEXT_ACTION_LABEL[job.status] ? t(NEXT_ACTION_LABEL[job.status]) : null;
  const phone = cleanPhone(job?.customerPhone);
  const vehicleLabel =
    job && (job.vehicleReg || job.vehicleMake || job.vehicleModel)
      ? [job.vehicleReg, job.vehicleMake, job.vehicleModel].filter(Boolean).join(' · ')
      : null;
  const tyreLines = getJobTyreLines(job);
  const tyreCount = totalJobTyreQuantity(job);
  const tyreSummary =
    formatJobTyreLinesSummary(job) ??
    (tyreCount > 0
      ? t(tyreCount === 1 ? 'route.tyreUnitSingular' : 'route.tyreUnitPlural', {
          count: tyreCount,
        })
      : null);
  const addressLine = job?.addressLine && job.addressLine.length > 0 ? job.addressLine : null;
  const payDisplay = getDriverPaymentDisplay(job?.paymentSummary ?? job?.payment ?? null, job?.refNumber ?? null);
  const payColors = paymentToneColors(payDisplay.tone);

  // ── Checklist derived warnings ──
  const checklistTyreMissing = tyreLines.length === 0;
  const checklistAddressMissing = !addressLine;
  const checklistPaymentWarning =
    payDisplay.tone === 'pending' ||
    payDisplay.tone === 'unknown' ||
    payDisplay.tone === 'action' ||
    payDisplay.tone === 'warning' ||
    payDisplay.tone === 'failed';

  // Pre-job checklist: all required boxes must be checked before starting.
  const preJobAllChecked =
    preJobChecks.tyreSizeChecked &&
    preJobChecks.addressChecked &&
    preJobChecks.paymentChecked;

  // Completion checklist: all boxes must be checked.
  const completionAllChecked =
    completionChecks.tyreFitted &&
    completionChecks.wheelNuts &&
    completionChecks.customerInformed &&
    completionChecks.paymentChecked;

  // ── Job timeline ──
  // Maps backend statuses to ordered driver-facing phases.
  // "fitting" is a frontend-only phase that maps to in_progress.
  type TimelinePhase = 'accepted' | 'on_the_way' | 'arrived' | 'fitting' | 'completed';
  const TIMELINE_PHASES: { id: TimelinePhase; labelKey: string }[] = [
    { id: 'accepted', labelKey: 'timeline.accepted' },
    { id: 'on_the_way', labelKey: 'timeline.onTheWay' },
    { id: 'arrived', labelKey: 'timeline.arrived' },
    { id: 'fitting', labelKey: 'timeline.fitting' },
    { id: 'completed', labelKey: 'timeline.completed' },
  ];

  function jobStatusToTimelineIndex(status: string | undefined): number {
    switch (status) {
      case 'driver_assigned': return 0;
      case 'en_route': return 1;
      case 'arrived': return 2;
      case 'in_progress': return 3;
      case 'completed': return 4;
      default: return -1;
    }
  }

  const timelineIndex = jobStatusToTimelineIndex(job?.status);

  // ── Reminder action labels ──
  function reminderActionLabel(action: SmartReminderAction): string {
    switch (action) {
      case 'call_customer': return t('reminder.actionCallCustomer');
      case 'open_waze': return t('reminder.actionOpenWaze');
      case 'open_google_maps': return t('reminder.actionOpenMaps');
      case 'mark_arrived': return t('reminder.actionMarkArrived');
      case 'complete_job': return t('reminder.actionCompleteJob');
      case 'check_payment': return t('reminder.actionCheckPayment');
      default: return '';
    }
  }

  let metaText: string;
  if (permissionDenied || navigationLocationState === 'permission-denied') {
    metaText = t('route.locationPermissionRequired');
  } else if (navigationLocationState === 'requesting') {
    metaText = t('route.findingLocation');
  } else if (navigationLocationState === 'weak') {
    metaText = t('route.gpsSignalWeak');
  } else if (navigationLocationState === 'stale') {
    metaText = t('route.locationStale');
  } else if (
    navigationLocationState === 'unavailable' ||
    navigationLocationState === 'error'
  ) {
    metaText = t('route.locationUnavailable');
  } else if (routeIsCurrent) {
    metaText = t('route.liveRoute');
  } else if (routeState.error?.kind === 'network') {
    metaText = t('route.routeUnavailableConnection');
  } else if (routeState.error?.kind === 'invalid-coords' || !customerCoord) {
    metaText = t('route.missingCoordsRoute');
  } else if (rerouteFailed) {
    metaText = t('route.couldNotLoadRoute');
  } else {
    metaText = t('route.calculatingRoute');
  }

  // ── Route health pill (Part 5) — truthful, derived from existing state. ──
  const gpsWeak =
    navigationLocationState === 'weak' ||
    navigationLocationState === 'stale' ||
    (fixSeconds != null && fixSeconds > GPS_WEAK_SECONDS) ||
    (devGpsAllowed && devGpsWeak);
  // Perpendicular drift of the raw GPS fix from the active road route. Beyond
  // the snap threshold the marker is shown un-snapped, so the driver must be
  // told clearly they are off the route (matches SNAP_TO_ROUTE_MAX_DRIFT_M).
  const offRouteMeters = distanceFromRouteMeters;
  const isOffRoute =
    routeDeviation?.kind === 'off-route' ||
    (offRouteMeters != null && offRouteMeters > OFF_ROUTE_METERS);
  const isGpsDrift =
    (devGpsAllowed && devGpsWeak) ||
    routeDeviation?.kind === 'gps-drift' ||
    (offRouteMeters != null &&
      offRouteMeters > GPS_DRIFT_METERS &&
      offRouteMeters <= OFF_ROUTE_METERS);
  let routeHealth: { label: string; tone: 'good' | 'warn' | 'bad' };
  if (permissionDenied || navigationLocationState === 'permission-denied') {
    routeHealth = { label: t('route.gpsOff'), tone: 'bad' };
  } else if (navigationLocationState === 'requesting') {
    routeHealth = { label: t('route.findingLocation'), tone: 'warn' };
  } else if (
    navigationLocationState === 'unavailable' ||
    navigationLocationState === 'error'
  ) {
    routeHealth = { label: t('route.locationUnavailable'), tone: 'bad' };
  } else if (routeState.error?.kind === 'network') {
    // Offline: if the last good Mapbox route is still on screen, say so
    // explicitly so the driver knows it is the last known route, not a live one.
    const hasUsableRoute =
      routeIsCurrent && routeState.geometry != null && routeState.geometry.length >= 2;
    routeHealth = {
      label: hasUsableRoute
        ? t('route.offlineLastRoute')
        : t('route.routeUnavailable'),
      tone: 'bad',
    };
  } else if (routeState.error?.kind === 'invalid-coords' || !customerCoord) {
    routeHealth = { label: t('route.routeUnavailable'), tone: 'bad' };
  } else if (rerouting) {
    routeHealth = { label: t('route.rerouting'), tone: 'warn' };
  } else if (rerouteFailed) {
    routeHealth = { label: t('route.couldNotLoadRoute'), tone: 'bad' };
  } else if (routeNeedsRefresh) {
    routeHealth = { label: t('route.refreshRoute'), tone: 'warn' };
  } else if (isOffRoute) {
    routeHealth = { label: 'Off route', tone: 'warn' };
  } else if (isGpsDrift) {
    routeHealth = { label: 'GPS drift', tone: 'warn' };
  } else if (gpsWeak) {
    routeHealth = { label: t('route.gpsWeak'), tone: 'warn' };
  } else if (routeIsCurrent) {
    routeHealth = { label: t('route.liveRoute'), tone: 'good' };
  } else {
    routeHealth = { label: t('route.findingRoute'), tone: 'warn' };
  }
  // ── Traffic and route options — only real Mapbox values, never faked. ──
  const routeOptions = useMemo(
    () =>
      routeIsCurrent
        ? routeState.routes.slice(0, 3).map((route, index) =>
            buildRouteOption(route, index, routePreferences),
          )
        : [],
    [routeIsCurrent, routeState.routes, routePreferences],
  );
  const selectedRouteOption = routeOptions[routeState.selectedIndex] ?? null;
  const trafficDelayMinutes = selectedRouteOption?.trafficDelayMinutes;
  const trafficStatusLabel =
    trafficDelayMinutes == null
      ? 'Live traffic unavailable'
      : trafficDelayMinutes <= 3
        ? 'Traffic normal'
        : trafficDelayMinutes <= 10
          ? 'Busy traffic'
          : 'Heavy traffic';
  const routeCalculationError =
    routeState.error != null && routeState.error.kind !== 'aborted' && !routeState.loading;
  const showInstructionCard =
    mapLoaded &&
    !mapFatal &&
    primaryInstruction.length > 0 &&
    (arrival != null ||
      rerouting ||
      routeState.loading ||
      locationStatusInstruction != null ||
      (routeIsCurrent && !rerouteFailed));
  const showPermissionOverlay =
    permissionDenied && !routeIsCurrent && driverLoc == null;
  const jobClockMinuteTick = Math.floor(nowTick / 60_000);
  const jobClockNow = useMemo(
    () => new Date(jobClockMinuteTick * 60_000),
    [jobClockMinuteTick],
  );
  const jobClockGpsState: JobTimeGpsState = isOffRoute
    ? 'off_route'
    : isGpsDrift
      ? 'drift'
      : gpsWeak
        ? 'weak'
        : 'normal';
  const outboundMinutesForJobClock =
    routeIsCurrent && displayDurationSeconds != null
      ? secondsToMinutes(displayDurationSeconds)
      : null;
  const returnRouteAvailable =
    returnRouteEstimate.error == null && returnRouteEstimate.durationMinutes != null;
  const jobClockEstimate: JobTimeEstimate = useMemo(
    () =>
      calculateJobTimeEstimate({
        now: jobClockNow,
        outboundMinutes: outboundMinutesForJobClock,
        returnMinutes: returnRouteEstimate.durationMinutes,
        trafficDelayMinutes:
          trafficDelayMinutes != null || returnRouteEstimate.trafficDelayMinutes != null
            ? Math.max(
                trafficDelayMinutes ?? 0,
                returnRouteEstimate.trafficDelayMinutes ?? 0,
              )
            : null,
        serviceType: job?.serviceType ?? null,
        tyreCount,
        bookingStatus: job?.status ?? null,
        paymentStatus: job?.paymentSummary?.state ?? job?.payment?.state ?? null,
        gpsState: jobClockGpsState,
        plannedDueBackAt: null,
        returnEstimateAvailable: returnRouteAvailable,
      }),
    [
      job?.paymentSummary?.state,
      job?.payment?.state,
      job?.serviceType,
      job?.status,
      jobClockGpsState,
      jobClockNow,
      outboundMinutesForJobClock,
      returnRouteAvailable,
      returnRouteEstimate.durationMinutes,
      returnRouteEstimate.trafficDelayMinutes,
      trafficDelayMinutes,
      tyreCount,
    ],
  );
  const jobClockUnavailableReason = jobClockEstimate.isClosed
    ? 'Job closed'
    : !routeIsCurrent
      ? 'Job clock unavailable until route is ready'
      : returnRouteEstimate.error === 'missing-garage'
        ? 'Garage location not configured'
        : returnRouteEstimate.error === 'failed'
          ? 'Return estimate unavailable'
          : returnRouteEstimate.loading && returnRouteEstimate.durationMinutes == null
            ? 'Return estimate calculating'
            : null;
  const jobClockBadgeLabel =
    jobClockEstimate.isClosed || jobClockUnavailableReason != null
      ? 'Unavailable'
      : jobClockEstimate.risk === 'late'
        ? 'Late'
        : jobClockEstimate.risk === 'at_risk'
          ? 'At risk'
          : 'On time';
  const jobClockBadgeTone:
    | 'on_time'
    | 'at_risk'
    | 'late'
    | 'unavailable' =
    jobClockEstimate.isClosed || jobClockUnavailableReason != null
      ? 'unavailable'
      : jobClockEstimate.risk;
  const jobClockTotalLabel = formatMinutesCompact(jobClockEstimate.totalMinutes);
  const jobClockDueBackLabel =
    jobClockEstimate.isClosed ? '--:--' : formatDueBackTime(jobClockEstimate.dueBackAt);
  const jobClockOutboundLabel =
    jobClockEstimate.outboundMinutes != null
      ? formatMinutesCompact(jobClockEstimate.outboundMinutes)
      : '--';
  const jobClockReturnLabel =
    returnRouteEstimate.loading && returnRouteEstimate.durationMinutes == null
      ? 'calculating'
      : jobClockEstimate.returnEstimateAvailable && jobClockEstimate.returnMinutes != null
        ? formatMinutesCompact(jobClockEstimate.returnMinutes)
        : 'unavailable';

  // ── Final destination precision (Part 10) ──
  // Distance between the customer's true coordinate and the point Mapbox
  // snapped the route to. A large gap means the road route stops short of the
  // building — surfaced honestly so the driver checks the final approach.
  const snapGapMeters =
    routeIsCurrent && routeState.destinationSnap && customerCoord
      ? haversineMeters(customerCoord, {
          lng: routeState.destinationSnap[0],
          lat: routeState.destinationSnap[1],
        })
      : null;
  const routeEndsShort = snapGapMeters != null && snapGapMeters > ARRIVAL_HERE_M;

  const mapDepthLabel = mapDepthMode === '3d' ? '3D' : '2D';
  const routeOverviewActive = followMode === 'overview';

  // ── Safer arrival workflow (Part 6) ──
  const isEnRoute = job?.status === 'en_route';
  const within100m =
    metersToCustomer != null && metersToCustomer <= ARRIVAL_VERY_CLOSE_M;
  const within25m = metersToCustomer != null && metersToCustomer <= ARRIVAL_HERE_M;
  // Emphasise "Mark arrived" once the driver is on the customer's doorstep.
  const emphasiseArrived = isEnRoute && within100m;
  // Doorstep hint at 25 m — a nudge, never an auto-confirm.
  const showAtCustomerHint = isEnRoute && within25m;

  const renderJobClock = (compact: boolean) => (
    <View style={[styles.jobClockCard, compact && styles.jobClockCardCompact]}>
      <View style={styles.jobClockHeader}>
        <View style={styles.jobClockTitleRow}>
          <Ionicons name="time-outline" size={14} color="#F97316" />
          <Text style={styles.jobClockTitle}>Job clock</Text>
        </View>
        <View
          style={[
            styles.jobClockBadge,
            jobClockBadgeTone === 'on_time' && styles.jobClockBadgeOnTime,
            jobClockBadgeTone === 'at_risk' && styles.jobClockBadgeAtRisk,
            jobClockBadgeTone === 'late' && styles.jobClockBadgeLate,
            jobClockBadgeTone === 'unavailable' && styles.jobClockBadgeUnavailable,
          ]}
        >
          <Text style={styles.jobClockBadgeText}>{jobClockBadgeLabel}</Text>
        </View>
      </View>
      {jobClockUnavailableReason != null && (
        <Text style={styles.jobClockMessage} numberOfLines={1}>
          {jobClockUnavailableReason}
        </Text>
      )}
      {!jobClockEstimate.isClosed && (
        <>
          <Text style={styles.jobClockSummary} numberOfLines={1}>
            {jobClockEstimate.returnEstimateAvailable
              ? `Total ${jobClockTotalLabel} · Due back ${jobClockDueBackLabel}`
              : `Partial ${jobClockTotalLabel} · Due back ${jobClockDueBackLabel}`}
          </Text>
          <Text style={styles.jobClockBreakdown} numberOfLines={compact ? 1 : 2}>
            To customer {jobClockOutboundLabel} · On site{' '}
            {formatMinutesCompact(jobClockEstimate.onSiteMinutes)} · Back{' '}
            {jobClockReturnLabel}
          </Text>
        </>
      )}
    </View>
  );

  if (!ref) {
    return <LoadingScreen />;
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Native MapKit map; navigation is independent of a map-rendering token. */}
      <View style={StyleSheet.absoluteFillObject}>
        <DriverNavigationMap
          key={mapKey}
          driver={displayNavigationState.displayLocation}
          customer={customerMarkerPosition ? [customerMarkerPosition.lng, customerMarkerPosition.lat] : null}
          routes={routeIsCurrent ? routeState.routes : []}
          selectedIndex={routeState.selectedIndex}
          remainingGeometry={routeIsCurrent ? navigationProgress.remainingGeometry ?? selectedRouteCoordinates : null}
          travelledGeometry={routeIsCurrent ? navigationProgress.travelledGeometry : null}
          displayHeading={displayNavigationState.displayHeading}
          locationFresh={!navigationProgress.isLocationStale && !navigationProgress.locationWeak}
          following={isFollowingDriver}
          followMode={followMode}
          mapDepthMode={mapDepthMode}
          mapStyleMode={mapStyleMode}
          followZoom={displayNavigationState.followZoom}
          cameraEpoch={cameraEpoch}
          routeRevision={routeRev}
          bottomPadding={(cockpitCollapsed ? COCKPIT_PAD_COLLAPSED : COCKPIT_PAD_EXPANDED) + insets.bottom}
          topPadding={insets.top + 116}
          showAlternatives={followMode === 'overview' || !cockpitCollapsed}
          reduceMotion={reduceMotionEnabled}
          driverLabel={locale === 'ar' ? 'موقعك' : 'Your location'}
          customerLabel={job?.customerName ?? t('route.customer')}
          onReady={handleNativeMapReady}
          onPan={handleNativeMapPan}
          onSelectAlternative={handleSelectAlternative}
          onOpenExternal={handleOpenExternal}
        />
        {!mapLoaded && !mapFatal && (
          <View style={[styles.mapOverlay, styles.noPointerEvents]}>
            <ActivityIndicator color={NAV_ROUTE_BLUE} />
            <Text style={styles.mapOverlayText}>{t('route.loadingMap')}</Text>
          </View>
        )}
        {mapLoaded && !mapFatal && showPermissionOverlay && (
          <View style={styles.locationPermissionCard}>
            <Ionicons name="location-outline" size={28} color={NAV_ROUTE_BLUE} />
            <Text style={styles.fallbackTitle}>{t('route.locationNeeded')}</Text>
            <Text style={styles.fallbackText}>{t('route.locationPermissionRequired')}</Text>
            <Pressable accessibilityRole="button" onPress={handleEnableLocation} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>{t('route.enable')}</Text>
            </Pressable>
          </View>
        )}
        {mapFatal && (
          <View style={styles.mapOverlay}>
            <Ionicons name="map-outline" size={36} color={NAV_ROUTE_BLUE} />
            <Text style={styles.fallbackTitle}>{t('route.mapUnavailable')}</Text>
            <Text style={styles.fallbackText}>{t('route.mapLoadFailed')}</Text>
            <Pressable accessibilityRole="button" onPress={() => {
              recoveryAttemptsRef.current = 0;
              setMapReloadKey((k) => k + 1);
            }} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>{t('common.retry')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={handleOpenExternal} style={styles.secondaryBtn}>
              <Ionicons name="navigate-outline" size={20} color={NAV_ROUTE_BLUE} />
              <Text style={styles.secondaryBtnText}>{t('route.openGoogleMaps')}</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ── Live instruction card — hidden when route has failed (recovery panel handles it)
           but kept when arrival wording is active so the driver sees their destination. ── */}
      {showInstructionCard && (
        <View
          style={[
            styles.instructionCard,
            instructionCardPhaseStyle,
            styles.noPointerEvents,
            { top: Math.max(insets.top + spacing.xs, spacing.md) },
          ]}
        >
          <View style={[styles.instructionIcon, instructionIconPhaseStyle]}>
            {Platform.OS !== 'web' && !maneuverShimmerSpec.paused && (
              maneuverShimmerSpec.mode === 'pulse' ? (
                <Animated.View
                  style={[
                    styles.maneuverSignArrivalPulse,
                    styles.noPointerEvents,
                    {
                      opacity: maneuverSignalLeadOpacity,
                      transform: [{ scale: maneuverShimmerScale }],
                    },
                  ]}
                />
              ) : (
                <Animated.View
                  style={[
                    styles.maneuverSignSignalClip,
                    styles.noPointerEvents,
                    {
                      transform: [
                        { translateX: maneuverShimmerTranslateX },
                        { translateY: maneuverShimmerTranslateY },
                        { rotate: maneuverShimmerRotate },
                        { scale: maneuverShimmerScale },
                      ],
                    },
                  ]}
                >
                  <Animated.View
                    style={[styles.maneuverSignSignalSegment, { opacity: maneuverSignalTailOpacity }]}
                  />
                  <Animated.View
                    style={[styles.maneuverSignSignalSegment, { opacity: maneuverSignalMidOpacity }]}
                  />
                  <Animated.View
                    style={[styles.maneuverSignSignalSegment, { opacity: maneuverSignalLeadOpacity }]}
                  />
                </Animated.View>
              )
            )}
            <Ionicons
              name={
                arrival
                  ? 'flag'
                  : rerouting
                    ? 'refresh'
                    : locationStatusInstruction != null && !routeState.loading && !hasLiveStep
                      ? 'locate'
                    : hasLiveStep && upcomingStep
                      ? maneuverIcon(upcomingStep)
                      : 'navigate'
              }
              size={34}
              color="#FFFFFF"
            />
          </View>
          <View style={styles.instructionTextWrap}>
            {primaryDistance != null && (
              <Text style={styles.instructionDistance}>{primaryDistance}</Text>
            )}
            {renderGuidanceText(primaryInstruction, hasLiveStep ? upcomingStep : null, styles.instructionText, 2)}
            <View style={styles.instructionStatusPill}>
              <View
                style={[
                  styles.healthDot,
                  routeHealth.tone === 'good'
                    ? styles.healthDotGood
                    : routeHealth.tone === 'warn'
                      ? styles.healthDotWarn
                      : styles.healthDotBad,
                ]}
              />
              <Text style={styles.instructionStatusText} numberOfLines={1}>
                {routeHealth.label}
              </Text>
            </View>
            {nextInstruction != null && (
              <Text style={styles.instructionNext} numberOfLines={1}>
                {t('route.thenInstruction', { instruction: nextInstruction })}
              </Text>
            )}
            {renderRoundaboutDiagram()}
            {renderLaneGuidance()}
          </View>
        </View>
      )}

      {/* Rerouting pill + transient payment banner. */}
      {rerouting && (
        <View
          style={[styles.reroutePill, styles.noPointerEvents, { top: insets.top + 124 }]}
        >
          <ActivityIndicator size="small" color="#F97316" />
          <Text style={styles.reroutePillText}>{t('route.reroutingEllipsis')}</Text>
        </View>
      )}
      {paymentBanner != null && (
        <View
          style={[styles.banner, styles.noPointerEvents, { top: insets.top + 124 }]}
        >
          <Ionicons name="checkmark-circle" size={16} color="#137333" />
          <Text style={styles.bannerText}>{paymentBanner}</Text>
        </View>
      )}

      {mapLoaded && !mapFatal && !permissionDenied && (
        <View
          style={[
            styles.speedPanel,
            styles.noPointerEvents,
            {
              bottom:
                (cockpitCollapsed ? COCKPIT_PAD_COLLAPSED : COCKPIT_PAD_EXPANDED) +
                insets.bottom +
                spacing.sm,
            },
          ]}
        >
          <View style={styles.speedPanelTopRow}>
            <View style={styles.currentSpeedBlock}>
              <Text style={styles.currentSpeedValue}>{speedValueText}</Text>
              <Text style={styles.currentSpeedUnit}>{speedUnitText}</Text>
            </View>
            {speedLimitReliable && (
              <View
                style={[
                  styles.speedLimitSign,
                  speedOverLimit && styles.speedLimitSignWarning,
                ]}
              >
                <Text
                  style={[
                    styles.speedLimitValue,
                    speedOverLimit && styles.speedLimitValueWarning,
                  ]}
                >
                  {speedLimitMph}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.speedRoadText} numberOfLines={1}>
            {roadMetaText}
          </Text>
        </View>
      )}

      {/* ── Floating map controls: orientation toggle + recenter (Parts 2,3) ── */}
      {mapLoaded && !mapFatal && !permissionDenied && (
        <View
          style={[
            styles.sideControls,
            styles.boxNonePointerEvents,
            {
              bottom:
                (cockpitCollapsed ? COCKPIT_PAD_COLLAPSED : COCKPIT_PAD_EXPANDED) + insets.bottom + spacing.sm,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isFollowingDriver && !routeOverviewActive }}
            accessibilityLabel={t('route.recenter')}
            onPress={handleRecenter}
            style={[
              styles.ctrlBtn,
              isFollowingDriver && !routeOverviewActive && styles.ctrlBtnAccent,
            ]}
          >
            <Ionicons
              name={isFollowingDriver && !routeOverviewActive ? 'navigate' : 'locate'}
              size={22}
              color={isFollowingDriver && !routeOverviewActive ? NAV_ROUTE_BLUE : '#364B64'}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: routeOverviewActive }}
            accessibilityLabel={routeOverviewActive ? 'Exit route overview' : 'Show route overview'}
            onPress={handleToggleRouteOverview}
            style={[styles.ctrlBtn, routeOverviewActive && styles.ctrlBtnAccent]}
          >
            <Ionicons name="scan-outline" size={22} color={routeOverviewActive ? NAV_ROUTE_BLUE : '#364B64'} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: mapDepthMode === '3d' }}
            accessibilityLabel={`Switch map to ${mapDepthMode === '3d' ? '2D' : '3D'}`}
            onPress={handleToggleMapDepth}
            style={[styles.ctrlBtn, mapDepthMode === '3d' && styles.ctrlBtnAccent]}
          >
            <Ionicons
              name={mapDepthMode === '3d' ? 'cube-outline' : 'map-outline'}
              size={20}
              color={mapDepthMode === '3d' ? NAV_ROUTE_BLUE : '#364B64'}
            />
            <Text style={[styles.ctrlBtnText, mapDepthMode === '3d' && styles.ctrlBtnTextAccent]}>
              {mapDepthLabel}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: voiceEnabled }}
            accessibilityLabel={voiceEnabled ? t('route.voiceOff') : t('route.voiceOn')}
            onPress={handleToggleVoice}
            style={[styles.ctrlBtn, voiceEnabled && styles.ctrlBtnAccent]}
          >
            <Ionicons
              name={voiceEnabled ? 'volume-high' : 'volume-mute'}
              size={22}
              color={voiceEnabled ? NAV_ROUTE_BLUE : '#364B64'}
            />
          </Pressable>
        </View>
      )}

      {devGpsAllowed && (
        <View
          style={[
            styles.devGpsPanel,
            {
              bottom:
                (cockpitCollapsed ? COCKPIT_PAD_COLLAPSED : COCKPIT_PAD_EXPANDED) +
                insets.bottom +
                spacing.sm,
            },
          ]}
        >
          <View style={styles.devGpsHeader}>
            <View style={styles.devGpsTitleRow}>
              <Ionicons name="navigate-circle" size={16} color="#F97316" />
              <Text style={styles.devGpsTitle}>Dev GPS</Text>
            </View>
            <Text style={styles.devGpsState} numberOfLines={1}>
              {devGpsLostActive
                ? 'GPS lost'
                : devGpsRunning
                  ? 'Running'
                  : devGpsPaused
                    ? 'Paused'
                    : 'Idle'}
            </Text>
          </View>

          {!devGpsRouteReady && (
            <Text style={styles.devGpsEmpty}>Route not ready. Refresh route first.</Text>
          )}
          {devGpsTerminal && (
            <Text style={styles.devGpsEmpty}>Job closed.</Text>
          )}

          <View style={styles.devGpsMainRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start GPS Simulation"
              disabled={!devGpsRouteReady || devGpsTerminal}
              onPress={handleDevGpsStart}
              style={[
                styles.devGpsStartBtn,
                (!devGpsRouteReady || devGpsTerminal) && styles.devGpsBtnDisabled,
              ]}
            >
              <Ionicons name="play" size={14} color="#FFFFFF" />
              <Text style={styles.devGpsStartText} numberOfLines={2}>
                Start GPS Simulation
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pause GPS Simulation"
              onPress={handleDevGpsPause}
              style={styles.devGpsIconActionBtn}
            >
              <Ionicons name="pause" size={13} color="#3C4043" />
              <Text style={styles.devGpsActionText} numberOfLines={1}>Pause</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset GPS Simulation"
              onPress={handleDevGpsReset}
              style={styles.devGpsIconActionBtn}
            >
              <Ionicons name="refresh" size={13} color="#3C4043" />
              <Text style={styles.devGpsActionText} numberOfLines={1}>Reset</Text>
            </Pressable>
          </View>

          <View style={styles.devGpsSpeedRow}>
            {DEV_GPS_SPEEDS.map((speed) => {
              const active = speed === devGpsSpeedMph;
              return (
                <Pressable
                  key={speed}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Set GPS speed to ${speed}mph`}
                  onPress={() => handleDevGpsSpeed(speed)}
                  style={[styles.devGpsSpeedChip, active && styles.devGpsSpeedChipActive]}
                >
                  <Text
                    style={[
                      styles.devGpsSpeedText,
                      active && styles.devGpsSpeedTextActive,
                    ]}
                  >
                    {speed}mph
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.devGpsModeRow}>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: devGpsWeak }}
              accessibilityLabel="Toggle Weak GPS"
              onPress={handleDevGpsWeakToggle}
              style={[styles.devGpsActionBtn, styles.devGpsModeBtn, devGpsWeak && styles.devGpsWarnBtn]}
            >
              <Ionicons
                name={devGpsWeak ? 'warning' : 'radio-button-off'}
                size={13}
                color={devGpsWeak ? '#B06000' : '#3C4043'}
              />
              <Text
                style={[
                  styles.devGpsActionText,
                  devGpsWeak && styles.devGpsWarnText,
                ]}
                numberOfLines={2}
              >
                Weak GPS
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Simulate GPS Lost 30s"
              onPress={handleDevGpsLost}
              style={[styles.devGpsActionBtn, styles.devGpsModeBtn, devGpsLostActive && styles.devGpsWarnBtn]}
            >
              <Ionicons
                name="cloud-offline-outline"
                size={13}
                color={devGpsLostActive ? '#B06000' : '#3C4043'}
              />
              <Text
                style={[
                  styles.devGpsActionText,
                  devGpsLostActive && styles.devGpsWarnText,
                ]}
                numberOfLines={2}
              >
                GPS Lost
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Simulate Off Route"
              onPress={handleDevGpsOffRoute}
              style={[styles.devGpsActionBtn, styles.devGpsModeBtn]}
            >
              <Ionicons name="git-branch-outline" size={13} color="#3C4043" />
              <Text style={styles.devGpsActionText} numberOfLines={2}>Off Route</Text>
            </Pressable>
          </View>

          {devGpsDebugText != null ? (
            <Text style={styles.devGpsDebug} numberOfLines={3}>
              {devGpsDebugText}
            </Text>
          ) : devGpsLastUpdate != null ? (
            <Text style={styles.devGpsMeta} numberOfLines={1}>
              {Math.round(devGpsLastUpdate.accuracyMeters)}m accuracy · {devGpsLastUpdate.source}
            </Text>
          ) : null}
          {devGpsError != null && (
            <Text style={styles.devGpsError} numberOfLines={3}>
              {devGpsError}
            </Text>
          )}
        </View>
      )}

      {/* ── Smart driver reminder card ── */}
      {activeReminder != null && !showArrivalPrompt && (
        <View
          style={[
            styles.reminderCard,
            activeReminder.severity === 'urgent'
              ? styles.reminderCardUrgent
              : activeReminder.severity === 'warning'
                ? styles.reminderCardWarning
                : styles.reminderCardInfo,
            {
              bottom:
                (cockpitCollapsed ? COCKPIT_PAD_COLLAPSED : COCKPIT_PAD_EXPANDED) +
                insets.bottom +
                spacing.sm +
                (devGpsAllowed ? DEV_GPS_PANEL_STACK_HEIGHT : 0),
            },
          ]}
        >
          <View style={styles.reminderHeader}>
            <Ionicons
              name={
                activeReminder.severity === 'urgent'
                  ? 'alert-circle'
                  : activeReminder.severity === 'warning'
                    ? 'warning'
                    : 'information-circle'
              }
              size={18}
              color={
                activeReminder.severity === 'urgent'
                  ? '#FCA5A5'
                  : activeReminder.severity === 'warning'
                    ? '#FDE68A'
                    : '#93C5FD'
              }
            />
            <Text style={[styles.reminderTitle, activeReminder.severity === 'urgent' ? styles.reminderTitleUrgent : activeReminder.severity === 'warning' ? styles.reminderTitleWarning : styles.reminderTitleInfo]} numberOfLines={1}>
              {t(activeReminder.titleKey)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('reminder.dismiss')}
              onPress={handleDismissReminder}
              hitSlop={10}
              style={styles.reminderDismiss}
            >
              <Ionicons name="close" size={16} color={colors.muted} />
            </Pressable>
          </View>
          <Text style={styles.reminderBody} numberOfLines={2}>
            {t(activeReminder.bodyKey)}
          </Text>
          <View style={styles.reminderActions}>
            {activeReminder.primaryAction !== 'none' && (
              <Pressable
                accessibilityRole="button"
                onPress={() => handleReminderAction(activeReminder.primaryAction)}
                style={[
                  styles.reminderPrimaryBtn,
                  activeReminder.severity === 'urgent'
                    ? styles.reminderPrimaryBtnUrgent
                    : activeReminder.severity === 'warning'
                      ? styles.reminderPrimaryBtnWarning
                      : styles.reminderPrimaryBtnInfo,
                ]}
              >
                <Text style={styles.reminderPrimaryBtnText}>
                  {reminderActionLabel(activeReminder.primaryAction)}
                </Text>
              </Pressable>
            )}
            {activeReminder.secondaryAction !== 'none' && (
              <Pressable
                accessibilityRole="button"
                onPress={() => handleReminderAction(activeReminder.secondaryAction)}
                style={styles.reminderSecBtn}
              >
                <Text style={styles.reminderSecBtnText}>
                  {reminderActionLabel(activeReminder.secondaryAction)}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* ── Auto "mark arrived" suggestion (Phase A) — never auto-updates ── */}
      {showArrivalPrompt && (
        <View
          style={[
            styles.arrivalPrompt,
            { bottom: (cockpitCollapsed ? COCKPIT_PAD_COLLAPSED : 330) + insets.bottom + spacing.lg },
          ]}
        >
          <View style={styles.arrivalPromptHeader}>
            <Ionicons name="flag" size={18} color="#34A853" />
            <Text style={styles.arrivalPromptText}>{t('route.areYouAtCustomer')}</Text>
          </View>
          <View style={styles.arrivalPromptActions}>
            <Pressable
              accessibilityRole="button"
              onPress={handleDismissArrival}
              style={[styles.arrivalPromptBtn, styles.arrivalPromptBtnGhost]}
              hitSlop={8}
            >
              <Text style={styles.arrivalPromptBtnGhostText}>{t('route.notYet')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={actioning}
              onPress={handleConfirmArrival}
              style={[styles.arrivalPromptBtn, styles.arrivalPromptBtnPrimary, actioning && styles.btnDisabled]}
              hitSlop={8}
            >
              {actioning ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              )}
              <Text style={styles.arrivalPromptBtnPrimaryText}>{t('route.markArrived')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Bottom cockpit sheet (collapsible) ── */}
      <View style={[styles.cockpit, { paddingBottom: insets.bottom + spacing.sm }]}>

        {/* Grabber — always visible, full-width tap target to toggle. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cockpitCollapsed ? t('route.expandDetails') : t('route.collapseDetails')}
          onPress={() => setCockpitCollapsed((c) => !c)}
          style={styles.grabberRow}
          hitSlop={10}
        >
          <View style={styles.grabber} />
          <View style={styles.grabberHint}>
            <Ionicons
              name={cockpitCollapsed ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.muted}
            />
            <Text style={styles.grabberHintText}>
              {cockpitCollapsed ? t('route.expandDetails') : t('route.collapseDetails')}
            </Text>
          </View>
        </Pressable>

        {!cockpitCollapsed && renderJobClock(false)}

        {arrivalError != null && <View style={styles.routeErrorPanel}>
          <Ionicons name="alert-circle-outline" size={20} color="#B3261E" />
          <Text style={styles.routeErrorText}>{arrivalError}</Text>
        </View>}

        {cockpitCollapsed ? (
          <>
          <View style={styles.navigationSummaryRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={locale === 'ar' ? 'العودة إلى الحجوزات' : 'Back to jobs'}
              onPress={() => router.back()} style={styles.navigationSmallButton}>
              <Ionicons name="chevron-back" size={23} color="#24364D" />
            </Pressable>
            <View style={styles.navigationSummaryText}>
              <Text style={styles.navigationDestination} numberOfLines={1}>
                {addressLine ?? job?.customerName ?? t('route.customer')}
              </Text>
            </View>
            {phone != null && <Pressable accessibilityRole="button" accessibilityLabel={t('route.callCustomer')}
              onPress={handleCallCustomer} style={styles.navigationSmallButton}>
              <Ionicons name="call-outline" size={22} color={NAV_ROUTE_BLUE} />
            </Pressable>}
          </View>
          <View style={styles.navigationPaymentSurface}>
            <DriverPaymentCard payment={job?.paymentSummary ?? job?.payment} compact />
          </View>
          <View style={styles.collapsedMetaRow}>
            <View style={styles.collapsedEtaBlock}>
              <Text style={styles.collapsedEtaNum}>
                {durationMin != null ? String(durationMin) : '--'}
              </Text>
              <Text style={styles.collapsedEtaUnit}>{t('route.etaMin')}</Text>
            </View>
            <View style={styles.collapsedMetaDivider} />
            <View style={styles.collapsedMetricBlock}>
              <Text style={styles.collapsedMetricValue}>
                {distanceMiles != null ? distanceMiles.toFixed(1) : '--'}
              </Text>
              <Text style={styles.collapsedMetricLabel}>mi</Text>
            </View>
            <View style={styles.collapsedMetaDivider} />
            <View style={styles.collapsedMetricBlock}>
              <Text style={styles.collapsedMetricValue}>
                {arrivalEtaLabel}
              </Text>
              <Text style={styles.collapsedMetricLabel}>ETA</Text>
            </View>
          </View>
          {statusAction && nextActionLabel != null && (
            <Pressable accessibilityRole="button" disabled={actioning}
              onPress={() => handleStatusAction(statusAction.next)}
              style={[styles.primaryBtn, emphasiseArrived && styles.primaryBtnEmphasis,
                routeActionBlockedByConsent && styles.primaryBtnWarning, actioning && styles.btnDisabled]}>
              {actioning ? <ActivityIndicator color="#FFFFFF" />
                : <Ionicons name={emphasiseArrived ? 'flag' : 'arrow-forward-circle'} size={22} color="#FFFFFF" />}
              <Text style={styles.primaryBtnText}>{nextActionLabel}</Text>
            </Pressable>
          )}
          </>
        ) : (
          /* ──────────────────────────────────────────────────────────────────
             EXPANDED: job details, navigation, job status actions.
             Waze and Google Maps are near the top so the driver can reach them
             without scrolling through the detail rows.
          ────────────────────────────────────────────────────────────────── */
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.expandedScrollContent}>
            {/* Navigation shortcuts — visible immediately on expand */}
            <View style={styles.secondaryRow}>
              {Platform.OS === 'ios' && <Pressable accessibilityRole="button"
                accessibilityLabel={locale === 'ar' ? 'فتح خرائط Apple' : 'Open Apple Maps'}
                onPress={handleOpenAppleMaps} style={styles.secondaryBtn}>
                <Ionicons name="map-outline" size={18} color="#3C4043" />
                <Text style={styles.secondaryBtnText}>Apple Maps</Text>
              </Pressable>}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={customerCoord ? t('route.openWaze') : t('route.wazeUnavailable')}
                disabled={!customerCoord}
                onPress={handleOpenWaze}
                style={[styles.secondaryBtn, !customerCoord && styles.secondaryBtnMuted]}
              >
                <Ionicons name="navigate-outline" size={18} color={customerCoord ? '#3C4043' : '#9AA0A6'} />
                <Text style={[styles.secondaryBtnText, !customerCoord && styles.secondaryBtnTextMuted]}>
                  {customerCoord ? t('route.openWaze') : t('route.wazeUnavailable')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('route.openGoogleMaps')}
                onPress={handleOpenExternal}
                style={styles.secondaryBtn}
              >
                <Ionicons name="open-outline" size={18} color="#3C4043" />
                <Text style={styles.secondaryBtnText}>{t('route.openGoogleMaps')}</Text>
              </Pressable>
            </View>

            {/* Customer name + call */}
            <View style={styles.expandedCustomerRow}>
              <Text style={[styles.customerName, { flex: 1 }]} numberOfLines={1}>
                {job?.customerName ?? t('route.customer')}
              </Text>
              {phone != null && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('route.callCustomer')}
                  onPress={handleCallCustomer}
                  style={styles.expandedCallBtn}
                >
                  <Ionicons name="call" size={18} color="#FFFFFF" />
                </Pressable>
              )}
            </View>

            {/* Address, vehicle, tyres */}
            {addressLine != null && (
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={15} color={colors.muted} />
                <Text style={styles.detailText} numberOfLines={2}>{addressLine}</Text>
              </View>
            )}
            {vehicleLabel != null && (
              <View style={styles.detailRow}>
                <Ionicons name="car-outline" size={15} color={colors.muted} />
                <Text style={styles.detailText} numberOfLines={1}>{vehicleLabel}</Text>
              </View>
            )}
            {tyreSummary != null && (
              <View style={styles.detailRow}>
                <Ionicons name="ellipse-outline" size={15} color={colors.muted} />
                <Text style={styles.detailText} numberOfLines={1}>{tyreSummary}</Text>
              </View>
            )}

            {/* Payment status */}
            <View style={styles.navigationPaymentSurface}>
              <DriverPaymentCard payment={job?.paymentSummary ?? job?.payment} />
            </View>

            {routeNeedsRefresh && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('route.refreshRoute')}
                onPress={handleRetryRoute}
                style={({ pressed }) => [
                  styles.routeRefreshButton,
                  pressed && styles.routeRefreshButtonPressed,
                ]}
              >
                <Ionicons name="refresh" size={16} color="#F97316" />
                <Text style={styles.routeRefreshButtonText}>{t('route.refreshRoute')}</Text>
              </Pressable>
            )}

            <View style={styles.routePrefsPanel}>
              <View style={styles.routePrefsHeader}>
                <Text style={styles.routeSectionTitle}>Route preferences</Text>
                {routeState.loading && (
                  <Text style={styles.routeLoadingText}>Calculating route...</Text>
                )}
              </View>
              <View style={styles.routePrefsRow}>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: routePreferences.motorways }}
                  accessibilityLabel="Avoid motorways"
                  onPress={() => handleToggleRoutePreference('motorways')}
                  style={[
                    styles.routePrefChip,
                    routePreferences.motorways && styles.routePrefChipActive,
                  ]}
                >
                  <Ionicons
                    name="trail-sign-outline"
                    size={13}
                    color={routePreferences.motorways ? '#F97316' : '#5F6368'}
                  />
                  <Text
                    style={[
                      styles.routePrefChipText,
                      routePreferences.motorways && styles.routePrefChipTextActive,
                    ]}
                  >
                    Avoid motorways
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: routePreferences.tolls }}
                  accessibilityLabel="Avoid tolls"
                  onPress={() => handleToggleRoutePreference('tolls')}
                  style={[
                    styles.routePrefChip,
                    routePreferences.tolls && styles.routePrefChipActive,
                  ]}
                >
                  <Ionicons
                    name="cash-outline"
                    size={13}
                    color={routePreferences.tolls ? '#F97316' : '#5F6368'}
                  />
                  <Text
                    style={[
                      styles.routePrefChipText,
                      routePreferences.tolls && styles.routePrefChipTextActive,
                    ]}
                  >
                    Avoid tolls
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: routePreferences.ferries }}
                  accessibilityLabel="Avoid ferries"
                  onPress={() => handleToggleRoutePreference('ferries')}
                  style={[
                    styles.routePrefChip,
                    routePreferences.ferries && styles.routePrefChipActive,
                  ]}
                >
                  <Ionicons
                    name="boat-outline"
                    size={13}
                    color={routePreferences.ferries ? '#F97316' : '#5F6368'}
                  />
                  <Text
                    style={[
                      styles.routePrefChipText,
                      routePreferences.ferries && styles.routePrefChipTextActive,
                    ]}
                  >
                    Avoid ferries
                  </Text>
                </Pressable>
              </View>
              <View style={styles.trafficStatusRow}>
                <Ionicons
                  name={
                    trafficDelayMinutes == null
                      ? 'radio-outline'
                      : trafficDelayMinutes > 10
                        ? 'warning-outline'
                        : 'speedometer-outline'
                  }
                  size={14}
                  color={
                    trafficDelayMinutes == null
                      ? '#5F6368'
                      : trafficDelayMinutes > 10
                        ? '#B3261E'
                        : trafficDelayMinutes > 3
                          ? '#B06000'
                          : '#188038'
                  }
                />
                <Text style={styles.trafficStatusText}>{trafficStatusLabel}</Text>
              </View>
              {routeCalculationError && (
                <View style={styles.routeErrorPanel}>
                  <Text style={styles.routeErrorText}>
                    Route could not be calculated. Keep current route or retry.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Retry route calculation"
                    onPress={handleRetryRoute}
                    style={styles.routeErrorRetry}
                  >
                    <Ionicons name="refresh" size={13} color="#F97316" />
                    <Text style={styles.routeErrorRetryText}>Retry</Text>
                  </Pressable>
                </View>
              )}
            </View>

            <View style={styles.routePrefsPanel}>
              <View style={styles.routePrefsHeader}>
                <Text style={styles.routeSectionTitle}>Map display</Text>
              </View>
              <View style={styles.routePrefsRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: mapStyleMode === 'streets' }}
                  accessibilityLabel="Use streets map style"
                  onPress={() => handleSelectMapStyle('streets')}
                  style={[
                    styles.routePrefChip,
                    mapStyleMode === 'streets' && styles.routePrefChipActive,
                  ]}
                >
                  <Ionicons
                    name="map-outline"
                    size={13}
                    color={mapStyleMode === 'streets' ? '#F97316' : '#5F6368'}
                  />
                  <Text
                    style={[
                      styles.routePrefChipText,
                      mapStyleMode === 'streets' && styles.routePrefChipTextActive,
                    ]}
                  >
                    Streets
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: mapStyleMode === 'satellite' }}
                  accessibilityLabel="Use satellite map style"
                  onPress={() => handleSelectMapStyle('satellite')}
                  style={[
                    styles.routePrefChip,
                    mapStyleMode === 'satellite' && styles.routePrefChipActive,
                  ]}
                >
                  <Ionicons
                    name="earth-outline"
                    size={13}
                    color={mapStyleMode === 'satellite' ? '#F97316' : '#5F6368'}
                  />
                  <Text
                    style={[
                      styles.routePrefChipText,
                      mapStyleMode === 'satellite' && styles.routePrefChipTextActive,
                    ]}
                  >
                    Satellite
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Route alternatives — expanded only, never in collapsed driving mode */}
            {routeOptions.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.routeCardsRow}
              >
                {routeOptions.map((option) => {
                  const active = option.index === routeState.selectedIndex;
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${option.label} route, ${option.durationMinutes} minutes`}
                      onPress={() => handleSelectAlternative(option.index)}
                      style={[styles.routeCard, active && styles.routeCardActive]}
                    >
                      <Text style={[styles.routeCardLabel, active && styles.routeCardLabelActive]}>
                        {option.label}
                      </Text>
                      <Text style={styles.routeCardEta}>
                        {option.durationMinutes} {t('route.etaMin')}
                      </Text>
                      <Text style={styles.routeCardMeta}>
                        {t('route.distanceMi', { value: option.distanceMiles.toFixed(1) })}
                      </Text>
                      {option.trafficDelayMinutes != null && (
                        <Text
                          style={[
                            styles.routeCardDelay,
                            option.trafficDelayMinutes > 10 && styles.routeCardDelayHeavy,
                          ]}
                        >
                          +{option.trafficDelayMinutes} min traffic
                        </Text>
                      )}
                      {option.warnings.length > 0 && (
                        <Text style={styles.routeCardWarning} numberOfLines={2}>
                          {option.warnings[0]}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : routeIsCurrent && !routeState.loading ? (
              <Text style={styles.metaLine}>{t('route.noAlternatives')}</Text>
            ) : !routeState.loading ? (
              <Text style={styles.metaLine}>Route not ready. Refresh route first.</Text>
            ) : null}

            {(routeDeviation != null || isGpsDrift || isOffRoute) && (
              <View
                style={[
                  styles.routeDeviationPanel,
                  isOffRoute && styles.routeDeviationPanelBad,
                ]}
              >
                <Ionicons
                  name={isOffRoute ? 'git-branch-outline' : 'locate-outline'}
                  size={15}
                  color={isOffRoute ? '#B3261E' : '#B06000'}
                />
                <Text
                  style={[
                    styles.routeDeviationText,
                    isOffRoute && styles.routeDeviationTextBad,
                  ]}
                >
                  {isOffRoute
                    ? routeDeviation?.recalculating
                      ? 'Off route. Recalculating route...'
                      : 'Off route'
                    : 'GPS drift detected'}
                </Text>
              </View>
            )}

            {/* Destination precision warning */}
            {routeEndsShort && (
              <View style={styles.warnRow}>
                <Ionicons name="flag-outline" size={15} color="#B3261E" />
                <Text style={styles.warnText}>{t('route.routeEndsShort')}</Text>
              </View>
            )}

            {/* Route failed hint */}
            {rerouteFailed && (
              <Text style={styles.rerouteFailedText}>{t('route.noRouteOpenWaze')}</Text>
            )}

            {/* Doorstep nudge — within 25 m. Never auto-confirms. */}
            {showAtCustomerHint && (
              <View style={styles.arrivalHint}>
                <Ionicons name="warning" size={16} color="#B06000" />
                <Text style={styles.arrivalHintText}>{t('route.atCustomerHint')}</Text>
              </View>
            )}

            {/* Waze helper text */}
            <Text style={styles.cockpitMeta}>{t('route.wazeHelperText')}</Text>

            {/* ── Job timeline ── */}
            {timelineIndex >= 0 && (
              <View style={styles.timeline} accessibilityLabel={t('timeline.accepted')}>
                {TIMELINE_PHASES.map((phase, idx) => {
                  const done = idx < timelineIndex;
                  const active = idx === timelineIndex;
                  const future = idx > timelineIndex;
                  return (
                    <View key={phase.id} style={styles.timelineItem}>
                      <View
                        style={[
                          styles.timelineDot,
                          done && styles.timelineDotDone,
                          active && styles.timelineDotActive,
                          future && styles.timelineDotFuture,
                        ]}
                      >
                        {done && <Ionicons name="checkmark" size={10} color="#FFFFFF" />}
                      </View>
                      {idx < TIMELINE_PHASES.length - 1 && (
                        <View style={[styles.timelineLine, done && styles.timelineLineDone]} />
                      )}
                      <Text
                        style={[
                          styles.timelineLabel,
                          active && styles.timelineLabelActive,
                          future && styles.timelineLabelFuture,
                        ]}
                        numberOfLines={1}
                      >
                        {t(phase.labelKey)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Primary job status action — in expanded mode only */}
            {statusAction && nextActionLabel != null && (
              <Pressable
                accessibilityRole="button"
                disabled={actioning}
                onPress={() => handleStatusAction(statusAction.next)}
                style={[
                  styles.primaryBtn,
                  emphasiseArrived && styles.primaryBtnEmphasis,
                  routeActionBlockedByConsent && styles.primaryBtnWarning,
                  actioning && styles.btnDisabled,
                ]}
              >
                {actioning ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons
                    name={emphasiseArrived ? 'flag' : 'arrow-forward-circle'}
                    size={20}
                    color="#FFFFFF"
                  />
                )}
                <Text style={styles.primaryBtnText}>{nextActionLabel}</Text>
              </Pressable>
            )}

            {/* Route/GPS meta line */}
            <Text style={styles.cockpitMeta}>
              {permissionDenied || navigationLocationState === 'permission-denied'
                ? t('route.locationDeniedNav')
                : navigationLocationState === 'requesting' && fixSeconds == null
                  ? t('route.findingLocation')
                : navigationLocationState === 'weak'
                  ? t('route.gpsSignalWeak')
                : navigationLocationState === 'stale'
                  ? t('route.locationStale')
                : navigationLocationState === 'unavailable' ||
                    navigationLocationState === 'error'
                  ? t('route.locationUnavailable')
                : fixSeconds == null
                  ? routeState.loading || phase === 'preview'
                    ? t('route.calculatingRoute')
                    : t('route.waitingFirstFix')
                  : routeUpdatedSeconds != null
                    ? `${metaText} · ${t('route.routeUpdatedAgo', { seconds: routeUpdatedSeconds })}`
                    : `${metaText} · ${t('route.updatedAgo', { seconds: fixSeconds })}`}
            </Text>
          </ScrollView>
        )}
      </View>

      {/* ── Pre-job safety checklist modal ── */}
      {showPreJobChecklist && (
        <View style={styles.checklistOverlay}>
          <View style={[styles.checklistModal, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.checklistScroll}>
              <Text style={styles.checklistTitle}>{t('checklist.title')}</Text>
              <Text style={styles.checklistSubtitle}>{t('checklist.subtitle')}</Text>

              {/* Job summary rows */}
              <View style={styles.checklistSummary}>
                {job?.refNumber != null && (
                  <View style={styles.checklistSummaryRow}>
                    <Text style={styles.checklistSummaryLabel}>{t('checklist.jobRef')}</Text>
                    <Text style={styles.checklistSummaryValue}>#{job.refNumber}</Text>
                  </View>
                )}
                {job?.customerName != null && (
                  <View style={styles.checklistSummaryRow}>
                    <Text style={styles.checklistSummaryLabel}>{t('checklist.customer')}</Text>
                    <Text style={styles.checklistSummaryValue}>{job.customerName}</Text>
                  </View>
                )}
                {phone != null && (
                  <View style={styles.checklistSummaryRow}>
                    <Text style={styles.checklistSummaryLabel}>{t('checklist.phone')}</Text>
                    <Text style={styles.checklistSummaryValue}>{phone}</Text>
                  </View>
                )}
                {addressLine != null && (
                  <View style={styles.checklistSummaryRow}>
                    <Text style={styles.checklistSummaryLabel}>{t('checklist.address')}</Text>
                    <Text style={[styles.checklistSummaryValue, { flex: 1 }]} numberOfLines={2}>{addressLine}</Text>
                  </View>
                )}
                {tyreSummary != null && (
                  <View style={styles.checklistSummaryRow}>
                    <Text style={styles.checklistSummaryLabel}>{t('checklist.tyreSize')}</Text>
                    <Text style={styles.checklistSummaryValue}>{tyreSummary}</Text>
                  </View>
                )}
                {vehicleLabel != null && (
                  <View style={styles.checklistSummaryRow}>
                    <Text style={styles.checklistSummaryLabel}>{t('checklist.vehicle')}</Text>
                    <Text style={styles.checklistSummaryValue}>{vehicleLabel}</Text>
                  </View>
                )}
                <View style={styles.checklistSummaryRow}>
                  <Text style={styles.checklistSummaryLabel}>{t('checklist.payment')}</Text>
                  <Text style={[styles.checklistSummaryValue, { color: payColors.text }]}>
                    {t(payDisplay.labelKey)}
                    {payDisplay.amountLabel != null ? ` · ${payDisplay.amountLabel}` : ''}
                  </Text>
                </View>
                {durationMin != null && (
                  <View style={styles.checklistSummaryRow}>
                    <Text style={styles.checklistSummaryLabel}>{t('checklist.etaDistance')}</Text>
                    <Text style={styles.checklistSummaryValue}>
                      {durationMin} {t('route.etaMin')}
                      {distanceMiles != null ? ` · ${t('route.distanceMi', { value: distanceMiles.toFixed(1) })}` : ''}
                    </Text>
                  </View>
                )}
              </View>

              {/* Warnings */}
              {checklistTyreMissing && (
                <View style={styles.checklistWarn}>
                  <Ionicons name="alert-circle" size={16} color="#FDBA74" />
                  <Text style={styles.checklistWarnText}>{t('checklist.warnTyreMissing')}</Text>
                </View>
              )}
              {checklistAddressMissing && (
                <View style={styles.checklistWarn}>
                  <Ionicons name="alert-circle" size={16} color="#FDBA74" />
                  <Text style={styles.checklistWarnText}>{t('checklist.warnAddressMissing')}</Text>
                </View>
              )}
              {checklistPaymentWarning && (
                <View style={styles.checklistWarn}>
                  <Ionicons name="information-circle" size={16} color="#93C5FD" />
                  <Text style={styles.checklistWarnTextInfo}>{t('checklist.warnPaymentPending')}</Text>
                </View>
              )}

              {/* Required confirmations */}
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: preJobChecks.tyreSizeChecked }}
                onPress={() => setPreJobChecks((c) => ({ ...c, tyreSizeChecked: !c.tyreSizeChecked }))}
                style={styles.checklistItem}
              >
                <View style={[styles.checklistBox, preJobChecks.tyreSizeChecked && styles.checklistBoxChecked]}>
                  {preJobChecks.tyreSizeChecked && <Ionicons name="checkmark" size={14} color="#0B0F1A" />}
                </View>
                <Text style={styles.checklistItemText}>{t('checklist.checkTyreSize')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: preJobChecks.addressChecked }}
                onPress={() => setPreJobChecks((c) => ({ ...c, addressChecked: !c.addressChecked }))}
                style={styles.checklistItem}
              >
                <View style={[styles.checklistBox, preJobChecks.addressChecked && styles.checklistBoxChecked]}>
                  {preJobChecks.addressChecked && <Ionicons name="checkmark" size={14} color="#0B0F1A" />}
                </View>
                <Text style={styles.checklistItemText}>{t('checklist.checkAddress')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: preJobChecks.paymentChecked }}
                onPress={() => setPreJobChecks((c) => ({ ...c, paymentChecked: !c.paymentChecked }))}
                style={styles.checklistItem}
              >
                <View style={[styles.checklistBox, preJobChecks.paymentChecked && styles.checklistBoxChecked]}>
                  {preJobChecks.paymentChecked && <Ionicons name="checkmark" size={14} color="#0B0F1A" />}
                </View>
                <Text style={styles.checklistItemText}>{t('checklist.checkPayment')}</Text>
              </Pressable>

              {/* Buttons */}
              <View style={styles.checklistBtnRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowPreJobChecklist(false)}
                  style={styles.checklistCancelBtn}
                >
                  <Text style={styles.checklistCancelBtnText}>{t('checklist.cancel')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!preJobAllChecked || actioning}
                  onPress={handleConfirmPreJob}
                  style={[
                    styles.checklistConfirmBtn,
                    (!preJobAllChecked || actioning) && styles.btnDisabled,
                  ]}
                >
                  {actioning ? (
                    <ActivityIndicator size="small" color="#0B0F1A" />
                  ) : (
                    <Ionicons name="navigate" size={18} color="#0B0F1A" />
                  )}
                  <Text style={styles.checklistConfirmBtnText}>{t('checklist.startDriving')}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {/* ── Completion checklist modal ── */}
      {showCompletionChecklist && (
        <View style={styles.checklistOverlay}>
          <View style={[styles.checklistModal, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.checklistScroll}>
              <Text style={styles.checklistTitle}>{t('completion.title')}</Text>
              <Text style={styles.checklistSubtitle}>{t('completion.subtitle')}</Text>

              {/* Payment reminder if needed */}
              {checklistPaymentWarning && (
                <View style={styles.checklistWarn}>
                  <Ionicons name="alert-circle" size={16} color="#FDBA74" />
                  <Text style={styles.checklistWarnText}>{t('checklist.warnPaymentPending')}</Text>
                </View>
              )}

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: completionChecks.tyreFitted }}
                onPress={() => setCompletionChecks((c) => ({ ...c, tyreFitted: !c.tyreFitted }))}
                style={styles.checklistItem}
              >
                <View style={[styles.checklistBox, completionChecks.tyreFitted && styles.checklistBoxChecked]}>
                  {completionChecks.tyreFitted && <Ionicons name="checkmark" size={14} color="#0B0F1A" />}
                </View>
                <Text style={styles.checklistItemText}>{t('completion.tyreFitted')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: completionChecks.wheelNuts }}
                onPress={() => setCompletionChecks((c) => ({ ...c, wheelNuts: !c.wheelNuts }))}
                style={styles.checklistItem}
              >
                <View style={[styles.checklistBox, completionChecks.wheelNuts && styles.checklistBoxChecked]}>
                  {completionChecks.wheelNuts && <Ionicons name="checkmark" size={14} color="#0B0F1A" />}
                </View>
                <Text style={styles.checklistItemText}>{t('completion.wheelNuts')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: completionChecks.customerInformed }}
                onPress={() => setCompletionChecks((c) => ({ ...c, customerInformed: !c.customerInformed }))}
                style={styles.checklistItem}
              >
                <View style={[styles.checklistBox, completionChecks.customerInformed && styles.checklistBoxChecked]}>
                  {completionChecks.customerInformed && <Ionicons name="checkmark" size={14} color="#0B0F1A" />}
                </View>
                <Text style={styles.checklistItemText}>{t('completion.customerInformed')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: completionChecks.paymentChecked }}
                onPress={() => setCompletionChecks((c) => ({ ...c, paymentChecked: !c.paymentChecked }))}
                style={styles.checklistItem}
              >
                <View style={[styles.checklistBox, completionChecks.paymentChecked && styles.checklistBoxChecked]}>
                  {completionChecks.paymentChecked && <Ionicons name="checkmark" size={14} color="#0B0F1A" />}
                </View>
                <Text style={styles.checklistItemText}>{t('completion.paymentChecked')}</Text>
              </Pressable>

              {completionError != null && (
                <Text style={styles.completionError}>{completionError}</Text>
              )}

              <View style={styles.checklistBtnRow}>
                <Pressable
                  accessibilityRole="button"
                  disabled={completionActioning}
                  onPress={() => {
                    if (!completionActioning) {
                      setShowCompletionChecklist(false);
                      setCompletionError(null);
                      actionLockRef.current = false;
                    }
                  }}
                  style={[styles.checklistCancelBtn, completionActioning && styles.btnDisabled]}
                >
                  <Text style={styles.checklistCancelBtnText}>{t('completion.cancel')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!completionAllChecked || completionActioning}
                  onPress={handleConfirmCompletion}
                  style={[
                    styles.checklistConfirmBtn,
                    styles.checklistConfirmBtnComplete,
                    (!completionAllChecked || completionActioning) && styles.btnDisabled,
                  ]}
                >
                  {completionActioning ? (
                    <ActivityIndicator size="small" color="#0B0F1A" />
                  ) : (
                    <Ionicons name="checkmark-circle" size={18} color="#0B0F1A" />
                  )}
                  <Text style={styles.checklistConfirmBtnText}>
                    {completionActioning ? t('completion.completing') : t('completion.completeJob')}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFE',
  },
  noPointerEvents: {
    pointerEvents: 'none',
  },
  boxNonePointerEvents: {
    pointerEvents: 'box-none',
  },
  ltrText: {
    writingDirection: 'ltr',
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: '#F8FAFE',
  },
  mapOverlayText: {
    color: '#5F6368',
    fontSize: fontSize.sm,
  },
  locationPermissionCard: {
    position: 'absolute', left: 24, right: 24, top: '32%',
    padding: 22, gap: 12, alignItems: 'center', borderRadius: 24,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D9E3F0',
    shadowColor: '#24364D', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 20,
  },
  instructionCard: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 22,
    backgroundColor: '#0B6B57',
    borderWidth: 1,
    borderColor: '#0B6B57',
    shadowColor: '#12392E',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 7,
  },
  instructionCardPrepare: {
    borderColor: 'rgba(245,158,11,0.95)',
    shadowOpacity: 0.22,
  },
  instructionCardImminent: {
    borderColor: 'rgba(249,115,22,0.98)',
    shadowOpacity: 0.26,
  },
  instructionCardExecuting: {
    borderColor: 'rgba(234,67,53,0.98)',
    shadowOpacity: 0.3,
  },
  instructionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#14866D',
    overflow: 'hidden',
  },
  instructionIconPrepare: {
    backgroundColor: '#F59E0B',
  },
  instructionIconImminent: {
    backgroundColor: '#F97316',
  },
  instructionIconExecuting: {
    backgroundColor: '#EA4335',
  },
  maneuverSignSignalClip: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  maneuverSignSignalSegment: {
    width: 9,
    height: 13,
    borderRadius: 5,
    marginVertical: -1,
    backgroundColor: 'rgba(255,255,255,0.58)',
  },
  maneuverSignArrivalPulse: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  instructionTextWrap: {
    flex: 1,
  },
  instructionDistance: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  instructionText: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
  },
  instructionNext: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginTop: 1,
  },
  instructionStatusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  instructionStatusText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  laneGuidanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  laneCell: {
    width: 27,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F3F4',
    borderWidth: 1,
    borderColor: '#DADCE0',
  },
  laneCellValid: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.32)',
  },
  laneCellActive: {
    backgroundColor: NAV_ROUTE_BLUE,
    borderColor: NAV_ROUTE_BLUE,
  },
  roundaboutDiagram: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 7,
  },
  roundaboutStage: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundaboutCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.78)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  roundaboutBranch: {
    position: 'absolute',
    top: 4,
    left: 36,
    width: 4,
    height: 34,
    borderRadius: 3,
    backgroundColor: '#BDC1C6',
    opacity: 0.7,
  },
  roundaboutBranchAllowed: {
    backgroundColor: 'rgba(255,255,255,0.62)',
    opacity: 0.86,
  },
  roundaboutApproachBranch: {
    backgroundColor: '#FFFFFF',
    opacity: 1,
  },
  roundaboutExitBranch: {
    width: 7,
    left: 34.5,
    backgroundColor: NAV_ROUTE_BLUE,
    opacity: 1,
    zIndex: 3,
  },
  roundaboutExitBadge: {
    position: 'absolute',
    right: 0,
    top: 0,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NAV_ROUTE_BLUE,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    zIndex: 4,
  },
  roundaboutExitBadgeText: {
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: '900',
  },
  roundaboutTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  roundaboutLabel: {
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  roundaboutSubLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  reroutePill: {
    position: 'absolute',
    top: 78,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
    shadowColor: '#3C4043',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  reroutePillText: {
    color: '#202124',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  healthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  healthGood: {
    backgroundColor: 'rgba(52,168,83,0.12)',
    borderColor: 'rgba(52,168,83,0.45)',
  },
  healthWarn: {
    backgroundColor: 'rgba(251,188,4,0.20)',
    borderColor: 'rgba(251,188,4,0.65)',
  },
  healthBad: {
    backgroundColor: 'rgba(234,67,53,0.14)',
    borderColor: 'rgba(234,67,53,0.52)',
  },
  healthDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  healthDotGood: { backgroundColor: '#34A853' },
  healthDotWarn: { backgroundColor: '#FBBC04' },
  healthDotBad: { backgroundColor: '#EA4335' },
  healthPillText: {
    color: '#202124',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  banner: {
    position: 'absolute',
    top: 118,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: '#E6F4EA',
    borderWidth: 1,
    borderColor: '#CEEAD6',
  },
  bannerText: {
    color: '#137333',
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  speedPanel: {
    position: 'absolute',
    left: spacing.md,
    width: 112,
    minHeight: 72,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13,18,20,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#3C4043',
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  speedPanelTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
  },
  currentSpeedBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  currentSpeedValue: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 29,
    writingDirection: 'ltr',
  },
  currentSpeedUnit: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
    writingDirection: 'ltr',
  },
  speedLimitSign: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 5,
    borderColor: '#EA4335',
  },
  speedLimitSignUnavailable: {
    borderColor: '#BDC1C6',
  },
  speedLimitSignWarning: {
    backgroundColor: '#FCE8E6',
  },
  speedLimitValue: {
    color: '#202124',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 20,
    writingDirection: 'ltr',
  },
  speedLimitValueUnavailable: {
    color: '#5F6368',
  },
  speedLimitValueWarning: {
    color: '#B3261E',
  },
  speedRoadText: {
    width: '100%',
    marginTop: 4,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
  },
  approxBadge: {
    position: 'absolute',
    bottom: spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: '#FEF7E0',
  },
  approxBadgeText: {
    color: '#B06000',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  recenterBtn: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
  },
  backFab: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: '#DADCE0',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  fallbackTitle: {
    color: '#202124',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  fallbackText: {
    color: '#5F6368',
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  diagText: {
    color: '#B3261E',
    fontSize: fontSize.xs,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    paddingHorizontal: spacing.md,
  },
  retryBtn: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: '#F97316',
    marginTop: spacing.sm,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  sideControls: {
    position: 'absolute',
    right: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  ctrlBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9E3F0',
    shadowColor: '#3C4043',
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  ctrlBtnAccent: {
    backgroundColor: '#EAF2FF',
    borderColor: NAV_ROUTE_BLUE,
  },
  ctrlBtnText: {
    marginTop: -2,
    color: '#364B64',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0,
  },
  ctrlBtnTextAccent: {
    color: NAV_ROUTE_BLUE,
  },
  devGpsPanel: {
    position: 'absolute',
    left: spacing.md,
    right: 76,
    maxWidth: 300,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: 'rgba(255,255,255,0.98)',
    padding: spacing.sm,
    gap: spacing.xs,
    shadowColor: '#3C4043',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 7,
  },
  devGpsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  devGpsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 0,
  },
  devGpsTitle: {
    color: '#202124',
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  devGpsState: {
    color: '#5F6368',
    fontSize: 10,
    fontWeight: '800',
    flexShrink: 0,
  },
  devGpsEmpty: {
    color: '#B06000',
    fontSize: fontSize.xs,
    fontWeight: '700',
    lineHeight: 15,
  },
  devGpsMainRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'stretch',
  },
  devGpsStartBtn: {
    flex: 1,
    minHeight: 34,
    borderRadius: radius.md,
    backgroundColor: '#F97316',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  devGpsStartText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    flexShrink: 1,
  },
  devGpsIconActionBtn: {
    width: 62,
    minHeight: 34,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  devGpsModeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  devGpsActionBtn: {
    flex: 1,
    minHeight: 32,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  devGpsModeBtn: {
    minHeight: 36,
    paddingHorizontal: 4,
  },
  devGpsActionText: {
    color: '#3C4043',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    flexShrink: 1,
  },
  devGpsBtnDisabled: {
    opacity: 0.5,
  },
  devGpsSpeedRow: {
    flexDirection: 'row',
    gap: 4,
  },
  devGpsSpeedChip: {
    flex: 1,
    minHeight: 28,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  devGpsSpeedChipActive: {
    backgroundColor: '#E8F0FE',
    borderColor: '#F97316',
  },
  devGpsSpeedText: {
    color: '#5F6368',
    fontSize: 9,
    fontWeight: '800',
  },
  devGpsSpeedTextActive: {
    color: '#F97316',
  },
  devGpsWarnBtn: {
    backgroundColor: '#FEF7E0',
    borderColor: '#FDD663',
  },
  devGpsWarnText: {
    color: '#B06000',
  },
  devGpsMeta: {
    color: '#5F6368',
    fontSize: 9,
    fontWeight: '700',
  },
  devGpsDebug: {
    color: '#5F6368',
    fontSize: 7,
    fontWeight: '700',
    lineHeight: 9,
  },
  devGpsError: {
    color: '#B3261E',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
  },
  cockpit: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#DADCE0',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '60%',
    backgroundColor: '#FFFFFF',
    shadowColor: '#3C4043',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -5 },
    elevation: 12,
    gap: spacing.sm,
  },
  expandedScrollContent: { gap: spacing.md, paddingBottom: spacing.lg },
  navigationSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navigationSummaryText: { flex: 1, minWidth: 0, gap: 4 },
  navigationDestination: { color: '#172337', fontSize: 16, fontWeight: '800' },
  navigationPaymentSurface: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  navigationSmallButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F5FC' },
  grabberRow: {
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: spacing.xs,
    gap: 4,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DADCE0',
  },
  grabberHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  grabberHintText: {
    color: '#5F6368',
    fontSize: 10,
    fontWeight: '700',
  },
  jobClockCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#F8FAFE',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: 3,
  },
  jobClockCardCompact: {
    paddingVertical: 7,
  },
  jobClockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  jobClockTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 0,
  },
  jobClockTitle: {
    color: '#202124',
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  jobClockBadge: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    flexShrink: 0,
  },
  jobClockBadgeOnTime: {
    backgroundColor: '#E6F4EA',
    borderColor: '#34A853',
  },
  jobClockBadgeAtRisk: {
    backgroundColor: '#FEF7E0',
    borderColor: '#FDD663',
  },
  jobClockBadgeLate: {
    backgroundColor: '#FCE8E6',
    borderColor: '#F28B82',
  },
  jobClockBadgeUnavailable: {
    backgroundColor: '#F1F3F4',
    borderColor: '#DADCE0',
  },
  jobClockBadgeText: {
    color: '#3C4043',
    fontSize: 10,
    fontWeight: '800',
  },
  jobClockSummary: {
    color: '#202124',
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  jobClockBreakdown: {
    color: '#5F6368',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
  },
  jobClockMessage: {
    color: '#B06000',
    fontSize: 10,
    fontWeight: '800',
  },
  routePrefsPanel: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#FFFFFF',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  routePrefsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  routeSectionTitle: {
    color: '#202124',
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  routeLoadingText: {
    color: '#F97316',
    fontSize: 10,
    fontWeight: '800',
  },
  routePrefsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  routePrefChip: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#FFFFFF',
  },
  routePrefChipActive: {
    backgroundColor: '#E8F0FE',
    borderColor: '#F97316',
  },
  routePrefChipText: {
    color: '#5F6368',
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  routePrefChipTextActive: {
    color: '#F97316',
  },
  trafficStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  trafficStatusText: {
    color: '#3C4043',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  routeErrorPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: '#FCE8E6',
  },
  routeErrorText: {
    flex: 1,
    color: '#B3261E',
    fontSize: fontSize.xs,
    fontWeight: '700',
    lineHeight: 16,
  },
  routeErrorRetry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
  },
  routeErrorRetryText: {
    color: '#F97316',
    fontSize: 10,
    fontWeight: '800',
  },
  routeCardsRow: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  routeCard: {
    width: 152,
    minHeight: 112,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#FFFFFF',
    gap: 2,
  },
  routeCardActive: {
    borderColor: '#F97316',
    backgroundColor: '#E8F0FE',
  },
  routeCardLabel: {
    color: '#202124',
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  routeCardLabelActive: {
    color: '#F97316',
  },
  routeCardEta: {
    color: '#202124',
    fontSize: fontSize.lg,
    fontWeight: '800',
    lineHeight: 22,
  },
  routeCardMeta: {
    color: '#5F6368',
    fontSize: 10,
    fontWeight: '700',
  },
  routeCardDelay: {
    color: '#B06000',
    fontSize: 10,
    fontWeight: '800',
  },
  routeCardDelayHeavy: {
    color: '#B3261E',
  },
  routeCardWarning: {
    color: '#B06000',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
  },
  routeDeviationPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#FDD663',
    backgroundColor: '#FEF7E0',
  },
  routeDeviationPanelBad: {
    borderColor: '#F28B82',
    backgroundColor: '#FCE8E6',
  },
  routeDeviationText: {
    flex: 1,
    color: '#B06000',
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  routeDeviationTextBad: {
    color: '#B3261E',
  },
  metaLine: {
    color: '#5F6368',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  warnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  warnText: {
    color: '#B3261E',
    fontSize: fontSize.sm,
    fontWeight: '700',
    flex: 1,
  },
  stateStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F97316',
  },
  stateLabel: {
    color: '#202124',
    fontSize: fontSize.md,
    fontWeight: '800',
    textTransform: 'none',
  },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginLeft: 'auto',
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: '#F1F3F4',
  },
  statePillText: {
    color: '#3C4043',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  customerName: {
    color: '#202124',
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  detailText: {
    flex: 1,
    color: '#5F6368',
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  payBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  payBadgeTextWrap: {
    flex: 1,
  },
  payBadgeLabel: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  payBadgeDesc: {
    fontSize: fontSize.xs,
    fontWeight: '500',
    opacity: 0.85,
    marginTop: 1,
  },
  routeRefreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#FFFFFF',
  },
  routeRefreshButtonPressed: {
    opacity: 0.75,
  },
  routeRefreshButtonText: {
    color: '#F97316',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  rerouteFailedText: {
    color: '#B3261E',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  cockpitMeta: {
    color: '#5F6368',
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  primaryBtn: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: NAV_ROUTE_BLUE,
  },
  primaryBtnEmphasis: {
    minHeight: 60,
    backgroundColor: '#34A853',
  },
  primaryBtnWarning: {
    backgroundColor: '#B45309',
  },
  arrivalHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#FEF7E0',
  },
  arrivalHintText: {
    flex: 1,
    color: '#3C4043',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#FFFFFF',
  },
  secondaryBtnMuted: {
    opacity: 0.7,
  },
  secondaryBtnText: {
    color: '#3C4043',
    fontSize: fontSize.sm,
    fontWeight: '700',
    flexShrink: 1,
  },
  secondaryBtnTextMuted: {
    color: '#5F6368',
    fontWeight: '600',
  },
  arrivalPrompt: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: '#34A853',
    shadowColor: '#3C4043',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    gap: spacing.sm,
  },
  arrivalPromptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  arrivalPromptText: {
    flex: 1,
    color: '#202124',
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  arrivalPromptActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  arrivalPromptBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    borderRadius: radius.md,
  },
  arrivalPromptBtnGhost: {
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#FFFFFF',
  },
  arrivalPromptBtnGhostText: {
    color: '#3C4043',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  arrivalPromptBtnPrimary: {
    backgroundColor: '#34A853',
  },
  arrivalPromptBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: '800',
  },

  /* ── Recenter button with label ── */
  ctrlBtnRecenter: {
    width: 46,
    height: 46,
  },
  /* ── Collapsed cockpit: duration / distance / ETA ── */
  collapsedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  collapsedEtaBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  collapsedEtaNum: {
    color: '#202124',
    fontSize: fontSize.xl,
    fontWeight: '800',
    lineHeight: 24,
  },
  collapsedEtaUnit: {
    color: '#5F6368',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  collapsedMetricBlock: {
    minWidth: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedMetricValue: {
    color: '#202124',
    fontSize: fontSize.md,
    fontWeight: '800',
    lineHeight: 20,
  },
  collapsedMetricLabel: {
    color: '#5F6368',
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  collapsedMetaDivider: {
    width: 1,
    height: 14,
    backgroundColor: '#DADCE0',
  },

  /* ── Recovery / missing location panels ── */
  recoveryPanel: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  recoveryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  recoveryTitle: {
    flex: 1,
    color: '#202124',
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  recoveryBody: {
    color: '#5F6368',
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  recoveryPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#F97316',
  },
  recoveryPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  recoverySecRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  recoverySecBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#FFFFFF',
  },
  recoverySecBtnFull: {
    flex: 0,
    alignSelf: 'stretch',
  },
  recoverySecBtnText: {
    color: '#3C4043',
    fontSize: fontSize.sm,
    fontWeight: '700',
    flexShrink: 1,
  },

  /* ── Expanded cockpit extras ── */
  expandedCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  expandedCallBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F97316',
    flexShrink: 0,
  },

  /* ── Arrival inline error ── */
  arrivalErrorText: {
    color: '#B3261E',
    fontSize: fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },

  /* ── Smart reminder card ── */
  reminderCard: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  reminderCardInfo: {
    backgroundColor: 'rgba(232,240,254,0.98)',
    borderColor: '#AECBFA',
  },
  reminderCardWarning: {
    backgroundColor: 'rgba(254,247,224,0.98)',
    borderColor: '#FDD663',
  },
  reminderCardUrgent: {
    backgroundColor: 'rgba(252,232,230,0.98)',
    borderColor: '#F28B82',
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reminderTitle: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  reminderTitleInfo: { color: '#1967D2' },
  reminderTitleWarning: { color: '#B06000' },
  reminderTitleUrgent: { color: '#B3261E' },
  reminderDismiss: {
    padding: 4,
  },
  reminderBody: {
    color: '#3C4043',
    fontSize: fontSize.xs,
    lineHeight: 16,
  },
  reminderActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: 2,
  },
  reminderPrimaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    minHeight: 36,
  },
  reminderPrimaryBtnInfo: { backgroundColor: '#F97316' },
  reminderPrimaryBtnWarning: { backgroundColor: '#B06000' },
  reminderPrimaryBtnUrgent: { backgroundColor: '#B3261E' },
  reminderPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  reminderSecBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    minHeight: 36,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#FFFFFF',
  },
  reminderSecBtnText: {
    color: '#3C4043',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },

  /* ── Job timeline ── */
  timeline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    gap: 0,
  },
  timelineItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#DADCE0',
    zIndex: 1,
  },
  timelineDotDone: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
  timelineDotActive: {
    backgroundColor: '#34A853',
    borderColor: '#34A853',
  },
  timelineDotFuture: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DADCE0',
    opacity: 0.4,
  },
  timelineLine: {
    position: 'absolute',
    top: 9,
    left: '50%',
    right: '-50%',
    height: 2,
    backgroundColor: '#DADCE0',
    zIndex: 0,
  },
  timelineLineDone: {
    backgroundColor: '#F97316',
  },
  timelineLabel: {
    color: '#5F6368',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    flexShrink: 1,
  },
  timelineLabelActive: {
    color: '#34A853',
    fontWeight: '800',
  },
  timelineLabelFuture: {
    opacity: 0.4,
  },

  /* ── Checklist modals ── */
  checklistOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    zIndex: 200,
  },
  checklistModal: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  checklistScroll: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  checklistTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    marginBottom: 2,
  },
  checklistSubtitle: {
    color: colors.muted,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  checklistSummary: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  checklistSummaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checklistSummaryLabel: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '600',
    width: 72,
    flexShrink: 0,
  },
  checklistSummaryValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
    flex: 1,
  },
  checklistWarn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: 'rgba(180,83,9,0.12)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(253,186,116,0.4)',
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  checklistWarnText: {
    color: '#FDBA74',
    fontSize: fontSize.sm,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  checklistWarnTextInfo: {
    color: '#93C5FD',
    fontSize: fontSize.sm,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 52,
    marginBottom: spacing.xs,
  },
  checklistBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checklistBoxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checklistItemText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    flex: 1,
    lineHeight: 20,
  },
  checklistBtnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  checklistCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  checklistCancelBtnText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  checklistConfirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  checklistConfirmBtnComplete: {
    backgroundColor: '#22c55e',
  },
  checklistConfirmBtnText: {
    color: '#0B0F1A',
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  completionError: {
    color: '#F87171',
    fontSize: fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
});
