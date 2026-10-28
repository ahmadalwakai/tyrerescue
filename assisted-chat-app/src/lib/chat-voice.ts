import type { AudioPlayer, AudioRecorder, AudioSource, AudioStatus } from 'expo-audio';
import { Platform } from 'react-native';

type AudioModule = typeof import('expo-audio');
type Subscription = { remove(): void };
export type VoiceRecordingState = { phase: 'idle' | 'preparing' | 'recording' | 'stopping' | 'ready'; durationMillis: number };
export type VoicePlaybackState = { loading: boolean; playing: boolean; currentTime: number; duration: number };

// Importing a chat screen must never initialize ExpoAudio. Its native module and
// recorder/player objects are resolved only after a deliberate microphone/play tap.
let audioLoading: Promise<AudioModule> | null = null;
async function loadAudio(): Promise<AudioModule> {
  if (!audioLoading) {
    audioLoading = import('expo-audio').catch(() => {
      audioLoading = null;
      throw new Error('Voice messages are unavailable in this app version. Update the app and try again.');
    });
  }
  return audioLoading;
}

let audioQueue: Promise<unknown> = Promise.resolve();
let audioOwner: { stop(): Promise<void> } | null = null;
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = audioQueue.then(task, task);
  audioQueue = next.catch(() => undefined);
  return next;
}

async function removeRecording(uri: string | null) {
  if (!uri) return;
  try {
    if (uri.startsWith('blob:')) { URL.revokeObjectURL(uri); return; }
    if (!uri.startsWith('file:')) return;
    const { File } = await import('expo-file-system');
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch { /* Cache cleanup must never prevent closing the chat. */ }
}

interface Dependencies {
  load?: () => Promise<AudioModule>;
  remove?: (uri: string | null) => Promise<void>;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
}

/** A recorder is cheap and inert until start() is explicitly requested. */
export function createChatVoiceRecorder(
  isCurrent: () => boolean,
  onState: (state: VoiceRecordingState) => void,
  dependencies: Dependencies = {},
) {
  const load = dependencies.load ?? loadAudio;
  const remove = dependencies.remove ?? removeRecording;
  let audio: AudioModule | null = null;
  let recorder: AudioRecorder | null = null;
  let subscription: Subscription | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;
  let version = 0;
  let uri: string | null = null;
  let state: VoiceRecordingState = { phase: 'idle', durationMillis: 0 };
  const publish = (next: VoiceRecordingState) => {
    state = next;
    if (!disposed && isCurrent()) onState(next);
  };
  const valid = (operation: number) => !disposed && operation === version && isCurrent();
  const clearMonitoring = () => {
    if (timer) (dependencies.clearInterval ?? clearInterval)(timer);
    timer = null;
    subscription?.remove(); subscription = null;
  };
  const releaseRecorder = () => {
    clearMonitoring();
    try { recorder?.release(); } catch { /* Already released by the OS. */ }
    recorder = null;
  };
  const resetMode = async () => {
    try { await audio?.setAudioModeAsync({ allowsRecording: false, allowsBackgroundRecording: false, shouldPlayInBackground: false }); } catch { /* Interrupted audio session. */ }
  };
  const stopNative = async () => {
    version += 1;
    const ownedAudioSession = audioOwner === owner || recorder !== null;
    const recordingUri = recorder?.uri ?? uri;
    clearMonitoring();
    try { await recorder?.stop(); } catch { /* Preparation/cancellation may leave no recording to stop. */ }
    const finalUri = recorder?.uri ?? recordingUri;
    releaseRecorder();
    if (ownedAudioSession) await resetMode();
    uri = null;
    await remove(finalUri);
    if (audioOwner === owner) audioOwner = null;
    publish({ phase: 'idle', durationMillis: 0 });
  };
  const owner = { stop: stopNative };
  const cancel = () => {
    version += 1;
    publish({ phase: 'idle', durationMillis: 0 });
    return serialized(stopNative);
  };
  const start = () => {
    if (disposed || !isCurrent() || state.phase !== 'idle') return Promise.resolve();
    const operation = ++version;
    publish({ phase: 'preparing', durationMillis: 0 });
    return serialized(async () => {
      if (!valid(operation)) return;
      try {
        if (audioOwner && audioOwner !== owner) await audioOwner.stop();
        if (!valid(operation)) return;
        audioOwner = owner;
        audio = await load();
        if (!valid(operation)) return;
        const permission = await audio.requestRecordingPermissionsAsync();
        if (!valid(operation)) return;
        if (!permission.granted) throw new Error('Microphone permission is required. Enable it in iPhone Settings to record a voice message.');
        await audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false, allowsBackgroundRecording: false, interruptionMode: 'doNotMix', shouldRouteThroughEarpiece: false });
        if (!valid(operation)) { await stopNative(); return; }
        const preset = audio.RecordingPresets.HIGH_QUALITY;
        const platformOptions = Platform.OS === 'ios' ? preset.ios : Platform.OS === 'android' ? preset.android : preset.web;
        recorder = new audio.AudioModule.AudioRecorder({ ...preset, ...platformOptions });
        await recorder.prepareToRecordAsync(preset);
        if (!valid(operation)) { await stopNative(); return; }
        recorder.record();
        publish({ phase: 'recording', durationMillis: 0 });
        subscription = recorder.addListener('recordingStatusUpdate', (status) => {
          if (!valid(operation)) return;
          if (status.hasError || status.isFinished) void serialized(stopNative);
        });
        timer = (dependencies.setInterval ?? setInterval)(() => {
          if (!valid(operation) || !recorder) return;
          try {
            const status = recorder.getStatus();
            publish({ phase: 'recording', durationMillis: status.durationMillis });
          } catch { void cancel(); }
        }, 250);
      } catch (error) {
        await stopNative();
        if (!disposed && isCurrent()) throw error;
      }
    });
  };
  const finish = () => {
    if (state.phase === 'ready' && uri && !disposed && isCurrent()) return Promise.resolve(uri);
    if (state.phase !== 'recording' || !recorder || disposed || !isCurrent()) return Promise.resolve(null);
    const operation = version;
    publish({ ...state, phase: 'stopping' });
    return serialized(async () => {
      if (!valid(operation) || !recorder) return null;
      try {
        const durationMillis = Math.max(state.durationMillis, recorder.getStatus().durationMillis);
        clearMonitoring();
        await recorder.stop();
        if (!valid(operation)) { await stopNative(); return null; }
        uri = recorder.uri;
        releaseRecorder();
        await resetMode();
        if (!valid(operation)) { await stopNative(); return null; }
        if (!uri || durationMillis < 250) throw new Error('The recording was too short. Record a longer voice message.');
        if (audioOwner === owner) audioOwner = null;
        publish({ phase: 'ready', durationMillis });
        return uri;
      } catch (error) {
        await stopNative();
        if (!disposed && isCurrent()) throw error;
        return null;
      }
    });
  };
  return { start, finish, cancel, getState: () => state, dispose: () => { disposed = true; return cancel(); } };
}

/** No remote source is loaded until toggle() is pressed. */
export function createChatVoicePlayer(
  source: AudioSource,
  isCurrent: () => boolean,
  onState: (state: VoicePlaybackState) => void,
  dependencies: Dependencies = {},
) {
  let audio: AudioModule | null = null;
  let player: AudioPlayer | null = null;
  let subscription: Subscription | null = null;
  let disposed = false;
  let busy = false;
  let version = 0;
  const publish = (state: VoicePlaybackState) => { if (!disposed && isCurrent()) onState(state); };
  const status = (value: Pick<AudioStatus, 'playing' | 'currentTime' | 'duration' | 'isLoaded'>) => publish({ loading: !value.isLoaded, playing: value.playing, currentTime: value.currentTime, duration: value.duration });
  const stopNative = async () => {
    version += 1;
    subscription?.remove(); subscription = null;
    try { player?.pause(); } catch { /* Interrupted player. */ }
    try { player?.release(); } catch { /* Already released by native. */ }
    player = null;
    busy = false;
    if (audioOwner === owner) audioOwner = null;
    publish({ loading: false, playing: false, currentTime: 0, duration: 0 });
  };
  const owner = { stop: stopNative };
  const toggle = () => {
    if (disposed || !isCurrent() || busy) return Promise.resolve();
    busy = true;
    const operation = version;
    const valid = () => !disposed && operation === version && isCurrent();
    return serialized(async () => {
      if (!valid()) return;
      try {
        if (player?.playing) { player.pause(); status(player.currentStatus); return; }
        if (audioOwner && audioOwner !== owner) await audioOwner.stop();
        if (!valid()) return;
        audioOwner = owner;
        publish({ loading: true, playing: false, currentTime: 0, duration: 0 });
        audio = await (dependencies.load ?? loadAudio)();
        if (!valid()) return;
        await audio.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false, allowsBackgroundRecording: false, interruptionMode: 'doNotMix' });
        if (!valid()) return;
        if (!player) {
          player = audio.createAudioPlayer(source, { updateInterval: 250 });
          subscription = player.addListener('playbackStatusUpdate', (value) => {
            if (!valid()) return;
            status(value);
          });
        }
        if (player.duration > 0 && player.currentTime >= player.duration - 0.1) await player.seekTo(0);
        if (!valid()) return;
        player.play();
      } catch (error) {
        await stopNative();
        if (!disposed && isCurrent()) throw error;
      } finally { busy = false; }
    });
  };
  const stop = () => { version += 1; return serialized(stopNative); };
  return { toggle, stop, dispose: () => { disposed = true; return stop(); } };
}
