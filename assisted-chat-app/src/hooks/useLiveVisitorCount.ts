import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { api } from '@/lib/api';

const POLL_INTERVAL_MS = 8_000;

export interface LiveVisitorCountSnapshot {
  liveCount: number;
  activeWindowSeconds: number;
  updatedAt: string;
  source: 'site_visitors';
}

export interface LiveVisitorCountState {
  liveCount: number | null;
  activeWindowSeconds: number | null;
  updatedAt: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function isForegroundState(state: AppStateStatus): boolean {
  return state === 'active';
}

export function useLiveVisitorCount(enabled: boolean): LiveVisitorCountState {
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [activeWindowSeconds, setActiveWindowSeconds] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasLoadedRef = useRef(false);
  const enabledRef = useRef(enabled);
  const inFlightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      inFlightRef.current?.abort();
      hasLoadedRef.current = false;
    }
  }, [enabled]);

  const refresh = useCallback(async () => {
    if (!enabledRef.current) return;

    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    if (!hasLoadedRef.current) setLoading(true);

    try {
      const snapshot = await api.get<LiveVisitorCountSnapshot>(
        '/api/mobile/admin/visitors/live-count',
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setLiveCount(Math.max(0, Number(snapshot.liveCount) || 0));
      setActiveWindowSeconds(Math.max(1, Number(snapshot.activeWindowSeconds) || 60));
      setUpdatedAt(snapshot.updatedAt || new Date().toISOString());
      setError(null);
      hasLoadedRef.current = true;
    } catch {
      if (controller.signal.aborted) return;
      setError('Failed to load live visitors');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (inFlightRef.current === controller) inFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const initialTimer = setTimeout(() => {
      void refresh();
    }, 0);
    const timer = setInterval(() => {
      if (Platform.OS === 'web' || isForegroundState(AppState.currentState)) {
        void refresh();
      }
    }, POLL_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (state) => {
      if (isForegroundState(state)) void refresh();
    });

    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
      subscription.remove();
      inFlightRef.current?.abort();
    };
  }, [enabled, refresh]);

  if (!enabled) {
    return {
      liveCount: null,
      activeWindowSeconds: null,
      updatedAt: null,
      loading: false,
      error: null,
      refresh,
    };
  }

  return {
    liveCount,
    activeWindowSeconds,
    updatedAt,
    loading,
    error,
    refresh,
  };
}
