import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Appearance,
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
import { playSound, type SoundEvent } from '@/services/sound';
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
  bearingDegrees,
  distanceToRouteMeters,
  fallbackGuidance,
  fetchDirections,
  formatGuidanceDistance,
  getRemainingRouteProgress,
  haversineMeters,
  humanizeInstruction,
  isValidCoord,
  metersToMiles,
  secondsToMinutes,
  snapToRoute,
} from '@/services/directions';
import {
  loadVoiceEnabled,
  setVoiceEnabled,
  speak as speakGuidance,
  stopVoice,
} from '@/services/voice';
import {
  ACTIVE_BOOKING_REF_KEY,
  startBackgroundLocation,
} from '@/services/background-location';
import * as secureStorage from '@/services/secure-storage';
import {
  buildWazeNavigationUrl,
  isValidNavigationCoordinate,
} from '@/lib/navigation/waze';
import { buildGoogleMapsSearchUrl } from '@/lib/navigation/google-maps';
import {
  getSmartDriverReminder,
  type SmartDriverReminder,
  type SmartReminderAction,
} from '@/lib/driver-smart-reminders';

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
const OFF_ROUTE_METERS = 45;
const REROUTE_DEBOUNCE_MS = 3_000;
// Force a route refresh when the route is stale AND the driver has moved far.
const ROUTE_STALE_WHILE_MOVING_MS = 45_000;
const ROUTE_FORCE_REFRESH_MOVE_M = 120;
// Snap the displayed driver marker onto the route ONLY when the perpendicular
// drift from the raw GPS fix is within this many metres — i.e. normal GPS
// jitter while genuinely on the road. Beyond this the driver is treated as
// truly off-route and the raw fix is shown (so "Off route" reads honestly).
const SNAP_TO_ROUTE_MAX_DRIFT_M = 35;
// Advance to the next turn instruction when within this distance of it.
const STEP_ADVANCE_METERS = 30;
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
const COCKPIT_PAD_COLLAPSED = 220;
const COCKPIT_PAD_EXPANDED = 360;
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

// Use road-focused base styles that do not request Mapbox's incidents tileset.
// The app draws its own selected route and congestion overlays, so this keeps
// the cockpit console quiet without losing route traffic colouring.
const PRIMARY_STYLE = 'mapbox://styles/mapbox/streets-v12';
const FALLBACK_STYLE = 'mapbox://styles/mapbox/streets-v11';
const NAV_DAY_STYLE = PRIMARY_STYLE;
const NAV_NIGHT_STYLE = 'mapbox://styles/mapbox/dark-v11';

/**
 * Camera behaviour while navigating.
 * - `north_up`   — map fixed to north, marker rotates to heading.
 * - `heading_up` — map rotates so travel direction is up (default driving).
 * - `overview`   — whole route framed, camera does not chase the driver.
 */
export type FollowMode = 'north_up' | 'heading_up' | 'overview';

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
  background: '#0F1115',
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
  html,body,#m{margin:0;padding:0;width:100%;height:100%;background:#0F1115}
  .dwrap,.cwrap{position:relative;pointer-events:none}
  .dwrap{width:64px;height:64px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))}
  .cwrap{width:52px;height:52px;filter:drop-shadow(0 2px 8px rgba(0,0,0,.45))}
  .driver-icon,.cpin{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2}
  .cpin{width:18px;height:18px;border-radius:50%;background:#22c55e;border:3px solid #09090B;box-shadow:0 2px 8px rgba(0,0,0,.5)}
  .pulse{position:absolute;left:50%;top:50%;width:34px;height:34px;border-radius:50%;transform:translate(-50%,-50%) scale(.25);opacity:0;animation:radarPulse 2400ms ease-out infinite;z-index:1}
  .pulse.p2{animation-delay:800ms}
  .dwrap .pulse{border:2px solid rgba(249,115,22,.85);box-shadow:0 0 14px rgba(249,115,22,.35)}
  .cwrap .pulse{border:2px solid rgba(34,197,94,.85);box-shadow:0 0 14px rgba(34,197,94,.32)}
  @keyframes radarPulse{
    0%{transform:translate(-50%,-50%) scale(.25);opacity:.72}
    70%{opacity:.16}
    100%{transform:translate(-50%,-50%) scale(1.9);opacity:0}
  }
  @media (prefers-reduced-motion: reduce){
    .pulse{animation:none;transform:translate(-50%,-50%) scale(1.2);opacity:.18}
    .pulse.p2{display:none}
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
window.addEventListener('message', function(event){
  try {
    var data = event && event.data;
    if(!data || data.__driverRouteMapCommand !== 'eval' || typeof data.script !== 'string') return;
    if(event && event.source && window.parent && event.source !== window.parent) return;
    (0, eval)(data.script);
  } catch(err){
    post({type:'js-error', message:'command eval: '+String(err && (err.message||err))});
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
window.addEventListener('error', function(e){ post({type:'js-error', message:String(e && (e.message||e))}); });
window.addEventListener('unhandledrejection', function(e){ post({type:'js-error', message:'unhandledrejection: '+String(e && e.reason)}); });

var loaded = false, styleFellBack = false, layersReady = false, altClickBound = false;
var lastDriver = null, lastCustomer = null, lastHeading = null, lastRoutes = null, lastSelIdx = 0, lastFallback = false;
var lastRouteRev = -1;
var driverMarker = null, customerMarker = null;
// Driver-marker interpolation state: the dot is eased between ~1s GPS fixes
// (instead of snapping) so movement reads smooth like a real nav app.
var driverAnim = null, driverRaf = 0, driverAnimPos = null, lastRenderedRot = null;
var nowMs = (window.performance && window.performance.now) ? function(){ return window.performance.now(); } : function(){ return Date.now(); };
var pendingState = null;
var cameraEpoch = -1, programmatic = false;
// Stable zoom for driver follow mode — never changes on GPS update, only on recenter/mode-change.
var NAVIGATION_ZOOM = 16;
// DEV-only diagnostics flag (baked in at build time).
var NAV_DEV = ${__DEV__};
// Bottom map padding (px) reserved for the cockpit sheet so route framing is
// never hidden behind it. Updated from each pushed state (collapsed/expanded).
var bottomPad = 230;

if(typeof mapboxgl === 'undefined'){ post({type:'map-fatal', reason:'gl-script-failed', message:'mapbox-gl-js failed to load from CDN'}); }
else if(!hasWebGL()){
  post({type:'map-fatal', reason:'webgl-unsupported', message:'WebGL is not supported by this WebView'});
}
mapboxgl.accessToken = ${JSON.stringify(token)};
var map;
try {
  map = new mapboxgl.Map({container:'m',style:${JSON.stringify(PRIMARY_STYLE)},center:[-4.2518,55.8642],zoom:11,pitch:0,bearing:0,attributionControl:false,dragRotate:true,pitchWithRotate:true,maxPitch:72,antialias:true});
} catch(err){
  post({type:'map-fatal', reason:'construct-failed', message:String(err && (err.message||err))});
}

// Clear navigation arrow that rotates to driver heading. rotationAlignment
// 'map' means the net on-screen rotation is (heading - mapBearing): in
// heading-up mode (bearing=heading) it points straight up; in north-up it
// points along the real travel direction.
function driverEl(){
  var w = document.createElement('div'); w.className='dwrap';
  // Big, high-contrast navigation arrow: white halo ring + dark disc + bright
  // orange arrow so the driver's own position is instantly readable on any map.
  w.innerHTML='<span class="pulse p1"></span><span class="pulse p2"></span><svg class="driver-icon" width="46" height="46" viewBox="0 0 46 46"><circle cx="23" cy="23" r="20" fill="#FFFFFF" opacity="0.95"/><circle cx="23" cy="23" r="17" fill="#0B0F1A" stroke="#F97316" stroke-width="3"/><path d="M23 8 L33 35 L23 28 L13 35 Z" fill="#F97316"/></svg>';
  return w;
}
function customerEl(){ var el=document.createElement('div'); el.className='cwrap'; el.innerHTML='<span class="pulse p1"></span><span class="pulse p2"></span><span class="cpin"></span>'; return el; }

function emptyFC(){ return {type:'FeatureCollection',features:[]}; }
function lineFeature(coords){ return {type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}; }
function approxMeters(a,b){ var k=111320; var dx=(a[0]-b[0])*k*Math.cos(b[1]*Math.PI/180); var dy=(a[1]-b[1])*k; return Math.hypot(dx,dy); }
// Shortest signed angular path from->to so the arrow never spins the long way.
function shortestRot(from, to){ var d = ((to - from + 540) % 360) - 180; return from + d; }
function stepDriver(){
  driverRaf = 0;
  if(!driverAnim || !driverMarker) return;
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
  if(t < 1) driverRaf = requestAnimationFrame(stepDriver);
}
// Move the driver dot to the target [lng,lat]; ease over ~1s, but snap instantly
// on a GPS teleport (big jump) so the dot never glides across the whole map.
function animateDriver(to, rot){
  if(!driverMarker){
    driverMarker = new mapboxgl.Marker({element:driverEl(), anchor:'center', rotationAlignment:'map', pitchAlignment:'map'}).setLngLat(to).addTo(map);
    driverAnimPos = { lng: to[0], lat: to[1] };
    if(rot != null){ driverMarker.setRotation(rot); lastRenderedRot = ((rot % 360) + 360) % 360; }
    return;
  }
  var from = driverAnimPos || driverMarker.getLngLat();
  var fLng = (from.lng != null) ? from.lng : from[0];
  var fLat = (from.lat != null) ? from.lat : from[1];
  var fromRot = (lastRenderedRot == null) ? (rot == null ? 0 : rot) : lastRenderedRot;
  var toRot = (rot == null) ? fromRot : shortestRot(fromRot, rot);
  if(approxMeters([fLng, fLat], to) > 150){
    driverAnim = null;
    driverAnimPos = { lng: to[0], lat: to[1] };
    driverMarker.setLngLat(to);
    if(rot != null){ driverMarker.setRotation(rot); lastRenderedRot = ((rot % 360) + 360) % 360; }
    return;
  }
  driverAnim = { fLng:fLng, fLat:fLat, tLng:to[0], tLat:to[1], fRot:fromRot, tRot:toRot, hasRot:(rot != null), start:nowMs(), dur:1000 };
  if(!driverRaf) driverRaf = requestAnimationFrame(stepDriver);
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
function hasRouteLayers(){
  try { return !!(map && map.getSource('rsel') && map.getLayer('r-case') && map.getLayer('r-main') && map.getLayer('r-arrows')); }
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
  var ids = ['acc-fill','acc-line','alt-lines','r-shadow','r-case','r-main','r-traffic-low','r-traffic-slow','r-approach','r-arrows'];
  for(var i=0;i<ids.length;i++){
    try { if(map.getLayer(ids[i])) map.moveLayer(ids[i]); } catch(_){}
  }
}
function findBuildingSourceId(){
  try {
    var sources = (map.getStyle() && map.getStyle().sources) || {};
    if(sources.composite) return 'composite';
    for(var id in sources){
      var src = sources[id] || {};
      if(src.type === 'vector' && String(src.url || '').indexOf('mapbox-streets') !== -1) return id;
    }
  } catch(_){}
  return null;
}
function ensureDepthLayers(){
  try {
    if(!map.getSource('mapbox-dem')){
      map.addSource('mapbox-dem',{type:'raster-dem',url:'mapbox://mapbox.mapbox-terrain-dem-v1',tileSize:512,maxzoom:14});
    }
    if(map.setTerrain) map.setTerrain({source:'mapbox-dem',exaggeration:1.12});
  } catch(e) {
    if(NAV_DEV) post({type:'map-warn', message:'terrain setup failed: '+String(e && (e.message||e))});
  }
  try {
    if(map.setFog){
      map.setFog({
        color:'rgba(255,255,255,0.9)',
        'high-color':'rgba(191,219,254,0.75)',
        'horizon-blend':0.18,
        'space-color':'#0B1020',
        'star-intensity':0.08
      });
    }
  } catch(_){}
  try {
    var buildingSource = findBuildingSourceId();
    if(!buildingSource || map.getLayer('driver-3d-buildings')) return;
    map.addLayer({
      id:'driver-3d-buildings',
      source:buildingSource,
      'source-layer':'building',
      type:'fill-extrusion',
      minzoom:14.4,
      filter:['==',['get','extrude'],'true'],
      paint:{
        'fill-extrusion-color':'#B8C2D0',
        'fill-extrusion-opacity':['interpolate',['linear'],['zoom'],14.4,0,15.2,0.28,17,0.46],
        'fill-extrusion-height':['interpolate',['linear'],['zoom'],14.4,0,15.2,['to-number',['get','height'],12]],
        'fill-extrusion-base':['to-number',['get','min_height'],0],
        'fill-extrusion-vertical-gradient':true
      }
    });
  } catch(e) {
    if(NAV_DEV) post({type:'map-warn', message:'3d buildings setup failed: '+String(e && (e.message||e))});
  }
}

// Route overlays are promoted above the base style so the selected route stays
// readable. Traffic colouring is limited to the selected route, not every road.
function ensureLayers(){
  if(layersReady && hasRouteLayers()){ promoteRouteLayers(); return true; }
  if(!isMapStyleReady()) return false;
  try {
    ensureDepthLayers();
    addSourceIfMissing('acc',{type:'geojson',data:emptyFC()});
    addLayerIfMissing({id:'acc-fill',type:'fill',source:'acc',paint:{'fill-color':'#60A5FA','fill-opacity':0.10}});
    addLayerIfMissing({id:'acc-line',type:'line',source:'acc',paint:{'line-color':'#60A5FA','line-opacity':0.5,'line-width':1}});
    addSourceIfMissing('alts',{type:'geojson',data:emptyFC()});
    // Alternatives: thin, muted blue-grey so the selected blue route dominates.
    // Hidden by DEFAULT so they never compete with the main route on a moving
    // map — only shown when the driver expands the cockpit details.
    addLayerIfMissing({id:'alt-lines',type:'line',source:'alts',layout:{'line-cap':'round','line-join':'round','visibility':'none'},paint:{'line-color':'#7C8DB0','line-width':3,'line-opacity':0.45}});
    addSourceIfMissing('rsel',{type:'geojson',data:emptyFC()});
    // Sat-nav route corridor: soft road shadow, crisp white casing, saturated
    // blue body, then traffic accents and chevrons above it.
    addLayerIfMissing({id:'r-shadow',type:'line',source:'rsel',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'rgba(3,7,18,0.55)','line-width':['interpolate',['linear'],['zoom'],10,20,15,29,18,36],'line-blur':1.4,'line-opacity':0.45,'line-translate':[0,2]}});
    addLayerIfMissing({id:'r-case',type:'line',source:'rsel',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'rgba(255,255,255,0.98)','line-width':['interpolate',['linear'],['zoom'],10,17,15,24,18,31]}});
    addLayerIfMissing({id:'r-main',type:'line',source:'rsel',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#2F6BFF','line-width':['interpolate',['linear'],['zoom'],10,10,15,16,18,22],'line-opacity':1}});
    addSourceIfMissing('rcong',{type:'geojson',data:emptyFC()});
    // Route-only traffic accents. Clear traffic is a slim green center stripe;
    // moderate/heavy/severe widen and intensify without painting every road.
    addLayerIfMissing({id:'r-traffic-low',type:'line',source:'rcong',filter:['==',['get','level'],'low'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-width':['interpolate',['linear'],['zoom'],10,2,15,4,18,6],'line-opacity':0.58,'line-color':'#22C55E'}});
    addLayerIfMissing({id:'r-traffic-slow',type:'line',source:'rcong',filter:['any',['==',['get','level'],'moderate'],['==',['get','level'],'heavy'],['==',['get','level'],'severe']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-width':['interpolate',['linear'],['zoom'],10,5,15,8,18,12],'line-opacity':0.96,'line-color':['match',['get','level'],'moderate','#F59E0B','heavy','#EF4444','severe','#B91C1C','#EF4444']}});
    addSourceIfMissing('rapproach',{type:'geojson',data:emptyFC()});
    addLayerIfMissing({id:'r-approach',type:'line',source:'rapproach',layout:{'line-cap':'round'},paint:{'line-color':'#2F6BFF','line-width':3,'line-dasharray':[1.5,1.5],'line-opacity':0.85}});
    addLayerIfMissing({id:'r-arrows',type:'symbol',source:'rsel',minzoom:13,layout:{'symbol-placement':'line','symbol-spacing':['interpolate',['linear'],['zoom'],13,150,16,110,18,80],'text-field':'>','text-size':['interpolate',['linear'],['zoom'],13,14,16,18,18,22],'text-keep-upright':false,'text-rotation-alignment':'map','text-pitch-alignment':'map','text-ignore-placement':true,'text-allow-overlap':true},paint:{'text-color':'rgba(255,255,255,0.92)','text-halo-color':'rgba(47,107,255,0.9)','text-halo-width':1.4,'text-opacity':['interpolate',['linear'],['zoom'],12.8,0,13.4,0.85]}});
    if(!altClickBound){
      map.on('click','alt-lines',function(e){ if(e.features && e.features[0] && e.features[0].properties){ post({type:'select-alt', index:e.features[0].properties.altIndex}); } });
      altClickBound = true;
    }
    layersReady = hasRouteLayers();
    if(layersReady) promoteRouteLayers();
    return layersReady;
  } catch(e) {
    layersReady = false;
    if(NAV_DEV) post({type:'map-warn', message:'route layer setup failed: '+String(e && (e.message||e))});
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
    if(NAV_DEV) post({type:'map-warn', message:'route draw skipped: empty selected route'});
    return false;
  }
  try {
    map.getSource('alts').setData({type:'FeatureCollection',features:altF});
    map.getSource('rsel').setData({type:'FeatureCollection',features:[lineFeature(sel.coords)]});
    // Bright blue base is ALWAYS visible. Dashed + lighter blue only for the
    // approximate straight-line fallback so the driver can tell it apart.
    if(fallback){
      map.setPaintProperty('r-main','line-dasharray',[2,2]);
      map.setPaintProperty('r-main','line-color','#60A5FA');
    } else {
      try { map.setPaintProperty('r-main','line-dasharray', null); } catch(_){}
      map.setPaintProperty('r-main','line-color','#2F6BFF');
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
    map.getSource('rcong').setData({type:'FeatureCollection',features:feats});
    if(customer && sel.coords.length>0){
      var end = sel.coords[sel.coords.length-1];
      if(approxMeters(end, customer) > 12){ map.getSource('rapproach').setData({type:'FeatureCollection',features:[lineFeature([end, customer])]}); }
      else { map.getSource('rapproach').setData(emptyFC()); }
    } else { map.getSource('rapproach').setData(emptyFC()); }
    promoteRouteLayers();
    if(NAV_DEV) post({type:'route-drawn', coords:sel.coords.length, alternatives:routes.length, selectedIndex:selIdx});
    return true;
  } catch(e) {
    layersReady = false;
    if(NAV_DEV) post({type:'map-warn', message:'route draw failed: '+String(e && (e.message||e))});
    return false;
  }
}
function clearRoutes(){
  try { if(map.getSource('alts')) map.getSource('alts').setData(emptyFC()); } catch(_){}
  try { if(map.getSource('rsel')) map.getSource('rsel').setData(emptyFC()); } catch(_){}
  try { if(map.getSource('rcong')) map.getSource('rcong').setData(emptyFC()); } catch(_){}
  try { if(map.getSource('rapproach')) map.getSource('rapproach').setData(emptyFC()); } catch(_){}
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
  if(mode==='overview'){
    if(s.epoch!==cameraEpoch && s.fitCoords && s.fitCoords.length>=2){ fitToCoords(s.fitCoords); }
    cameraEpoch = s.epoch; return;
  }
  if(!s.follow || !s.driver){ cameraEpoch = s.epoch; return; }
  var resetZoom = (s.epoch !== cameraEpoch);
  cameraEpoch = s.epoch;
  var opts = { center: s.driver, duration: 350 };
  if(mode==='heading_up'){ opts.bearing = (s.heading==null ? map.getBearing() : s.heading); opts.pitch = 62; }
  else { opts.bearing = 0; opts.pitch = mode==='north_up' ? 34 : 0; }
  if(resetZoom){ opts.zoom = NAVIGATION_ZOOM; }
  programmatic = true;
  map.easeTo(opts);
}

function applyState(s){
  if(!s || !map) return;
  if(typeof s.bottomPad === 'number' && s.bottomPad >= 0) bottomPad = s.bottomPad;
  if(s.customer){
    lastCustomer = s.customer;
    if(!customerMarker) customerMarker = new mapboxgl.Marker({element:customerEl(), anchor:'center'}).setLngLat(s.customer).addTo(map);
    else customerMarker.setLngLat(s.customer);
  }
  if(s.driver){
    lastDriver = s.driver;
    if(s.heading!=null) lastHeading = s.heading;
    animateDriver(s.driver, s.heading);
    if(layersReady && map.getSource('acc')){
      if(s.accuracy!=null && s.accuracy>0 && s.accuracy<=120) map.getSource('acc').setData(circlePolygon(s.driver, s.accuracy));
      else map.getSource('acc').setData(emptyFC());
    }
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
  // Alternatives visibility is independent of the route rebuild: toggling the
  // cockpit must never redraw the route, only show/hide the muted alt lines.
  if(typeof s.showAlts === 'boolean') setVis('alt-lines', s.showAlts);
  if(s.fit && s.fitCoords && s.fitCoords.length>=2){ fitToCoords(s.fitCoords); cameraEpoch = s.epoch; return; }
  applyCamera(s);
}
window.__applyState = function(encoded){
  try {
    var s = JSON.parse(decodeURIComponent(encoded));
    if(loaded) applyState(s); else pendingState = s;
  }
  catch(e){ post({type:'map-error', message:'applyState parse: '+String(e)}); }
};
window.__resizeMap = function(){ try { map && map.resize(); } catch(_){} };
// Day/night style switch. setStyle() WIPES all custom sources/layers, so the
// existing 'style.load' handler below re-adds them (route casing/main, traffic,
// alternatives, accuracy circle, approach line) and re-applies the last route.
// mapbox-gl Markers are DOM overlays (NOT part of the style) so the driver and
// customer markers survive setStyle automatically. The route is therefore never
// lost across a theme change.
var currentStyleUrl = ${JSON.stringify(PRIMARY_STYLE)};
window.__setMapTheme = function(theme){
  if(!map) return;
  var url = (theme === 'night') ? ${JSON.stringify(NAV_NIGHT_STYLE)} : ${JSON.stringify(NAV_DAY_STYLE)};
  if(url === currentStyleUrl) return;
  currentStyleUrl = url;
  try { map.setStyle(url, {diff:false}); } catch(_){}
};

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
      post({type:'map-warn', message:'style load failed, falling back: '+em});
      try { map.setStyle(${JSON.stringify(FALLBACK_STYLE)}, {diff:false}); return; } catch(_){}
    }
    if(!loaded && isFatalErr(em, st)){ post({type:'map-fatal', reason:'load-error', message:em, status:st}); }
    else { post({type:'map-warn', message:em, status:st}); }
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
  const { ref } = useLocalSearchParams<{ ref: string }>();
  const router = useRouter();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const token = useMemo(() => getMapboxToken(), []);
  const currentRouteJobRef = typeof ref === 'string' && ref.length > 0 ? ref : null;

  useEffect(() => {
    if (!currentRouteJobRef) return;
    secureStorage.setItemAsync(ACTIVE_BOOKING_REF_KEY, currentRouteJobRef).catch(() => {});
    startBackgroundLocation().catch(() => false);
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
  // Collapsible bottom cockpit so the map can occupy the full screen.
  // Default to COLLAPSED so the map is the dominant full-screen visual and the
  // bottom panel is only a small floating bar (status + ETA + action).
  const [cockpitCollapsed, setCockpitCollapsed] = useState(true);
  const [rerouting, setRerouting] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  // Auto "mark arrived" suggestion (Phase A). A non-blocking prompt shown when
  // the driver is parked at the customer — it NEVER changes status by itself.
  const [showArrivalPrompt, setShowArrivalPrompt] = useState(false);
  // Map theme preference: 'auto' follows the device colour scheme + local time,
  // 'day'/'night' force the corresponding Mapbox navigation style.
  const [mapThemeMode, setMapThemeMode] = useState<'auto' | 'day' | 'night'>('auto');
  // Device colour scheme, kept current so 'auto' reacts to dark-mode changes.
  const [colorScheme, setColorScheme] = useState<ReturnType<typeof Appearance.getColorScheme>>(
    () => Appearance.getColorScheme(),
  );
  // Transient cockpit banner (e.g. "Payment received") shown over the map.
  const [paymentBanner, setPaymentBanner] = useState<string | null>(null);
  // Spoken voice-guidance mute toggle (persisted). Default ON for safety;
  // the persisted preference (if any) is applied on mount.
  const [voiceEnabled, setVoiceEnabledState] = useState(true);
  // Inline error for the arrival status update (replaces Alert.alert so the
  // driver sees it in context rather than a modal that blocks the map).
  const [arrivalError, setArrivalError] = useState<string | null>(null);

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
  const jobNumberShimmer = useRef(new Animated.Value(0)).current;
  const routeAbortRef = useRef<AbortController | null>(null);
  const destinationRef = useRef<Coordinates | null>(null);
  const driverLocRef = useRef<Coordinates | null>(null);
  // Heading/speed/accuracy derived from the GPS stream, read by the camera
  // push effect (kept in refs so a fix doesn't force the effect to re-subscribe).
  const headingRef = useRef<number | null>(null);
  const speedRef = useRef<number | null>(null);
  const accuracyRef = useRef<number | null>(null);
  const prevLocRef = useRef<Coordinates | null>(null);
  const routeStateRef = useRef<RouteState>(INITIAL_ROUTE_STATE);
  const phaseRef = useRef<NavigationPhase>('preview');
  const stepIndexRef = useRef(0);
  const lastRouteOriginRef = useRef<Coordinates | null>(null);
  const lastRouteAtRef = useRef<number>(0);
  const offRouteSinceRef = useRef<number | null>(null);
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
  // When the job status changes, clear cooldowns so next-phase reminders surface
  // immediately. The 2-second timer will naturally discard any stale reminder on
  // its next tick — no direct setState needed here.
  useEffect(() => {
    reminderDismissedRef.current = {};
  }, [job?.status]);
  useEffect(() => { jobRef.current = job; }, [job]);
  useEffect(() => { activeReminderIdRef.current = activeReminder?.id ?? null; }, [activeReminder]);

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

  const logMapDiag = useCallback((reason: string) => {
    setMapDiag(reason);
    if (__DEV__) console.warn('[route-map]', reason);
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

  useEffect(() => {
    destinationRef.current = customerCoord;
    routeAbortRef.current?.abort();
    hasRequestedRef.current = false;
    lastRouteOriginRef.current = null;
    lastRouteAtRef.current = 0;
    offRouteSinceRef.current = null;
    networkFailRef.current = 0;
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
    return () => {
      if (clearRouteTimer) clearTimeout(clearRouteTimer);
      clearTimeout(id);
    };
  }, [customerCoord, currentDestinationKey, currentRouteJobRef]);

  // Build the HTML once per token so the WebView never reloads while data updates.
  const html = useMemo(() => (token ? buildHtml(token) : ''), [token]);
  const mapKey = `${job?.id ?? 'job'}:${mapReloadKey}`;
  const mapLoaded = mapStatus.key === mapKey && mapStatus.phase === 'loaded';
  const mapFatal = mapStatus.key === mapKey && mapStatus.phase === 'fatal';

  // ── Route request (client-side Mapbox Directions, road-following) ──
  const requestRoute = useCallback(
    async (origin: Coordinates, destination: Coordinates) => {
      routeAbortRef.current?.abort();
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
      );
      if (controller.signal.aborted) return;

      if ('routes' in result) {
        const routes = result.routes;
        const primary = routes[0];
        // A successful fetch means we are back online — clear the latch so
        // reroute/refresh is allowed again.
        // Only fit the whole route on the very first fetch for this session or when in
        // overview mode. Fitting during active navigation zooms out and disorients the driver.
        const isFirstNavRoute =
          lastRouteOriginRef.current === null && routeStateRef.current.source === 'none';
        networkFailRef.current = 0;
        lastRouteOriginRef.current = origin;
        lastRouteAtRef.current = Date.now();
        offRouteSinceRef.current = null;
        fitPendingRef.current = isFirstNavRoute || followModeRef.current === 'overview';
        stepIndexRef.current = primary.steps.length > 1 ? 1 : 0;
        setCurrentStepIndex(stepIndexRef.current);
        setRerouting(false);
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

      if (err.kind === 'invalid-coords') {
        const next = makeRouteState('none', [], 0, err, {
          routeJobRef,
          routeDestinationKey,
        });
        routeStateRef.current = next;
        setRouteState(next);
        return;
      }

      // Network/offline failure: NEVER clear a route the driver is using. If we
      // already have a usable Mapbox road route, keep it on screen and only flag
      // the connection state (drives the "Offline — last route" health pill and
      // the engine's connection-lost cue). Latch the failure time so
      // reroute/refresh is suppressed until the next probe window.
      if (err.kind === 'network') {
        networkFailRef.current = Date.now();
        const prev = routeStateRef.current;
        if (
          prev.source === 'mapbox' &&
          prev.geometry != null &&
          prev.geometry.length >= 2
        ) {
          const next: RouteState = { ...prev, error: err, loading: false };
          routeStateRef.current = next;
          setRouteState(next);
          return;
        }
      }

      // All attempts failed and no previous valid route to preserve.
      // A straight-line is NOT drawn — it must never be presented as navigation.
      // Rate-limit the next retry so we do not spam the Directions API.
      lastRouteAtRef.current = Date.now();
      const next = makeRouteState('none', [], 0, err, {
        routeJobRef,
        routeDestinationKey,
      });
      routeStateRef.current = next;
      setRouteState(next);
    },
    [currentRouteJobRef, locale],
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
        const next: RouteState = {
          ...INITIAL_ROUTE_STATE,
          loading: true,
        };
        routeStateRef.current = next;
        setRouteState(next);
        requestRoute(driver, dest);
        return;
      }

      // Advance the active turn instruction as the driver passes maneuvers.
      if (routeBelongsToCurrentJob && rs.steps.length > 1) {
        let idx = stepIndexRef.current;
        while (idx < rs.steps.length - 1) {
          const s = rs.steps[idx];
          const m = haversineMeters(driver, { lng: s.location[0], lat: s.location[1] });
          if (m < STEP_ADVANCE_METERS) idx += 1;
          else break;
        }
        if (idx !== stepIndexRef.current) {
          stepIndexRef.current = idx;
          setCurrentStepIndex(idx);
        }
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
        if (d > OFF_ROUTE_METERS) {
          if (offRouteSinceRef.current == null) {
            offRouteSinceRef.current = now;
          } else if (
            !rs.loading &&
            networkAllowed &&
            now - offRouteSinceRef.current > REROUTE_DEBOUNCE_MS
          ) {
            offRouteSinceRef.current = null;
            setRerouting(true);
            requestRoute(driver, dest);
            return;
          }
        } else {
          offRouteSinceRef.current = null;
        }
      }

      // Periodic refresh blocked while a request is already in-flight.
      if (rs.loading) return;

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
      if (
        networkAllowed &&
        (rs.source === 'none' || (movedEnough && intervalOk) || staleWhileMoving)
      ) {
        requestRoute(driver, dest);
      }
    },
    [currentRouteJobRef, requestRoute],
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
      if (!cancelled && last) {
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
  ]);

  // ── Push markers / route / camera into the WebView ──
  useEffect(() => {
    if (!token || !mapLoaded) return;
    const routeCanRender =
      routeState.source === 'mapbox' &&
      routeState.routeJobRef === currentRouteJobRef &&
      routeState.routeDestinationKey === currentDestinationKey;
    // Snap the displayed marker onto the route when the GPS drift is small
    // (genuine jitter on the road). Beyond SNAP_TO_ROUTE_MAX_DRIFT_M the driver
    // is treated as truly off-route and the raw fix is shown unchanged.
    let driverPoint: Coordinates | null =
      driverLoc && isValidCoord(driverLoc) ? driverLoc : null;
    if (
      driverPoint &&
      routeCanRender &&
      routeState.geometry &&
      routeState.geometry.length >= 2
    ) {
      const snap = snapToRoute(driverPoint, routeState.geometry);
      if (snap && snap.distanceMeters <= SNAP_TO_ROUTE_MAX_DRIFT_M) {
        driverPoint = { lng: snap.point[0], lat: snap.point[1] };
      }
    }
    const driver = driverPoint ? [driverPoint.lng, driverPoint.lat] : null;
    const customer = customerCoord ? [customerCoord.lng, customerCoord.lat] : null;
    // Only re-serialise route geometry when the route itself changed. GPS-only
    // updates (every ~2 s) shrink from ~15–40 KB to ~300 bytes on the JS bridge.
    const routeRevChanged = routeRev !== lastInjectedRouteRevRef.current;
    if (routeRevChanged) lastInjectedRouteRevRef.current = routeRev;
    const routesPayload = !routeRevChanged
      ? undefined // GPS-only update — WebView keeps its current route display
      : routeCanRender
        ? routeState.routes.map((r) => ({ coords: r.geometry, congestion: r.congestion }))
        : [];
    const fit = fitPendingRef.current;
    fitPendingRef.current = false;
    const json = JSON.stringify({
      driver,
      heading: headingRef.current,
      accuracy: accuracyRef.current,
      customer,
      routes: routesPayload,       // undefined → omitted by JSON.stringify → WebView "no change"
      selectedIndex: routeState.selectedIndex,
      routeRev,
      // Alternatives are hidden while the cockpit is collapsed so they never
      // compete with the main route; shown only when details are expanded.
      showAlts: !cockpitCollapsed,
      fallback: false,
      fit,
      // Only include the full coordinate array when the map must actually call
      // fitBounds. Sending ~15 KB of geometry on every GPS fix wastes the bridge.
      fitCoords: fit && routeCanRender ? routeState.geometry : null,
      follow: isFollowingDriver,
      followMode,
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
    driverLoc,
    customerCoord,
    currentDestinationKey,
    currentRouteJobRef,
    routeState.routes,
    routeState.selectedIndex,
    routeState.source,
    routeState.geometry,
    routeState.routeJobRef,
    routeState.routeDestinationKey,
    routeRev,
    isFollowingDriver,
    followMode,
    cameraEpoch,
    cockpitCollapsed,
    insets.bottom,
    injectMapJavaScript,
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

  // Track the device colour scheme so the 'auto' map theme follows dark mode.
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme: cs }) =>
      setColorScheme(cs),
    );
    return () => sub.remove();
  }, []);

  // Resolve the effective day/night theme. In 'auto', night is chosen when the
  // device is in dark mode OR it is locally night-time (before 07:00 / from
  // 19:00). nowTick (1 s) only flips this at hour boundaries.
  const effectiveTheme = useMemo<'day' | 'night'>(() => {
    if (mapThemeMode === 'day') return 'day';
    if (mapThemeMode === 'night') return 'night';
    const hour = new Date(nowTick).getHours();
    const nightByTime = hour < 7 || hour >= 19;
    return colorScheme === 'dark' || nightByTime ? 'night' : 'day';
  }, [mapThemeMode, colorScheme, nowTick]);

  // Push the day/night navigation style to the WebView when it changes (and the
  // map is ready). setStyle() re-adds the route/traffic/alt layers via the
  // in-page 'style.load' hook; DOM markers persist, so the route never drops.
  useEffect(() => {
    if (!token || !mapLoaded) return;
    injectMapJavaScript(
      `window.__setMapTheme && window.__setMapTheme(${JSON.stringify(
        effectiveTheme,
      )}); true;`,
    );
  }, [token, mapLoaded, effectiveTheme, injectMapJavaScript]);

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
    }, 6000);
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
      const metersToRoute =
        driver && rs.geometry ? distanceToRouteMeters(driver, rs.geometry) : null;
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
        step && driver
          ? haversineMeters(driver, { lng: step.location[0], lat: step.location[1] })
          : null;
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
          heavyHaptic();
          playSound('job_completed');
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

      // Pre-job safety checklist — shown before starting travel.
      if (nextStatus === 'en_route') {
        setPreJobChecks({ tyreSizeChecked: false, addressChecked: false, paymentChecked: false });
        setShowPreJobChecklist(true);
        return;
      }

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

  // Google Maps fallback — phase-aware destination (single customer dropoff).
  const handleOpenExternal = useCallback(() => {
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
    Linking.openURL(url)
      .catch(() => {
        if (lat != null && lng != null) {
          Linking.openURL(
            `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
          );
        }
      })
      .finally(() => {
        setTimeout(() => {
          extNavLockRef.current = false;
        }, 800);
      });
  }, [customerCoord, job]);

  // Waze external navigation — opens the official Waze deep link.
  // No Waze API key. No unofficial endpoint. No police/camera data.
  const handleOpenWaze = useCallback(() => {
    if (wazeNavLockRef.current) return;
    const lat = customerCoord?.lat ?? null;
    const lng = customerCoord?.lng ?? null;
    if (lat == null || lng == null) return;
    const dest = { lat, lng };
    if (!isValidNavigationCoordinate(dest)) return;
    wazeNavLockRef.current = true;
    const url = buildWazeNavigationUrl(dest);
    Linking.openURL(url)
      .catch(() => {
        // If Waze is not installed the system browser will handle the URL.
      })
      .finally(() => {
        setTimeout(() => {
          wazeNavLockRef.current = false;
        }, 800);
      });
  }, [customerCoord]);

  // Open a Google Maps text search for the customer address when coordinates are
  // unavailable. Reuses extNavLockRef so double-taps are prevented.
  const handleOpenAddressSearch = useCallback(() => {
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
    Linking.openURL(url)
      .catch(() => {})
      .finally(() => {
        setTimeout(() => { extNavLockRef.current = false; }, 800);
      });
  }, [job?.addressLine]);

  // Manual retry for the road route, gated on the existing minimum interval so
  // the driver cannot spam the Directions API with repeated taps.
  const handleRetryRoute = useCallback(() => {
    const driver = driverLocRef.current;
    const dest = destinationRef.current;
    if (!driver || !dest) return;
    if (Date.now() - lastRouteAtRef.current < ROUTE_MIN_INTERVAL_MS) return;
    requestRoute(driver, dest);
  }, [requestRoute]);

  // Single handler for the collapsed cockpit primary button. Uses refs for
  // real-time values to avoid closure-ordering issues. Priority order:
  //   1. Within arrival zone + en route → Mark Arrived
  //   2. Coordinates valid → Open Waze
  //   3. Address available → Open address in Google Maps
  const handleCollapsedPrimary = useCallback(() => {
    const jobStatus = jobStatusRef.current;
    const driver = driverLocRef.current;
    const dest = destinationRef.current;
    const distM = driver && dest ? haversineMeters(driver, dest) : null;
    const isArrivedZone = jobStatus === 'en_route' && distM != null && distM <= ARRIVAL_HERE_M;
    if (isArrivedZone) {
      void handleConfirmArrival();
      return;
    }
    if (dest) {
      handleOpenWaze();
      return;
    }
    if (job?.addressLine?.trim()) {
      handleOpenAddressSearch();
    }
  }, [handleConfirmArrival, handleOpenWaze, handleOpenAddressSearch, job?.addressLine]);

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

  // Cycle the map theme: auto → day → night → auto. Pure preference change; the
  // effect above pushes the resulting navigation style into the WebView.
  const handleCycleTheme = useCallback(() => {
    lightHaptic();
    setMapThemeMode((m) => (m === 'auto' ? 'day' : m === 'day' ? 'night' : 'auto'));
  }, []);

  // Driver picked an alternative route from the cockpit chips (or by tapping a
  // muted line on the map). Switches the active guidance to that route.
  const handleSelectAlternative = useCallback((index: number) => {
    const rs = routeStateRef.current;
    if (rs.source !== 'mapbox' || !rs.routes[index] || index === rs.selectedIndex) {
      return;
    }
    lightHaptic();
    stepIndexRef.current = rs.routes[index].steps.length > 1 ? 1 : 0;
    setCurrentStepIndex(stepIndexRef.current);
    fitPendingRef.current = followModeRef.current === 'overview';
    const next = makeRouteState('mapbox', rs.routes, index, rs.error, {
      routeJobRef: rs.routeJobRef,
      routeDestinationKey: rs.routeDestinationKey,
      routeCalculatedAt: rs.routeCalculatedAt,
      routeOriginFixAt: rs.routeOriginFixAt,
    });
    routeStateRef.current = next;
    setRouteState(next);
  }, []);

  const handleMapMessage = useCallback((msg: RouteMapMessage) => {
    if (msg.type === 'map-loaded') {
      recoveryAttemptsRef.current = 0;
      // Force the next state push to re-send route geometry so the rebuilt map
      // gets the full route after a crash/reload.
      lastInjectedRouteRevRef.current = '';
      setMapStatus({ key: mapKey, phase: 'loaded' });
      if (latestStateRef.current) {
        injectMapJavaScript(
          `window.__applyState && window.__applyState('${latestStateRef.current}'); true;`,
        );
      }
      injectMapJavaScript('window.__resizeMap && window.__resizeMap(); true;');
    } else if (msg.type === 'map-fatal') {
      logMapDiag(
        `map-fatal: ${msg.reason ?? 'unknown'}${
          msg.status ? ` (status ${msg.status})` : ''
        }`,
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
  const routeIsCurrent =
    routeState.source === 'mapbox' &&
    routeState.routeJobRef === currentRouteJobRef &&
    routeState.routeDestinationKey === currentDestinationKey;
  const steps = routeIsCurrent ? routeState.steps : [];
  const upcomingStep =
    steps.length > 1 ? steps[Math.min(currentStepIndex, steps.length - 1)] : null;
  const nextStep =
    steps.length > currentStepIndex + 1 ? steps[currentStepIndex + 1] : null;
  const distanceToManeuver =
    upcomingStep && driverLoc
      ? haversineMeters(driverLoc, {
          lng: upcomingStep.location[0],
          lat: upcomingStep.location[1],
        })
      : null;

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
  const routeNeedsRefresh = routeIsCurrent && routeInstructionStale;

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
    !rerouting && routeIsCurrent && !routeNeedsRefresh && !!upcomingStep && phase === 'to_dropoff';
  const primaryInstruction = arrival
    ? arrival
    : rerouting
      ? t('route.findingBetterRoute')
    : routeNeedsRefresh
      ? t('route.refreshRoute')
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
    if (currentStepIndex === spokenStepRef.current) return;
    spokenStepRef.current = currentStepIndex;
    const instruction = humanizeInstruction(upcomingStep, t);
    const phrase =
      distanceToManeuver != null
        ? `${formatGuidanceDistance(distanceToManeuver, t)}, ${instruction}`
        : instruction;
    speakGuidance(phrase, { locale: localeRef.current, force: true });
  }, [voiceEnabled, hasLiveStep, upcomingStep, currentStepIndex, distanceToManeuver, t]);

  // A route-fetch attempt has definitively failed (no fallback drawn).
  const rerouteFailed =
    routeState.source === 'none' &&
    routeState.error != null &&
    routeState.error.kind !== 'network' &&
    routeState.error.kind !== 'invalid-coords' &&
    routeState.error.kind !== 'aborted';

  // Live remaining distance/time along the SELECTED route from the driver's
  // current GPS position — computed locally on each fix (no API refetch). Falls
  // back to the full route totals when there is no fix / geometry is too short.
  const remainingProgress = useMemo(() => {
    if (
      !driverLoc ||
      !routeIsCurrent ||
      routeState.geometry == null ||
      routeState.geometry.length < 2 ||
      routeState.distanceMeters == null ||
      routeState.durationSeconds == null
    ) {
      return null;
    }
    return getRemainingRouteProgress({
      driver: driverLoc,
      geometry: routeState.geometry,
      totalDistanceMeters: routeState.distanceMeters,
      totalDurationSeconds: routeState.durationSeconds,
    });
  }, [
    driverLoc,
    routeIsCurrent,
    routeState.geometry,
    routeState.distanceMeters,
    routeState.durationSeconds,
  ]);

  const displayDistanceMeters =
    routeIsCurrent ? remainingProgress?.remainingDistanceMeters ?? routeState.distanceMeters : null;
  const displayDurationSeconds =
    routeIsCurrent ? remainingProgress?.remainingDurationSeconds ?? routeState.durationSeconds : null;

  const distanceMiles =
    displayDistanceMeters != null ? metersToMiles(displayDistanceMeters) : null;
  const durationMin =
    displayDurationSeconds != null ? secondsToMinutes(displayDurationSeconds) : null;

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
  const gpsWeak = fixSeconds != null && fixSeconds > GPS_WEAK_SECONDS;
  // Perpendicular drift of the raw GPS fix from the active road route. Beyond
  // the snap threshold the marker is shown un-snapped, so the driver must be
  // told clearly they are off the route (matches SNAP_TO_ROUTE_MAX_DRIFT_M).
  const offRouteMeters =
    driverLoc &&
    routeIsCurrent &&
    routeState.geometry != null &&
    routeState.geometry.length >= 2
      ? distanceToRouteMeters(driverLoc, routeState.geometry)
      : null;
  const isOffRoute =
    offRouteMeters != null && offRouteMeters > SNAP_TO_ROUTE_MAX_DRIFT_M;
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
  } else if (gpsWeak) {
    routeHealth = { label: t('route.gpsWeak'), tone: 'warn' };
  } else if (isOffRoute) {
    routeHealth = { label: t('route.offRoute'), tone: 'warn' };
  } else if (routeIsCurrent) {
    routeHealth = { label: t('route.liveRoute'), tone: 'good' };
  } else {
    routeHealth = { label: t('route.findingRoute'), tone: 'warn' };
  }
  // ── Traffic (Part 6) — only when Mapbox returns real congestion data. ──
  const trafficAvailable =
    routeIsCurrent &&
    routeState.congestion != null &&
    routeState.congestion.length > 0;

  // ── Alternative routes (Part 7) — chips derived from real Mapbox routes. ──
  const altChips =
    routeIsCurrent && routeState.routes.length > 1
      ? routeState.routes.map((r, i) => {
          const fastest = Math.min(
            ...routeState.routes.map((x) => x.durationSeconds),
          );
          const deltaSec = r.durationSeconds - fastest;
          const label =
            deltaSec <= 60
              ? t('route.fastest')
              : deltaSec <= 180
                ? t('route.similar')
                : t('route.slower');
          return {
            index: i,
            label,
            durationMin: secondsToMinutes(r.durationSeconds),
            distanceMi: metersToMiles(r.distanceMeters),
          };
        })
      : [];

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
    if (isEnRoute && within25m) return t('route.markArrived');
    if (!customerCoord && addressLine) return t('route.openGoogleMaps');
    return t('route.openWazeShort');
  }, [isEnRoute, within25m, customerCoord, addressLine, t]);

  const collapsedPrimaryIcon: IoniconName = isEnRoute && within25m ? 'flag' : 'navigate';

  const collapsedPrimaryDisabled =
    actioning ||
    (!isEnRoute && !within25m && !customerCoord && !addressLine);

  const collapsedPrimaryIsArrival = isEnRoute && within25m;

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
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.mapOverlayText}>{t('route.loadingMap')}</Text>
              </View>
            )}

            {mapLoaded && !mapFatal && permissionDenied && (
              <View style={styles.mapOverlay}>
                <Ionicons name="location-outline" size={36} color="#FDBA74" />
                <Text style={styles.fallbackTitle}>{t('route.locationNeeded')}</Text>
                <Text style={styles.fallbackText}>
                  {t('route.locationPermissionRequired')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleEnableLocation}
                  style={styles.retryBtn}
                >
                  <Ionicons name="refresh" size={18} color="#0B0F1A" />
                  <Text style={styles.retryBtnText}>{t('route.enable')}</Text>
                </Pressable>
              </View>
            )}

            {mapFatal && (
              <View style={styles.mapOverlay}>
                <Ionicons name="warning-outline" size={36} color="#FDBA74" />
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
                  <Ionicons name="refresh" size={18} color="#0B0F1A" />
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
          <Ionicons name="chevron-back" size={22} color={colors.text} />
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
              color="#0B0F1A"
            />
          </View>
          <View style={styles.instructionTextWrap}>
            {primaryDistance != null && (
              <Text style={styles.instructionDistance}>{primaryDistance}</Text>
            )}
            <Text style={styles.instructionText} numberOfLines={2}>
              {primaryInstruction}
            </Text>
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
          <ActivityIndicator size="small" color="#0B0F1A" />
          <Text style={styles.reroutePillText}>{t('route.reroutingEllipsis')}</Text>
        </View>
      )}
      {paymentBanner != null && (
        <View
          style={[styles.banner, styles.noPointerEvents, { top: insets.top + 124 }]}
        >
          <Ionicons name="checkmark-circle" size={16} color="#0B0F1A" />
          <Text style={styles.bannerText}>{paymentBanner}</Text>
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
              <Ionicons name="locate" size={20} color="#0B0F1A" />
              <Text style={styles.ctrlBtnLabelDark} numberOfLines={1}>
                {t('route.recenter').split(' ')[0]}
              </Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('route.mapOrientation', { mode: followModeLabel })}
            onPress={handleCycleFollowMode}
            style={styles.ctrlBtn}
          >
            <Ionicons name={followModeIcon} size={20} color={colors.text} />
            <Text style={styles.ctrlBtnLabel} numberOfLines={1}>
              {followModeLabel}
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
              size={20}
              color={voiceEnabled ? '#0B0F1A' : colors.text}
            />
            <Text
              style={[styles.ctrlBtnLabel, voiceEnabled && { color: '#0B0F1A' }]}
              numberOfLines={1}
            >
              {voiceEnabled ? t('route.voiceLabelOn') : t('route.voiceLabelOff')}
            </Text>
          </Pressable>
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
                spacing.sm,
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
            <Ionicons name="flag" size={18} color="#0B0F1A" />
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
                <ActivityIndicator size="small" color="#0B0F1A" />
              ) : (
                <Ionicons name="checkmark" size={16} color="#0B0F1A" />
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
                  <Ionicons name="alert-circle-outline" size={22} color="#FDBA74" />
                  <Text style={styles.recoveryTitle}>{t('route.couldNotLoadRoute')}</Text>
                </View>
                <Text style={styles.recoveryBody}>{t('route.noRouteRecoveryBody')}</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={!customerCoord}
                  onPress={handleOpenWaze}
                  style={[styles.recoveryPrimaryBtn, !customerCoord && styles.btnDisabled]}
                >
                  <Ionicons name="navigate" size={18} color="#0B0F1A" />
                  <Text style={styles.recoveryPrimaryBtnText}>{t('route.openWazeShort')}</Text>
                </Pressable>
                <View style={styles.recoverySecRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleOpenExternal}
                    style={styles.recoverySecBtn}
                  >
                    <Ionicons name="open-outline" size={16} color={colors.text} />
                    <Text style={styles.recoverySecBtnText}>{t('route.openGoogleMaps')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleRetryRoute}
                    style={styles.recoverySecBtn}
                  >
                    <Ionicons name="refresh" size={16} color={colors.text} />
                    <Text style={styles.recoverySecBtnText}>{t('route.tryAgain')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : !customerCoord && job != null ? (
              /* Missing coordinates panel */
              <View style={styles.recoveryPanel}>
                <View style={styles.recoveryHeader}>
                  <Ionicons name="location-outline" size={22} color="#FDBA74" />
                  <Text style={styles.recoveryTitle}>{t('route.locationMissingTitle')}</Text>
                </View>
                <Text style={styles.recoveryBody}>{t('route.locationMissingBody')}</Text>
                {phone != null && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleCallCustomer}
                    style={styles.recoveryPrimaryBtn}
                  >
                    <Ionicons name="call" size={18} color="#0B0F1A" />
                    <Text style={styles.recoveryPrimaryBtnText}>{t('route.callCustomer')}</Text>
                  </Pressable>
                )}
                {addressLine != null && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleOpenAddressSearch}
                    style={[styles.recoverySecBtn, styles.recoverySecBtnFull]}
                  >
                    <Ionicons name="open-outline" size={16} color={colors.text} />
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
                    <Ionicons name={collapsedNavIcon} size={24} color="#0B0F1A" />
                  </View>
                  <Text style={styles.collapsedInstText} numberOfLines={2}>
                    {collapsedHeadline}
                  </Text>
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
                      <ActivityIndicator size="small" color="#0B0F1A" />
                    ) : (
                      <Ionicons name={collapsedPrimaryIcon} size={18} color="#0B0F1A" />
                    )}
                    <Text style={styles.collapsedPrimaryBtnText} numberOfLines={1}>
                      {collapsedPrimaryLabel}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('route.callCustomer')}
                    disabled={phone == null}
                    onPress={handleCallCustomer}
                    style={[styles.collapsedSecBtn, phone == null && styles.collapsedSecBtnDisabled]}
                  >
                    <Ionicons name="call-outline" size={18} color={phone ? colors.text : colors.muted} />
                    <Text style={[styles.collapsedSecBtnText, phone == null && { color: colors.muted }]}>
                      {t('route.call')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('route.expandDetails')}
                    onPress={() => setCockpitCollapsed(false)}
                    style={styles.collapsedSecBtn}
                  >
                    <Ionicons name="chevron-up" size={18} color={colors.text} />
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
                <Ionicons name="navigate-outline" size={18} color={customerCoord ? colors.text : colors.muted} />
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
                <Ionicons name="open-outline" size={18} color={colors.text} />
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
                  <Ionicons name="call" size={18} color="#0B0F1A" />
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
                <Ionicons name="refresh" size={16} color={colors.text} />
                <Text style={styles.routeRefreshButtonText}>{t('route.refreshRoute')}</Text>
              </Pressable>
            )}

            {/* Route alternatives — expanded only, never in collapsed driving mode */}
            {altChips.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.altChipsRow}
              >
                {altChips.map((chip) => {
                  const active = chip.index === routeState.selectedIndex;
                  return (
                    <Pressable
                      key={chip.index}
                      accessibilityRole="button"
                      accessibilityLabel={t('route.altRouteAccessibility', { label: chip.label, minutes: chip.durationMin })}
                      onPress={() => handleSelectAlternative(chip.index)}
                      style={[styles.altChip, active && styles.altChipActive]}
                    >
                      <Text style={[styles.altChipLabel, active && styles.altChipLabelActive]}>
                        {chip.label}
                      </Text>
                      <Text style={[styles.altChipMeta, active && styles.altChipMetaActive]}>
                        {chip.durationMin} {t('route.etaMin')} · {t('route.distanceMi', { value: chip.distanceMi.toFixed(1) })}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* Traffic honesty */}
            {routeIsCurrent && (
              <Text style={styles.metaLine}>
                {trafficAvailable ? t('route.trafficShown') : t('route.trafficUnavailable')}
              </Text>
            )}

            {/* Destination precision warning */}
            {routeEndsShort && (
              <View style={styles.warnRow}>
                <Ionicons name="flag-outline" size={15} color="#FDBA74" />
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
                <Ionicons name="warning" size={16} color="#0B0F1A" />
                <Text style={styles.arrivalHintText}>{t('route.atCustomerHint')}</Text>
              </View>
            )}

            {/* Waze helper text */}
            <Text style={styles.cockpitMeta}>{t('route.wazeHelperText')}</Text>

            {/* Map theme */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('route.mapThemeLabel')}
              onPress={handleCycleTheme}
              style={styles.themeRow}
            >
              <Ionicons
                name={mapThemeMode === 'night' ? 'moon' : mapThemeMode === 'day' ? 'sunny' : 'contrast'}
                size={16}
                color={colors.muted}
              />
              <Text style={styles.themeRowText}>{t('route.mapThemeLabel')}</Text>
              <Text style={styles.themeRowValue}>
                {mapThemeMode === 'day' ? t('route.dayMode') : mapThemeMode === 'night' ? t('route.nightMode') : t('route.autoMode')}
              </Text>
            </Pressable>

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
                        {done && <Ionicons name="checkmark" size={10} color="#0B0F1A" />}
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
                  <ActivityIndicator size="small" color="#0B0F1A" />
                ) : (
                  <Ionicons
                    name={emphasiseArrived ? 'flag' : 'arrow-forward-circle'}
                    size={20}
                    color="#0B0F1A"
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
    backgroundColor: colors.bg,
  },
  noPointerEvents: {
    pointerEvents: 'none',
  },
  boxNonePointerEvents: {
    pointerEvents: 'box-none',
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  mapOverlayText: {
    color: colors.muted,
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
    borderRadius: radius.lg,
    backgroundColor: 'rgba(24,24,27,0.96)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  instructionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  instructionTextWrap: {
    flex: 1,
  },
  instructionDistance: {
    color: colors.accent,
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  instructionText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  instructionNext: {
    color: colors.muted,
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
    backgroundColor: colors.accent,
  },
  reroutePillText: {
    color: '#0B0F1A',
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
    backgroundColor: 'rgba(34,197,94,0.18)',
    borderColor: 'rgba(34,197,94,0.6)',
  },
  healthWarn: {
    backgroundColor: 'rgba(249,115,22,0.20)',
    borderColor: 'rgba(249,115,22,0.6)',
  },
  healthBad: {
    backgroundColor: 'rgba(239,68,68,0.22)',
    borderColor: 'rgba(239,68,68,0.6)',
  },
  healthDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  healthDotGood: { backgroundColor: '#22c55e' },
  healthDotWarn: { backgroundColor: '#F97316' },
  healthDotBad: { backgroundColor: '#EF4444' },
  healthPillText: {
    color: colors.text,
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
    backgroundColor: '#86EFAC',
  },
  bannerText: {
    color: '#0B0F1A',
    fontSize: fontSize.sm,
    fontWeight: '800',
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
    backgroundColor: '#FDBA74',
  },
  approxBadgeText: {
    color: '#0B0F1A',
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backFab: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  fallbackTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  fallbackText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  diagText: {
    color: '#FDBA74',
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
    backgroundColor: colors.accent,
    marginTop: spacing.sm,
  },
  retryBtnText: {
    color: '#0B0F1A',
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
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topTitlePill: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: 'rgba(24,24,27,0.92)',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    position: 'relative',
  },
  topTitleText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  topTitleShimmer: {
    position: 'absolute',
    top: -8,
    bottom: -8,
    left: 0,
    width: 34,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  sideControls: {
    position: 'absolute',
    right: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  ctrlBtn: {
    minWidth: 46,
    height: 46,
    paddingHorizontal: spacing.sm,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ctrlBtnAccent: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  ctrlBtnLabel: {
    color: colors.text,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 1,
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
    borderTopColor: colors.border,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.surface,
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
    backgroundColor: colors.border,
  },
  grabberHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  grabberHintText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  altChipsRow: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  altChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  altChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  altChipLabel: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  altChipLabelActive: {
    color: '#0B0F1A',
  },
  altChipMeta: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  altChipMetaActive: {
    color: '#0B0F1A',
  },
  metaLine: {
    color: colors.muted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  warnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  warnText: {
    color: '#FDBA74',
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
    backgroundColor: colors.accent,
  },
  stateLabel: {
    color: colors.text,
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
    backgroundColor: colors.card,
  },
  statePillText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  customerName: {
    color: colors.text,
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
    color: colors.muted,
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
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  routeRefreshButtonPressed: {
    opacity: 0.75,
  },
  routeRefreshButtonText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  rerouteFailedText: {
    color: '#FDBA74',
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  cockpitMeta: {
    color: colors.muted,
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
    backgroundColor: colors.accent,
  },
  primaryBtnEmphasis: {
    minHeight: 60,
    backgroundColor: '#22c55e',
  },
  arrivalHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#FDBA74',
  },
  arrivalHintText: {
    flex: 1,
    color: '#0B0F1A',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  primaryBtnText: {
    color: '#0B0F1A',
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
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryBtnMuted: {
    opacity: 0.7,
  },
  secondaryBtnText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
    flexShrink: 1,
  },
  secondaryBtnTextMuted: {
    color: colors.muted,
    fontWeight: '600',
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  themeRowText: {
    flex: 1,
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  themeRowValue: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  arrivalPrompt: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(24,24,27,0.98)',
    borderWidth: 1,
    borderColor: '#22c55e',
    gap: spacing.sm,
  },
  arrivalPromptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  arrivalPromptText: {
    flex: 1,
    color: colors.text,
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
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  arrivalPromptBtnGhostText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  arrivalPromptBtnPrimary: {
    backgroundColor: '#22c55e',
  },
  arrivalPromptBtnPrimaryText: {
    color: '#0B0F1A',
    fontSize: fontSize.sm,
    fontWeight: '800',
  },

  /* ── Recenter button with label ── */
  ctrlBtnRecenter: {
    flexDirection: 'column',
    minWidth: 52,
    height: 52,
    gap: 2,
  },
  ctrlBtnLabelDark: {
    color: '#0B0F1A',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 1,
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
    backgroundColor: colors.accent,
    flexShrink: 0,
  },
  collapsedInstText: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    lineHeight: 22,
  },
  collapsedDistBadge: {
    color: colors.muted,
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
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    lineHeight: 24,
  },
  collapsedEtaUnit: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  collapsedMetaDivider: {
    width: 1,
    height: 14,
    backgroundColor: colors.border,
  },
  collapsedDistText: {
    color: colors.muted,
    fontSize: fontSize.sm,
    fontWeight: '600',
    flex: 1,
  },
  collapsedPayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    maxWidth: 110,
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
    backgroundColor: colors.accent,
  },
  collapsedPrimaryBtnArrival: {
    backgroundColor: '#22c55e',
  },
  collapsedPrimaryBtnText: {
    color: '#0B0F1A',
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
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  collapsedSecBtnDisabled: {
    opacity: 0.4,
  },
  collapsedSecBtnText: {
    color: colors.text,
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
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  recoveryBody: {
    color: colors.muted,
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
    backgroundColor: colors.accent,
  },
  recoveryPrimaryBtnText: {
    color: '#0B0F1A',
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
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  recoverySecBtnFull: {
    flex: 0,
    alignSelf: 'stretch',
  },
  recoverySecBtnText: {
    color: colors.text,
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
    backgroundColor: colors.accent,
    flexShrink: 0,
  },

  /* ── Arrival inline error ── */
  arrivalErrorText: {
    color: '#F87171',
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
    backgroundColor: 'rgba(30,58,138,0.92)',
    borderColor: 'rgba(147,197,253,0.5)',
  },
  reminderCardWarning: {
    backgroundColor: 'rgba(78,46,0,0.95)',
    borderColor: 'rgba(253,186,116,0.55)',
  },
  reminderCardUrgent: {
    backgroundColor: 'rgba(69,10,10,0.95)',
    borderColor: 'rgba(252,165,165,0.55)',
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
  reminderTitleInfo: { color: '#93C5FD' },
  reminderTitleWarning: { color: '#FDE68A' },
  reminderTitleUrgent: { color: '#FCA5A5' },
  reminderDismiss: {
    padding: 4,
  },
  reminderBody: {
    color: colors.muted,
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
  reminderPrimaryBtnInfo: { backgroundColor: '#1D4ED8' },
  reminderPrimaryBtnWarning: { backgroundColor: '#B45309' },
  reminderPrimaryBtnUrgent: { backgroundColor: '#B91C1C' },
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
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reminderSecBtnText: {
    color: colors.text,
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
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    zIndex: 1,
  },
  timelineDotDone: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  timelineDotActive: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  timelineDotFuture: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    opacity: 0.4,
  },
  timelineLine: {
    position: 'absolute',
    top: 9,
    left: '50%',
    right: '-50%',
    height: 2,
    backgroundColor: colors.border,
    zIndex: 0,
  },
  timelineLineDone: {
    backgroundColor: colors.accent,
  },
  timelineLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    flexShrink: 1,
  },
  timelineLabelActive: {
    color: '#22c55e',
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
