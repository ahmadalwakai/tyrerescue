import { NativeModules, Platform } from 'react-native';

interface UrgentSoundModuleType {
  playUrgentBookingSound(): Promise<boolean>;
  stopUrgentBookingSound(): Promise<boolean>;
}

function getModule(): UrgentSoundModuleType | null {
  if (Platform.OS !== 'android') return null;
  const mod = (NativeModules as Record<string, unknown>).UrgentSoundModule;
  if (!mod) return null;
  return mod as UrgentSoundModuleType;
}

/**
 * Play the bundled urgent_booking.mp3 via native Android MediaPlayer.
 * Returns true if the native module reported success, false otherwise
 * (including when running on non-Android platforms or when the native
 * module is not linked into the running binary).
 *
 * Never throws — callers can safely chain a fallback path.
 */
export async function playNativeUrgentSound(): Promise<boolean> {
  const mod = getModule();
  if (!mod) return false;
  try {
    const ok = await mod.playUrgentBookingSound();
    return ok === true;
  } catch (err) {
    if (__DEV__) {
      console.warn('[native-urgent-sound] play failed:', err);
    }
    return false;
  }
}

/** Stop any currently-playing urgent sound. Best-effort. */
export async function stopNativeUrgentSound(): Promise<void> {
  const mod = getModule();
  if (!mod) return;
  try {
    await mod.stopUrgentBookingSound();
  } catch (err) {
    if (__DEV__) {
      console.warn('[native-urgent-sound] stop failed:', err);
    }
  }
}

/** True when the native Android module is available in this binary. */
export function isNativeUrgentSoundAvailable(): boolean {
  return getModule() !== null;
}
