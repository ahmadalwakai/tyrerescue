/** Pure GPS evidence rules. A candidate is a proposal; it never assigns a driver. */
export interface GeoFix {
  lat: number;
  lng: number;
  at: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
}

export interface CandidateBooking {
  id: string;
  refNumber: string;
  lat: number;
  lng: number;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  bookingType: string;
}

export interface JourneyDestination { lat: number; lng: number }

export interface JourneyCandidate {
  bookingId: string;
  confidence: 'approaching' | 'nearby';
  distanceMeters: number;
  progressMeters: number;
}

export interface JourneyMonitorState {
  lastFix: GeoFix | null;
  travelAnchor: GeoFix | null;
  hasTravelled: boolean;
  stationaryAnchor: GeoFix | null;
  stationarySince: number | null;
  nearSampleCount: number;
  lastNearAt: number | null;
  nearSent: boolean;
  stopSent: boolean;
  arrived: boolean;
}

const MAX_FIX_AGE_MS = 60_000;
const MAX_SAMPLE_GAP_MS = 60_000;
const MAX_ACCURACY_METERS = 50;
const MAX_SPEED_MPS = 70;
const CANDIDATE_MIN_SPAN_MS = 30_000;
const APPROACHING_RADIUS_METERS = 20_000;
const NEARBY_RADIUS_METERS = 500;
const STATIONARY_NEARBY_RADIUS_METERS = 150;
const ARRIVAL_RADIUS_METERS = 75;
const STOP_DURATION_MS = 120_000;
const ROAD_ETA_THRESHOLD_SECONDS = 300;
const MIN_ETA_CHECK_INTERVAL_MS = 20_000;
const MAX_ETA_CHECK_GAP_MS = 120_000;
const ELIGIBLE_STATUSES = new Set([
  'awaiting_payment', 'payment_failed', 'paid', 'deposit_paid',
  'driver_assigned', 'en_route', 'arrived', 'in_progress',
]);

function validPoint(point: JourneyDestination): boolean {
  return Number.isFinite(point.lat) && Math.abs(point.lat) <= 90
    && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180
    && !(point.lat === 0 && point.lng === 0);
}

function validTime(at: number): boolean {
  return Number.isFinite(at) && Number.isFinite(new Date(at).getTime());
}

export function ukServiceDay(now: number): string {
  if (!validTime(now)) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(now));
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isEligibleJourneyBooking(booking: CandidateBooking, now: number): boolean {
  if (!validTime(now) || !booking.id || !booking.refNumber || !validPoint(booking)
    || !ELIGIBLE_STATUSES.has(booking.status)) return false;
  // A malformed scheduled date cannot silently turn into a different service day.
  const serviceAt = Date.parse(booking.scheduledAt ?? booking.createdAt);
  return validTime(serviceAt) && ukServiceDay(serviceAt) === ukServiceDay(now);
}

export function isUsableJourneyFix(fix: GeoFix, now: number, previousAt?: number): boolean {
  return validTime(now) && validPoint(fix) && validTime(fix.at)
    && fix.at <= now && now - fix.at <= MAX_FIX_AGE_MS
    && (previousAt === undefined || (validTime(previousAt) && fix.at > previousAt))
    && fix.accuracy !== null && Number.isFinite(fix.accuracy)
    && fix.accuracy >= 0 && fix.accuracy <= MAX_ACCURACY_METERS
    && (fix.speed === null || (Number.isFinite(fix.speed) && fix.speed >= 0 && fix.speed <= MAX_SPEED_MPS))
    && (fix.heading === null || (Number.isFinite(fix.heading) && fix.heading >= 0 && fix.heading < 360));
}

function distance(a: JourneyDestination, b: JourneyDestination): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const h = Math.sin(radians(b.lat - a.lat) / 2) ** 2
    + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

function bearing(a: JourneyDestination, b: JourneyDestination): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const delta = radians(b.lng - a.lng);
  const y = Math.sin(delta) * Math.cos(radians(b.lat));
  const x = Math.cos(radians(a.lat)) * Math.sin(radians(b.lat))
    - Math.sin(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.cos(delta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function aligned(a: number, b: number): boolean {
  const difference = Math.abs(a - b) % 360;
  return Math.min(difference, 360 - difference) <= 55;
}

function plausible(previous: GeoFix, next: GeoFix): boolean {
  const elapsedSeconds = (next.at - previous.at) / 1000;
  return elapsedSeconds > 0 && distance(previous, next)
    <= MAX_SPEED_MPS * elapsedSeconds + (previous.accuracy ?? 0) + (next.accuracy ?? 0);
}

export function selectJourneyCandidates(bookings: CandidateBooking[], fixes: GeoFix[], now: number): JourneyCandidate[] {
  // Keep only the latest continuous trustworthy segment. Do not reorder replayed
  // GPS, bridge a sample gap, or silently use evidence before a bad final sample.
  let segment: GeoFix[] = [];
  for (const fix of fixes) {
    const previous = segment.at(-1);
    if (!isUsableJourneyFix(fix, now, previous?.at) || (previous && !plausible(previous, fix))) {
      segment = [];
      continue;
    }
    if (previous && fix.at - previous.at > MAX_SAMPLE_GAP_MS) segment = [];
    segment.push(fix);
  }
  const first = segment[0];
  const latest = segment.at(-1);
  if (!first || !latest || segment.length < 2 || latest.at - first.at < CANDIDATE_MIN_SPAN_MS) return [];
  const movement = distance(first, latest);
  const motionThreshold = Math.max(50, ((first.accuracy ?? 0) + (latest.accuracy ?? 0)) * 2);
  const moving = movement >= motionThreshold && !(first.speed !== null && latest.speed !== null
    && first.speed < 0.5 && latest.speed < 0.5);
  // A driver already beside a customer can still produce a proposal. Require
  // tighter accuracy and stable repeated coordinates instead of mere proximity.
  const stationary = segment.every((fix) => fix.accuracy !== null && fix.accuracy <= 25
    && distance(first, fix) <= 25 && (fix.speed === null || fix.speed <= 0.8));
  if (!moving && !stationary) return [];
  const trackHeading = bearing(first, latest);
  const preceding = segment.at(-2)!;
  const latestMovement = distance(preceding, latest);
  const seen = new Set<string>();
  const candidates: JourneyCandidate[] = [];
  for (const booking of bookings) {
    if (seen.has(booking.id) || !isEligibleJourneyBooking(booking, now)) continue;
    const before = distance(first, booking);
    const current = distance(latest, booking);
    const progress = before - current;
    const headingToBooking = bearing(latest, booking);
    const approaching = moving && current <= APPROACHING_RADIUS_METERS
      && progress >= Math.max(50, motionThreshold / 2)
      && aligned(trackHeading, headingToBooking)
      && (latestMovement < Math.max(10, (preceding.accuracy ?? 0) + (latest.accuracy ?? 0))
        || aligned(bearing(preceding, latest), headingToBooking))
      && (latest.heading === null || aligned(latest.heading, headingToBooking));
    const nearby = (moving && before <= NEARBY_RADIUS_METERS && current <= NEARBY_RADIUS_METERS
      && Math.abs(progress) <= 100)
      || (stationary && segment.every((fix) => distance(fix, booking) <= STATIONARY_NEARBY_RADIUS_METERS));
    if (!approaching && !nearby) continue;
    seen.add(booking.id);
    candidates.push({ bookingId: booking.id, confidence: approaching ? 'approaching' : 'nearby',
      distanceMeters: Math.round(current), progressMeters: Math.round(progress) });
  }
  return candidates.sort((a, b) => Number(b.confidence === 'approaching') - Number(a.confidence === 'approaching')
    || a.distanceMeters - b.distanceMeters || b.progressMeters - a.progressMeters || a.bookingId.localeCompare(b.bookingId));
}

export function initialJourneyMonitorState(): JourneyMonitorState {
  return { lastFix: null, travelAnchor: null, hasTravelled: false,
    stationaryAnchor: null, stationarySince: null, nearSampleCount: 0, lastNearAt: null,
    nearSent: false, stopSent: false, arrived: false };
}

/** Call only after explicit admin confirmation of this driver ↔ booking journey. */
export function advanceJourneyMonitor(
  state: JourneyMonitorState,
  fix: GeoFix,
  destination: JourneyDestination,
  etaSeconds: number | null,
  now: number,
): { state: JourneyMonitorState; events: Array<'near' | 'stopped'> } {
  if (!validPoint(destination) || !isUsableJourneyFix(fix, now, state.lastFix?.at)
    || (state.lastFix && !plausible(state.lastFix, fix))) return { state, events: [] };
  const next = { ...state, lastFix: { ...fix } };
  const events: Array<'near' | 'stopped'> = [];
  const gap = state.lastFix !== null && fix.at - state.lastFix.at > MAX_SAMPLE_GAP_MS;
  if (gap) {
    next.stationaryAnchor = null;
    next.stationarySince = null;
    next.stopSent = false;
    next.nearSampleCount = 0;
    next.lastNearAt = null;
    next.travelAnchor = { ...fix };
  }
  if (!next.travelAnchor) next.travelAnchor = { ...fix };
  const travelled = distance(next.travelAnchor, fix);
  if (travelled >= Math.max(75, ((next.travelAnchor.accuracy ?? 0) + (fix.accuracy ?? 0)) * 2)) {
    next.hasTravelled = true;
  }
  if (distance(fix, destination) <= ARRIVAL_RADIUS_METERS) next.arrived = true;
  if (next.arrived) {
    next.stationaryAnchor = null;
    next.stationarySince = null;
    next.stopSent = false;
    next.nearSampleCount = 0;
    return { state: next, events };
  }

  // null means no new road ETA observation; cached ETA must not be counted twice.
  if (etaSeconds !== null && Number.isFinite(etaSeconds) && etaSeconds >= 0) {
    if (etaSeconds > ROAD_ETA_THRESHOLD_SECONDS) {
      next.nearSampleCount = 0;
      next.lastNearAt = null;
    } else if (next.lastNearAt === null || fix.at - next.lastNearAt >= MIN_ETA_CHECK_INTERVAL_MS) {
      if (next.lastNearAt !== null && fix.at - next.lastNearAt > MAX_ETA_CHECK_GAP_MS) next.nearSampleCount = 0;
      next.nearSampleCount += 1;
      next.lastNearAt = fix.at;
      if (next.nearSampleCount >= 2 && !next.nearSent) {
        next.nearSent = true;
        events.push('near');
      }
    }
  }

  const anchor = next.stationaryAnchor;
  const speedLow = fix.speed === null || fix.speed <= 0.8;
  const insideStopRadius = anchor !== null && distance(anchor, fix) <= 25;
  if (!next.hasTravelled || !speedLow || (anchor && !insideStopRadius)) {
    next.stationaryAnchor = null;
    next.stationarySince = null;
    next.stopSent = false;
  }
  if (next.hasTravelled && speedLow && next.stationaryAnchor === null) {
    next.stationaryAnchor = { ...fix };
    next.stationarySince = fix.at;
  }
  if (next.stationarySince !== null && fix.at - next.stationarySince > STOP_DURATION_MS && !next.stopSent) {
    next.stopSent = true;
    events.push('stopped');
  }
  return { state: next, events };
}
