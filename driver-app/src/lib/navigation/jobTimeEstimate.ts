export type JobTimeRisk = 'on_time' | 'at_risk' | 'late';

export type JobTimeGpsState = 'normal' | 'weak' | 'drift' | 'off_route';

export type JobTimeEstimateInput = {
  now: Date;
  outboundMinutes?: number | null;
  returnMinutes?: number | null;
  trafficDelayMinutes?: number | null;
  serviceType?: string | null;
  tyreCount?: number | null;
  bookingStatus?: string | null;
  paymentStatus?: string | null;
  gpsState?: JobTimeGpsState | null;
  plannedDueBackAt?: Date | null;
  returnEstimateAvailable: boolean;
};

export type JobTimeEstimate = {
  outboundMinutes: number | null;
  returnMinutes: number | null;
  onSiteMinutes: number;
  handoverMinutes: number;
  safetyBufferMinutes: number;
  totalMinutes: number;
  dueBackAt: Date;
  risk: JobTimeRisk;
  riskDelayMinutes: number;
  returnEstimateAvailable: boolean;
  isClosed: boolean;
};

const CLOSED_STATUSES = new Set([
  'completed',
  'cancelled',
  'cancelled_refund_pending',
  'refunded',
  'refunded_partial',
]);

function normaliseDuration(minutes: number | null | undefined): number | null {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  return Math.max(0, Math.round(minutes));
}

function normaliseServiceType(serviceType: string | null | undefined): string {
  return (serviceType ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ');
}

function serviceClearlyMeansPuncture(serviceType: string): boolean {
  return /\b(puncture|repair|plug|patch)\b/.test(serviceType);
}

function serviceClearlyMeansTyreFitting(serviceType: string): boolean {
  return /\b(tyre|tire|fit|fitting|replacement|replace|mobile)\b/.test(serviceType);
}

export function estimateOnSiteMinutes(input: {
  serviceType?: string | null;
  tyreCount?: number | null;
}): number {
  const serviceType = normaliseServiceType(input.serviceType);
  const tyreCount =
    input.tyreCount != null && Number.isFinite(input.tyreCount)
      ? Math.max(0, Math.round(input.tyreCount))
      : null;

  if (serviceClearlyMeansPuncture(serviceType)) return 20;

  const effectiveTyreCount =
    tyreCount != null && tyreCount > 0
      ? tyreCount
      : serviceClearlyMeansTyreFitting(serviceType)
        ? 1
        : null;

  switch (effectiveTyreCount) {
    case 1:
      return 25;
    case 2:
      return 35;
    case 3:
      return 45;
    case 4:
      return 55;
    default:
      return 30;
  }
}

export function calculateJobTimeEstimate(input: JobTimeEstimateInput): JobTimeEstimate {
  const nowMs = Number.isFinite(input.now.getTime()) ? input.now.getTime() : Date.now();
  const now = new Date(nowMs);
  const outboundMinutes = normaliseDuration(input.outboundMinutes);
  const returnMinutes = input.returnEstimateAvailable
    ? normaliseDuration(input.returnMinutes)
    : null;
  const trafficDelayMinutes = normaliseDuration(input.trafficDelayMinutes) ?? 0;
  const gpsState = input.gpsState ?? 'normal';
  const isClosed = CLOSED_STATUSES.has((input.bookingStatus ?? '').trim().toLowerCase());
  const onSiteMinutes = estimateOnSiteMinutes({
    serviceType: input.serviceType,
    tyreCount: input.tyreCount,
  });
  const handoverMinutes = 5;
  const trafficRiskBuffer = trafficDelayMinutes > 3 ? 10 : 5;
  const gpsRiskBuffer = gpsState === 'drift' || gpsState === 'off_route' ? 5 : 0;
  const safetyBufferMinutes = trafficRiskBuffer + gpsRiskBuffer;
  const totalMinutes =
    (outboundMinutes ?? 0) +
    onSiteMinutes +
    handoverMinutes +
    (returnMinutes ?? 0) +
    safetyBufferMinutes;
  const dueBackAt = new Date(now.getTime() + totalMinutes * 60_000);

  let risk: JobTimeRisk = 'on_time';
  if (
    trafficDelayMinutes > 3 ||
    gpsState === 'weak' ||
    gpsState === 'drift' ||
    gpsState === 'off_route'
  ) {
    risk = 'at_risk';
  }
  if (trafficDelayMinutes > 15) {
    risk = 'late';
  }
  const planned = input.plannedDueBackAt;
  if (planned != null && Number.isFinite(planned.getTime()) && now.getTime() > planned.getTime()) {
    risk = 'late';
  }

  return {
    outboundMinutes,
    returnMinutes,
    onSiteMinutes,
    handoverMinutes,
    safetyBufferMinutes,
    totalMinutes,
    dueBackAt,
    risk,
    riskDelayMinutes: Math.max(0, trafficDelayMinutes + gpsRiskBuffer),
    returnEstimateAvailable: input.returnEstimateAvailable && returnMinutes != null,
    isClosed,
  };
}

export function formatMinutesCompact(minutes: number): string {
  const safe = normaliseDuration(minutes) ?? 0;
  if (safe < 60) return `${safe}m`;
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

export function formatDueBackTime(date: Date): string {
  if (!Number.isFinite(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
