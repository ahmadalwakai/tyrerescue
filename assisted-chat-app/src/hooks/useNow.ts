import { useEffect, useState } from 'react';

/**
 * The current time, refreshed every `intervalMs` while `enabled`.
 *
 * Use it for time-relative labels ("stale", "x minutes ago") instead of
 * calling Date.now() during render, which only updates when something else
 * happens to re-render the component.
 */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs]);
  return now;
}
