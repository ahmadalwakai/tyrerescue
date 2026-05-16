'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LiveTrackingMap } from '@/components/tracking/LiveTrackingMap';
import { TrackingStatusBanner } from '@/components/tracking/TrackingStatusBanner';
import {
  calculateDirectDistanceMiles,
  formatDistanceMiles,
  formatLastUpdated,
  isTrackingStale,
} from '@/lib/tracking/tracking-format';
import type { TrackingPoint, TrackingRouteMode, TrackingStatus } from '@/types/tracking';

interface DriverTrackingState {
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

interface DriverTrackingResponse {
  bookingId: string;
  refNumber: string | null;
  customerAddress: string | null;
  customerLat: number | null;
  customerLng: number | null;
  state: DriverTrackingState;
}

interface Props {
  token: string;
}

// Don't spam the server: only POST a location if it moves ≥10m or 10s passed.
const MIN_INTERVAL_MS = 10_000;
const MIN_DISTANCE_M = 10;
/** Snapshot poll cadence (refreshes status/lastUpdatedAt independent of watchPosition). */
const SNAPSHOT_POLL_MS = 5_000;

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function DriverTrackingClient({ token }: Props) {
  const [snapshot, setSnapshot] = useState<DriverTrackingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [routeMode, setRouteMode] = useState<TrackingRouteMode>('none');

  const mountedRef = useRef(true);
  const watchIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef<number>(0);
  const lastSentCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  const loadSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`/api/tracking/driver/${token}`, { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Tracking session not available');
      }
      const json: DriverTrackingResponse = await res.json();
      if (!mountedRef.current) return json;
      setSnapshot(json);
      setError(null);
      return json;
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      }
      return null;
    }
  }, [token]);

  // Initial load + snapshot polling.
  useEffect(() => {
    mountedRef.current = true;
    void loadSnapshot();
    const id = setInterval(() => {
      if (document.hidden) return;
      const s = snapshot?.state.status;
      if (s === 'completed' || s === 'expired') return;
      void loadSnapshot();
    }, SNAPSHOT_POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [loadSnapshot, snapshot?.state.status]);

  const sendLocation = useCallback(
    async (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const now = Date.now();
      const last = lastSentCoordsRef.current;
      if (last && now - lastSentAtRef.current < MIN_INTERVAL_MS) return;
      if (
        last &&
        distanceMeters(last, { lat, lng }) < MIN_DISTANCE_M &&
        now - lastSentAtRef.current < 30_000
      )
        return;
      lastSentAtRef.current = now;
      lastSentCoordsRef.current = { lat, lng };
      try {
        const res = await fetch(`/api/tracking/driver/${token}/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: lat,
            longitude: lng,
            accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
            heading: Number.isFinite(pos.coords.heading ?? NaN) ? pos.coords.heading : null,
            speed: Number.isFinite(pos.coords.speed ?? NaN) ? pos.coords.speed : null,
          }),
        });
        if (res.ok) {
          const json = (await res.json()) as { state?: DriverTrackingState };
          if (mountedRef.current && json.state) {
            setSnapshot((prev) => (prev ? { ...prev, state: json.state! } : prev));
          }
        }
      } catch {
        // Swallow — next watchPosition tick will retry.
      }
    },
    [token],
  );

  const startWatching = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocation not supported on this device.');
      return;
    }
    if (watchIdRef.current != null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPermissionDenied(false);
        void sendLocation(pos);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setPermissionDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
  }, [sendLocation]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => () => stopWatching(), [stopWatching]);

  // Auto start/stop watching based on status.
  useEffect(() => {
    const s = snapshot?.state.status;
    if (s === 'in_progress' || s === 'paused') startWatching();
    if (s === 'completed' || s === 'expired') stopWatching();
  }, [snapshot?.state.status, startWatching, stopWatching]);

  const handleStart = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tracking/driver/${token}/start`, { method: 'POST' });
      if (res.ok) {
        const json = (await res.json()) as { state: DriverTrackingState };
        setSnapshot((prev) => (prev ? { ...prev, state: json.state } : prev));
        startWatching();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || 'Failed to start');
      }
    } finally {
      setBusy(false);
    }
  }, [token, startWatching]);

  const handleFinish = useCallback(async () => {
    if (!window.confirm('Mark this job as finished and stop sharing your location?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tracking/driver/${token}/finish`, { method: 'POST' });
      if (res.ok) {
        const json = (await res.json()) as { state: DriverTrackingState };
        setSnapshot((prev) => (prev ? { ...prev, state: json.state } : prev));
        stopWatching();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || 'Failed to finish');
      }
    } finally {
      setBusy(false);
    }
  }, [token, stopWatching]);

  const handleOpenInMaps = useCallback(() => {
    const lat = snapshot?.customerLat;
    const lng = snapshot?.customerLng;
    if (lat == null || lng == null) return;
    // Universal Google Maps directions link. Works in Android/iOS as a deep
    // link via the OS handler; falls back to the web map on desktop.
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(url, '_blank', 'noopener');
  }, [snapshot?.customerLat, snapshot?.customerLng]);

  const handleRefresh = useCallback(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const derivedStatus: TrackingStatus | null = useMemo(() => {
    if (!snapshot) return null;
    const raw = snapshot.state.status;
    if (raw === 'in_progress' && isTrackingStale(snapshot.state.lastUpdatedAt)) {
      return 'paused';
    }
    return raw;
  }, [snapshot]);

  const driverPoint: TrackingPoint | null = useMemo(
    () =>
      snapshot?.state.driverLat != null && snapshot?.state.driverLng != null
        ? { lat: snapshot.state.driverLat, lng: snapshot.state.driverLng }
        : null,
    [snapshot],
  );
  const customerPoint: TrackingPoint | null = useMemo(
    () =>
      snapshot?.customerLat != null && snapshot?.customerLng != null
        ? { lat: snapshot.customerLat, lng: snapshot.customerLng }
        : null,
    [snapshot],
  );
  const distanceMiles = useMemo(
    () => calculateDirectDistanceMiles(driverPoint, customerPoint),
    [driverPoint, customerPoint],
  );

  if (error && !snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-center">
        <div className="max-w-md">
          <h1 className="mb-3 text-2xl font-bold text-white">Driver tracking unavailable</h1>
          <p className="mb-6 text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }
  if (!snapshot || !derivedStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-300">
        Loading...
      </div>
    );
  }

  const isDone = derivedStatus === 'completed' || derivedStatus === 'expired';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div
        className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-10 pt-5 sm:gap-5 sm:px-6"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 1.25rem)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 2.5rem)',
        }}
      >
        <header className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Tyre Rescue — Driver
          </p>
          <h1 className="text-xl font-semibold text-white sm:text-2xl">
            {snapshot.refNumber ? `Booking ${snapshot.refNumber}` : 'Live tracking'}
          </h1>
        </header>

        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm leading-relaxed text-amber-200">
          Keep this page open until the job is finished. Closing it will stop sharing your location.
        </div>

        {permissionDenied && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm leading-relaxed text-red-200">
            Location permission is required to share your journey. Enable it in your browser settings,
            then reload this page.
          </div>
        )}

        <TrackingStatusBanner
          status={derivedStatus}
          distanceLabel={
            derivedStatus === 'in_progress' || derivedStatus === 'paused'
              ? formatDistanceMiles(distanceMiles)
              : null
          }
          lastUpdatedAt={derivedStatus !== 'pending' ? snapshot.state.lastUpdatedAt : null}
          isLive={derivedStatus === 'in_progress'}
        />

        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <div className="relative h-[45vh] min-h-[280px] w-full">
            <LiveTrackingMap
              driver={driverPoint}
              customer={customerPoint}
              customerLabel="Customer"
              driverLabel="You"
              onRouteModeChange={setRouteMode}
            />
          </div>
          {routeMode === 'direct' && driverPoint && customerPoint && (
            <p className="border-t border-zinc-800 bg-zinc-900 px-4 py-2 text-[11px] text-zinc-400">
              Direct distance shown — turn-by-turn route temporarily unavailable.
            </p>
          )}
        </section>

        {snapshot.customerAddress && (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Destination
            </p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-100">
              {snapshot.customerAddress}
            </p>
          </section>
        )}

        <div className="flex flex-col gap-2">
          {derivedStatus === 'pending' && (
            <button
              type="button"
              disabled={busy}
              onClick={handleStart}
              className="h-12 w-full rounded-xl bg-orange-500 text-base font-semibold text-white shadow-lg shadow-orange-500/20 transition active:translate-y-px disabled:opacity-60"
            >
              {busy ? 'Starting...' : 'Start journey'}
            </button>
          )}
          {!isDone && derivedStatus !== 'pending' && (
            <button
              type="button"
              disabled={busy}
              onClick={handleFinish}
              className="h-12 w-full rounded-xl bg-emerald-600 text-base font-semibold text-white shadow-lg shadow-emerald-600/20 transition active:translate-y-px disabled:opacity-60"
            >
              {busy ? 'Finishing...' : 'Finish job'}
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenInMaps}
            disabled={snapshot.customerLat == null || snapshot.customerLng == null}
            className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 text-sm font-medium text-zinc-100 transition active:translate-y-px disabled:opacity-50"
          >
            Open in Maps
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            className="h-11 w-full rounded-xl border border-zinc-800 bg-transparent text-sm font-medium text-zinc-400 transition hover:text-white active:translate-y-px"
          >
            Refresh now
          </button>
        </div>

        {snapshot.state.lastUpdatedAt && (
          <p className="text-center text-[11px] text-zinc-500">
            Last fix sent {formatLastUpdated(snapshot.state.lastUpdatedAt)}.
          </p>
        )}

        {error && <p className="text-sm text-red-300">{error}</p>}
      </div>
    </div>
  );
}
