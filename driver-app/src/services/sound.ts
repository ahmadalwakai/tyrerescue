import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Vibration } from 'react-native';

export type SoundEvent =
  | 'new_job'
  | 'reassignment'
  | 'upcoming_v2'
  | 'job_accepted'
  | 'job_completed'
  | 'new_message'
  // ── In-app driver-cockpit cues (Phase 2 intelligence layer) ──
  // These are intentionally NON-critical: they never loop and never reuse the
  // urgent full-screen alert channel. They are subtle, in-app only feedback.
  | 'payment_received'
  | 'route_rerouting'
  | 'route_warning'
  | 'near_customer'
  | 'arrived_zone';

// ── Vibration patterns (Android: [wait, buzz, wait, buzz, ...] in ms) ──
const URGENT_VIBRATION_PATTERN = [0, 500, 200, 500, 200, 500];
const MESSAGE_VIBRATION_PATTERN = [0, 300, 150, 300];
const SHORT_VIBRATION_PATTERN = [0, 200];

const CRITICAL_SOUND_FILE = 'unvversfiled_ringtone_021_365652.mp3';

// ── Static require() map — every bundled sound file must be listed here ──
const AVAILABLE_SOUNDS: Record<string, ReturnType<typeof require>> = {
  [CRITICAL_SOUND_FILE]: require('../../assets/sounds/unvversfiled_ringtone_021_365652.mp3'),
  'new_job.wav': require('../../assets/sounds/new_job.wav'),
};

// ── Default config used until remote config is fetched ──
interface SoundEventConfig {
  soundFile: string;
  enabled: boolean;
  volume: number;
  vibrationEnabled: boolean;
}

const DEFAULT_CONFIG: Record<SoundEvent, SoundEventConfig> = {
  new_job: { soundFile: CRITICAL_SOUND_FILE, enabled: true, volume: 1.0, vibrationEnabled: true },
  reassignment: { soundFile: CRITICAL_SOUND_FILE, enabled: true, volume: 1.0, vibrationEnabled: true },
  upcoming_v2: { soundFile: CRITICAL_SOUND_FILE, enabled: true, volume: 1.0, vibrationEnabled: true },
  job_accepted: { soundFile: 'new_job.wav', enabled: true, volume: 0.8, vibrationEnabled: false },
  job_completed: { soundFile: 'new_job.wav', enabled: true, volume: 0.8, vibrationEnabled: false },
  new_message: { soundFile: 'new_job.wav', enabled: true, volume: 0.7, vibrationEnabled: true },
  // In-app cockpit cues. No dedicated assets ship yet, so each gracefully
  // falls back to the bundled, non-urgent `new_job.wav` (createSound() also
  // hard-falls-back if a file is ever missing, so these can never crash).
  // MISSING ASSETS (add to assets/sounds/ + AVAILABLE_SOUNDS to upgrade):
  //   payment_received.wav, route_rerouting.wav, route_warning.wav,
  //   near_customer.wav, arrived_zone.wav
  payment_received: { soundFile: 'new_job.wav', enabled: true, volume: 0.7, vibrationEnabled: true },
  route_rerouting: { soundFile: 'new_job.wav', enabled: true, volume: 0.4, vibrationEnabled: false },
  route_warning: { soundFile: 'new_job.wav', enabled: true, volume: 0.6, vibrationEnabled: true },
  near_customer: { soundFile: 'new_job.wav', enabled: true, volume: 0.7, vibrationEnabled: true },
  arrived_zone: { soundFile: 'new_job.wav', enabled: true, volume: 0.8, vibrationEnabled: true },
};

/** Critical events — sound config cannot disable these. */
const CRITICAL_EVENTS: Set<SoundEvent> = new Set(['new_job', 'reassignment', 'upcoming_v2']);

// ── Runtime state ──
let remoteConfig: Record<string, SoundEventConfig> | null = null;
const cache: Partial<Record<string, AudioPlayer>> = {};
let lastPlayed = 0;
let audioModeSet = false;
const DEBOUNCE_MS = 600;
let activeCriticalLoopFile: string | null = null;

/** Configure audio mode once — call early at app start. */
async function ensureAudioMode(): Promise<void> {
  if (audioModeSet) return;
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  });
  audioModeSet = true;
}

/** Load admin-controlled sound config from the backend */
export async function loadSoundConfig(apiFn: () => Promise<Record<string, SoundEventConfig>>): Promise<void> {
  try {
    const cfg = await apiFn();
    if (cfg && typeof cfg === 'object') {
      remoteConfig = cfg;
    }
  } catch {
    // Use defaults
  }
}

function getConfig(event: SoundEvent): SoundEventConfig {
  const fallback = DEFAULT_CONFIG[event];
  const remote = remoteConfig?.[event];
  if (!remote) return fallback;

  // Critical events — enforce safety: always enabled, always audible,
  // always a bundled file. Bad remote config cannot silently kill them.
  if (CRITICAL_EVENTS.has(event)) {
    const remoteFile = typeof remote.soundFile === 'string' ? remote.soundFile : '';
    const normalizedCriticalFile = remoteFile === 'new_job.wav' ? CRITICAL_SOUND_FILE : remoteFile;
    return {
      soundFile:
        normalizedCriticalFile && AVAILABLE_SOUNDS[normalizedCriticalFile]
          ? normalizedCriticalFile
          : fallback.soundFile,
      enabled: true,
      volume:
        typeof remote.volume === 'number' && remote.volume > 0 && remote.volume <= 1
          ? remote.volume
          : fallback.volume,
      vibrationEnabled:
        typeof remote.vibrationEnabled === 'boolean'
          ? remote.vibrationEnabled
          : fallback.vibrationEnabled,
    };
  }

  return remote;
}

function disposeCachedSound(soundFile: string): void {
  const player = cache[soundFile];
  if (!player) return;

  try {
    player.pause();
    player.remove();
  } catch {
    // Non-critical
  }

  delete cache[soundFile];
}

function createSound(soundFile: string): AudioPlayer | null {
  const source = AVAILABLE_SOUNDS[soundFile] ?? AVAILABLE_SOUNDS[CRITICAL_SOUND_FILE];
  if (!source) return null;
  const player = createAudioPlayer(source, {
    downloadFirst: true,
    keepAudioSessionActive: true,
  });
  cache[soundFile] = player;
  return player;
}

function ensureLoaded(soundFile: string): AudioPlayer | null {
  if (cache[soundFile]) return cache[soundFile]!;
  return createSound(soundFile);
}

/**
 * Play a cached sound reliably on Android.
 * Checks player status before stopping to avoid IllegalStateException
 * on sounds that are loaded but not playing (e.g. after preload).
 * If the cached instance is stale or unloaded, recreates and retries once.
 */
async function playCachedSound(soundFile: string, volume: number): Promise<void> {
  let player = ensureLoaded(soundFile);
  if (!player) return;

  try {
    if (player.playing) {
      player.pause();
    }
    player.loop = false;
    player.volume = volume;
    await player.seekTo(0);
    player.play();
  } catch {
    // Cached instance is stale — recreate and retry once
    disposeCachedSound(soundFile);
    const fresh = createSound(soundFile);
    if (!fresh) return;
    fresh.loop = false;
    fresh.volume = volume;
    fresh.play();
  }
}

async function startCriticalLoop(soundFile: string, volume: number): Promise<void> {
  const player = ensureLoaded(soundFile);
  if (!player) return;

  try {
    if (player.playing && activeCriticalLoopFile === soundFile) {
      // Already looping this alert sound.
      return;
    }

    await stopAlertSound();
    player.volume = volume;
    player.loop = true;
    await player.seekTo(0);
    player.play();
    activeCriticalLoopFile = soundFile;
  } catch {
    disposeCachedSound(soundFile);
    const fresh = createSound(soundFile);
    if (!fresh) return;
    await stopAlertSound();
    fresh.volume = volume;
    fresh.loop = true;
    fresh.play();
    activeCriticalLoopFile = soundFile;
  }
}

/** Stop the repeating critical alert sound immediately. */
export async function stopAlertSound(): Promise<void> {
  const loopFile = activeCriticalLoopFile;
  activeCriticalLoopFile = null;
  if (!loopFile) return;

  const player = cache[loopFile];
  if (!player) return;

  try {
    player.loop = false;
    if (player.playing) {
      player.pause();
    }
    await player.seekTo(0);
  } catch {
    // Non-critical
  }
}

/** Play a sound by event name. Debounces rapid triggers. */
export async function playSound(event: SoundEvent): Promise<void> {
  const now = Date.now();
  if (now - lastPlayed < DEBOUNCE_MS) return;
  lastPlayed = now;

  const config = getConfig(event);

  if (!config.enabled) return;

  // Audio mode setup failure must not block playback
  try { await ensureAudioMode(); } catch { /* proceed anyway */ }

  try {
    if (CRITICAL_EVENTS.has(event)) {
      await startCriticalLoop(config.soundFile, config.volume);
    } else {
      await playCachedSound(config.soundFile, config.volume);
    }

    if (config.vibrationEnabled) {
      if (CRITICAL_EVENTS.has(event)) {
        Vibration.vibrate(URGENT_VIBRATION_PATTERN, false);
      } else if (event === 'new_message') {
        Vibration.vibrate(MESSAGE_VIBRATION_PATTERN, false);
      } else {
        Vibration.vibrate(SHORT_VIBRATION_PATTERN, false);
      }
    }
  } catch {
    // Non-critical — silently fail
  }
}

/** Pre-load default sounds at app start for snappy playback */
export async function preloadSounds(): Promise<void> {
  await ensureAudioMode();
  await Promise.allSettled(
    Object.keys(AVAILABLE_SOUNDS).map((file) => ensureLoaded(file)),
  );
}
