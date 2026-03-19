import { useState, useEffect, useCallback, useRef } from 'react';

interface UseAutoplaySlidesOptions {
  /** Total number of slides */
  count: number;
  /** Interval in ms between slides. Default: 5000 */
  interval?: number;
  /** Start paused. Default: false */
  startPaused?: boolean;
}

/**
 * Lightweight hook for autoplay slide cycling with:
 *  - pause/resume via hover
 *  - manual go-to that resets the timer
 *  - cleanup on unmount (no memory leaks)
 *  - prefers-reduced-motion: pauses autoplay
 */
export function useAutoplaySlides({ count, interval = 5000, startPaused = false }: UseAutoplaySlidesOptions) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(startPaused);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reducedMotion = useRef(false);

  // Detect prefers-reduced-motion once on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  }, []);

  // Auto-advance
  useEffect(() => {
    if (paused || reducedMotion.current || count <= 1) return;
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % count);
    }, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [paused, count, interval]);

  const goTo = useCallback(
    (index: number) => {
      setActiveIndex(index);
      // Reset timer so the new slide stays visible for the full interval
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (!paused && !reducedMotion.current && count > 1) {
        timerRef.current = setInterval(() => {
          setActiveIndex((prev) => (prev + 1) % count);
        }, interval);
      }
    },
    [paused, count, interval],
  );

  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);

  return { activeIndex, goTo, pause, resume, paused } as const;
}
