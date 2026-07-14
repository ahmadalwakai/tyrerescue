export type DriverSituation = {
  jobRef: string;
  driverId: string | null;
  status: 'on_time' | 'at_risk' | 'late' | 'offline' | 'job_closed' | 'unavailable' | string;
  label: string;
  dueBackAt: string | null;
  availableAfter: string | null;
  totalMinutes: number | null;
  delayMinutes: number;
  reasons: string[];
  reasonLabels: string[];
  lastLocationAt: string | null;
  gpsState: 'normal' | 'weak' | 'drift' | 'off_route' | 'offline' | null | string;
};
