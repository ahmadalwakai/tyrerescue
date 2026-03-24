import { Audio } from 'expo-av';
import { Vibration, Platform } from 'react-native';

type SoundEvent = 'new_job' | 'job_accepted' | 'job_completed' | 'new_message' | 'screen_tap';

// Long vibration burst pattern for urgent alerts (pause, buzz, pause, buzz...)
// Android: [wait, vibrate, wait, vibrate, ...] in ms
const URGENT_VIBRATION_PATTERN = [0, 500, 200, 500, 200, 500];
const MESSAGE_VIBRATION_PATTERN = [0, 300, 150, 300];

const SOUND_FILES: Record<SoundEvent, ReturnType<typeof require>> = {
  new_job: require('../../assets/sounds/new_job.wav'),
  job_accepted: require('../../assets/sounds/new_job.wav'),
  job_completed: require('../../assets/sounds/new_job.wav'),
  new_message: require('../../assets/sounds/new_job.wav'),
  screen_tap: require('../../assets/sounds/new_job.wav'),
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
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
    });
    const sound = await ensureLoaded(event);
    // Max volume for urgent alerts
    if (event === 'new_job') {
      await sound.setVolumeAsync(1.0);
    }
    await sound.setPositionAsync(0);
    await sound.playAsync();

    // Trigger vibration for alerts
    if (event === 'new_job') {
      Vibration.vibrate(URGENT_VIBRATION_PATTERN, false);
    } else if (event === 'new_message') {
      Vibration.vibrate(MESSAGE_VIBRATION_PATTERN, false);
    }
  } catch {
    // Non-critical — silently fail
  }
}

/** Pre-load all sounds at app start for snappy playback */
export async function preloadSounds(): Promise<void> {
  const events: SoundEvent[] = ['new_job', 'job_accepted', 'job_completed', 'new_message', 'screen_tap'];
  await Promise.allSettled(events.map(ensureLoaded));
}
