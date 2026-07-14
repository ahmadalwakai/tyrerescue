import type { DriverSituation } from '@/types/driverSituation';

const fallbackDriverSituation: DriverSituation = {
  jobRef: '',
  driverId: null,
  status: 'unavailable',
  label: 'No driver data',
  dueBackAt: null,
  availableAfter: null,
  totalMinutes: null,
  delayMinutes: 0,
  reasons: [],
  reasonLabels: [],
  lastLocationAt: null,
  gpsState: null,
};

export function normalizeDriverSituation(
  situation: DriverSituation | null | undefined,
): DriverSituation {
  if (!situation) return fallbackDriverSituation;

  return {
    ...fallbackDriverSituation,
    ...situation,
    status: situation.status || fallbackDriverSituation.status,
    label: situation.label || fallbackDriverSituation.label,
    reasons: Array.isArray(situation.reasons) ? situation.reasons : [],
    reasonLabels: Array.isArray(situation.reasonLabels) ? situation.reasonLabels : [],
  };
}
