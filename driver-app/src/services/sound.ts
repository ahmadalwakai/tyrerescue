import { Audio } from 'expo-av';
import { Vibration, Platform } from 'react-native';

export type SoundEvent = 'new_job' | 'job_accepted' | 'job_completed' | 'new_message';

// ── Vibration patterns (Android: [wait, buzz, wait, buzz, ...] in ms) ──
const URGENT_VIBRATION_PATTERN = [0, 500, 200, 500, 200, 500];
const MESSAGE_VIBRATION_PATTERN = [0, 300, 150, 300];
const SHORT_VIBRATION_PATTERN = [0, 200];

// ── Static require() map — every bundled sound file must be listed here ──
const AVAILABLE_SOUNDS: Record<string, ReturnType<typeof require>> = {
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
  new_job: { soundFile: 'new_job.wav', enabled: true, volume: 1.0, vibrationEnabled: true },
  job_accepted: { soundFile: 'new_job.wav', enabled: true, volume: 0.8, vibrationEnabled: false },
  job_completed: { soundFile: 'new_job.wav', enabled: true, volume: 0.8, vibrationEnabled: false },
  new_message: { soundFile: 'new_job.wav', enabled: true, volume: 0.7, vibrationEnabled: true },
};

// ── Runtime state ──
let remoteConfig: Record<string, SoundEventConfig> | null = null;
const cache: Partial<Record<string, Audio.Sound>> = {};
let lastPlayed = 0;
const DEBOUNCE_MS = 600;

/** Load admin-controlled sound config from the backend */
export async function loadSoundConfig(apiFn: () => Promise<Record<string, SoundEventConfig>>): Promise<void> {
  try {
    const cfg = await apiFn();
    if (cfg && typeof cfg === 'object') {
      remoteConfig = cfg;
      console.log('[sound] Loaded remote sound config:', Object.keys(cfg).join(', '));
    }
  } catch (err) {
    console.warn('[sound] Failed to load remote config, using defaults', err);
  }
}

function getConfig(event: SoundEvent): SoundEventConfig {
  return remoteConfig?.[event] ?? DEFAULT_CONFIG[event];
}

async function ensureLoaded(soundFile: string): Promise<Audio.Sound | null> {
  if (cache[soundFile]) return cache[soundFile]!;
  const source = AVAILABLE_SOUNDS[soundFile];
  if (!source) {
    console.warn(`[sound] Sound file "${soundFile}" not bundled, falling back to new_job.wav`);
    const fallback = AVAILABLE_SOUNDS['new_job.wav'];
    if (!fallback) return null;
    const { sound } = await Audio.Sound.createAsync(fallback);
    cache[soundFile] = sound;
    return sound;
  }
  const { sound } = await Audio.Sound.createAsync(source);
  cache[soundFile] = sound;
  return sound;
}

/** Play a sound by event name. Debounces rapid triggers. */
export async function playSound(event: SoundEvent): Promise<void> {
  const now = Date.now();
  if (now - lastPlayed < DEBOUNCE_MS) return;
  lastPlayed = now;

  const config = getConfig(event);

  if (!config.enabled) return;

  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
    });

    const sound = await ensureLoaded(config.soundFile);
    if (sound) {
      await sound.setVolumeAsync(config.volume);
      await sound.setPositionAsync(0);
      await sound.playAsync();
    }

    if (config.vibrationEnabled) {
      if (event === 'new_job') {
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
  await Promise.allSettled(
    Object.keys(AVAILABLE_SOUNDS).map((file) => ensureLoaded(file)),
  );
}
