import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export interface TrackingPaymentSummary {
  type: 'cash' | 'full' | 'deposit' | null;
  status: string;
  paymentStatus: string | null;
  subtotalPence: number | null;
  vatAmountPence: number | null;
  totalAmountPence: number | null;
  totalPaidPence: number;
  depositAmountPence: number | null;
  remainingBalancePence: number | null;
  amountToCollectPence: number;
  depositPaidAt: string | null;
  bookingStatus: string | null;
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
  createdAt: string;
  scheduledFor: string | null;
}

export interface TrackingData {
  drivers: TrackingDriver[];
  jobs: TrackingJob[];
  generatedAt: string;
}

const POLL_MS = 12_000;

export function useTracking(enabled: boolean) {
  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<TrackingData>('/api/admin/tracking');
      if (!aliveRef.current) return;
      setData(result);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      if (!aliveRef.current) return;
      setError(err instanceof Error ? err.message : 'Could not load tracking data');
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

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
