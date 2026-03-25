import { playSound } from '@/services/sound';

/**
 * Central new-job alert tracker.
 *
 * Keeps a module-level Set of job refs that have already been alerted
 * in this app session. Both push-based and polling-based paths converge
 * here so each job only alerts once.
 */

const alertedRefs = new Set<string>();

/** Mark a ref as already alerted (e.g. from push handler). */
export function markAlerted(ref: string) {
  alertedRefs.add(ref);
}

/** Check if a ref has already been alerted. */
export function isAlerted(ref: string): boolean {
  return alertedRefs.has(ref);
}

/**
 * Given the previous set of known refs and the current jobs array,
 * return refs that are truly new (not previously known AND not already alerted).
 */
export function detectNewRefs(
  knownRefs: Set<string>,
  currentRefs: string[],
): string[] {
  // On first load (knownRefs is empty), mark all current refs as known
  // but don't alert — they're pre-existing jobs, not freshly assigned.
  if (knownRefs.size === 0) return [];

  return currentRefs.filter(
    (ref) => !knownRefs.has(ref) && !alertedRefs.has(ref),
  );
}

/**
 * Fire the full alert: sound + vibration.
 * Vibration is handled inside playSound() when vibrationEnabled is true in config.
 * The popup is triggered separately by the caller via showJobAlert().
 */
export function fireNewJobAlert() {
  playSound('new_job');
}
