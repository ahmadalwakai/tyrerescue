import { useEffect, useRef, useCallback, useState } from 'react';
import * as Location from 'expo-location';
import { AppState, type AppStateStatus } from 'react-native';
import { driverApi, ApiError } from '@/api/client';
import {
  startBackgroundLocation,
  stopBackgroundLocation,
  requestLocationPermissions,
} from '@/services/background-location';

// ── Throttling constants ─────────────────────────────────────────────────
// Server enforces a hard 8s min between writes per driver. Stay above.
const ACTIVE_INTERVAL = 15_000; // 15s when job active (foreground)
const IDLE_INTERVAL = 60_000;   // 60s when idle (foreground)
const MIN_INTERVAL_MS = 10_000; // never POST faster than this
const MIN_MOVEMENT_METERS = 25;
const MAX_QUIET_MS = 60_000;    // force a heartbeat at least this often
const DEFAULT_BACKOFF_MS = 30_000;

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
  }, [activeBookingRef]);

  const sendForegroundLocation = useCallback(async () => {
    const now = Date.now();
    if (now < backoffUntilRef.current) return;
    if (inFlightRef.current) return;

    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
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
        lastSentAtRef.current = Date.now();
        lastSentCoordsRef.current = coords;
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          const seconds = err.retryAfterSeconds ?? DEFAULT_BACKOFF_MS / 1000;
          backoffUntilRef.current = Date.now() + seconds * 1000;
          return;
        }
        // Other errors silently ignored — network/permission flakes
      } finally {
        inFlightRef.current = false;
      }
    } catch {
      // Silently ignore — permission / GPS errors
    }
  }, []);

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
        // App going to background — start background location, stop foreground polling
        stopForegroundPolling();
        const started = await startBackgroundLocation();
        setBgRunning(started);
      } else if (!wasActive && isActive) {
        // App returning to foreground — stop background, start foreground polling
        await stopBackgroundLocation();
        setBgRunning(false);
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

    // If app is in foreground, start foreground polling
    if (appStateRef.current === 'active') {
      startForegroundPolling();
    } else {
      // App is already backgrounded when going online
      startBackgroundLocation().then((started) => setBgRunning(started));
    }

    return () => {
      stopForegroundPolling();
    };
  }, [isOnline, startForegroundPolling, stopForegroundPolling]);

  return { requestPermission: requestLocationPermissions, bgRunning };
}
