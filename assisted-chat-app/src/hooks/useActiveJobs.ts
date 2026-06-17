import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export interface ActiveJobItem {
  bookingRef: string;
  bookingId: string;
  status: 'driver_assigned' | 'en_route' | 'arrived' | 'in_progress' | string;
  scheduledAt: string | null;
  assignedAt: string | null;
  acceptedAt: string | null;
  customer: {
    name: string;
    phone: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
  };
  driver: {
    id: string;
    name: string;
    phone: string | null;
    lat: number | null;
    lng: number | null;
    locationAt: string | null;
    locationSource: string | null;
    isStale: boolean;
  };
  payment: {
    type: string | null;
    status: string | null;
    paymentStatus: string | null;
    amountToCollectPence: number;
    totalAmountPence: number | null;
    totalPaidPence: number;
    remainingBalancePence: number | null;
    depositAmountPence: number | null;
    depositPaidAt: string | null;
    bookingStatus: string | null;
  } | null;
  distanceMiles: number | null;
  etaMinutes: number | null;
}

interface ActiveJobsResponse {
  activeJobs: ActiveJobItem[];
}

const POLL_MS = 12_000;

export function useActiveJobs(enabled: boolean) {
  const [items, setItems] = useState<ActiveJobItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<ActiveJobsResponse>('/api/admin/active-jobs');
      if (!aliveRef.current) return;
      setItems(data.activeJobs ?? []);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err) {
      if (!aliveRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load active jobs');
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
    refresh();
    timerRef.current = setInterval(refresh, POLL_MS);
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [enabled, refresh]);

  return { items, loading, error, lastUpdated, refresh };
}
