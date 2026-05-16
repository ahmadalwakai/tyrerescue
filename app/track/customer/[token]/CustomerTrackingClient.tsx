'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LiveTrackingMap } from '@/components/tracking/LiveTrackingMap';
import { TrackingStatusBanner } from '@/components/tracking/TrackingStatusBanner';
import {
  calculateDirectDistanceMiles,
  formatDistanceMiles,
  isTrackingStale,
} from '@/lib/tracking/tracking-format';
import type { TrackingPoint, TrackingRouteMode, TrackingStatus } from '@/types/tracking';

interface CustomerTrackingState {
  status: TrackingStatus;
  startedAt: string | null;
  completedAt: string | null;
  lastUpdatedAt: string | null;
  driverLat: number | null;
  driverLng: number | null;
  accuracyMeters: number | null;
  headingDegrees: number | null;
  speedMetersPerSecond: number | null;
}

interface CustomerTrackingResponse {
  refNumber: string | null;
  customerAddress: string | null;
  customerLat: number | null;
  customerLng: number | null;
  driverName: string | null;
  state: CustomerTrackingState;
}

interface Props {
  token: string;
}

/** Live polling cadence. Page Visibility API pauses it when tab is hidden. */
const POLL_MS = 5_000;

export function CustomerTrackingClient({ token }: Props) {
  const [data, setData] = useState<CustomerTrackingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [routeMode, setRouteMode] = useState<TrackingRouteMode>('none');
  const mountedRef = useRef(true);

  const fetchData = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/tracking/customer/${token}`, { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to load tracking');
      }
      const json: CustomerTrackingResponse = await res.json();
      if (!mountedRef.current) return false;
      setData(json);
      setError(null);
      return json.state.status !== 'completed' && json.state.status !== 'expired';
    } catch (err) {
      if (!mountedRef.current) return false;
      setError(err instanceof Error ? err.message : 'Failed to load tracking');
      return true;
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [token]);

  // Polling with visibility-aware pausing.
  useEffect(() => {
    mountedRef.current = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      if (timer || stopped) return;
      timer = setInterval(async () => {
        const keep = await fetchData();
        if (!keep) {
          stopped = true;
          stop();
        }
      }, POLL_MS);
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else if (!stopped) {
        void fetchData().then((keep) => {
          if (keep) start();
          else stopped = true;
        });
      }
    };

    void fetchData().then((keep) => {
      if (keep) start();
      else stopped = true;
    });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mountedRef.current = false;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchData]);

  const derivedStatus: TrackingStatus | null = useMemo(() => {
    if (!data) return null;
    const raw = data.state.status;
    if (raw === 'in_progress' && isTrackingStale(data.state.lastUpdatedAt)) {
      return 'paused';
    }
    return raw;
  }, [data]);

  const driverPoint: TrackingPoint | null = useMemo(
    () =>
      data?.state.driverLat != null && data?.state.driverLng != null
        ? { lat: data.state.driverLat, lng: data.state.driverLng }
        : null,
    [data],
  );
  const customerPoint: TrackingPoint | null = useMemo(
    () =>
      data?.customerLat != null && data?.customerLng != null
        ? { lat: data.customerLat, lng: data.customerLng }
        : null,
    [data],
  );
  const distanceMiles = useMemo(
    () => calculateDirectDistanceMiles(driverPoint, customerPoint),
    [driverPoint, customerPoint],
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-300">
        Loading tracking...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-center">
        <div className="max-w-md">
          <h1 className="mb-3 text-2xl font-bold text-white">Tracking link not available</h1>
          <p className="mb-6 text-zinc-400">{error}</p>
          <a
            href="/"
            className="inline-block rounded-lg bg-orange-500 px-6 py-3 font-medium text-white"
          >
            Return to homepage
          </a>
        </div>
      </div>
    );
  }

  if (!data || !derivedStatus) return null;

  const distanceLabel =
    derivedStatus === 'in_progress' || derivedStatus === 'paused'
      ? formatDistanceMiles(distanceMiles)
      : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-10 pt-6 sm:gap-5 sm:px-6"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 1.5rem)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 2.5rem)',
        }}
      >
        <header className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Tyre Rescue live tracking
          </p>
          {data.refNumber && (
            <h1 className="text-xl font-semibold text-white sm:text-2xl">
              Booking {data.refNumber}
            </h1>
          )}
          {data.driverName && (
            <p className="text-sm text-zinc-400">Your driver: {data.driverName}</p>
          )}
        </header>

        <TrackingStatusBanner
          status={derivedStatus}
          distanceLabel={distanceLabel}
          lastUpdatedAt={derivedStatus !== 'pending' ? data.state.lastUpdatedAt : null}
          isLive={derivedStatus === 'in_progress'}
        />

        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <div className="relative h-[55vh] min-h-[320px] w-full">
            <LiveTrackingMap
              driver={driverPoint}
              customer={customerPoint}
              customerLabel="You"
              driverLabel="Driver"
              onRouteModeChange={setRouteMode}
            />
          </div>
          {routeMode === 'direct' && driverPoint && customerPoint && (
            <p className="border-t border-zinc-800 bg-zinc-900 px-4 py-2 text-[11px] text-zinc-400">
              Direct distance shown — turn-by-turn route is temporarily unavailable.
            </p>
          )}
        </section>

        {data.customerAddress && (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Destination
            </p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-100">
              {data.customerAddress}
            </p>
          </section>
        )}

        <p className="pt-2 text-center text-[11px] leading-relaxed text-zinc-500">
          This page refreshes automatically. Keep it open to follow the driver in real time.
        </p>
      </div>
    </div>
  );
}
