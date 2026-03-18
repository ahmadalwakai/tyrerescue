import { useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import { driverApi } from '@/api/client';

const ACTIVE_INTERVAL = 30_000; // 30s when job active
const IDLE_INTERVAL = 60_000; // 60s when idle

export function useLocationBroadcast(isOnline: boolean, hasActiveJob: boolean) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendLocation = useCallback(async () => {
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

  useEffect(() => {
    if (!isOnline) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Send immediately on becoming online
    sendLocation();

    const interval = hasActiveJob ? ACTIVE_INTERVAL : IDLE_INTERVAL;
    intervalRef.current = setInterval(sendLocation, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isOnline, hasActiveJob, sendLocation]);

  return { requestPermission };
}

async function requestPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}
