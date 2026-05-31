import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Guards an async (or sync) action against double-execution.
 *
 * Why this exists: on Android a fast double-tap fires `onPress` twice before
 * React has a chance to flush the `disabled`/loading state, so a state-only
 * guard (`if (loading) return`) still lets the second tap through. This hook
 * uses a synchronous `useRef` flag that flips on the very first tap, so the
 * second tap in the same gesture is dropped immediately — no duplicate API
 * call, no duplicate navigation, no duplicate toast.
 *
 * Behaviour:
 * - `run(...)` refuses to start while a previous call is still in flight and
 *   resolves to `undefined` in that case.
 * - The in-flight flag and `isRunning` state are always reset in `finally`,
 *   so a failed request never traps the user permanently.
 * - Errors are re-thrown so existing try/catch and error UI keep working.
 * - State updates are skipped after unmount to avoid the "update on unmounted
 *   component" warning when an action navigates away mid-flight.
 *
 * @param fn The action to guard. May be synchronous or return a Promise.
 * @returns `isRunning` (for disabling/loading UI) and `run` (the guarded call).
 */
export function useSingleFlight<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult | Promise<TResult>,
): {
  isRunning: boolean;
  run: (...args: TArgs) => Promise<TResult | undefined>;
} {
  const [isRunning, setIsRunning] = useState(false);
  // Synchronous re-entrancy lock — flips before React re-renders, so it blocks
  // the second tap of a double-tap that `isRunning` would miss.
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  // Always call the latest `fn` without forcing `run` to change identity.
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async (...args: TArgs): Promise<TResult | undefined> => {
    if (inFlightRef.current) return undefined;
    inFlightRef.current = true;
    if (mountedRef.current) setIsRunning(true);
    try {
      // `await` handles both sync and async `fn` transparently.
      return await fnRef.current(...args);
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setIsRunning(false);
    }
  }, []);

  return { isRunning, run };
}
