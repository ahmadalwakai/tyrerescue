import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

export interface PollingOptions {
  enabled: boolean;
  intervalMs: number;
  /**
   * Restarts polling and aborts the request in flight when it changes, so a
   * late response for the previous key (project, booking…) is never applied.
   */
  key?: string | number | null;
  /** Native only: skip ticks while the app is not active. Default true. */
  pauseInBackground?: boolean;
  /**
   * Run as soon as polling (re)starts. Default true; set false when the
   * caller already loads on the same change and only needs the interval.
   */
  immediate?: boolean;
}

function isActive(state: AppStateStatus): boolean {
  return state === 'active';
}

/**
 * Runs `task` now and then every `intervalMs` while enabled.
 *
 * - Never overlaps: a tick is skipped while the previous run is in flight.
 * - Each run gets an AbortSignal that aborts on disable, unmount, key change
 *   or a manual refresh; tasks must pass it to requests and must not set
 *   state once it has aborted.
 * - On native, ticks pause in the background and a run fires on return to
 *   the foreground.
 *
 * Returns `refresh()`, which aborts any run in flight and starts a new one.
 */
export function usePolling(
  task: (signal: AbortSignal) => Promise<void>,
  { enabled, intervalMs, key = null, pauseInBackground = true, immediate = true }: PollingOptions,
): () => Promise<void> {
  const taskRef = useRef(task);
  const inFlightRef = useRef<AbortController | null>(null);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  const run = useCallback(async (force: boolean) => {
    if (!enabledRef.current) return;
    if (inFlightRef.current) {
      if (!force) return;
      inFlightRef.current.abort();
    }
    const controller = new AbortController();
    inFlightRef.current = controller;
    try {
      await taskRef.current(controller.signal);
    } finally {
      if (inFlightRef.current === controller) inFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) return undefined;

    const shouldTick = () =>
      Platform.OS === 'web' || !pauseInBackground || isActive(AppState.currentState);

    if (immediate) void run(true);
    const timer = setInterval(() => {
      if (shouldTick()) void run(false);
    }, intervalMs);
    const subscription = pauseInBackground && Platform.OS !== 'web'
      ? AppState.addEventListener('change', (state) => {
          if (isActive(state)) void run(false);
        })
      : null;

    return () => {
      enabledRef.current = false;
      clearInterval(timer);
      subscription?.remove();
      inFlightRef.current?.abort();
      inFlightRef.current = null;
    };
  }, [enabled, intervalMs, key, pauseInBackground, immediate, run]);

  return useCallback(() => run(true), [run]);
}
