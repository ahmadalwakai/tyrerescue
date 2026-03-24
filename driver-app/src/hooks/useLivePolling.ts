import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

const DEFAULT_INTERVAL = 12_000; // 12 seconds

/**
 * Lightweight foreground polling hook.
 * Polls while the screen is focused AND app is active.
 * Stops when screen blurs or app backgrounds.
 */
export function useLivePolling(
  callback: () => Promise<void> | void,
  enabled: boolean,
  interval = DEFAULT_INTERVAL,
) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const focusedRef = useRef(false);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const start = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      callbackRef.current();
    }, interval);
  }, [interval]);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Start/stop based on screen focus
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      if (enabled && AppState.currentState === 'active') {
        start();
      }
      return () => {
        focusedRef.current = false;
        stop();
      };
    }, [enabled, start, stop]),
  );

  // Pause when app backgrounds, resume when foregrounded
  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && focusedRef.current && enabled) {
        callbackRef.current(); // immediate refresh on resume
        start();
      } else {
        stop();
      }
    });

    return () => {
      sub.remove();
      stop();
    };
  }, [enabled, start, stop]);
}
