import { Audio } from 'expo-av';
import { Vibration } from 'react-native';

export type SoundEvent =
  | 'new_job'
  | 'reassignment'
  | 'upcoming_v2'
  | 'job_accepted'
  | 'job_completed'
  | 'new_message';

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
};

/** Critical events — sound config cannot disable these. */
const CRITICAL_EVENTS: Set<SoundEvent> = new Set(['new_job', 'reassignment', 'upcoming_v2']);

// ── Runtime state ──
let remoteConfig: Record<string, SoundEventConfig> | null = null;
const cache: Partial<Record<string, Audio.Sound>> = {};
let lastPlayed = 0;
let audioModeSet = false;
const DEBOUNCE_MS = 600;
let activeCriticalLoopFile: string | null = null;

/** Configure audio mode once — call early at app start. */
async function ensureAudioMode(): Promise<void> {
  if (audioModeSet) return;
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    shouldDuckAndroid: false,
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

async function createSound(soundFile: string): Promise<Audio.Sound | null> {
  const source = AVAILABLE_SOUNDS[soundFile] ?? AVAILABLE_SOUNDS[CRITICAL_SOUND_FILE];
  if (!source) return null;
  const { sound } = await Audio.Sound.createAsync(source);
  cache[soundFile] = sound;
  return sound;
}

async function ensureLoaded(soundFile: string): Promise<Audio.Sound | null> {
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
  let sound = await ensureLoaded(soundFile);
  if (!sound) return;

  try {
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) {
      // Sound was unloaded externally — recreate
      delete cache[soundFile];
      sound = await createSound(soundFile);
      if (!sound) return;
    } else if (status.isPlaying) {
      await sound.stopAsync();
    }
    await sound.setVolumeAsync(volume);
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // Cached instance is stale — recreate and retry once
    delete cache[soundFile];
    const fresh = await createSound(soundFile);
    if (!fresh) return;
    await fresh.setVolumeAsync(volume);
    await fresh.playAsync();
  }
}

async function startCriticalLoop(soundFile: string, volume: number): Promise<void> {
  const sound = await ensureLoaded(soundFile);
  if (!sound) return;

  try {
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) {
      delete cache[soundFile];
      const fresh = await createSound(soundFile);
      if (!fresh) return;
      await fresh.setVolumeAsync(volume);
      await fresh.setIsLoopingAsync(true);
      await fresh.setPositionAsync(0);
      await fresh.playAsync();
      activeCriticalLoopFile = soundFile;
      return;
    }

    if (status.isPlaying && activeCriticalLoopFile === soundFile) {
      // Already looping this alert sound.
      return;
    }

    await stopAlertSound();
    await sound.setVolumeAsync(volume);
    await sound.setIsLoopingAsync(true);
    await sound.setPositionAsync(0);
    await sound.playAsync();
    activeCriticalLoopFile = soundFile;
  } catch {
    delete cache[soundFile];
    const fresh = await createSound(soundFile);
    if (!fresh) return;
    await stopAlertSound();
    await fresh.setVolumeAsync(volume);
    await fresh.setIsLoopingAsync(true);
    await fresh.playAsync();
    activeCriticalLoopFile = soundFile;
  }
}

/** Stop the repeating critical alert sound immediately. */
export async function stopAlertSound(): Promise<void> {
  const loopFile = activeCriticalLoopFile;
  activeCriticalLoopFile = null;
  if (!loopFile) return;

  const sound = cache[loopFile];
  if (!sound) return;

  try {
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) return;
    await sound.setIsLoopingAsync(false);
    if (status.isPlaying) {
      await sound.stopAsync();
    }
    await sound.setPositionAsync(0);
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
