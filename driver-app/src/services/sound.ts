import { Audio } from 'expo-av';

type SoundEvent = 'new_job' | 'job_accepted' | 'job_completed' | 'new_message';

const SOUND_FILES: Record<SoundEvent, ReturnType<typeof require>> = {
  new_job: require('../../assets/sounds/new_job_alert.mp3'),
  // These three re-use the same file — swap for distinct files later.
  job_accepted: require('../../assets/sounds/new_job.wav'),
  job_completed: require('../../assets/sounds/new_job.wav'),
  new_message: require('../../assets/sounds/new_job.wav'),
};

const cache: Partial<Record<SoundEvent, Audio.Sound>> = {};
let lastPlayed = 0;
const DEBOUNCE_MS = 600;

async function ensureLoaded(event: SoundEvent): Promise<Audio.Sound> {
  if (!cache[event]) {
    const { sound } = await Audio.Sound.createAsync(SOUND_FILES[event]);
    cache[event] = sound;
  }
  return cache[event]!;
}

/** Play a sound by event name. Debounces rapid triggers. */
export async function playSound(event: SoundEvent): Promise<void> {
  const now = Date.now();
  if (now - lastPlayed < DEBOUNCE_MS) return;
  lastPlayed = now;

  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const sound = await ensureLoaded(event);
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // Non-critical — silently fail
  }
}

/** Pre-load all sounds at app start for snappy playback */
export async function preloadSounds(): Promise<void> {
  const events: SoundEvent[] = ['new_job', 'job_accepted', 'job_completed', 'new_message'];
  await Promise.allSettled(events.map(ensureLoaded));
}
