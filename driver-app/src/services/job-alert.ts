import { playSound, type SoundEvent } from '@/services/sound';

/**
 * Central job alert tracker.
 *
 * Keeps a module-level Set of job refs that have already been alerted
 * in this app session. Both push-based and polling-based paths converge
 * here so each job only alerts once per event type.
 */

/** Key format: `${ref}:${eventType}` to allow different alerts for the same ref. */
const alertedKeys = new Set<string>();

function alertKey(ref: string, eventType: string): string {
  return `${ref}:${eventType}`;
}

/** Clear all alerted keys (e.g. on logout) so sounds fire again for every job on next login. */
export function clearAlertedRefs(): void {
  alertedKeys.clear();
}

/** Clear all alerted keys for a specific booking ref (all event types). */
export function clearAlertedRef(ref: string): void {
  const prefix = `${ref}:`;
  for (const key of Array.from(alertedKeys)) {
    if (key.startsWith(prefix)) {
      alertedKeys.delete(key);
    }
  }
}

/** Mark a ref+event as already alerted (e.g. from push handler). */
export function markAlerted(ref: string, eventType = 'new_job') {
  alertedKeys.add(alertKey(ref, eventType));
}

/** Check if a ref+event has already been alerted. */
export function isAlerted(ref: string, eventType = 'new_job'): boolean {
  return alertedKeys.has(alertKey(ref, eventType));
}

/**
 * Given the previous set of known refs and the current jobs array,
 * return refs that are truly new (not previously known AND not already alerted).
 */
export function detectNewRefs(
  knownRefs: Set<string>,
  currentRefs: string[],
): string[] {
  return currentRefs.filter(
    (ref) => !knownRefs.has(ref) && !alertedKeys.has(alertKey(ref, 'new_job')),
  );
}

/**
 * Fire the full alert for the given event: sound + vibration.
 * Vibration is handled inside playSound() when vibrationEnabled is true in config.
 * The popup is triggered separately by the caller via showJobAlert().
 */
export function fireJobAlert(event: SoundEvent = 'new_job') {
  playSound(event);
}

/** Backwards-compatible alias. */
export const fireNewJobAlert = () => fireJobAlert('new_job');
