import {
  ACTIVE_JOB_GRACE_MINUTES,
  OFFLINE_GRACE_MINUTES,
  STALE_THRESHOLD_MINUTES,
  minutesSinceLastLocation,
} from '@/lib/driver-presence';
import {
  calculateJobTimeEstimate,
  type JobTimeGpsState,
} from '@/driver-app/src/lib/navigation/jobTimeEstimate';

export type DriverSituationStatus =
  | 'on_time'
  | 'at_risk'
  | 'late'
  | 'offline'
  | 'job_closed'
  | 'unavailable';

export type DriverSituationReason =
  | 'heavy_traffic'
  | 'gps_weak'
  | 'gps_drift'
  | 'off_route'
  | 'route_delay'
  | 'no_recent_location'
  | 'return_estimate_unavailable'
  | 'garage_not_configured'
  | 'job_completed'
  | 'job_cancelled'
  | 'route_unavailable';

export type DriverSituation = {
  jobRef: string;
  driverId: string | null;
  status: DriverSituationStatus;
  label: string;
  dueBackAt: string | null;
  availableAfter: string | null;
  totalMinutes: number | null;
  delayMinutes: number;
  reasons: DriverSituationReason[];
  reasonLabels: string[];
  lastLocationAt: string | null;
  gpsState: 'normal' | 'weak' | 'drift' | 'off_route' | 'offline' | null;
};

export type DriverSituationInput = {
  jobRef: string;
  driverId?: string | null;
  bookingStatus?: string | null;
  driverIsOnline?: boolean | null;
  driverStatus?: string | null;
  lastLocationAt?: Date | string | null;
  outboundMinutes?: number | null;
  returnMinutes?: number | null;
  trafficDelayMinutes?: number | null;
  serviceType?: string | null;
  tyreCount?: number | null;
  paymentStatus?: string | null;
  gpsState?: DriverSituation['gpsState'];
  plannedDueBackAt?: Date | string | null;
  returnEstimateAvailable?: boolean;
  routeAvailable?: boolean;
  garageConfigured?: boolean;
  now?: Date;
};

export const ACTIVE_DRIVER_SITUATION_STATUSES = [
  'driver_assigned',
  'en_route',
  'arrived',
  'in_progress',
] as const;

const COMPLETED_STATUSES = new Set(['completed', 'refunded', 'refunded_partial']);
const CANCELLED_STATUSES = new Set(['cancelled', 'cancelled_refund_pending']);
const CLOSED_STATUSES = new Set([...COMPLETED_STATUSES, ...CANCELLED_STATUSES]);

const STATUS_LABELS: Record<DriverSituationStatus, string> = {
  on_time: 'On time',
  at_risk: 'At risk',
  late: 'Late',
  offline: 'Offline',
  job_closed: 'Job closed',
  unavailable: 'Unavailable',
};

export const DRIVER_SITUATION_REASON_LABELS: Record<DriverSituationReason, string> = {
  heavy_traffic: 'Heavy traffic',
  gps_weak: 'Weak GPS',
  gps_drift: 'GPS drift',
  off_route: 'Off route',
  route_delay: 'Route delay',
  no_recent_location: 'No recent driver location',
  return_estimate_unavailable: 'Return estimate unavailable',
  garage_not_configured: 'Garage not configured',
  job_completed: 'Job completed',
  job_cancelled: 'Job cancelled',
  route_unavailable: 'Route unavailable',
};

export const DRIVER_SITUATION_CHAKRA_COLORS: Record<DriverSituationStatus, string> = {
  on_time: 'green',
  at_risk: 'orange',
  late: 'red',
  offline: 'gray',
  job_closed: 'gray',
  unavailable: 'gray',
};

export function isActiveDriverSituationStatus(status: string | null | undefined): boolean {
  return ACTIVE_DRIVER_SITUATION_STATUSES.includes(
    (status ?? '') as typeof ACTIVE_DRIVER_SITUATION_STATUSES[number],
  );
}

export function estimateUrbanDriveMinutesFromMiles(miles: number | null | undefined): number | null {
  if (miles == null || !Number.isFinite(miles)) return null;
  return Math.max(1, Math.round((Math.max(0, miles) / 25) * 60));
}

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase();
}

function normalizeDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isFinite(date.getTime()) ? date : null;
}

function toIso(value: Date | string | null | undefined): string | null {
  const date = normalizeDate(value);
  return date ? date.toISOString() : null;
}

function uniqueReasons(reasons: DriverSituationReason[]): DriverSituationReason[] {
  return Array.from(new Set(reasons));
}

function buildSituation(input: {
  jobRef: string;
  driverId: string | null;
  status: DriverSituationStatus;
  dueBackAt?: Date | null;
  totalMinutes?: number | null;
  delayMinutes?: number | null;
  reasons?: DriverSituationReason[];
  lastLocationAt?: Date | string | null;
  gpsState?: DriverSituation['gpsState'];
}): DriverSituation {
  const reasons = uniqueReasons(input.reasons ?? []);
  const dueBackAt = input.dueBackAt ? input.dueBackAt.toISOString() : null;

  return {
    jobRef: input.jobRef,
    driverId: input.driverId,
    status: input.status,
    label: STATUS_LABELS[input.status],
    dueBackAt,
    availableAfter: dueBackAt,
    totalMinutes: input.totalMinutes ?? null,
    delayMinutes: input.delayMinutes ?? 0,
    reasons,
    reasonLabels: reasons.map((reason) => DRIVER_SITUATION_REASON_LABELS[reason]),
    lastLocationAt: toIso(input.lastLocationAt),
    gpsState: input.gpsState ?? null,
  };
}

function mapGpsReason(gpsState: DriverSituation['gpsState']): DriverSituationReason | null {
  if (gpsState === 'weak') return 'gps_weak';
  if (gpsState === 'drift') return 'gps_drift';
  if (gpsState === 'off_route') return 'off_route';
  return null;
}

export function calculateDriverSituation(input: DriverSituationInput): DriverSituation {
  const bookingStatus = normalizeStatus(input.bookingStatus);
  const driverId = input.driverId ?? null;
  const now = input.now && Number.isFinite(input.now.getTime()) ? input.now : new Date();
  const reasons: DriverSituationReason[] = [];
  const activeJob = isActiveDriverSituationStatus(bookingStatus);
  const lastLocationAt = normalizeDate(input.lastLocationAt);

  if (CLOSED_STATUSES.has(bookingStatus)) {
    return buildSituation({
      jobRef: input.jobRef,
      driverId,
      status: 'job_closed',
      reasons: [COMPLETED_STATUSES.has(bookingStatus) ? 'job_completed' : 'job_cancelled'],
      lastLocationAt,
      gpsState: null,
    });
  }

  if (!driverId) {
    return buildSituation({
      jobRef: input.jobRef,
      driverId: null,
      status: 'unavailable',
      reasons: ['route_unavailable'],
      lastLocationAt: null,
      gpsState: null,
    });
  }

  const minutesSinceLocation = minutesSinceLastLocation(lastLocationAt);
  const offlineGrace = activeJob ? ACTIVE_JOB_GRACE_MINUTES : OFFLINE_GRACE_MINUTES;
  if (minutesSinceLocation == null || minutesSinceLocation > offlineGrace) {
    return buildSituation({
      jobRef: input.jobRef,
      driverId,
      status: 'offline',
      reasons: ['no_recent_location'],
      lastLocationAt,
      gpsState: 'offline',
    });
  }

  let gpsState = input.gpsState ?? 'normal';
  if (gpsState == null || gpsState === 'offline') gpsState = 'normal';

  if (minutesSinceLocation > STALE_THRESHOLD_MINUTES) {
    reasons.push('no_recent_location');
    if (gpsState === 'normal') gpsState = 'weak';
  }

  const gpsReason = mapGpsReason(gpsState);
  if (gpsReason) reasons.push(gpsReason);

  const routeAvailable = input.routeAvailable !== false && input.outboundMinutes != null;
  const returnEstimateAvailable = input.returnEstimateAvailable === true && input.returnMinutes != null;

  if (!routeAvailable) reasons.push('route_unavailable');
  if (!returnEstimateAvailable) {
    reasons.push(input.garageConfigured === false ? 'garage_not_configured' : 'return_estimate_unavailable');
  }

  const trafficDelayMinutes =
    input.trafficDelayMinutes != null && Number.isFinite(input.trafficDelayMinutes)
      ? Math.max(0, Math.round(input.trafficDelayMinutes))
      : 0;

  if (trafficDelayMinutes > 3) reasons.push('heavy_traffic');
  if (trafficDelayMinutes > 15) reasons.push('route_delay');

  if (!routeAvailable || !returnEstimateAvailable) {
    return buildSituation({
      jobRef: input.jobRef,
      driverId,
      status: 'unavailable',
      reasons,
      lastLocationAt,
      gpsState,
    });
  }

  const plannedDueBackAt = normalizeDate(input.plannedDueBackAt);
  const estimate = calculateJobTimeEstimate({
    now,
    outboundMinutes: input.outboundMinutes,
    returnMinutes: input.returnMinutes,
    trafficDelayMinutes,
    serviceType: input.serviceType,
    tyreCount: input.tyreCount,
    bookingStatus,
    paymentStatus: input.paymentStatus,
    gpsState: gpsState as JobTimeGpsState,
    plannedDueBackAt,
    returnEstimateAvailable: true,
  });

  const status: DriverSituationStatus =
    estimate.risk === 'late'
      ? 'late'
      : estimate.risk === 'at_risk' || reasons.length > 0
        ? 'at_risk'
        : 'on_time';

  return buildSituation({
    jobRef: input.jobRef,
    driverId,
    status,
    dueBackAt: estimate.dueBackAt,
    totalMinutes: estimate.totalMinutes,
    delayMinutes: estimate.riskDelayMinutes,
    reasons,
    lastLocationAt,
    gpsState,
  });
}
