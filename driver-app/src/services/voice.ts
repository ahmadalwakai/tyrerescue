/**
 * Spoken turn-by-turn voice guidance for the driver route screen.
 *
 * Backed by `expo-speech` (SDK 55-compatible, autolinked native TTS). The
 * service is deliberately conservative:
 *  - It NEVER speaks more than one phrase at a time (each `speak` stops any
 *    in-flight utterance first), so guidance cannot pile up.
 *  - It is DEBOUNCED two ways: identical phrases are suppressed within a short
 *    window, and a global minimum gap is enforced between any two utterances.
 *  - It is ON by default for driver safety on first install/session (no saved
 *    preference). If the driver mutes it, that preference is persisted and
 *    honoured on every subsequent session until they unmute again.
 *  - It is purely additive to the existing haptic/sound cues — it never reuses
 *    or interferes with the urgent full-screen new-job alert path.
 *
 * If the native module is unavailable for any reason the calls degrade to
 * no-ops (wrapped in try/catch) so the route screen can never crash.
 */
import * as Speech from 'expo-speech';
import * as SecureStore from 'expo-secure-store';

const VOICE_ENABLED_KEY = 'route_voice_enabled';

// Minimum gap between ANY two spoken phrases. Prevents the TTS engine being
// hammered when several events land close together.
const MIN_GAP_MS = 3_500;
// A repeat of the exact same phrase is suppressed for this long (covers the
// case where the same maneuver/event re-evaluates on consecutive GPS ticks).
const REPEAT_SUPPRESS_MS = 12_000;

// Default ON for driver safety until a saved preference says otherwise.
let enabled = true;
let lastSpokenAt = 0;
let lastPhrase = '';
let lastPhraseAt = 0;

/** BCP-47 language tag passed to the platform TTS voice. */
function speechLanguage(locale: 'en' | 'ar'): string {
  return locale === 'ar' ? 'ar' : 'en-GB';
}

/**
 * Load the persisted mute preference. Defaults to ON (unmuted) for driver
 * safety when no preference has ever been saved; only an explicit stored '0'
 * (the driver tapped mute) keeps it off.
 */
export async function loadVoiceEnabled(): Promise<boolean> {
  try {
    const stored = await SecureStore.getItemAsync(VOICE_ENABLED_KEY);
    // null/undefined => no saved preference => default ON. Only an explicit
    // '0' means the driver chose to mute.
    enabled = stored == null ? true : stored === '1';
  } catch {
    // Could not read the preference — fall back to the safe default (ON).
    enabled = true;
  }
  return enabled;
}

/** Persist + apply the mute preference. Stops any active utterance when muted. */
export async function setVoiceEnabled(next: boolean): Promise<void> {
  enabled = next;
  if (!next) stopVoice();
  try {
    await SecureStore.setItemAsync(VOICE_ENABLED_KEY, next ? '1' : '0');
  } catch {
    // Persistence is best-effort; the in-memory flag still applies this session.
  }
}

export function isVoiceEnabled(): boolean {
  return enabled;
}

/** Immediately silence any in-flight speech. */
export function stopVoice(): void {
  try {
    Speech.stop();
  } catch {
    // no-op — never let TTS failures bubble into the UI
  }
}

interface SpeakOptions {
  locale: 'en' | 'ar';
  /** When true, bypasses the same-phrase suppression (e.g. a fresh maneuver). */
  force?: boolean;
}

/**
 * Speak a single guidance phrase, honouring the enabled flag and debounce
 * windows. Returns true when the phrase was actually spoken.
 */
export function speak(phrase: string, opts: SpeakOptions): boolean {
  if (!enabled) return false;
  const text = phrase.trim();
  if (text.length === 0) return false;

  const now = Date.now();
  if (now - lastSpokenAt < MIN_GAP_MS) return false;
  if (
    !opts.force &&
    text === lastPhrase &&
    now - lastPhraseAt < REPEAT_SUPPRESS_MS
  ) {
    return false;
  }

  try {
    // Stop first so a new instruction always supersedes a stale one rather than
    // queueing behind it.
    Speech.stop();
    Speech.speak(text, {
      language: speechLanguage(opts.locale),
      pitch: 1.0,
      rate: 1.0,
    });
    lastSpokenAt = now;
    lastPhrase = text;
    lastPhraseAt = now;
    return true;
  } catch {
    return false;
  }
}
