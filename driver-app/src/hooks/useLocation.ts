import { useEffect, useRef, useCallback, useState } from 'react';
import * as Location from 'expo-location';
import { AppState, type AppStateStatus } from 'react-native';
import {
  ACTIVE_BOOKING_REF_KEY,
  sendDriverLocationSample,
  startBackgroundLocation,
  setOnlineLocationTracking,
  requestLocationPermissions,
} from '@/services/background-location';
import { getOnlineLocationRevision, isOnlineLocationEnabled } from '@/services/online-location-state';
import * as secureStorage from '@/services/secure-storage';

// Native background delivery is OS-controlled. These foreground heartbeats
// provide genuine samples even while an Online driver is stationary/unassigned.
const ACTIVE_INTERVAL = 10_000;
const IDLE_INTERVAL = 20_000;
const MIN_INTERVAL_MS = 9_000; // Server minimum is 8 seconds.

export function useLocationBroadcast(
  isOnline: boolean,
  hasActiveJob: boolean,
  activeBookingRef?: string | null,
  statusResolved = true,
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const activeRefRef = useRef<string | null>(activeBookingRef ?? null);
  const onlineRef = useRef(isOnline);
  onlineRef.current = isOnline && statusResolved;
  const inFlightRef = useRef(false);
  const lastSentAtRef = useRef(0);
  const [bgRunning, setBgRunning] = useState(false);

  useEffect(() => {
    activeRefRef.current = activeBookingRef ?? null;
    if (!statusResolved) return;
    if (isOnline && activeBookingRef) {
      secureStorage.setItemAsync(ACTIVE_BOOKING_REF_KEY, activeBookingRef).catch(() => {});
    } else {
      secureStorage.deleteItemAsync(ACTIVE_BOOKING_REF_KEY).catch(() => {});
    }
  }, [activeBookingRef, isOnline, statusResolved]);

  const sendForegroundLocation = useCallback(async () => {
    if (!onlineRef.current || appStateRef.current !== 'active' || inFlightRef.current) return;
    if (lastSentAtRef.current && Date.now() - lastSentAtRef.current < MIN_INTERVAL_MS) return;
    const revision = getOnlineLocationRevision();
    inFlightRef.current = true;
    try {
      if (!(await isOnlineLocationEnabled())) return;
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' || !onlineRef.current) return;
      const location = await Location.getCurrentPositionAsync({
        accuracy: hasActiveJob ? Location.Accuracy.BestForNavigation : Location.Accuracy.High,
      });
      // Going Offline/logging out while GPS resolves invalidates this sample.
      if (!onlineRef.current || revision !== getOnlineLocationRevision() ||
          appStateRef.current !== 'active') return;
      if (await sendDriverLocationSample(location, activeRefRef.current, 'foreground')) {
        lastSentAtRef.current = Date.now();
      }
    } catch {
      // Permission/GPS failures are not evidence of a stationary driver.
    } finally {
      inFlightRef.current = false;
    }
  }, [hasActiveJob]);

  const stopForegroundPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const startForegroundPolling = useCallback(() => {
    stopForegroundPolling();
    if (!onlineRef.current || appStateRef.current !== 'active') return;
    void sendForegroundLocation();
    intervalRef.current = setInterval(sendForegroundLocation,
      hasActiveJob ? ACTIVE_INTERVAL : IDLE_INTERVAL);
  }, [hasActiveJob, sendForegroundLocation, stopForegroundPolling]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      appStateRef.current = nextState;
      stopForegroundPolling();
      if (!onlineRef.current) return;
      void startBackgroundLocation().then((started) => {
        if (onlineRef.current) setBgRunning(started);
      });
      if (nextState === 'active') startForegroundPolling();
    });
    return () => sub.remove();
  }, [startForegroundPolling, stopForegroundPolling]);

  useEffect(() => {
    let cancelled = false;
    stopForegroundPolling();
    // Cold launch/profile network failure is not an explicit Offline choice.
    // Leave the already registered native task and persisted consent intact.
    if (!statusResolved) return;
    if (!isOnline) {
      lastSentAtRef.current = 0;
      setBgRunning(false);
    }
    void setOnlineLocationTracking(isOnline).then((started) => {
      if (cancelled) return;
      setBgRunning(started);
      if (isOnline) startForegroundPolling();
    });
    return () => {
      cancelled = true;
      stopForegroundPolling();
    };
  }, [isOnline, statusResolved, startForegroundPolling, stopForegroundPolling]);

  return { requestPermission: requestLocationPermissions, bgRunning };
}
