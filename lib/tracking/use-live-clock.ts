'use client';

import { useEffect, useState } from 'react';

/**
 * Re-renders the consuming component every `intervalMs` (default 1s) so
 * the "Last update: X seconds ago" label can tick forward without any
 * extra network polling. Pauses automatically when the tab is hidden to
 * avoid wasted re-renders.
 */
export function useLiveClock(intervalMs: number = 1_000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer != null) return;
      timer = setInterval(() => setNow(Date.now()), intervalMs);
    };
    const stop = () => {
      if (timer != null) clearInterval(timer);
      timer = null;
    };
    start();
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        setNow(Date.now());
        start();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
  return now;
}
