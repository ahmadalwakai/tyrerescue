import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export interface TrackingPaymentSummary {
  state: string;
  label: string;
  instruction: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral' | string;
  method: string;
  methodLabel: string;
  linkStatus: string;
  paidVia: string | null;
  totalPence: number | null;
  paidPence: number | null;
  depositAmountPence: number | null;
  depositPaidPence: number | null;
  remainingBalancePence: number | null;
  amountToCollectPence: number | null;
  paymentUpdatedAt: string | null;
  depositPaidAt: string | null;
  linkSentAt: string | null;
  linkOpenedAt: string | null;
  linkExpiresAt: string | null;
  reason: string;
}

export interface DriverSituation {
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
}

export interface TrackingDriver {
  id: string;
  name: string;
  phone: string | null;
  status: 'available' | 'busy' | 'offline' | 'unknown';
  activeJobRef: string | null;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  lastSeenAt: string | null;
  locationFreshness: 'live' | 'stale' | 'offline' | 'unknown';
  driverSituation: DriverSituation | null;
}

export interface TrackingJob {
  id: string;
  ref: string;
  status: string;
  assignmentStatus: 'unassigned' | 'assigned';
  assignedDriverId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  tyreSummary: string | null;
  vehicleSummary: string | null;
  paymentSummary: TrackingPaymentSummary | null;
  driverSituation: DriverSituation | null;
  createdAt: string;
  scheduledFor: string | null;
}

export interface TrackingData {
  drivers: TrackingDriver[];
  jobs: TrackingJob[];
  generatedAt: string;
}

export type TrackingJobsRange = 'today' | 'yesterday' | 'last_7_days' | 'last_month' | 'last_year';

const POLL_MS = 12_000;

export function useTracking(enabled: boolean, jobsRange: TrackingJobsRange = 'today') {
  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aliveRef = useRef(true);
  const requestSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestSeq = ++requestSeqRef.current;
    setLoading(true);
    try {
      const result = await api.get<TrackingData>(
        `/api/admin/tracking?jobsRange=${encodeURIComponent(jobsRange)}`,
      );
      if (!aliveRef.current || requestSeq !== requestSeqRef.current) return;
      setData(result);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      if (!aliveRef.current || requestSeq !== requestSeqRef.current) return;
      setError(err instanceof Error ? err.message : 'Could not load tracking data');
    } finally {
      if (aliveRef.current && requestSeq === requestSeqRef.current) setLoading(false);
    }
  }, [jobsRange]);

  useEffect(() => {
    aliveRef.current = true;
    if (!enabled) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return () => {
        aliveRef.current = false;
      };
    }
    void refresh();
    timerRef.current = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [enabled, refresh]);

  return { data, loading, error, lastUpdated, refresh };
}
