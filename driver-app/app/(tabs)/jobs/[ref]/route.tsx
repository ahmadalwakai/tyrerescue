import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
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
import { WebView } from 'react-native-webview';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import { driverApi, JobDetail, ApiError, PaymentState } from '@/api/client';
import { LoadingScreen } from '@/components/LoadingScreen';
import { mediumHaptic, heavyHaptic, lightHaptic, successHaptic, maneuverHaptic } from '@/services/haptics';
import { playSound, stopAlertSound, type SoundEvent } from '@/services/sound';
import { useI18n } from '@/i18n';
import {
  getDriverPaymentDisplay,
  paymentToneColors,
} from '@/lib/payment-status';
import { RouteEventEngine, type RouteEventType } from '@/lib/route-events';
import {
  Coordinates,
  DirectionsRoute,
  NavigationPhase,
  RouteError,
  RouteSource,
  RouteState,
  RouteStep,
  ARRIVAL_HERE_M,
  ARRIVAL_VERY_CLOSE_M,
  arrivalPhrase,
  fallbackGuidance,
  fetchDirections,
  fetchReturnToGarageDirections,
  formatGuidanceDistance,
  GARAGE_LOCATION,
  haversineMeters,
  humanizeInstruction,
  isValidCoord,
  metersToMiles,
  secondsToMinutes,
} from '@/services/directions';
import {
  loadVoiceEnabled,
  setVoiceEnabled,
  speak as speakGuidance,
  stopVoice,
} from '@/services/voice';
import {
  armBackgroundLocationForJob,
  stopBackgroundLocation,
} from '@/services/background-location';
import {
  buildWazeNavigationUrl,
  isValidNavigationCoordinate,
} from '@/lib/navigation/waze';
import { buildGoogleMapsSearchUrl } from '@/lib/navigation/google-maps';
import {
  buildNavigationProgress,
  splitInstructionRoadName,
  validateRouteGeometry,
  type NavigationProgress,
} from '@/lib/navigation/navigationProgress';
import {
  bearingDegrees,
  distanceToRouteMeters,
  snapPointToRoute,
} from '@/lib/navigation/routeGeometry';
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
const REROUTE_DEBOUNCE_MS = 5_000;
const REROUTE_MIN_INTERVAL_MS = 30_000;
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
const COCKPIT_PAD_COLLAPSED = 210;
const COCKPIT_PAD_EXPANDED = 460;
const NAVIGATION_PROGRESS_STALE_MS = GPS_WEAK_SECONDS * 1000;
const DEV_GPS_PANEL_STACK_HEIGHT = 188;
// ── Offline / weak-network handling ─────────────────────────────────────────
// While a network failure is latched we suppress reroute/refresh spam, but
// still allow ONE probe this often so recovery is detected without a busy loop.
const OFFLINE_RETRY_MS = 15_000;
// ── Monotonic GPS guard / adaptive accuracy ─────────────────────────────────
// A fix implying a speed above this (~168 mph) is treated as a teleport/stale
// outlier and rejected UNLESS the fix is highly accurate (genuine motorway).
const MAX_PLAUSIBLE_SPEED_MPS = 75;
// Below this speed (m/s, ~1.3 mph) AND with little movement the driver is
// treated as stationary, so excess fixes are throttled to save work/battery.
const STATIONARY_SPEED_MPS = 0.6;
const STATIONARY_MOVE_M = 6;
// Minimum gap between PROCESSED fixes while stationary (excess fixes dropped).
const STATIONARY_MIN_INTERVAL_MS = 5_000;
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

// Google-style road map built from Mapbox tiles. This intentionally avoids
// Google branding/tiles while using a light, familiar road-first palette.
const PRIMARY_STYLE = 'mapbox://styles/mapbox/light-v11';
const FALLBACK_STYLE = 'mapbox://styles/mapbox/streets-v12';

/**
 * Camera behaviour while navigating.
 * - `north_up`   — map fixed to north, marker rotates to heading.
 * - `heading_up` — map rotates so travel direction is up (default driving).
 * - `overview`   — whole route framed, camera does not chase the driver.
 */
export type FollowMode = 'north_up' | 'heading_up' | 'overview';

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
  if (type === 'roundabout' || type === 'rotary' || type === 'roundabout turn') {
    return 'sync';
  }
  if (type === 'merge') return 'git-merge';
  if (mod.includes('uturn')) return 'arrow-undo';
  if (mod.includes('left')) return 'arrow-back';
  if (mod.includes('right')) return 'arrow-forward';
  return 'arrow-up';
}

function parseLatLng(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

type RouteMapMessage = {
  type?: string;
  reason?: string;
  message?: string;
  status?: number;
  index?: number;
};

const WEB_MAP_FRAME_STYLE = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  border: 0,
  display: 'block',
  background: '#F8FAFE',
} as const;

function parseRouteMapMessageData(
  data: unknown,
  allowPlainJson: boolean,
): RouteMapMessage | null {
  let raw = data;
  if (raw && typeof raw === 'object') {
    const envelope = raw as { __driverRouteMap?: unknown; payload?: unknown };
    if (envelope.__driverRouteMap === true) raw = envelope.payload;
    else if (!allowPlainJson) return null;
  }
  if (typeof raw === 'string') {
    if (!allowPlainJson) return null;
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object') return null;
  return raw as RouteMapMessage;
}

// ── Map HTML (mapbox-gl-js inside native WebView or web iframe) ─────────────
function buildHtml(token: string): string {
  return `<!doctype html><html><head>
<meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no" />
<link href="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css" rel="stylesheet" />
<script src="https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js"></script>
<style>
  html,body,#m{margin:0;padding:0;width:100%;height:100%;background:#F8FAFE}
  .mapboxgl-canvas{outline:none}
  .dwrap,.cwrap{position:relative;pointer-events:none}
  .dwrap{width:64px;height:64px;filter:drop-shadow(0 2px 7px rgba(60,64,67,.28))}
  .cwrap{width:44px;height:54px;filter:drop-shadow(0 3px 7px rgba(60,64,67,.32))}
  .driver-icon,.pin-icon{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2}
  .driver-icon{transform:translate(-50%,-50%)}
  .pin-icon{top:auto;bottom:0;transform:translateX(-50%)}
  .customer-pulse{position:absolute;left:50%;top:39%;width:28px;height:28px;border-radius:50%;border:2px solid rgba(234,67,53,.62);background:rgba(234,67,53,.10);box-shadow:0 0 18px rgba(234,67,53,.22);transform:translate(-50%,-50%) scale(.35);opacity:0;animation:customerRadarPulse 2400ms ease-out infinite;z-index:1}
  .customer-pulse.p2{animation-delay:800ms}
  @keyframes customerRadarPulse{
    0%{transform:translate(-50%,-50%) scale(.35);opacity:.62}
    68%{opacity:.16}
    100%{transform:translate(-50%,-50%) scale(2.4);opacity:0}
  }
  .pulse{display:none}
  @media (prefers-reduced-motion: reduce){
    .customer-pulse{animation:none;transform:translate(-50%,-50%) scale(1.45);opacity:.18}
    .customer-pulse.p2{display:none}
    *{scroll-behavior:auto!important}
  }
</style>
</head><body>
<div id="m"></div>
<script>
function post(payload){
  try {
    var msg = JSON.stringify(payload);
    if(window.ReactNativeWebView && window.ReactNativeWebView.postMessage){
      window.ReactNativeWebView.postMessage(msg);
      return;
    }
    if(window.parent && window.parent !== window){
      window.parent.postMessage({__driverRouteMap:true,payload:payload}, '*');
    }
  } catch(_){}
}
var postedMessages = {};
var fatalPosted = false;
function messageKey(type, message, status){
  return String(type || '') + ':' + String(status || '') + ':' + String(message || '').slice(0, 160);
}
function isBenignMapNoise(message, status){
  var m = String(message || '').toLowerCase();
  if(!m) return true;
  if(m.indexOf('abort') !== -1 || m.indexOf('cancel') !== -1) return true;
  if(m.indexOf('network request failed') !== -1) return true;
  if(m.indexOf('failed to fetch') !== -1) return true;
  if(m.indexOf('load canceled') !== -1 || m.indexOf('load cancelled') !== -1) return true;
  if(m.indexOf('tile') !== -1 && (status === 0 || status === 404)) return true;
  if(m.indexOf('glyph') !== -1 || m.indexOf('sprite') !== -1) return true;
  if(m.indexOf('styleimagemissing') !== -1) return true;
  return false;
}
function postOnce(payload){
  var key = messageKey(payload && payload.type, payload && payload.message, payload && payload.status);
  if(postedMessages[key]) return;
  postedMessages[key] = true;
  post(payload);
}
function postWarn(message, status){
  if(isBenignMapNoise(message, status)) return;
  postOnce({type:'map-warn', message:String(message || ''), status:status || 0});
}
function postJsError(message){
  if(isBenignMapNoise(message, 0)) return;
  postOnce({type:'js-error', message:String(message || '')});
}
function postFatal(reason, message, status){
  if(fatalPosted) return;
  fatalPosted = true;
  post({type:'map-fatal', reason:reason, message:String(message || ''), status:status || 0});
}
window.addEventListener('message', function(event){
  try {
    var data = event && event.data;
    if(!data || data.__driverRouteMapCommand !== 'eval' || typeof data.script !== 'string') return;
    if(event && event.source && window.parent && event.source !== window.parent) return;
    (0, eval)(data.script);
  } catch(err){
    postJsError('command eval: '+String(err && (err.message||err)));
  }
});
// Manual WebGL capability probe — mapbox-gl-js v3 removed mapboxgl.supported(),
// so we test for a real WebGL2/WebGL/experimental context on a throwaway canvas.
function hasWebGL(){
  try {
    var c = document.createElement('canvas');
    if(!window.WebGLRenderingContext) return false;
    return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch(_){ return false; }
}
function isFatalErr(msg, status){
  var m = String(msg || '').toLowerCase();
  if(status === 401 || status === 403) return true;
  if(m.indexOf('unauthorized') !== -1) return true;
  if(m.indexOf('forbidden') !== -1) return true;
  if(m.indexOf('access token') !== -1 || m.indexOf('accesstoken') !== -1) return true;
  if(m.indexOf('invalid token') !== -1) return true;
  if(m.indexOf('webgl') !== -1) return true;
  return false;
}
window.addEventListener('error', function(e){
  var target = e && e.target;
  if(target && target !== window) return;
  postJsError(String(e && (e.message||e)));
});
window.addEventListener('unhandledrejection', function(e){
  postJsError('unhandledrejection: '+String(e && e.reason));
});

var loaded = false, styleFellBack = false, layersReady = false, altClickBound = false;
var lastDriver = null, lastCustomer = null, lastHeading = null, lastRoutes = null, lastSelIdx = 0, lastFallback = false;
var lastRouteRev = -1;
var lastRouteSeq = -1;
var lastLocationTimestamp = 0;
var driverMarker = null, customerMarker = null;
// Driver-marker interpolation state: the dot is eased between ~1s GPS fixes
// (instead of snapping) so movement reads smooth like a real nav app.
var driverAnim = null, driverRaf = 0, driverAnimPos = null, lastRenderedRot = null, driverAnimSerial = 0;
var nowMs = (window.performance && window.performance.now) ? function(){ return window.performance.now(); } : function(){ return Date.now(); };
var pendingState = null;
var cameraEpoch = -1, programmatic = false;
// Stable zoom for driver follow mode — never changes on GPS update, only on recenter/mode-change.
var NAVIGATION_ZOOM = 16;
var ROUTE_PROJECTION_MAX_M = 80;
// DEV-only diagnostics flag (baked in at build time).
var NAV_DEV = ${__DEV__};
// Bottom map padding (px) reserved for the cockpit sheet so route framing is
// never hidden behind it. Updated from each pushed state (collapsed/expanded).
var bottomPad = 230;

var canStartMap = false;
if(typeof mapboxgl === 'undefined'){ postFatal('gl-script-failed', 'mapbox-gl-js failed to load from CDN'); }
else if(!hasWebGL()){
  postFatal('webgl-unsupported', 'WebGL is not supported by this WebView');
} else {
  canStartMap = true;
  mapboxgl.accessToken = ${JSON.stringify(token)};
}
var map;
if(canStartMap){
  try {
    map = new mapboxgl.Map({container:'m',style:${JSON.stringify(PRIMARY_STYLE)},center:[-4.2518,55.8642],zoom:11,pitch:0,bearing:0,attributionControl:false,dragRotate:false,pitchWithRotate:false,maxPitch:50,antialias:true});
  } catch(err){
    postFatal('construct-failed', String(err && (err.message||err)));
  }
}

// Clear navigation arrow that rotates to driver heading. rotationAlignment
// 'map' means the net on-screen rotation is (heading - mapBearing): in
// heading-up mode (bearing=heading) it points straight up; in north-up it
// points along the real travel direction.
function driverEl(){
  var w = document.createElement('div'); w.className='dwrap';
  w.innerHTML='<svg class="driver-icon" width="56" height="56" viewBox="0 0 56 56"><circle cx="28" cy="28" r="22" fill="rgba(249,115,22,.18)"/><circle cx="28" cy="28" r="16" fill="#F97316"/><path d="M28 10L39 38L29 33L21 43L22 30L12 25Z" fill="#FFFFFF" transform="rotate(45 28 28)"/></svg>';
  return w;
}
function customerEl(){
  var el=document.createElement('div'); el.className='cwrap';
  el.innerHTML='<span class="customer-pulse p1"></span><span class="customer-pulse p2"></span><svg class="pin-icon" width="36" height="48" viewBox="0 0 36 48"><path d="M18 2C9.2 2 2 9.1 2 17.9C2 29.8 18 48 18 48S34 29.8 34 17.9C34 9.1 26.8 2 18 2Z" fill="#EA4335"/><circle cx="18" cy="18" r="7" fill="#FFFFFF"/><circle cx="18" cy="18" r="4" fill="#EA4335"/></svg>';
  return el;
}

function emptyFC(){ return {type:'FeatureCollection',features:[]}; }
function featureCollection(features){ return {type:'FeatureCollection',features:features || []}; }
function lineFeature(coords){ return {type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}; }
function approxMeters(a,b){ var k=111320; var dx=(a[0]-b[0])*k*Math.cos(b[1]*Math.PI/180); var dy=(a[1]-b[1])*k; return Math.hypot(dx,dy); }
function projectPointOnRoute(point, coords){
  if(!point || !coords || coords.length<2) return null;
  var mLat = 111320;
  var mLng = 111320 * Math.cos(point[1] * Math.PI / 180);
  var px = point[0] * mLng;
  var py = point[1] * mLat;
  var bestIdx = 0, bestT = 0, bestDist = Infinity, bestPoint = null;
  for(var i=0;i<coords.length-1;i++){
    var ax = coords[i][0] * mLng;
    var ay = coords[i][1] * mLat;
    var bx = coords[i+1][0] * mLng;
    var by = coords[i+1][1] * mLat;
    var dx = bx - ax;
    var dy = by - ay;
    var lenSq = dx*dx + dy*dy;
    var t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
    if(t < 0) t = 0;
    if(t > 1) t = 1;
    var cx = ax + dx * t;
    var cy = ay + dy * t;
    var d = Math.hypot(px - cx, py - cy);
    if(d < bestDist){
      bestDist = d;
      bestIdx = i;
      bestT = t;
      bestPoint = [
        coords[i][0] + (coords[i+1][0] - coords[i][0]) * t,
        coords[i][1] + (coords[i+1][1] - coords[i][1]) * t
      ];
    }
  }
  return bestPoint ? {index:bestIdx, t:bestT, point:bestPoint, distanceMeters:bestDist} : null;
}
function passedRouteCoords(coords, driver){
  var p = projectPointOnRoute(driver, coords);
  if(!p || !p.point) return null;
  if(p.distanceMeters > ROUTE_PROJECTION_MAX_M) return null;
  if(p.index === 0 && p.t <= 0.01) return null;
  var passed = coords.slice(0, p.index + 1);
  var last = passed[passed.length - 1];
  if(!last || approxMeters(last, p.point) > 1) passed.push(p.point);
  return passed.length >= 2 ? passed : null;
}
function visualRouteCoords(coords, driver, customer){
  return coords || [];
}
function syncDynamicRouteOverlays(route, driver, customer, travelled){
  if(!map || !layersReady || !route || !route.coords || route.coords.length<2) return;
  try {
    if(map.getSource('rsel')) map.getSource('rsel').setData(featureCollection([lineFeature(visualRouteCoords(route.coords, driver, customer))]));
    var passed = (travelled && travelled.length >= 2) ? travelled : (driver ? passedRouteCoords(route.coords, driver) : null);
    if(map.getSource('rpassed')) map.getSource('rpassed').setData(passed ? featureCollection([lineFeature(passed)]) : emptyFC());
  } catch(e) {
    if(NAV_DEV) postWarn('route progress draw failed: '+String(e && (e.message||e)));
  }
}
// Shortest signed angular path from->to so the arrow never spins the long way.
function shortestRot(from, to){ var d = ((to - from + 540) % 360) - 180; return from + d; }
function stepDriver(animId){
  driverRaf = 0;
  if(!driverAnim || !driverMarker) return;
  if(driverAnim.id !== animId) return;
  var t = (nowMs() - driverAnim.start) / driverAnim.dur;
  if(t > 1) t = 1;
  var lng = driverAnim.fLng + (driverAnim.tLng - driverAnim.fLng) * t;
  var lat = driverAnim.fLat + (driverAnim.tLat - driverAnim.fLat) * t;
  driverMarker.setLngLat([lng, lat]);
  driverAnimPos = { lng: lng, lat: lat };
  if(driverAnim.hasRot){
    var r = driverAnim.fRot + (driverAnim.tRot - driverAnim.fRot) * t;
    driverMarker.setRotation(r);
    lastRenderedRot = ((r % 360) + 360) % 360;
  }
  if(t < 1) driverRaf = requestAnimationFrame(function(){ stepDriver(animId); });
}
// Move the driver dot to the target [lng,lat]. Each accepted GPS fix cancels
// and retargets the previous animation from the currently-rendered marker
// position; stale timestamps are ignored so buffered iOS fixes cannot drag the
// dot backwards.
function animateDriver(to, rot, opts){
  opts = opts || {};
  var animId = ++driverAnimSerial;
  var ts = (typeof opts.timestamp === 'number' && isFinite(opts.timestamp)) ? opts.timestamp : 0;
  if(ts && ts < lastLocationTimestamp) return false;
  var forceSnap = !!opts.forceSnap;
  var duration = (typeof opts.duration === 'number' && isFinite(opts.duration)) ? opts.duration : 900;
  duration = Math.max(220, Math.min(1400, duration));
  if(!driverMarker){
    driverMarker = new mapboxgl.Marker({element:driverEl(), anchor:'center', rotationAlignment:'map', pitchAlignment:'map'}).setLngLat(to).addTo(map);
    driverAnimPos = { lng: to[0], lat: to[1] };
    if(rot != null){ driverMarker.setRotation(rot); lastRenderedRot = ((rot % 360) + 360) % 360; }
    if(ts) lastLocationTimestamp = ts;
    return true;
  }
  if(forceSnap){
    if(driverRaf) cancelAnimationFrame(driverRaf);
    driverRaf = 0;
    driverAnim = null;
    driverAnimPos = { lng: to[0], lat: to[1] };
    driverMarker.setLngLat(to);
    if(rot != null){ driverMarker.setRotation(rot); lastRenderedRot = ((rot % 360) + 360) % 360; }
    if(ts) lastLocationTimestamp = ts;
    return true;
  }
  if(driverRaf) cancelAnimationFrame(driverRaf);
  driverRaf = 0;
  var from = driverMarker.getLngLat ? driverMarker.getLngLat() : (driverAnimPos || to);
  var fLng = (from.lng != null) ? from.lng : from[0];
  var fLat = (from.lat != null) ? from.lat : from[1];
  var fromRot = (lastRenderedRot == null) ? (rot == null ? 0 : rot) : lastRenderedRot;
  var toRot = (rot == null) ? fromRot : shortestRot(fromRot, rot);
  if(approxMeters([fLng, fLat], to) > 150){
    driverAnim = null;
    driverAnimPos = { lng: to[0], lat: to[1] };
    driverMarker.setLngLat(to);
    if(rot != null){ driverMarker.setRotation(rot); lastRenderedRot = ((rot % 360) + 360) % 360; }
    if(ts) lastLocationTimestamp = ts;
    return true;
  }
  driverAnim = { id:animId, fLng:fLng, fLat:fLat, tLng:to[0], tLat:to[1], fRot:fromRot, tRot:toRot, hasRot:(rot != null), start:nowMs(), dur:duration };
  if(ts) lastLocationTimestamp = ts;
  driverRaf = requestAnimationFrame(function(){ stepDriver(animId); });
  return true;
}
function circlePolygon(center, meters){
  var pts=[]; var lat=center[1]*Math.PI/180; var dLat=meters/111320; var dLng=meters/(111320*Math.cos(lat));
  for(var i=0;i<=32;i++){ var a=2*Math.PI*i/32; pts.push([center[0]+dLng*Math.cos(a), center[1]+dLat*Math.sin(a)]); }
  return {type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[pts]}}]};
}
function getRouteBeforeLayerId(){
  // Find the first LABEL symbol layer (layout has text-field). In navigation
  // styles, icon-only symbol layers appear BEFORE road line layers, so using
  // the very first symbol layer places routes beneath roads. Text-label layers
  // always appear after all road geometry, so inserting before the first one
  // guarantees the route sits above roads but below street names.
  try { var ls=(map.getStyle()&&map.getStyle().layers)||[]; for(var i=0;i<ls.length;i++){ var l=ls[i]; if(l.type==='symbol'&&l.layout&&l.layout['text-field']) return l.id; } } catch(_){}
  return undefined;
}
function setVis(id,on){ try { if(map.getLayer(id)) map.setLayoutProperty(id,'visibility', on?'visible':'none'); } catch(_){} }
function addSourceIfMissing(id, source){ if(!map.getSource(id)) map.addSource(id, source); }
function addLayerIfMissing(layer){ if(!map.getLayer(layer.id)) map.addLayer(layer); }
function applyGooglePalette(){
  try {
    var layers = (map.getStyle() && map.getStyle().layers) || [];
    for(var i=0;i<layers.length;i++){
      var l = layers[i];
      var id = String(l.id || '').toLowerCase();
      var sl = String(l['source-layer'] || '').toLowerCase();
      if(l.type === 'background') map.setPaintProperty(l.id, 'background-color', '#F8FAFE');
      if(l.type === 'fill'){
        if(id.indexOf('water') !== -1 || sl.indexOf('water') !== -1) map.setPaintProperty(l.id, 'fill-color', '#D2E3FC');
        else if(id.indexOf('park') !== -1 || id.indexOf('landuse') !== -1 || id.indexOf('national-park') !== -1) map.setPaintProperty(l.id, 'fill-color', '#DFF2D8');
        else if(id.indexOf('land') !== -1 || id.indexOf('built') !== -1) map.setPaintProperty(l.id, 'fill-color', '#F8FAFE');
      }
      if(l.type === 'line'){
        if(id.indexOf('motorway') !== -1 || id.indexOf('trunk') !== -1){
          map.setPaintProperty(l.id, 'line-color', '#F6C453');
          map.setPaintProperty(l.id, 'line-opacity', 0.95);
        } else if(id.indexOf('primary') !== -1 || id.indexOf('secondary') !== -1){
          map.setPaintProperty(l.id, 'line-color', '#FFFFFF');
          map.setPaintProperty(l.id, 'line-opacity', 1);
        } else if(id.indexOf('street') !== -1 || id.indexOf('road') !== -1){
          map.setPaintProperty(l.id, 'line-color', '#FFFFFF');
          map.setPaintProperty(l.id, 'line-opacity', 0.95);
        }
      }
      if(l.type === 'symbol'){
        if(id.indexOf('road') !== -1 || id.indexOf('label') !== -1){
          try { map.setPaintProperty(l.id, 'text-color', '#5F6368'); } catch(_){}
          try { map.setPaintProperty(l.id, 'text-halo-color', '#FFFFFF'); } catch(_){}
          try { map.setPaintProperty(l.id, 'text-halo-width', 1); } catch(_){}
        }
      }
    }
  } catch(e) {
    if(NAV_DEV) postWarn('palette setup failed: '+String(e && (e.message||e)));
  }
}
function hasRouteLayers(){
  try { return !!(map && map.getSource('rsel') && map.getSource('rpassed') && map.getLayer('r-case') && map.getLayer('r-main') && map.getLayer('r-passed') && map.getLayer('r-arrows')); }
  catch(_){ return false; }
}
function isMapStyleReady(){
  try {
    if(!map) return false;
    if(map.isStyleLoaded && !map.isStyleLoaded()) return false;
    return !!map.getStyle();
  } catch(_){
    return false;
  }
}
function promoteRouteLayers(){
  var ids = ['acc-fill','acc-line','alt-lines','r-shadow','r-case','r-main','r-traffic-low','r-traffic-slow','r-passed','r-arrows'];
  for(var i=0;i<ids.length;i++){
    try { if(map.getLayer(ids[i])) map.moveLayer(ids[i]); } catch(_){}
  }
}
// Route overlays are promoted above the base style so the selected route stays
// readable. Traffic colouring is limited to the selected route, not every road.
function ensureLayers(){
  if(layersReady && hasRouteLayers()){ promoteRouteLayers(); return true; }
  if(!isMapStyleReady()) return false;
  try {
    applyGooglePalette();
    addSourceIfMissing('acc',{type:'geojson',data:emptyFC()});
    addLayerIfMissing({id:'acc-fill',type:'fill',source:'acc',paint:{'fill-color':'#F97316','fill-opacity':0.14}});
    addLayerIfMissing({id:'acc-line',type:'line',source:'acc',paint:{'line-color':'#F97316','line-opacity':0.28,'line-width':1}});
    addSourceIfMissing('alts',{type:'geojson',data:emptyFC()});
    // Alternatives stay quiet until expanded, like Google Maps route options.
    addLayerIfMissing({id:'alt-lines',type:'line',source:'alts',layout:{'line-cap':'round','line-join':'round','visibility':'none'},paint:{'line-color':'#FDBA74','line-width':['interpolate',['linear'],['zoom'],10,4,15,7,18,10],'line-opacity':0.55}});
    addSourceIfMissing('rsel',{type:'geojson',data:emptyFC()});
    // Google-style route: clean orange stroke with a white casing and no dark
    // neon shadow from the previous driver map. The passed portion is overlaid
    // separately in grey so the remaining route stays obvious.
    addLayerIfMissing({id:'r-shadow',type:'line',source:'rsel',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'rgba(60,64,67,0.16)','line-width':['interpolate',['linear'],['zoom'],10,15,15,22,18,29],'line-blur':1.2,'line-opacity':0.45,'line-translate':[0,1]}});
    addLayerIfMissing({id:'r-case',type:'line',source:'rsel',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#FFFFFF','line-width':['interpolate',['linear'],['zoom'],10,13,15,20,18,27]}});
    addLayerIfMissing({id:'r-main',type:'line',source:'rsel',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#F97316','line-width':['interpolate',['linear'],['zoom'],10,8,15,13,18,18],'line-opacity':1}});
    addSourceIfMissing('rcong',{type:'geojson',data:emptyFC()});
    // Route-only traffic accents. Clear traffic is a slim green center stripe;
    // moderate/heavy/severe widen and intensify without painting every road.
    addLayerIfMissing({id:'r-traffic-low',type:'line',source:'rcong',filter:['==',['get','level'],'low'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-width':['interpolate',['linear'],['zoom'],10,2,15,3,18,5],'line-opacity':0.62,'line-color':'#34A853'}});
    addLayerIfMissing({id:'r-traffic-slow',type:'line',source:'rcong',filter:['any',['==',['get','level'],'moderate'],['==',['get','level'],'heavy'],['==',['get','level'],'severe']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-width':['interpolate',['linear'],['zoom'],10,4,15,7,18,10],'line-opacity':0.96,'line-color':['match',['get','level'],'moderate','#FBBC04','heavy','#EA4335','severe','#B3261E','#EA4335']}});
    addSourceIfMissing('rpassed',{type:'geojson',data:emptyFC()});
    addLayerIfMissing({id:'r-passed',type:'line',source:'rpassed',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#9AA0A6','line-width':['interpolate',['linear'],['zoom'],10,7,15,12,18,17],'line-opacity':0.92}});
    addLayerIfMissing({id:'r-arrows',type:'symbol',source:'rsel',layout:{'visibility':'none'},paint:{'text-opacity':0}});
    if(!altClickBound){
      map.on('click','alt-lines',function(e){ if(e.features && e.features[0] && e.features[0].properties){ post({type:'select-alt', index:e.features[0].properties.altIndex}); } });
      altClickBound = true;
    }
    layersReady = hasRouteLayers();
    if(layersReady) promoteRouteLayers();
    return layersReady;
  } catch(e) {
    layersReady = false;
    if(NAV_DEV) postWarn('route layer setup failed: '+String(e && (e.message||e)));
    return false;
  }
}

function setRoutes(routes, selIdx, fallback, customer){
  if(!ensureLayers()) return false;
  var altF=[];
  for(var i=0;i<routes.length;i++){
    if(i===selIdx || !routes[i] || !routes[i].coords) continue;
    altF.push({type:'Feature',properties:{altIndex:i},geometry:{type:'LineString',coordinates:routes[i].coords}});
  }
  var sel = routes[selIdx] || routes[0];
  if(!sel || !sel.coords || sel.coords.length<2){
    // Defensive: do NOT wipe a previously-drawn route on a transient/empty
    // selection. Keeping the last good blue line means a follow-mode toggle can
    // never blank the route.
    if(NAV_DEV) postWarn('route draw skipped: empty selected route');
    return false;
  }
  try {
    map.getSource('alts').setData(featureCollection(altF));
    map.getSource('rsel').setData(featureCollection([lineFeature(visualRouteCoords(sel.coords, lastDriver, customer))]));
    // Bright orange base is ALWAYS visible. Dashed + lighter orange only for the
    // approximate straight-line fallback so the driver can tell it apart.
    if(fallback){
      map.setPaintProperty('r-main','line-dasharray',[2,2]);
      map.setPaintProperty('r-main','line-color','#F59E0B');
    } else {
      try { map.setPaintProperty('r-main','line-dasharray', null); } catch(_){}
      map.setPaintProperty('r-main','line-color','#F97316');
    }
    // Traffic overlay: real Mapbox congestion annotations on the selected route.
    // Unknown stays transparent; low/moderate/heavy/severe become green/amber/red.
    var cong = sel.congestion;
    var feats=[];
    if(cong && cong.length>0){
      var n=Math.min(cong.length, sel.coords.length-1);
      for(var j=0;j<n;j++){
        var lvl = cong[j];
        if(lvl==='low'||lvl==='moderate'||lvl==='heavy'||lvl==='severe'){
          feats.push({type:'Feature',properties:{level:lvl},geometry:{type:'LineString',coordinates:[sel.coords[j],sel.coords[j+1]]}});
        }
      }
    }
    map.getSource('rcong').setData(featureCollection(feats));
    syncDynamicRouteOverlays(sel, lastDriver, customer);
    promoteRouteLayers();
    if(NAV_DEV) postOnce({type:'route-drawn', message:'route-drawn', coords:sel.coords.length, alternatives:routes.length, selectedIndex:selIdx});
    return true;
  } catch(e) {
    layersReady = false;
    if(NAV_DEV) postWarn('route draw failed: '+String(e && (e.message||e)));
    return false;
  }
}
function clearRoutes(){
  try { if(map.getSource('alts')) map.getSource('alts').setData(emptyFC()); } catch(_){}
  try { if(map.getSource('rsel')) map.getSource('rsel').setData(emptyFC()); } catch(_){}
  try { if(map.getSource('rcong')) map.getSource('rcong').setData(emptyFC()); } catch(_){}
  try { if(map.getSource('rpassed')) map.getSource('rpassed').setData(emptyFC()); } catch(_){}
}
function fitToCoords(coords){
  try{
    var b = new mapboxgl.LngLatBounds(coords[0], coords[0]);
    for(var i=1;i<coords.length;i++){ b.extend(coords[i]); }
    programmatic = true;
    map.fitBounds(b,{padding:{top:150,right:55,bottom:Math.max(120, bottomPad),left:55}, maxZoom:16, bearing:0, pitch:0, duration:500});
  }catch(_){}
}
// Camera is epoch-driven: zoom only changes when the epoch advances (recenter
// tap / follow-mode change / initial fit). Normal GPS fixes update center and
// (in heading-up) bearing ONLY — never zoom — so the map never fights the user.
function applyCamera(s){
  if(!s) return;
  var mode = s.followMode || 'heading_up';
  var cameraMode = s.cameraMode || (mode==='overview' ? 'overview' : (s.follow ? 'following' : 'free-pan'));
  if(cameraMode==='overview' || mode==='overview'){
    if(s.epoch!==cameraEpoch && s.fitCoords && s.fitCoords.length>=2){ fitToCoords(s.fitCoords); }
    cameraEpoch = s.epoch; return;
  }
  if(cameraMode==='free-pan' || !s.follow || !s.driver){ cameraEpoch = s.epoch; return; }
  var resetZoom = (s.epoch !== cameraEpoch);
  cameraEpoch = s.epoch;
  var opts = { center: s.driver, duration: 360, offset:[0, Math.min(130, Math.max(72, bottomPad * 0.28))] };
  if(mode==='heading_up'){ opts.bearing = (s.heading==null ? map.getBearing() : s.heading); opts.pitch = 38; }
  else { opts.bearing = 0; opts.pitch = 0; }
  var currentZoom = (map && map.getZoom) ? map.getZoom() : NAVIGATION_ZOOM;
  if(resetZoom || currentZoom < NAVIGATION_ZOOM - 0.5){ opts.zoom = NAVIGATION_ZOOM; }
  programmatic = true;
  try { if(map && map.stop) map.stop(); } catch(_){}
  map.easeTo(opts);
}

function applyState(s){
  if(!s || !map) return;
  var incomingRouteSeq = (typeof s.routeSeq === 'number' && isFinite(s.routeSeq)) ? s.routeSeq : lastRouteSeq;
  if(incomingRouteSeq < lastRouteSeq){
    if(NAV_DEV) postWarn('stale route revision ignored');
    return;
  }
  if(incomingRouteSeq > lastRouteSeq){
    lastRouteSeq = incomingRouteSeq;
    lastLocationTimestamp = 0;
    if(driverRaf) cancelAnimationFrame(driverRaf);
    driverRaf = 0;
    driverAnim = null;
    driverAnimSerial++;
  }
  if(typeof s.bottomPad === 'number' && s.bottomPad >= 0) bottomPad = s.bottomPad;
  if(s.customer){
    lastCustomer = s.customer;
    if(!customerMarker) customerMarker = new mapboxgl.Marker({element:customerEl(), anchor:'bottom'}).setLngLat(s.customer).addTo(map);
    else customerMarker.setLngLat(s.customer);
  }
  var driverAccepted = true;
  if(s.driver){
    driverAccepted = animateDriver(s.driver, s.heading, {forceSnap: !!s.forceSnap, timestamp: s.locationTimestamp, duration: s.animationDurationMs});
    if(driverAccepted){
      lastDriver = s.driver;
      if(s.heading!=null) lastHeading = s.heading;
    }
  }
  if(layersReady && map.getSource('acc')){
    var accCenter = s.rawDriver || s.driver;
    if(accCenter && s.accuracy!=null && s.accuracy>0 && s.accuracy<=120) map.getSource('acc').setData(circlePolygon(accCenter, s.accuracy));
    else map.getSource('acc').setData(emptyFC());
  }
  if(s.routes && s.routes.length){
    // Only rebuild the (expensive) route/alt/congestion layers when the route
    // ACTUALLY changed — geometry or selected index — never on every GPS fix.
    // The marker + camera below still update on each push so the dot stays live.
    lastRoutes = s.routes; lastSelIdx = s.selectedIndex||0; lastFallback = !!s.fallback;
    if(s.routeRev !== lastRouteRev || !hasRouteLayers()){
      if(setRoutes(s.routes, lastSelIdx, lastFallback, s.customer || lastCustomer)){
        lastRouteRev = s.routeRev;
      }
    }
  } else if(Array.isArray(s.routes) && s.routes.length===0){
    // Explicit "no route" => clear. A missing/undefined routes key is treated
    // as "unchanged" so a partial state push can never remove the active route.
    lastRoutes = null; lastRouteRev = s.routeRev; clearRoutes();
  } else if(lastRoutes && !hasRouteLayers()){
    setRoutes(lastRoutes, lastSelIdx, lastFallback, s.customer || lastCustomer);
  }
  if(lastRoutes && layersReady){
    var activeRoute = lastRoutes[lastSelIdx] || lastRoutes[0];
    syncDynamicRouteOverlays(activeRoute, lastDriver, lastCustomer, s.travelledGeometry);
  }
  // Alternatives visibility is independent of the route rebuild: toggling the
  // cockpit must never redraw the route, only show/hide the muted alt lines.
  if(typeof s.showAlts === 'boolean') setVis('alt-lines', s.showAlts);
  if(s.fit && s.followMode==='overview' && s.fitCoords && s.fitCoords.length>=2){ fitToCoords(s.fitCoords); cameraEpoch = s.epoch; return; }
  if(driverAccepted) applyCamera(s);
}
window.__applyState = function(encoded){
  try {
    var s = JSON.parse(decodeURIComponent(encoded));
    if(loaded) applyState(s); else pendingState = s;
  }
  catch(e){ post({type:'map-error', message:'applyState parse: '+String(e)}); }
};
window.__resizeMap = function(){ try { map && map.resize(); } catch(_){} };

function scheduleEarlyResize(){
  var attempts = 0;
  var iv = setInterval(function(){
    try { map && map.resize(); } catch(_){}
    attempts++;
    if(attempts >= 8) clearInterval(iv);
  }, 150);
}
scheduleEarlyResize();
window.addEventListener('resize', function(){ try { map && map.resize(); } catch(_){} });
try {
  if(typeof ResizeObserver !== 'undefined'){
    var ro = new ResizeObserver(function(){ try { map && map.resize(); } catch(_){} });
    ro.observe(document.getElementById('m'));
  }
} catch(_){}

function onUserInteract(){ post({type:'user-pan'}); }
function restoreRouteLayers(){
  if(!ensureLayers()) return false;
  if(lastRoutes){ return setRoutes(lastRoutes, lastSelIdx, lastFallback, lastCustomer); }
  return true;
}
function scheduleRouteRestore(){
  restoreRouteLayers();
  setTimeout(restoreRouteLayers, 100);
  setTimeout(restoreRouteLayers, 350);
  setTimeout(restoreRouteLayers, 900);
}

if(map){
  map.on('error', function(e){
    var em = e && e.error ? (e.error.message || String(e.error)) : String(e);
    var st = e && e.error && e.error.status ? e.error.status : 0;
    if(!loaded && !styleFellBack && (String(em).toLowerCase().indexOf('style') !== -1)){
      styleFellBack = true;
      postWarn('style load failed, falling back: '+em, st);
      try { map.setStyle(${JSON.stringify(FALLBACK_STYLE)}, {diff:false}); return; } catch(_){}
    }
    if(!loaded && isFatalErr(em, st)){ postFatal('load-error', em, st); }
    else { postWarn(em, st); }
  });
  // Only treat as a user gesture when an originalEvent exists — programmatic
  // easeTo/fitBounds emit the same events WITHOUT one.
  map.on('dragstart', onUserInteract);
  map.on('zoomstart', function(e){ if(e && e.originalEvent) onUserInteract(); });
  map.on('rotatestart', function(e){ if(e && e.originalEvent) onUserInteract(); });
  map.on('pitchstart', function(e){ if(e && e.originalEvent) onUserInteract(); });
  map.on('style.load', function(){
    layersReady = false;
    scheduleRouteRestore();
  });
  map.on('idle', function(){
    if(lastRoutes && !hasRouteLayers()) scheduleRouteRestore();
  });
  map.on('load', function(){
    loaded = true;
    try { map.resize(); } catch(_){}
    ensureLayers();
    if(pendingState){ applyState(pendingState); pendingState = null; }
    post({type:'map-loaded'});
  });
}
post({type:'html-ready'});
</script></body></html>`;
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
  const [driverLoc, setDriverLoc] = useState<Coordinates | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [permRetry, setPermRetry] = useState(0);
  const [actioning, setActioning] = useState(false);

  const [routeState, setRouteState] = useState<RouteState>(INITIAL_ROUTE_STATE);
  const [phase, setPhase] = useState<NavigationPhase>('preview');
  const [isFollowingDriver, setIsFollowingDriver] = useState(true);
  const [followMode, setFollowMode] = useState<FollowMode>('heading_up');
  // Bumped on recenter / follow-mode change to authorise a one-off camera zoom
  // reset in the WebView. Plain GPS fixes keep the same epoch (no auto-zoom).
  const [cameraEpoch, setCameraEpoch] = useState(0);
  const [routeSequence, setRouteSequence] = useState(0);
  // Collapsible bottom cockpit so the map can occupy the full screen.
  // Default to COLLAPSED so the map is the dominant full-screen visual and the
  // bottom panel is only a small floating bar (status + ETA + action).
  const [cockpitCollapsed, setCockpitCollapsed] = useState(true);
  const [rerouting, setRerouting] = useState(false);
  const [, setCurrentStepIndex] = useState(0);
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);
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

  // Map lifecycle state, keyed to the current WebView instance so a remount
  // (status change / retry / watchdog) implicitly resets to "loading".
  const [mapStatus, setMapStatus] = useState<{
    key: string;
    phase: 'loading' | 'loaded' | 'fatal';
  }>({ key: '', phase: 'loading' });
  const [mapReloadKey, setMapReloadKey] = useState(0);
  const [mapDiag, setMapDiag] = useState<string>('');

  // ── Refs (stable across renders / used inside async callbacks) ──
  const webRef = useRef<WebView>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const mapDiagRef = useRef('');
  const jobNumberShimmer = useRef(new Animated.Value(0)).current;
  const routeAbortRef = useRef<AbortController | null>(null);
  const routeRequestSeqRef = useRef(0);
  const returnRouteAbortRef = useRef<AbortController | null>(null);
  const destinationRef = useRef<Coordinates | null>(null);
  const driverLocRef = useRef<Coordinates | null>(null);
  // Heading/speed/accuracy derived from the GPS stream, read by the camera
  // push effect (kept in refs so a fix doesn't force the effect to re-subscribe).
  const headingRef = useRef<number | null>(null);
  const speedRef = useRef<number | null>(null);
  const accuracyRef = useRef<number | null>(null);
  const prevLocRef = useRef<Coordinates | null>(null);
  const routeStateRef = useRef<RouteState>(INITIAL_ROUTE_STATE);
  const routeSequenceRef = useRef(0);
  const navigationProgressRef = useRef<NavigationProgress | null>(null);
  const phaseRef = useRef<NavigationPhase>('preview');
  const stepIndexRef = useRef(0);
  const lastRouteOriginRef = useRef<Coordinates | null>(null);
  const lastRouteAtRef = useRef<number>(0);
  const offRouteSinceRef = useRef<number | null>(null);
  const lastOffRouteRerouteAtRef = useRef<number>(0);
  const routePreferencesRef = useRef<RoutePreferences>(DEFAULT_ROUTE_PREFERENCES);
  // Timestamp (Date.now) of the last route fetch that failed for NETWORK
  // reasons; 0 means "online". While set we keep the last good route on screen
  // and suppress reroute/refresh spam (one probe per OFFLINE_RETRY_MS only).
  const networkFailRef = useRef<number>(0);
  // Monotonic GPS guard: timestamp (ms, from the OS fix) of the last ACCEPTED
  // fix, and the last fix we actually PROCESSED (used to throttle when parked).
  const lastFixTimeRef = useRef<number>(0);
  const lastProcessedFixTimeRef = useRef<number>(0);
  const fitPendingRef = useRef(false);
  // Tracks the last routeRev string we actually sent to the WebView so we can
  // skip re-serialising the full route geometry (~15 KB) on GPS-only updates.
  const lastInjectedRouteRevRef = useRef<string>('');
  const hasRequestedRef = useRef(false);
  const latestStateRef = useRef<string>('');
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
  const prevPayStatusRef = useRef<PaymentState | null | undefined>(undefined);
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
  const jobNumberShimmerX = jobNumberShimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-72, 220],
  });
  const jobNumberShimmerOpacity = jobNumberShimmer.interpolate({
    inputRange: [0, 0.14, 0.5, 0.86, 1],
    outputRange: [0, 0.28, 0.62, 0.28, 0],
  });

  // Keep the decorative title shimmer native-only; on web it becomes a JS loop
  // competing with the map.
  useEffect(() => {
    if (Platform.OS === 'web') {
      jobNumberShimmer.setValue(0);
      return undefined;
    }
    const animation = Animated.loop(
      Animated.timing(jobNumberShimmer, {
        toValue: 1,
        duration: 3000,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => {
      animation.stop();
      jobNumberShimmer.stopAnimation();
      jobNumberShimmer.setValue(0);
    };
  }, [jobNumberShimmer]);
  useEffect(() => { routeStateRef.current = routeState; }, [routeState]);
  useEffect(() => { followModeRef.current = followMode; }, [followMode]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { reroutingRef.current = rerouting; }, [rerouting]);
  useEffect(() => { lastFixAtRef.current = lastFixAt; }, [lastFixAt]);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);
  useEffect(() => { localeRef.current = locale === 'ar' ? 'ar' : 'en'; }, [locale]);
  useEffect(() => { jobStatusRef.current = job?.status ?? null; }, [job?.status]);
  useEffect(() => { showArrivalPromptRef.current = showArrivalPrompt; }, [showArrivalPrompt]);
  useEffect(() => { routePreferencesRef.current = routePreferences; }, [routePreferences]);
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
    setMapDiag(reason);
    if (__DEV__ && severity === 'error') {
      console.error('[route-map]', reason);
    }
  }, []);

  const injectMapJavaScript = useCallback((script: string) => {
    if (Platform.OS === 'web') {
      iframeRef.current?.contentWindow?.postMessage(
        { __driverRouteMapCommand: 'eval', script },
        '*',
      );
      return;
    }
    webRef.current?.injectJavaScript(script);
  }, []);

  const customerCoord: Coordinates | null = useMemo(() => {
    const lat = parseLatLng(job?.lat);
    const lng = parseLatLng(job?.lng);
    if (lat == null || lng == null) return null;
    const c = { lat, lng };
    return isValidCoord(c) ? c : null;
  }, [job?.lat, job?.lng]);
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
    offRouteSinceRef.current = null;
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

  // Build the HTML once per token so the WebView never reloads while data updates.
  const html = useMemo(() => (token ? buildHtml(token) : ''), [token]);
  const mapKey = `${job?.id ?? 'job'}:${mapReloadKey}`;
  const mapLoaded = mapStatus.key === mapKey && mapStatus.phase === 'loaded';
  const mapFatal = mapStatus.key === mapKey && mapStatus.phase === 'fatal';
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

  // ── Route request (client-side Mapbox Directions, road-following) ──
  const requestRoute = useCallback(
    async (origin: Coordinates, destination: Coordinates) => {
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
      const routeOriginFixAt = lastFixAtRef.current ?? Date.now();

      const result = await fetchDirections(
        origin,
        destination,
        controller.signal,
        locale === 'ar' ? 'ar' : 'en',
        { avoid: routePreferencesRef.current },
      );
      if (controller.signal.aborted) return;
      if (requestId !== routeRequestSeqRef.current) {
        logRouteDiagnostic('stale-route-response-discarded', { requestId });
        return;
      }

      if ('routes' in result) {
        const validations = result.routes.map((route) =>
          validateRouteGeometry({ route, origin, destination }),
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
        const primary = routes[0];
        // A successful fetch means we are back online — clear the latch so
        // reroute/refresh is allowed again.
        // Only fit the whole route on the very first fetch for this session or when in
        // overview mode. Fitting during active navigation zooms out and disorients the driver.
        networkFailRef.current = 0;
        lastRouteOriginRef.current = origin;
        lastRouteAtRef.current = Date.now();
        offRouteSinceRef.current = null;
        fitPendingRef.current = followModeRef.current === 'overview';
        stepIndexRef.current = primary.steps.length > 1 ? 1 : 0;
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
        requestRoute(driver, dest);
        return;
      }

      // While a network failure is latched, suppress reroute/refresh attempts
      // (keeping the last good route on screen) and only allow a single probe
      // every OFFLINE_RETRY_MS so connectivity recovery is still detected
      // without an infinite retry loop.
      const offline = networkFailRef.current !== 0;
      const networkAllowed =
        !offline || now - networkFailRef.current > OFFLINE_RETRY_MS;

      // Off-route detection + debounced reroute. NOT gated on rs.loading so the
      // off-route timer accumulates while an initial/refresh request is in-flight.
      // The reroute trigger itself skips firing while loading to avoid stacking
      // requests; as soon as the in-flight request settles the very next fix that
      // still finds the driver off-route fires immediately (debounce already elapsed).
      if (routeBelongsToCurrentJob && rs.geometry) {
        const d = distanceToRouteMeters(driver, rs.geometry);
        if (d <= GPS_DRIFT_METERS) {
          offRouteSinceRef.current = null;
          setRouteDeviation(null);
        } else if (d <= OFF_ROUTE_METERS) {
          offRouteSinceRef.current = null;
          setRouteDeviation({
            kind: 'gps-drift',
            distanceMeters: d,
            recalculating: false,
          });
          return;
        } else {
          if (offRouteSinceRef.current == null) {
            offRouteSinceRef.current = now;
            setRouteDeviation({
              kind: 'gps-drift',
              distanceMeters: d,
              recalculating: false,
            });
            return;
          } else if (now - offRouteSinceRef.current > REROUTE_DEBOUNCE_MS) {
            const rerouteAllowed =
              now - lastOffRouteRerouteAtRef.current > REROUTE_MIN_INTERVAL_MS;
            setRouteDeviation({
              kind: 'off-route',
              distanceMeters: d,
              recalculating: !rs.loading && networkAllowed && rerouteAllowed,
            });
            if (!rs.loading && networkAllowed && rerouteAllowed) {
              offRouteSinceRef.current = null;
              lastOffRouteRerouteAtRef.current = now;
              setRerouting(true);
              requestRoute(driver, dest);
              return;
            }
            return;
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
        now - lastOffRouteRerouteAtRef.current < REROUTE_MIN_INTERVAL_MS;
      if (
        networkAllowed &&
        !offRouteRerouteCooldown &&
        (rs.source === 'none' || (movedEnough && intervalOk) || staleWhileMoving)
      ) {
        requestRoute(driver, dest);
      }
    },
    [bumpRouteSequence, currentRouteJobRef, requestRoute],
  );

  // First fix / subsequent fixes funnel through here.
  const onFix = useCallback(
    (driver: Coordinates) => {
      const now = Date.now();
      lastFixAtRef.current = now;
      setLastFixAt(now);
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
        requestRoute(driver, dest);
        return;
      }
      evaluateRoute(driver);
    },
    [evaluateRoute, requestRoute],
  );

  useEffect(() => { handlersRef.current.onFix = onFix; }, [onFix]);

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
    if (customerCoord && driverLocRef.current) {
      const driver = driverLocRef.current;
      Promise.resolve().then(() => handlersRef.current.onFix(driver));
    }
  }, [customerCoord, currentDestinationKey, currentRouteJobRef]);

  // ── Foreground GPS watcher (single subscription, cleaned up on unmount) ──
  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const current = await Location.getForegroundPermissionsAsync();
      let granted = current.status === 'granted';
      if (!granted) {
        const requested = await Location.requestForegroundPermissionsAsync();
        granted = requested.status === 'granted';
      }
      if (cancelled) return;
      if (!granted) {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);

      const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(
        () => null,
      );
      if (!cancelled && last && !devGpsActiveRef.current) {
        const c = { lat: last.coords.latitude, lng: last.coords.longitude };
        // Seed the monotonic guard from the last-known fix timestamp and never
        // render an invalid (e.g. 0,0) seed position.
        if (isValidCoord(c)) {
          lastFixTimeRef.current =
            typeof last.timestamp === 'number' ? last.timestamp : Date.now();
          lastProcessedFixTimeRef.current = lastFixTimeRef.current;
          prevLocRef.current = c;
          driverLocRef.current = c;
          setDriverLoc(c);
          handlersRef.current.onFix(c);
        }
      }

      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 2_000,
          distanceInterval: 5,
        },
        (loc) => {
          if (devGpsActiveRef.current) return;
          const c = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          const fixTime =
            typeof loc.timestamp === 'number' ? loc.timestamp : Date.now();
          // ── Monotonic GPS guard ──
          // 1) Never render an invalid/0,0 fix — keep the last good position.
          if (!isValidCoord(c)) return;
          // 2) Reject stale / out-of-order fixes that arrive after a newer one
          //    (they would drag the marker + camera backwards).
          if (fixTime <= lastFixTimeRef.current) return;
          // 3) Reject physically impossible jumps (stale buffered fix or a wild
          //    outlier) UNLESS the fix is highly accurate (a genuine fast leg).
          const prevAccepted = prevLocRef.current;
          if (prevAccepted && lastFixTimeRef.current > 0) {
            const dtSec = (fixTime - lastFixTimeRef.current) / 1000;
            const acc = loc.coords.accuracy;
            const accurate = typeof acc === 'number' && acc >= 0 && acc <= 30;
            if (dtSec > 0) {
              const impliedSpeed = haversineMeters(prevAccepted, c) / dtSec;
              if (impliedSpeed > MAX_PLAUSIBLE_SPEED_MPS && !accurate) return;
            }
          }
          // Heading: trust the GPS course while genuinely moving; otherwise
          // derive a bearing from the previous fix so the arrow/map still face
          // the direction of travel.
          const gpsHeading = loc.coords.heading;
          const speed = loc.coords.speed;
          // ── Adaptive accuracy ──
          // While stationary (low speed AND negligible movement) throttle the
          // PROCESSED fixes: drop excess updates so we stop pushing state /
          // re-evaluating the route every couple of seconds when parked. This
          // uses the SAME single watcher — no second subscription is opened.
          const movedFromPrev = prevAccepted
            ? haversineMeters(prevAccepted, c)
            : Infinity;
          const stationary =
            (speed == null || speed < 0 || speed < STATIONARY_SPEED_MPS) &&
            movedFromPrev < STATIONARY_MOVE_M;
          if (
            stationary &&
            fixTime - lastProcessedFixTimeRef.current < STATIONARY_MIN_INTERVAL_MS
          ) {
            // Still accept the timestamp so the monotonic guard advances, but do
            // no further work this tick.
            lastFixTimeRef.current = fixTime;
            return;
          }
          lastFixTimeRef.current = fixTime;
          lastProcessedFixTimeRef.current = fixTime;
          // Rule 1: GPS heading only when driver is genuinely moving (speed > 1 m/s).
          // Rule 2: Bearing from last accepted fix when moved > 5 m (avoids GPS jitter).
          // Rule 3: Keep last stable heading (headingRef unchanged) — never snap to 0.
          let heading: number | null = null;
          if (
            typeof gpsHeading === 'number' &&
            gpsHeading >= 0 &&
            typeof speed === 'number' &&
            speed > 1
          ) {
            heading = gpsHeading;
          } else {
            const prev = prevLocRef.current;
            if (prev && haversineMeters(prev, c) > 5) {
              heading = bearingDegrees(prev, c);
            }
          }
          if (heading != null) headingRef.current = heading;
          speedRef.current =
            typeof speed === 'number' && speed >= 0 ? speed : null;
          accuracyRef.current =
            typeof loc.coords.accuracy === 'number' && loc.coords.accuracy >= 0
              ? loc.coords.accuracy
              : null;
          prevLocRef.current = c;
          driverLocRef.current = c;
          setDriverLoc(c);
          handlersRef.current.onFix(c);
        },
      );
      if (cancelled) {
        sub.remove();
        sub = null;
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
      routeAbortRef.current?.abort();
    };
  }, [token, permRetry]);

  // Route signature: changes ONLY when the drawn route truly changes
  // (geometry length / endpoints / selected index / source). The WebView uses
  // it as a stable opaque token to skip the expensive route-layer rebuild on
  // every GPS fix — compared with strict equality, so any change triggers a
  // single rebuild. Initial WebView value is -1 so the first push always wins.
  const routeRev = useMemo(() => {
    const g = routeState.geometry;
    return `${routeState.source}|${routeState.routeJobRef ?? ''}|${
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
  const navigationProgress = useMemo(
    () =>
      buildNavigationProgress({
        rawLocation: driverLoc && isValidCoord(driverLoc) ? driverLoc : null,
        route: selectedRoute,
        routeRevision: routeRev,
        routeIsCurrent,
        previous: navigationProgressRef.current,
        gpsHeading: headingRef.current,
        speedMps: speedRef.current,
        accuracyMeters: accuracyRef.current,
        fixTimestampMs: lastFixAt,
        nowMs: lastFixAt ?? 0,
        maxSnapDistanceMeters: SNAP_TO_ROUTE_MAX_DRIFT_M,
        staleAfterMs: NAVIGATION_PROGRESS_STALE_MS,
        fallbackStepIndex: stepIndexRef.current,
      }),
    [driverLoc, lastFixAt, routeIsCurrent, routeRev, selectedRoute],
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

  // ── Push markers / route / camera into the WebView ──
  useEffect(() => {
    if (!token || !mapLoaded) return;
    const routeCanRender =
      routeState.source === 'mapbox' &&
      routeState.routeJobRef === currentRouteJobRef &&
      routeState.routeDestinationKey === currentDestinationKey;
    const driver = displayDriverPosition
      ? [displayDriverPosition.lng, displayDriverPosition.lat]
      : null;
    const rawDriver = rawDriverPosition
      ? [rawDriverPosition.lng, rawDriverPosition.lat]
      : null;
    const customer = customerMarkerPosition
      ? [customerMarkerPosition.lng, customerMarkerPosition.lat]
      : null;
    const routeRevChanged = routeRev !== lastInjectedRouteRevRef.current;
    const routesPayload = routeCanRender
      ? routeRevChanged
        ? routeState.routes.map((r) => ({ coords: r.geometry, congestion: r.congestion }))
        : undefined
      : routeRevChanged
        ? []
        : undefined;
    if (routeRevChanged) lastInjectedRouteRevRef.current = routeRev;
    const fit = fitPendingRef.current;
    fitPendingRef.current = false;
    const fitCoords =
      fit && routeCanRender && selectedRouteCoordinates
        ? [
            ...(rawDriver ? [rawDriver] : driver ? [driver] : []),
            ...selectedRouteCoordinates,
            ...(customer ? [customer] : []),
          ]
        : null;
    const mapHeading =
      navigationProgress.displayHeading ??
      (displayMode === 'snapped' && routeHeading != null
        ? routeHeading
        : headingRef.current);
    const cameraMode =
      followMode === 'overview'
        ? 'overview'
        : isFollowingDriver
          ? 'following'
          : 'free-pan';
    const json = JSON.stringify({
      driver,
      rawDriver,
      driverDisplayMode: displayMode,
      heading: mapHeading,
      accuracy: accuracyRef.current,
      locationTimestamp: navigationProgress.fixTimestampMs,
      animationDurationMs: navigationProgress.animationDurationMs,
      forceSnap: navigationProgress.forceSnap,
      customer,
      routes: routesPayload,
      selectedIndex: routeState.selectedIndex,
      routeRev,
      routeSeq: routeSequence,
      travelledGeometry: navigationProgress.travelledGeometry,
      // Alternatives are hidden while the cockpit is collapsed so they never
      // compete with the main route; shown only when details are expanded.
      showAlts: !cockpitCollapsed,
      fallback: false,
      fit,
      // Only include the full coordinate array when the map must actually call
      // fitBounds. Sending ~15 KB of geometry on every GPS fix wastes the bridge.
      fitCoords,
      follow: isFollowingDriver,
      followMode,
      cameraMode,
      epoch: cameraEpoch,
      bottomPad: cockpitCollapsed ? COCKPIT_PAD_COLLAPSED + insets.bottom : COCKPIT_PAD_EXPANDED + insets.bottom,
    });
    // Encode so any character (incl. quotes / line separators) survives being
    // embedded in the injected JS string literal; the WebView decodeURIComponents.
    const encoded = encodeURIComponent(json).replace(/'/g, '%27');
    latestStateRef.current = encoded;
    injectMapJavaScript(
      `window.__applyState && window.__applyState('${encoded}'); true;`,
    );
  }, [
    token,
    mapLoaded,
    customerMarkerPosition,
    currentDestinationKey,
    currentRouteJobRef,
    displayDriverPosition,
    displayMode,
    routeState.routes,
    routeState.selectedIndex,
    routeState.source,
    routeState.geometry,
    routeState.routeJobRef,
    routeState.routeDestinationKey,
    routeRev,
    routeSequence,
    selectedRouteCoordinates,
    routeHeading,
    navigationProgress,
    isFollowingDriver,
    followMode,
    cameraEpoch,
    cockpitCollapsed,
    insets.bottom,
    injectMapJavaScript,
    rawDriverPosition,
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

  // Re-run Mapbox's internal resize when the screen regains focus.
  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => {
        injectMapJavaScript(
          'window.__resizeMap && window.__resizeMap(); true;',
        );
      }, 300);
      return () => clearTimeout(timer);
    }, [injectMapJavaScript]),
  );

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

  // Same when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        injectMapJavaScript(
          'window.__resizeMap && window.__resizeMap(); true;',
        );
      }
    });
    return () => sub.remove();
  }, [injectMapJavaScript]);

  // Watchdog: if a freshly-mounted canvas never reports map-loaded, remount it
  // a couple of times, then surface the retry card.
  useEffect(() => {
    if (!token || mapLoaded || mapFatal) return undefined;
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
  }, [token, mapLoaded, mapFatal, mapKey, logMapDiag]);

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
            hasTyreSize: !!(currentJob.tyreSizeDisplay?.trim()),
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
    const status: PaymentState | null = job?.paymentSummary?.state ?? job?.payment?.state ?? null;
    const prev = prevPayStatusRef.current;
    prevPayStatusRef.current = status;
    if (prev === undefined) return; // first observation — nothing to compare yet
    if (status === 'paid' && prev !== 'paid') {
      // Genuine unpaid/pending/deposit -> paid transition.
      playSound('payment_received');
      successHaptic();
      const text = t('route.paymentReceived');
      // Defer banner setState to avoid synchronous setState inside an effect body.
      const id = setTimeout(() => showBanner(text), 0);
      return () => clearTimeout(id);
    } else if (status === 'deposit_paid' && prev !== 'deposit_paid' && prev !== 'paid') {
      const text = t('route.depositReceived');
      const id = setTimeout(() => showBanner(text), 0);
      return () => clearTimeout(id);
    }
  }, [job?.paymentSummary?.state, job?.payment?.state, showBanner, t]);

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
          void stopBackgroundLocation();
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

  const handleStatusAction = useCallback(
    (nextStatus: string) => {
      if (!ref || actionLockRef.current) return;

      // Completion checklist — shown before marking complete.
      if (nextStatus === 'completed') {
        setCompletionChecks({ tyreFitted: false, wheelNuts: false, customerInformed: false, paymentChecked: false });
        setCompletionError(null);
        setShowCompletionChecklist(true);
        return;
      }

      void updateRouteStatus(nextStatus, {
        onError:
          nextStatus === 'arrived'
            ? (message) => setArrivalError(message)
            : undefined,
      });
    },
    [ref, updateRouteStatus],
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

  // Open a Google Maps text search for the customer address when coordinates are
  // unavailable. Reuses extNavLockRef so double-taps are prevented.
  const handleOpenAddressSearch = useCallback(async () => {
    if (extNavLockRef.current) return;
    const addr = job?.addressLine?.trim();
    if (!addr) return;
    extNavLockRef.current = true;
    let url: string;
    try {
      url = buildGoogleMapsSearchUrl(addr);
    } catch {
      extNavLockRef.current = false;
      return;
    }
    try {
      const trackingReady = await prepareExternalNavigationTracking();
      if (!trackingReady) return;
      await Linking.openURL(url).catch(() => {});
    } finally {
      setTimeout(() => { extNavLockRef.current = false; }, 800);
    }
  }, [job?.addressLine, prepareExternalNavigationTracking]);

  // Manual retry for the road route, gated on the existing minimum interval so
  // the driver cannot spam the Directions API with repeated taps.
  const handleRetryRoute = useCallback(() => {
    const driver = driverLocRef.current;
    const dest = destinationRef.current;
    if (!driver || !dest) return;
    if (Date.now() - lastRouteAtRef.current < ROUTE_MIN_INTERVAL_MS) return;
    requestRoute(driver, dest);
  }, [requestRoute]);

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
        requestRoute(driver, dest);
      }
    },
    [requestRoute],
  );

  // Single handler for the collapsed cockpit primary button. Uses refs for
  // real-time values to avoid closure-ordering issues. Priority order:
  //   1. Assigned job -> Start driving
  //   2. Within arrival zone + en route -> Mark Arrived
  //   3. Otherwise expand details (Waze/Google Maps live there)
  const handleCollapsedPrimary = useCallback(() => {
    const jobStatus = jobStatusRef.current;
    if (jobStatus === 'driver_assigned') {
      handleStatusAction('en_route');
      return;
    }
    const driver = driverLocRef.current;
    const dest = destinationRef.current;
    const distM = driver && dest ? haversineMeters(driver, dest) : null;
    const isArrivedZone = jobStatus === 'en_route' && distM != null && distM <= ARRIVAL_HERE_M;
    if (isArrivedZone) {
      void handleConfirmArrival();
      return;
    }
    setCockpitCollapsed(false);
  }, [handleStatusAction, handleConfirmArrival]);

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
    // Advance the camera epoch so the WebView performs a single zoom reset to
    // the follow-mode default; subsequent fixes won't change zoom again.
    setCameraEpoch((e) => e + 1);
  }, []);

  // Cycle north-up → heading-up → overview and re-engage follow.
  const handleCycleFollowMode = useCallback(() => {
    lightHaptic();
    setFollowMode((m) =>
      m === 'heading_up' ? 'overview' : m === 'overview' ? 'north_up' : 'heading_up',
    );
    setIsFollowingDriver(true);
    setCameraEpoch((e) => e + 1);
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

  const handleMapMessage = useCallback((msg: RouteMapMessage) => {
    if (msg.type === 'map-loaded') {
      recoveryAttemptsRef.current = 0;
      // Force the next state push to re-send route geometry so the rebuilt map
      // gets the full route after a crash/reload.
      lastInjectedRouteRevRef.current = '';
      setMapStatus({ key: mapKey, phase: 'loaded' });
      injectMapJavaScript('window.__resizeMap && window.__resizeMap(); true;');
    } else if (msg.type === 'map-fatal') {
      logMapDiag(
        `map-fatal: ${msg.reason ?? 'unknown'}${
          msg.status ? ` (status ${msg.status})` : ''
        }`,
        'error',
      );
      setMapStatus({ key: mapKey, phase: 'fatal' });
    } else if (msg.type === 'user-pan') {
      setIsFollowingDriver(false);
    } else if (msg.type === 'select-alt' && typeof msg.index === 'number') {
      handleSelectAlternative(msg.index);
    } else if (
      msg.type === 'map-warn' ||
      msg.type === 'js-error' ||
      msg.type === 'map-error'
    ) {
      logMapDiag(`${msg.type}: ${msg.message ?? ''}`.slice(0, 200));
    }
  }, [handleSelectAlternative, injectMapJavaScript, logMapDiag, mapKey]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const listener = (event: MessageEvent) => {
      const msg = parseRouteMapMessageData(event.data, false);
      if (msg) handleMapMessage(msg);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [handleMapMessage]);

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
      if (!isValidCoord(c)) return;

      const fixTime = Date.parse(update.recordedAt);
      const acceptedFixTime = Number.isFinite(fixTime) ? fixTime : Date.now();
      headingRef.current = update.heading;
      speedRef.current = update.speedMph * 0.44704;
      accuracyRef.current = update.accuracyMeters;
      lastFixTimeRef.current = Math.max(lastFixTimeRef.current, acceptedFixTime);
      lastProcessedFixTimeRef.current = lastFixTimeRef.current;
      prevLocRef.current = c;
      driverLocRef.current = c;
      setDriverLoc(c);
      setDevGpsLastUpdate(update);
      handlersRef.current.onFix(c);

      if (!currentRouteJobRef) return;
      const now = Date.now();
      if (devGpsInFlightRef.current || now < devGpsNextSendAtRef.current) return;

      devGpsInFlightRef.current = true;
      try {
        await driverApi.updateLocation(c.lat, c.lng, currentRouteJobRef, {
          timestamp: new Date(acceptedFixTime).toISOString(),
          accuracy: update.accuracyMeters,
          heading: update.heading,
          speed: update.speedMph * 0.44704,
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
    [currentRouteJobRef, devGpsAllowed],
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
  const hasLiveStep =
    !rerouting && routeIsCurrent && !!upcomingStep && phase === 'to_dropoff';
  const primaryInstruction = arrival
    ? arrival
    : rerouting
      ? t('route.findingBetterRoute')
    : hasLiveStep && upcomingStep
      ? humanizeInstruction(upcomingStep, t)
      : fallbackGuidance(metersToCustomer, t);
  const primaryDistance =
    !arrival && hasLiveStep && distanceToManeuver != null
      ? formatGuidanceDistance(distanceToManeuver, t)
      : null;
  const nextInstruction =
    !arrival && hasLiveStep && nextStep ? humanizeInstruction(nextStep, t) : null;

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
  const navigationFixStale =
    lastFixAt == null || nowTick - lastFixAt > NAVIGATION_PROGRESS_STALE_MS;
  const speedMph =
    !navigationFixStale && navigationProgress.speedMph != null
      ? Math.max(0, Math.round(navigationProgress.speedMph))
      : null;
  const speedValueText = speedMph != null ? String(speedMph) : '—';
  const speedUnitText = 'mph';

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

  // Cockpit data (all from the real driver job payload).
  const nextActionLabel =
    job && NEXT_ACTION_LABEL[job.status] ? t(NEXT_ACTION_LABEL[job.status]) : null;
  const phone = cleanPhone(job?.customerPhone);
  const vehicleLabel =
    job && (job.vehicleReg || job.vehicleMake || job.vehicleModel)
      ? [job.vehicleReg, job.vehicleMake, job.vehicleModel].filter(Boolean).join(' · ')
      : null;
  const tyreCount = job?.tyres?.reduce((sum, ty) => sum + (ty.quantity ?? 0), 0) ?? 0;
  const tyreSummary =
    job?.tyreSizeDisplay != null && job.tyreSizeDisplay.length > 0
      ? tyreCount > 0
        ? `${tyreCount} × ${job.tyreSizeDisplay}`
        : job.tyreSizeDisplay
      : tyreCount > 0
        ? t(tyreCount === 1 ? 'route.tyreUnitSingular' : 'route.tyreUnitPlural', {
            count: tyreCount,
          })
        : null;
  const addressLine = job?.addressLine && job.addressLine.length > 0 ? job.addressLine : null;
  const payDisplay = getDriverPaymentDisplay(job?.paymentSummary ?? job?.payment ?? null, job?.refNumber ?? null);
  const payColors = paymentToneColors(payDisplay.tone);

  // ── Checklist derived warnings ──
  const checklistTyreMissing = !job?.tyreSizeDisplay?.trim();
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
  if (permissionDenied) {
    metaText = t('route.locationPermissionRequired');
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
  if (permissionDenied) {
    routeHealth = { label: t('route.gpsOff'), tone: 'bad' };
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

  // Follow-mode toggle presentation.
  const followModeIcon: IoniconName =
    followMode === 'heading_up'
      ? 'navigate'
      : followMode === 'overview'
        ? 'scan-outline'
        : 'compass-outline';
  const followModeLabel =
    followMode === 'heading_up'
      ? t('route.headingUp')
      : followMode === 'overview'
        ? t('route.overview')
        : t('route.northUp');

  // ── Safer arrival workflow (Part 6) ──
  const isAssigned = job?.status === 'driver_assigned';
  const isEnRoute = job?.status === 'en_route';
  const within100m =
    metersToCustomer != null && metersToCustomer <= ARRIVAL_VERY_CLOSE_M;
  const within25m = metersToCustomer != null && metersToCustomer <= ARRIVAL_HERE_M;
  // Emphasise "Mark arrived" once the driver is on the customer's doorstep.
  const emphasiseArrived = isEnRoute && within100m;
  // Doorstep hint at 25 m — a nudge, never an auto-confirm.
  const showAtCustomerHint = isEnRoute && within25m;

  // ── Collapsed cockpit derived values ────────────────────────────────────────

  // Primary headline for the collapsed driving panel. Arrival wording wins over
  // all other states so the driver is never shown a maneuver when approaching.
  // Inline (not useMemo) so the React Compiler can manage memoization.
  const collapsedHeadline: string = (() => {
    if (arrival) return arrival;
    if (rerouting) return t('route.findingBetterRoute');
    if (routeState.error?.kind === 'network') return t('route.offlineUsingLastRoute');
    if (isOffRoute) {
      return routeDeviation?.recalculating
        ? 'Off route. Recalculating route...'
        : 'Off route';
    }
    if (isGpsDrift) return 'GPS drift detected';
    if (gpsWeak) return t('route.gpsSignalWeak');
    if (rerouteFailed) return t('route.couldNotLoadRoute');
    if (!customerCoord) return t('route.locationMissingTitle');
    if (hasLiveStep && upcomingStep) return humanizeInstruction(upcomingStep, t);
    return t('route.findingRoute');
  })();

  // Icon for the collapsed instruction row.
  // Inline (not useMemo) so the React Compiler can manage memoization.
  const collapsedNavIcon: IoniconName = (() => {
    if (arrival) return metersToCustomer != null && metersToCustomer <= ARRIVAL_HERE_M ? 'flag' : 'warning';
    if (rerouting) return 'refresh';
    if (routeState.error?.kind === 'network') return 'cloud-offline-outline';
    if (isOffRoute) return 'git-branch-outline';
    if (isGpsDrift) return 'locate-outline';
    if (gpsWeak) return 'warning-outline';
    if (rerouteFailed || !customerCoord) return 'alert-circle-outline';
    if (hasLiveStep && upcomingStep) return maneuverIcon(upcomingStep);
    return 'navigate';
  })();

  // Short payment label for the compact collapsed badge.
  const collapsedPayLabel = useMemo((): string => {
    switch (payDisplay.labelKey) {
      case 'payment.paid':
      case 'payment.paidOnline':
        return t('route.payBadgePaid');
      case 'payment.depositPaid':
        return t('payment.depositPaid');
      case 'payment.balanceDue':
      case 'payment.depositBalanceDue':
        return t('route.payBadgeBalanceDue');
      case 'payment.payOnArrival':
        return t('route.payBadgeCash');
      case 'payment.awaitingPayment':
      case 'payment.paymentPending':
      case 'payment.paymentLinkSent':
        return t('route.payBadgePending');
      case 'payment.needsChecking':
      case 'payment.failed':
        return t(payDisplay.labelKey);
      default:
        return t('route.payBadgeUnknown');
    }
  }, [payDisplay.labelKey, t]);

  // Label and icon for the collapsed primary action button.
  const collapsedPrimaryLabel = useMemo((): string => {
    if (isAssigned) return t('route.startDriving');
    if (isEnRoute && within25m) return t('route.markArrived');
    return t('route.more');
  }, [isAssigned, isEnRoute, within25m, t]);

  const collapsedPrimaryIcon: IoniconName = isEnRoute && within25m
    ? 'flag'
    : isAssigned
      ? 'navigate'
      : 'ellipsis-horizontal';

  const collapsedPrimaryDisabled = actioning;

  const collapsedPrimaryIsArrival = isEnRoute && within25m;

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

      {/* ── Full-screen map background (Part 1) ── */}
      <View
        style={StyleSheet.absoluteFillObject}
        onLayout={() => {
          injectMapJavaScript(
            'window.__resizeMap && window.__resizeMap(); true;',
          );
        }}
      >
        {!token ? (
          <View style={styles.fallback}>
            <Ionicons name="map-outline" size={40} color={colors.muted} />
            <Text style={styles.fallbackTitle}>{t('route.mapUnavailable')}</Text>
            <Text style={styles.fallbackText}>{t('route.missingToken')}</Text>
          </View>
        ) : (
          <>
            {Platform.OS === 'web' ? (
              <iframe
                key={mapKey}
                ref={iframeRef}
                title="Driver route map"
                srcDoc={html}
                style={WEB_MAP_FRAME_STYLE}
                onLoad={() => {
                  injectMapJavaScript('window.__resizeMap && window.__resizeMap(); true;');
                }}
              />
            ) : (
              <WebView
                key={mapKey}
                ref={webRef}
                originWhitelist={['*']}
                source={{ html, baseUrl: 'https://www.tyrerescue.uk/' }}
                style={StyleSheet.absoluteFillObject}
                javaScriptEnabled
                domStorageEnabled
                scrollEnabled={false}
                androidLayerType="hardware"
                mixedContentMode="always"
                setSupportMultipleWindows={false}
                onLoadEnd={() => {
                  injectMapJavaScript('window.__resizeMap && window.__resizeMap(); true;');
                }}
                onMessage={(event) => {
                  const msg = parseRouteMapMessageData(event.nativeEvent.data, true);
                  if (msg) handleMapMessage(msg);
                }}
              />
            )}

            {!mapLoaded && !mapFatal && (
              <View style={[styles.mapOverlay, styles.noPointerEvents]}>
                <ActivityIndicator color="#F97316" />
                <Text style={styles.mapOverlayText}>{t('route.loadingMap')}</Text>
              </View>
            )}

            {mapLoaded && !mapFatal && permissionDenied && (
              <View style={styles.mapOverlay}>
                <Ionicons name="location-outline" size={36} color="#F97316" />
                <Text style={styles.fallbackTitle}>{t('route.locationNeeded')}</Text>
                <Text style={styles.fallbackText}>
                  {t('route.locationPermissionRequired')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleEnableLocation}
                  style={styles.retryBtn}
                >
                  <Ionicons name="refresh" size={18} color="#FFFFFF" />
                  <Text style={styles.retryBtnText}>{t('route.enable')}</Text>
                </Pressable>
              </View>
            )}

            {mapFatal && (
              <View style={styles.mapOverlay}>
                <Ionicons name="warning-outline" size={36} color="#B3261E" />
                <Text style={styles.fallbackTitle}>{t('route.mapUnavailable')}</Text>
                <Text style={styles.fallbackText}>
                  {t('route.mapLoadFailed')}
                </Text>
                {mapDiag ? (
                  <Text style={styles.diagText} selectable>
                    {mapDiag}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    recoveryAttemptsRef.current = 0;
                    setMapReloadKey((k) => k + 1);
                  }}
                  style={styles.retryBtn}
                >
                  <Ionicons name="refresh" size={18} color="#FFFFFF" />
                  <Text style={styles.retryBtnText}>{t('common.retry')}</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </View>

      {/* ── Top overlay: compact header (Part 1) ── */}
      <View
        style={[styles.topBar, styles.boxNonePointerEvents, { paddingTop: insets.top + spacing.xs }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
          onPress={() => router.back()}
          style={styles.iconBtn}
        >
          <Ionicons name="chevron-back" size={22} color="#3C4043" />
        </Pressable>
        <View style={styles.topTitlePill}>
          <Text style={styles.topTitleText} numberOfLines={1}>
            #{ref}
          </Text>
          <Animated.View
            style={[
              styles.topTitleShimmer,
              styles.noPointerEvents,
              {
                opacity: jobNumberShimmerOpacity,
                transform: [
                  { translateX: jobNumberShimmerX },
                  { skewX: '-18deg' },
                ],
              },
            ]}
          />
        </View>
        <View
          style={[
            styles.healthPill,
            routeHealth.tone === 'good'
              ? styles.healthGood
              : routeHealth.tone === 'warn'
                ? styles.healthWarn
                : styles.healthBad,
          ]}
        >
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
          <Text style={styles.healthPillText}>{routeHealth.label}</Text>
        </View>
      </View>

      {/* ── Live instruction card — hidden when route has failed (recovery panel handles it)
           but kept when arrival wording is active so the driver sees their destination. ── */}
      {token && mapLoaded && !mapFatal && !permissionDenied && primaryInstruction.length > 0 && (arrival != null || rerouting || (routeIsCurrent && !rerouteFailed)) && (
        <View
          style={[styles.instructionCard, styles.noPointerEvents, { top: insets.top + 50 }]}
        >
          <View style={styles.instructionIcon}>
            <Ionicons
              name={
                arrival
                  ? 'flag'
                  : rerouting
                    ? 'refresh'
                    : hasLiveStep && upcomingStep
                      ? maneuverIcon(upcomingStep)
                      : 'navigate'
              }
              size={28}
              color="#FFFFFF"
            />
          </View>
          <View style={styles.instructionTextWrap}>
            {primaryDistance != null && (
              <Text style={styles.instructionDistance}>{primaryDistance}</Text>
            )}
            {renderGuidanceText(primaryInstruction, hasLiveStep ? upcomingStep : null, styles.instructionText, 2)}
            {nextInstruction != null && (
              <Text style={styles.instructionNext} numberOfLines={1}>
                {t('route.thenInstruction', { instruction: nextInstruction })}
              </Text>
            )}
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

      {token && mapLoaded && !mapFatal && !permissionDenied && (
        <View
          style={[
            styles.speedPill,
            styles.noPointerEvents,
            {
              bottom:
                (cockpitCollapsed ? COCKPIT_PAD_COLLAPSED : COCKPIT_PAD_EXPANDED) +
                insets.bottom +
                spacing.sm,
            },
          ]}
        >
          <Text style={styles.speedPillValue}>{speedValueText}</Text>
          <Text style={styles.speedPillUnit}>{speedUnitText}</Text>
        </View>
      )}

      {/* ── Floating map controls: orientation toggle + recenter (Parts 2,3) ── */}
      {token && mapLoaded && !mapFatal && !permissionDenied && (
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
          {!isFollowingDriver && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('route.recenter')}
              onPress={handleRecenter}
              style={[styles.ctrlBtn, styles.ctrlBtnAccent, styles.ctrlBtnRecenter]}
            >
              <Ionicons name="locate" size={22} color="#F97316" />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('route.mapOrientation', { mode: followModeLabel })}
            onPress={handleCycleFollowMode}
            style={styles.ctrlBtn}
          >
            <Ionicons name={followModeIcon} size={22} color="#3C4043" />
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
              color={voiceEnabled ? '#F97316' : '#3C4043'}
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

        {cockpitCollapsed ? (
          /* ──────────────────────────────────────────────────────────────────
             COLLAPSED: primary driving mode — 3 rows, fits 360 px width.
             Shows instruction/state → ETA+distance+payment → primary action.
             Special panels replace the 3 rows when route failed / no coords.
          ────────────────────────────────────────────────────────────────── */
          <>
            {rerouteFailed ? (
              /* Route failure recovery panel */
              <View style={styles.recoveryPanel}>
                <View style={styles.recoveryHeader}>
                  <Ionicons name="alert-circle-outline" size={22} color="#B3261E" />
                  <Text style={styles.recoveryTitle}>{t('route.couldNotLoadRoute')}</Text>
                </View>
                <Text style={styles.recoveryBody}>{t('route.noRouteRecoveryBody')}</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={!customerCoord}
                  onPress={handleOpenWaze}
                  style={[styles.recoveryPrimaryBtn, !customerCoord && styles.btnDisabled]}
                >
                  <Ionicons name="navigate" size={18} color="#FFFFFF" />
                  <Text style={styles.recoveryPrimaryBtnText}>{t('route.openWazeShort')}</Text>
                </Pressable>
                <View style={styles.recoverySecRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleOpenExternal}
                    style={styles.recoverySecBtn}
                  >
                    <Ionicons name="open-outline" size={16} color="#3C4043" />
                    <Text style={styles.recoverySecBtnText}>{t('route.openGoogleMaps')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleRetryRoute}
                    style={styles.recoverySecBtn}
                  >
                    <Ionicons name="refresh" size={16} color="#3C4043" />
                    <Text style={styles.recoverySecBtnText}>{t('route.tryAgain')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : !customerCoord && job != null ? (
              /* Missing coordinates panel */
              <View style={styles.recoveryPanel}>
                <View style={styles.recoveryHeader}>
                  <Ionicons name="location-outline" size={22} color="#F97316" />
                  <Text style={styles.recoveryTitle}>{t('route.locationMissingTitle')}</Text>
                </View>
                <Text style={styles.recoveryBody}>{t('route.locationMissingBody')}</Text>
                {phone != null && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleCallCustomer}
                    style={styles.recoveryPrimaryBtn}
                  >
                    <Ionicons name="call" size={18} color="#FFFFFF" />
                    <Text style={styles.recoveryPrimaryBtnText}>{t('route.callCustomer')}</Text>
                  </Pressable>
                )}
                {addressLine != null && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleOpenAddressSearch}
                    style={[styles.recoverySecBtn, styles.recoverySecBtnFull]}
                  >
                    <Ionicons name="open-outline" size={16} color="#3C4043" />
                    <Text style={styles.recoverySecBtnText}>{t('route.openAddressInMaps')}</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              /* Normal driving mode — instruction + meta + actions */
              <>
                {/* Row 1: Big next instruction or route state */}
                <View style={styles.collapsedInstRow}>
                  <View style={styles.collapsedInstIcon}>
                    <Ionicons name={collapsedNavIcon} size={24} color="#FFFFFF" />
                  </View>
                  {renderGuidanceText(collapsedHeadline, hasLiveStep ? upcomingStep : null, styles.collapsedInstText, 2)}
                  {primaryDistance != null && routeIsCurrent && (
                    <Text style={styles.collapsedDistBadge}>{primaryDistance}</Text>
                  )}
                </View>

                {/* Row 2: ETA · distance · payment badge */}
                <View style={styles.collapsedMetaRow}>
                  <View style={styles.collapsedEtaBlock}>
                    <Text style={styles.collapsedEtaNum}>
                      {durationMin != null ? String(durationMin) : '—'}
                    </Text>
                    <Text style={styles.collapsedEtaUnit}>{t('route.etaMin')}</Text>
                  </View>
                  <View style={styles.collapsedMetaDivider} />
                  <Text style={styles.collapsedDistText}>
                    {distanceMiles != null ? t('route.distanceMi', { value: distanceMiles.toFixed(1) }) : '—'}
                  </Text>
                  <View style={styles.collapsedSpeedChip}>
                    <Ionicons name="speedometer-outline" size={12} color="#3C4043" />
                    <Text style={styles.collapsedSpeedText}>
                      <Text style={styles.ltrText}>{speedValueText}</Text> {speedUnitText}
                    </Text>
                  </View>
                  <View style={[styles.collapsedPayChip, { backgroundColor: payColors.bg, borderColor: payColors.border }]}>
                    <Ionicons
                      name={
                        payDisplay.tone === 'paid'
                          ? 'checkmark-circle'
                          : payDisplay.tone === 'action'
                            ? 'cash-outline'
                            : payDisplay.tone === 'warning' || payDisplay.tone === 'failed'
                              ? 'alert-circle-outline'
                              : 'time-outline'
                      }
                      size={11}
                      color={payColors.text}
                    />
                    <Text style={[styles.collapsedPayChipText, { color: payColors.text }]} numberOfLines={1}>
                      {collapsedPayLabel}
                    </Text>
                  </View>
                </View>

                {/* Row 3: Primary action + Call + More */}
                <View style={styles.collapsedActionRow}>
                  {(isAssigned || collapsedPrimaryIsArrival) && (
                    <Pressable
                      accessibilityRole="button"
                      disabled={collapsedPrimaryDisabled}
                      onPress={handleCollapsedPrimary}
                      style={[
                        styles.collapsedPrimaryBtn,
                        collapsedPrimaryIsArrival && styles.collapsedPrimaryBtnArrival,
                        collapsedPrimaryDisabled && styles.btnDisabled,
                      ]}
                    >
                      {actioning ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Ionicons name={collapsedPrimaryIcon} size={18} color="#FFFFFF" />
                      )}
                      <Text style={styles.collapsedPrimaryBtnText} numberOfLines={1}>
                        {collapsedPrimaryLabel}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('route.callCustomer')}
                    disabled={phone == null}
                    onPress={handleCallCustomer}
                    style={[styles.collapsedSecBtn, phone == null && styles.collapsedSecBtnDisabled]}
                  >
                    <Ionicons name="call-outline" size={18} color={phone ? '#3C4043' : '#9AA0A6'} />
                    <Text style={[styles.collapsedSecBtnText, phone == null && { color: '#9AA0A6' }]}>
                      {t('route.call')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('route.expandDetails')}
                    onPress={() => setCockpitCollapsed(false)}
                    style={styles.collapsedSecBtn}
                  >
                    <Ionicons name="chevron-up" size={18} color="#3C4043" />
                    <Text style={styles.collapsedSecBtnText}>{t('route.more')}</Text>
                  </Pressable>
                </View>

                {/* Inline arrival error — shown after a failed Mark Arrived tap */}
                {arrivalError != null && (
                  <Text style={styles.arrivalErrorText}>{arrivalError}</Text>
                )}
              </>
            )}
          </>
        ) : (
          /* ──────────────────────────────────────────────────────────────────
             EXPANDED: job details, navigation, job status actions.
             Waze and Google Maps are near the top so the driver can reach them
             without scrolling through the detail rows.
          ────────────────────────────────────────────────────────────────── */
          <>
            {/* Navigation shortcuts — visible immediately on expand */}
            <View style={styles.secondaryRow}>
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
            <View style={[styles.payBadge, { backgroundColor: payColors.bg, borderColor: payColors.border }]}>
              <Ionicons
                name={
                  payDisplay.tone === 'paid'
                    ? 'checkmark-circle'
                    : payDisplay.tone === 'action'
                      ? 'cash-outline'
                      : payDisplay.tone === 'warning' || payDisplay.tone === 'failed'
                        ? 'alert-circle-outline'
                        : 'time-outline'
                }
                size={16}
                color={payColors.text}
              />
              <View style={styles.payBadgeTextWrap}>
                <Text style={[styles.payBadgeLabel, { color: payColors.text }]} numberOfLines={1}>
                  {t(payDisplay.labelKey)}
                  {payDisplay.amountLabel != null ? ` · ${payDisplay.amountLabel}` : ''}
                </Text>
                <Text style={[styles.payBadgeDesc, { color: payColors.text }]} numberOfLines={1}>
                  {t(payDisplay.descriptionKey)}
                </Text>
              </View>
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
              {permissionDenied
                ? t('route.locationDeniedNav')
                : fixSeconds == null
                  ? routeState.loading || phase === 'preview'
                    ? t('route.calculatingRoute')
                    : t('route.waitingFirstFix')
                  : routeUpdatedSeconds != null
                    ? `${metaText} · ${t('route.routeUpdatedAgo', { seconds: routeUpdatedSeconds })}`
                    : `${metaText} · ${t('route.updatedAgo', { seconds: fixSeconds })}`}
            </Text>
          </>
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
  instructionCard: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(218,220,224,0.95)',
    shadowColor: '#3C4043',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 7,
  },
  instructionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F97316',
  },
  instructionTextWrap: {
    flex: 1,
  },
  instructionDistance: {
    color: '#F97316',
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  instructionText: {
    color: '#202124',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  instructionNext: {
    color: '#5F6368',
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginTop: 1,
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
  speedPill: {
    position: 'absolute',
    left: spacing.md,
    width: 64,
    height: 64,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 2,
    borderColor: '#3C4043',
    shadowColor: '#3C4043',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  speedPillValue: {
    color: '#202124',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
    writingDirection: 'ltr',
  },
  speedPillUnit: {
    color: '#5F6368',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
    writingDirection: 'ltr',
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
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  iconBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: '#DADCE0',
    shadowColor: '#3C4043',
    shadowOpacity: 0.16,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  topTitlePill: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: '#DADCE0',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#3C4043',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  topTitleText: {
    color: '#202124',
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  topTitleShimmer: {
    position: 'absolute',
    top: -8,
    bottom: -8,
    left: 0,
    width: 34,
    backgroundColor: 'rgba(249,115,22,0.16)',
  },
  sideControls: {
    position: 'absolute',
    right: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  ctrlBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
    shadowColor: '#3C4043',
    shadowOpacity: 0.16,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  ctrlBtnAccent: {
    backgroundColor: '#FFFFFF',
    borderColor: '#F97316',
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
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#FFFFFF',
    shadowColor: '#3C4043',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -5 },
    elevation: 12,
    gap: spacing.sm,
  },
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
    backgroundColor: '#F97316',
  },
  primaryBtnEmphasis: {
    minHeight: 60,
    backgroundColor: '#34A853',
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
  /* ── Collapsed cockpit: Row 1 — instruction ── */
  collapsedInstRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
  },
  collapsedInstIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F97316',
    flexShrink: 0,
  },
  collapsedInstText: {
    flex: 1,
    color: '#202124',
    fontSize: fontSize.lg,
    fontWeight: '700',
    lineHeight: 22,
  },
  collapsedDistBadge: {
    color: '#5F6368',
    fontSize: fontSize.sm,
    fontWeight: '600',
    flexShrink: 0,
  },

  /* ── Collapsed cockpit: Row 2 — ETA / distance / payment ── */
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
  collapsedMetaDivider: {
    width: 1,
    height: 14,
    backgroundColor: '#DADCE0',
  },
  collapsedDistText: {
    color: '#5F6368',
    fontSize: fontSize.sm,
    fontWeight: '600',
    flex: 1,
  },
  collapsedSpeedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: '#F1F3F4',
    flexShrink: 0,
  },
  collapsedSpeedText: {
    color: '#3C4043',
    fontSize: 10,
    fontWeight: '800',
    writingDirection: 'ltr',
  },
  collapsedPayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    maxWidth: 96,
  },
  collapsedPayChipText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    flexShrink: 1,
  },

  /* ── Collapsed cockpit: Row 3 — action buttons ── */
  collapsedActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  collapsedPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 52,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#F97316',
  },
  collapsedPrimaryBtnArrival: {
    backgroundColor: '#34A853',
  },
  collapsedPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: fontSize.md,
    fontWeight: '800',
    flexShrink: 1,
  },
  collapsedSecBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minWidth: 56,
    minHeight: 52,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#DADCE0',
    backgroundColor: '#FFFFFF',
  },
  collapsedSecBtnDisabled: {
    opacity: 0.4,
  },
  collapsedSecBtnText: {
    color: '#3C4043',
    fontSize: 10,
    fontWeight: '700',
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
