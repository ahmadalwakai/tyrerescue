import { useEffect, useRef, useCallback, useState } from 'react';
import * as Location from 'expo-location';
import { AppState, type AppStateStatus } from 'react-native';
import { driverApi, ApiError } from '@/api/client';
import {
  ACTIVE_BOOKING_REF_KEY,
  startBackgroundLocation,
  stopBackgroundLocation,
  requestLocationPermissions,
} from '@/services/background-location';
import { dropQueued, enqueueLatest, flushOfflineQueue } from '@/services/offline-queue';
import * as secureStorage from '@/services/secure-storage';

// ── Throttling constants ─────────────────────────────────────────────────
// Server enforces a hard 8s min between writes per driver. Stay above.
const ACTIVE_INTERVAL = 10_000; // foreground heartbeat while a job is active
const IDLE_INTERVAL = 45_000;   // foreground heartbeat while waiting for jobs
const MIN_INTERVAL_MS = 9_000;  // server enforces 8s; keep just above it
const MIN_MOVEMENT_METERS = 10;
const MAX_QUIET_MS = 30_000;    // force a heartbeat at least this often
const DEFAULT_BACKOFF_MS = 30_000;
const LOCATION_PATH = '/api/driver/location';

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
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

function locationBody(lat: number, lng: number, bookingRef: string | null) {
  return bookingRef ? { lat, lng, bookingRef } : { lat, lng };
}

function shouldQueueLocation(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.code === 'network' || error.status === 0 || error.status >= 500;
  }
  return true;
}

export function useLocationBroadcast(
  isOnline: boolean,
  hasActiveJob: boolean,
  activeBookingRef?: string | null,
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const activeRefRef = useRef<string | null>(activeBookingRef ?? null);
  const inFlightRef = useRef<boolean>(false);
  const lastSentAtRef = useRef<number>(0);
  const lastSentCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const backoffUntilRef = useRef<number>(0);
  const [bgRunning, setBgRunning] = useState(false);

  // Keep ref in sync without re-creating the polling interval on every change.
  useEffect(() => {
    activeRefRef.current = activeBookingRef ?? null;
    if (activeBookingRef) {
      secureStorage.setItemAsync(ACTIVE_BOOKING_REF_KEY, activeBookingRef).catch(() => {});
    } else if (!hasActiveJob) {
      secureStorage.deleteItemAsync(ACTIVE_BOOKING_REF_KEY).catch(() => {});
    }
  }, [activeBookingRef, hasActiveJob]);

  const sendForegroundLocation = useCallback(async () => {
    const now = Date.now();
    if (now < backoffUntilRef.current) return;
    if (inFlightRef.current) return;

    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({
        accuracy: hasActiveJob ? Location.Accuracy.BestForNavigation : Location.Accuracy.High,
      });

      const coords = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      };

      const last = lastSentCoordsRef.current;
      const sinceLast = Date.now() - lastSentAtRef.current;

      if (lastSentAtRef.current && sinceLast < MIN_INTERVAL_MS) return;

      if (
        last &&
        sinceLast < MAX_QUIET_MS &&
        distanceMeters(last, coords) < MIN_MOVEMENT_METERS
      ) {
        return;
      }

      inFlightRef.current = true;
      try {
        await driverApi.updateLocation(coords.lat, coords.lng, activeRefRef.current);
        dropQueued(LOCATION_PATH, 'POST');
        void flushOfflineQueue();
        lastSentAtRef.current = Date.now();
        lastSentCoordsRef.current = coords;
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          const seconds = err.retryAfterSeconds ?? DEFAULT_BACKOFF_MS / 1000;
          backoffUntilRef.current = Date.now() + seconds * 1000;
          return;
        }
        if (shouldQueueLocation(err)) {
          enqueueLatest(
            LOCATION_PATH,
            'POST',
            locationBody(coords.lat, coords.lng, activeRefRef.current),
          );
          lastSentAtRef.current = Date.now();
          lastSentCoordsRef.current = coords;
        }
      } finally {
        inFlightRef.current = false;
      }
    } catch {
      // Silently ignore — permission / GPS errors
    }
  }, [hasActiveJob]);

  // Start/stop foreground polling
  const startForegroundPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    sendForegroundLocation();
    const interval = hasActiveJob ? ACTIVE_INTERVAL : IDLE_INTERVAL;
    intervalRef.current = setInterval(sendForegroundLocation, interval);
  }, [hasActiveJob, sendForegroundLocation]);

  const stopForegroundPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Handle app state changes (foreground <-> background)
  useEffect(() => {
    if (!isOnline) return;

    const handleAppState = async (nextState: AppStateStatus) => {
      const wasActive = appStateRef.current === 'active';
      const isActive = nextState === 'active';
      appStateRef.current = nextState;

      if (wasActive && !isActive) {
        // App going to background — keep the native foreground service alive.
        stopForegroundPolling();
        const started = await startBackgroundLocation();
        setBgRunning(started);
      } else if (!wasActive && isActive) {
        // App returning to foreground — keep background tracking armed and add
        // a foreground heartbeat for web/dev and faster first updates.
        const started = await startBackgroundLocation();
        setBgRunning(started);
        startForegroundPolling();
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [isOnline, startForegroundPolling, stopForegroundPolling]);

  // Main online/offline effect
  useEffect(() => {
    if (!isOnline) {
      stopForegroundPolling();
      stopBackgroundLocation().then(() => setBgRunning(false));
      // Reset throttle state so first POST after coming back online is fresh.
      lastSentAtRef.current = 0;
      lastSentCoordsRef.current = null;
      backoffUntilRef.current = 0;
      return;
    }

    startBackgroundLocation().then((started) => setBgRunning(started));

    if (appStateRef.current === 'active') {
      startForegroundPolling();
    } else {
      stopForegroundPolling();
    }

    return () => {
      stopForegroundPolling();
    };
  }, [isOnline, startForegroundPolling, stopForegroundPolling]);

  return { requestPermission: requestLocationPermissions, bgRunning };
}
