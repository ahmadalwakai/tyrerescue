'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { LiveTrackingMap } from '@/components/tracking/LiveTrackingMap';
import { TrackingStatusBanner } from '@/components/tracking/TrackingStatusBanner';
import {
  calculateDirectDistanceMiles,
  formatDistanceMiles,
  getTrackingHealth,
  isTrackingStale,
  NEARBY_MILES,
  type TrackingHealth,
} from '@/lib/tracking/tracking-format';
import { logTrackingDiagnostic } from '@/lib/tracking/diagnostic-log';
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

type FetchReason = 'initial' | 'polling' | 'visibility' | 'network_recovery';
type TrackingConnectionState =
  | 'live'
  | 'polling'
  | 'delayed'
  | 'offline'
  | 'completed'
  | 'unavailable';

/** Live polling cadence. Page Visibility API pauses it when tab is hidden. */
const POLL_MS = 5_000;
const APP_PROMPT_DELAY_MS = 1_700;
const APP_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1_000;
const APP_PROMPT_DISMISSED_KEY = 'tyre-rescue-customer-track-app-prompt-dismissed-at';
const CUSTOMER_APP_STORE_URL = 'https://apps.apple.com/gb/app/tyre-rescue/id6782555222';
const CUSTOMER_APP_SCHEME = 'tyrerescue';

function logCustomerTracking(
  event: string,
  details: Record<string, string | number | boolean | null | undefined> = {},
): void {
  logTrackingDiagnostic(event, {
    surface: 'customer_tracking',
    ...details,
  });
}

function timestampMs(value: string | null | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function isIosMobileBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator;
  const ua = nav.userAgent || '';
  const isiOS = /iPhone|iPad|iPod/i.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((nav as Navigator & { standalone?: boolean }).standalone);
  return isiOS && !standalone;
}

function promptDismissedRecently(): boolean {
  try {
    const raw = window.localStorage.getItem(APP_PROMPT_DISMISSED_KEY);
    const dismissedAt = raw ? Number(raw) : 0;
    return Number.isFinite(dismissedAt) && dismissedAt > 0 && Date.now() - dismissedAt < APP_PROMPT_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function rememberPromptDismissed(): void {
  try {
    window.localStorage.setItem(APP_PROMPT_DISMISSED_KEY, String(Date.now()));
  } catch {
    // Browser tracking must keep working even when storage is blocked.
  }
}

function shouldForceAppPromptForLocalTesting(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const url = new URL(window.location.href);
    const forced = url.searchParams.get('debugAppPrompt') === '1';
    if (forced) window.localStorage.removeItem(APP_PROMPT_DISMISSED_KEY);
    return forced;
  } catch {
    return false;
  }
}

function formatExactLastUpdate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function CustomerTrackingClient({ token }: Props) {
  const [data, setData] = useState<CustomerTrackingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [routeMode, setRouteMode] = useState<TrackingRouteMode>('none');
  const [isOffline, setIsOffline] = useState(false);
  const [lastFetchFailed, setLastFetchFailed] = useState(false);
  const [showAppPrompt, setShowAppPrompt] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const mountedRef = useRef(true);
  const appFallbackTimerRef = useRef<number | null>(null);
  const initialFetchLoggedRef = useRef(false);
  const staleStateRef = useRef<TrackingConnectionState | null>(null);

  const fetchData = useCallback(async (reason: FetchReason = 'polling'): Promise<boolean> => {
    const resultEvent = reason === 'initial' ? 'initial_fetch_result' : 'polling_result';
    if (reason === 'initial') {
      logCustomerTracking('initial_fetch_started');
    }

    try {
      const res = await fetch(`/api/tracking/customer/${token}`, { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to load tracking');
      }
      const json: CustomerTrackingResponse = await res.json();
      if (!mountedRef.current) return false;
      logCustomerTracking(resultEvent, {
        trigger: reason,
        result: 'success',
        httpStatus: res.status,
        jobId: json.refNumber,
        serverTimestamp: json.state.lastUpdatedAt,
      });
      setData((prev) => {
        if (!prev) return json;
        const prevMs = timestampMs(prev.state.lastUpdatedAt);
        const nextMs = timestampMs(json.state.lastUpdatedAt);
        if (prevMs > 0 && nextMs > 0 && nextMs < prevMs) {
          return {
            ...json,
            state: {
              ...json.state,
              driverLat: prev.state.driverLat,
              driverLng: prev.state.driverLng,
              accuracyMeters: prev.state.accuracyMeters,
              headingDegrees: prev.state.headingDegrees,
              speedMetersPerSecond: prev.state.speedMetersPerSecond,
              lastUpdatedAt: prev.state.lastUpdatedAt,
            },
          };
        }
        return json;
      });
      setError(null);
      setLastFetchFailed(false);
      return json.state.status !== 'completed' && json.state.status !== 'expired';
    } catch (err) {
      if (!mountedRef.current) return false;
      logCustomerTracking(resultEvent, {
        trigger: reason,
        result: 'failed',
      });
      setError(err instanceof Error ? err.message : 'Failed to load tracking');
      setLastFetchFailed(true);
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
      logCustomerTracking('polling_started', { intervalMs: POLL_MS });
      timer = setInterval(async () => {
        const keep = await fetchData('polling');
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
        logCustomerTracking('visibility_refetch', { hidden: false });
        void fetchData('visibility').then((keep) => {
          if (keep) start();
          else stopped = true;
        });
      }
    };

    if (!initialFetchLoggedRef.current) {
      logCustomerTracking('realtime_connected', { result: 'not_configured' });
      logCustomerTracking('realtime_disconnected', { reason: 'not_configured' });
      initialFetchLoggedRef.current = true;
    }

    void fetchData('initial').then((keep) => {
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

  useEffect(() => {
    const syncOnlineState = () => setIsOffline(!window.navigator.onLine);
    const handleOnline = () => {
      setIsOffline(false);
      logCustomerTracking('network_recovery_refetch');
      void fetchData('network_recovery');
    };
    const handleOffline = () => setIsOffline(true);

    syncOnlineState();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchData]);

  useEffect(() => {
    if (!data || showAppPrompt) return;
    const forced = shouldForceAppPromptForLocalTesting();
    if (!forced && (!isIosMobileBrowser() || promptDismissedRecently())) return;

    const timer = window.setTimeout(() => {
      if (!document.hidden) setShowAppPrompt(true);
    }, APP_PROMPT_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [data, showAppPrompt]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!showAppPrompt) return;
    document.body.dataset.customerInstallPromptOpen = 'true';
    return () => {
      delete document.body.dataset.customerInstallPromptOpen;
    };
  }, [showAppPrompt]);

  useEffect(
    () => () => {
      if (appFallbackTimerRef.current) clearTimeout(appFallbackTimerRef.current);
    },
    [],
  );

  const derivedStatus: TrackingStatus | null = useMemo(() => {
    if (!data) return null;
    const raw = data.state.status;
    // If the driver's last GPS ping is older than the staleness threshold
    // (currently 3 minutes), present the trip as "paused" so the customer gets
    // a clear "Tracking paused" hint instead of a frozen pin. The trip
    // itself is still in progress server-side — only the UI label flips.
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

  // Track whether the driver is getting closer between ticks. We compare
  // the latest distance against the previous one in a ref so the badge
  // only shows when the trip is in_progress and the distance dropped by
  // a meaningful amount (≥ 30m, ~0.02 miles) to avoid GPS jitter flicker.
  const prevDistanceRef = useRef<number | null>(null);
  const [closerSince, setCloserSince] = useState<number | null>(null);
  useEffect(() => {
    if (distanceMiles == null) return;
    const prev = prevDistanceRef.current;
    if (prev != null && prev - distanceMiles > 0.02) {
      setCloserSince(Date.now());
    }
    prevDistanceRef.current = distanceMiles;
  }, [distanceMiles]);
  // Auto-hide the "getting closer" badge after 8s of no improvement.
  const liveNow = Date.now();
  const showGettingCloser =
    closerSince != null && liveNow - closerSince < 8_000 && derivedStatus === 'in_progress';

  // Human-friendly headline + body shown inside the status banner.
  const humanCopy = useMemo(() => {
    if (!derivedStatus) return { title: undefined, body: undefined };
    if (derivedStatus === 'pending') {
      return {
        title: 'Waiting for driver to start',
        body: 'You will see the live location the moment the driver sets off.',
      };
    }
    if (derivedStatus === 'completed') {
      return {
        title: 'Job completed',
        body: 'The driver has finished the job. Thank you for choosing Tyre Rescue.',
      };
    }
    if (derivedStatus === 'expired') {
      return { title: 'Tracking link expired', body: 'This tracking link is no longer active.' };
    }
    if (derivedStatus === 'paused') {
      return {
        title: 'Tracking paused',
        body: 'Driver location has not updated recently. We will resume as soon as the signal returns.',
      };
    }
    // in_progress
    if (distanceMiles != null && distanceMiles < NEARBY_MILES) {
      return {
        title: 'Driver is nearby',
        body: 'The driver is almost at your location — please keep an eye out for the van.',
      };
    }
    return {
      title: 'Driver is on the way',
      body: 'Live location updates every few seconds.',
    };
  }, [derivedStatus, distanceMiles]);

  const health: TrackingHealth = useMemo(() => {
    if (!data || !derivedStatus) return 'idle';
    return getTrackingHealth(data.state.lastUpdatedAt, {
      isCompleted: derivedStatus === 'completed',
      isActive: derivedStatus === 'in_progress' || derivedStatus === 'paused',
    });
  }, [data, derivedStatus]);

  const connectionState = useMemo<TrackingConnectionState>(() => {
    const realtimeConnected: boolean = false;
    if (!data || !derivedStatus) return 'unavailable';
    if (derivedStatus === 'completed' || derivedStatus === 'expired') return 'completed';
    if (isOffline || lastFetchFailed) return 'offline';
    if (!driverPoint || !data.state.lastUpdatedAt) return 'unavailable';
    if (derivedStatus === 'paused' || health === 'weak' || health === 'lost') return 'delayed';
    if (realtimeConnected && health === 'good') return 'live';
    return 'polling';
  }, [data, derivedStatus, driverPoint, health, isOffline, lastFetchFailed]);

  useEffect(() => {
    if (!data) return;
    if (staleStateRef.current === connectionState) return;
    staleStateRef.current = connectionState;
    logCustomerTracking('stale_state_changed', {
      jobId: data.refNumber,
      state: connectionState,
      serverTimestamp: data.state.lastUpdatedAt,
    });
  }, [connectionState, data]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3 text-zinc-400">
          <div className="h-10 w-10 animate-pulse rounded-full border-2 border-orange-500/30 border-t-orange-500" />
          <p className="text-sm">Loading live map...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-center">
        <div className="max-w-md">
          <h1 className="mb-3 text-2xl font-bold text-white">Tracking link not available</h1>
          <p className="mb-6 text-zinc-400">{error}</p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-orange-500 px-6 py-3 font-medium text-white"
          >
            Return to homepage
          </Link>
        </div>
      </div>
    );
  }

  if (!data || !derivedStatus) return null;

  const distanceLabel =
    derivedStatus === 'in_progress' || derivedStatus === 'paused'
      ? formatDistanceMiles(distanceMiles)
      : null;

  const locationDelayed = connectionState === 'delayed';
  const connectionLabel =
    connectionState === 'offline'
      ? 'Temporarily offline'
      : connectionState === 'delayed'
        ? 'Location delayed'
        : connectionState === 'polling'
          ? 'Polling'
          : connectionState === 'unavailable'
            ? 'Location unavailable'
            : connectionState === 'completed'
              ? 'Completed'
              : 'Live';
  const lastExactUpdate = formatExactLastUpdate(data.state.lastUpdatedAt);
  const liveBanner = connectionState === 'live';

  const webTrackingLink = `/track/customer/${encodeURIComponent(token)}`;
  const appDeepLink = data.refNumber
    ? `${CUSTOMER_APP_SCHEME}://track?ref=${encodeURIComponent(data.refNumber)}`
    : webTrackingLink;

  const closeAppPrompt = () => {
    setShowAppPrompt(false);
    rememberPromptDismissed();
  };

  const openCustomerApp = () => {
    closeAppPrompt();
    let opened = false;
    const cancelFallback = () => {
      opened = true;
      if (appFallbackTimerRef.current) {
        clearTimeout(appFallbackTimerRef.current);
        appFallbackTimerRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    const handleVisibility = () => {
      if (document.hidden) cancelFallback();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.location.href = appDeepLink;
    appFallbackTimerRef.current = window.setTimeout(() => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (!opened && !document.hidden) {
        window.location.href = CUSTOMER_APP_STORE_URL;
      }
    }, 1_250);
  };

  const downloadCustomerApp = () => {
    closeAppPrompt();
    window.location.href = CUSTOMER_APP_STORE_URL;
  };

  const appPromptPortal =
    showAppPrompt && portalReady
      ? createPortal(
          <div
            className="fixed inset-0 overflow-y-auto bg-black/60 px-3 py-4 backdrop-blur-sm sm:px-4"
            style={{
              zIndex: 60,
              paddingTop: 'max(env(safe-area-inset-top), 1rem)',
              paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)',
            }}
            role="presentation"
            onClick={closeAppPrompt}
          >
            <div className="flex min-h-full items-end justify-center sm:items-center">
              <div
                className="w-full max-w-md rounded-2xl border border-orange-400/30 bg-zinc-950 p-4 shadow-2xl shadow-black/60"
                role="dialog"
                aria-modal="true"
                aria-label="Track your driver in the app"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start gap-3">
                  <Image
                    src="/apple-icon.png"
                    alt=""
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-xl bg-white object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="pr-8 text-base font-semibold text-white">
                      Track your driver in the app
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-300">
                      Get faster live updates and booking notifications.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeAppPrompt}
                    className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-800 text-lg leading-none text-zinc-300"
                    aria-label="Close app prompt"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                  <button
                    type="button"
                    onClick={openCustomerApp}
                    className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-orange-950/30"
                  >
                    Open App
                  </button>
                  <button
                    type="button"
                    onClick={downloadCustomerApp}
                    className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold text-zinc-100"
                  >
                    Download App
                  </button>
                </div>
                <button
                  type="button"
                  onClick={closeAppPrompt}
                  className="mt-2 w-full rounded-xl px-4 py-2 text-xs font-semibold text-zinc-400"
                >
                  Continue in browser
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
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
          title={locationDelayed && derivedStatus === 'in_progress' ? 'Location delayed' : humanCopy.title}
          body={
            locationDelayed && derivedStatus === 'in_progress'
              ? 'We are still showing the last confirmed driver position and will update it as soon as a fresh signal arrives.'
              : humanCopy.body
          }
          distanceLabel={distanceLabel}
          lastUpdatedAt={derivedStatus !== 'pending' ? data.state.lastUpdatedAt : null}
          isLive={liveBanner}
          connectionLabel={connectionLabel}
        />

        {lastExactUpdate && derivedStatus !== 'pending' && (
          <p className="-mt-2 px-1 text-xs text-zinc-500">
            Last successful server update: {lastExactUpdate}
          </p>
        )}

        {showGettingCloser && health === 'good' && (
          <p className="-mt-2 px-1 text-center text-xs font-medium text-emerald-300">
            Driver is getting closer
          </p>
        )}

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
      {appPromptPortal}
    </>
  );
}
