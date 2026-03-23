import { useEffect, useRef, useCallback, useState } from 'react';
import * as Location from 'expo-location';
import { AppState, type AppStateStatus } from 'react-native';
import { driverApi } from '@/api/client';
import {
  startBackgroundLocation,
  stopBackgroundLocation,
  requestLocationPermissions,
} from '@/services/background-location';

const ACTIVE_INTERVAL = 15_000; // 15s when job active (foreground)
const IDLE_INTERVAL = 60_000; // 60s when idle (foreground)

export function useLocationBroadcast(isOnline: boolean, hasActiveJob: boolean) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const [bgRunning, setBgRunning] = useState(false);

  const sendForegroundLocation = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await driverApi.updateLocation(loc.coords.latitude, loc.coords.longitude);
    } catch {
      // Silently ignore — network or permission errors
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
