import { useLayoutEffect, useRef } from 'react';

/**
 * A ref that always holds the latest `value`, for callbacks and effects that
 * must read current props without re-subscribing.
 *
 * It is synced in a layout effect rather than during render (writing refs
 * during render breaks React's rendering rules). Layout effects run after
 * commit and before any passive effect or user event, so effects and
 * handlers still observe the value from the latest render.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
