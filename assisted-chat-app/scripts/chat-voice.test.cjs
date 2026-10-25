const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const filename = path.join(__dirname, '../src/lib/chat-voice.ts');
function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function settle() { for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve)); }
function fixture() {
  const state = { loads: 0, current: true, permission: true, recorderCreates: 0, playerCreates: 0, prepared: 0, records: 0, stopped: 0, released: 0, plays: 0, pauses: 0, seek: [], modes: [], removed: [], recordings: [], playback: [], interval: null, listeners: {}, playerListeners: {}, durationMillis: 1500, pendingPermission: null, pendingPrepare: null, failLoad: false, failStop: false };
  class Recorder {
    constructor(options) { state.recorderCreates += 1; state.options = options; this.uri = 'file:///isolated-voice.m4a'; }
    async prepareToRecordAsync(options) { state.prepared += 1; state.prepareOptions = options; if (state.pendingPrepare) await state.pendingPrepare.promise; }
    record() { state.records += 1; }
    async stop() { state.stopped += 1; if (state.failStop) throw new Error('Recording interrupted'); }
    release() { state.released += 1; }
    getStatus() { return { durationMillis: state.durationMillis }; }
    addListener(name, callback) { state.listeners[name] = callback; return { remove: () => { delete state.listeners[name]; } }; }
  }
  class Player {
    constructor(source) { state.playerCreates += 1; state.source = source; this.playing = false; this.currentTime = 0; this.duration = 12; this.currentStatus = { isLoaded: true, currentTime: 0, duration: 12, playing: false }; state.player = this; }
    play() { state.plays += 1; this.playing = true; this.currentStatus.playing = true; state.playerListeners.playbackStatusUpdate?.(this.currentStatus); }
    pause() { state.pauses += 1; this.playing = false; this.currentStatus.playing = false; }
    async seekTo(seconds) { state.seek.push(seconds); this.currentTime = seconds; }
    release() { state.released += 1; }
    addListener(name, callback) { state.playerListeners[name] = callback; return { remove: () => { delete state.playerListeners[name]; } }; }
  }
  const audio = {
    AudioModule: { AudioRecorder: Recorder },
    RecordingPresets: { HIGH_QUALITY: { extension: '.m4a', sampleRate: 44100, numberOfChannels: 2, bitRate: 128000, ios: { outputFormat: 'aac', audioQuality: 127 }, android: { outputFormat: 'mpeg4' }, web: { mimeType: 'audio/webm' } } },
    requestRecordingPermissionsAsync: async () => state.pendingPermission ? state.pendingPermission.promise : ({ granted: state.permission }),
    setAudioModeAsync: async (mode) => { state.modes.push(mode); },
    createAudioPlayer: (source) => new Player(source),
  };
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { setInterval, clearInterval, URL }, { filename })((name) => {
    if (name === 'react-native') return { Platform: { OS: 'ios' } };
    if (name === 'expo-audio') { state.loads += 1; if (state.failLoad) throw new Error('Missing native module ExpoAudio'); return audio; }
    if (name === 'expo-file-system') return { File: class { constructor(uri) { this.uri = uri; this.exists = true; } delete() { state.removed.push(this.uri); } } };
    throw new Error(`Unexpected dependency ${name}`);
  }, module, module.exports);
  const dependencies = { setInterval: (callback) => { state.interval = callback; return 1; }, clearInterval: () => { state.interval = null; } };
  const recorder = () => module.exports.createChatVoiceRecorder(() => state.current, (value) => state.recordings.push(value), dependencies);
  const player = () => module.exports.createChatVoicePlayer({ uri: 'https://example.invalid/voice.m4a' }, () => state.current, (value) => state.playback.push(value));
  return { state, recorder, player, audio };
}

test('chat voice import/render never loads native audio, recorder or remote playback', async () => {
  const h = fixture(); const recorder = h.recorder(); const player = h.player();
  assert.equal(h.state.loads, 0); assert.equal(h.state.recorderCreates, 0); assert.equal(h.state.playerCreates, 0);
  await recorder.dispose(); await player.dispose(); assert.equal(h.state.loads, 0);
});
test('permission must succeed before constructing/preparing the platform-configured recorder', async () => {
  const h = fixture(); h.state.pendingPermission = deferred(); const recorder = h.recorder(); const pending = recorder.start();
  await settle(); assert.equal(h.state.loads, 1); assert.equal(h.state.recorderCreates, 0); assert.equal(recorder.getState().phase, 'preparing');
  h.state.pendingPermission.resolve({ granted: true }); await pending;
  assert.equal(h.state.recorderCreates, 1); assert.equal(h.state.records, 1); assert.equal(h.state.options.outputFormat, 'aac'); assert.equal(h.state.options.extension, '.m4a'); assert.equal(recorder.getState().phase, 'recording');
  assert.equal(h.state.modes[0].allowsBackgroundRecording, false); assert.equal(h.state.modes[0].shouldPlayInBackground, false);
  await recorder.dispose();
});
test('denied microphone permission is recoverable and never creates a recorder', async () => {
  const h = fixture(); h.state.permission = false; const recorder = h.recorder();
  await assert.rejects(recorder.start(), /Microphone permission.*Settings/); assert.equal(h.state.recorderCreates, 0); assert.equal(recorder.getState().phase, 'idle');
  h.state.permission = true; await recorder.start(); assert.equal(h.state.records, 1); await recorder.dispose();
});
test('missing native module fails only an explicit action and can be retried', async () => {
  const h = fixture(); h.state.failLoad = true; const recorder = h.recorder(); assert.equal(h.state.loads, 0);
  await assert.rejects(recorder.start(), /Update the app/); assert.equal(recorder.getState().phase, 'idle'); assert.equal(h.state.recorderCreates, 0);
  h.state.failLoad = false; await recorder.start(); assert.equal(h.state.loads, 2); assert.equal(h.state.records, 1); await recorder.dispose();
});
test('repeated microphone taps while permission is pending record only once', async () => {
  const h = fixture(); const recorder = h.recorder(); h.state.pendingPermission = deferred();
  const pending = recorder.start(); const repeated = recorder.start(); await settle(); h.state.pendingPermission.resolve({ granted: true }); await Promise.all([pending, repeated]);
  assert.equal(h.state.loads, 1); assert.equal(h.state.recorderCreates, 1); assert.equal(h.state.records, 1); await recorder.dispose();
});
for (const cause of ['cancel', 'background/scope', 'unmount']) {
  test(`${cause} while permission is pending cannot start recording later`, async () => {
    const h = fixture(); const recorder = h.recorder(); h.state.pendingPermission = deferred(); const pending = recorder.start(); await settle();
    let cleanup; if (cause === 'unmount') cleanup = recorder.dispose(); else { if (cause !== 'cancel') h.state.current = false; cleanup = recorder.cancel(); }
    h.state.pendingPermission.resolve({ granted: true }); await Promise.all([pending, cleanup]);
    assert.equal(h.state.recorderCreates, 0); assert.equal(h.state.records, 0); assert.equal(recorder.getState().phase, 'idle');
  });
}
test('closing during native prepare stops/releases and deletes the unused temporary recording', async () => {
  const h = fixture(); const recorder = h.recorder(); h.state.pendingPrepare = deferred(); const pending = recorder.start(); await settle();
  const cleanup = recorder.dispose(); h.state.pendingPrepare.resolve(); await Promise.all([pending, cleanup]);
  assert.equal(h.state.records, 0); assert.equal(h.state.released, 1); assert.equal(h.state.interval, null); assert.ok(h.state.removed.includes('file:///isolated-voice.m4a'));
});
test('stop retains a voice file for retry; successful/cancel cleanup removes it', async () => {
  const h = fixture(); const recorder = h.recorder(); await recorder.start(); h.state.interval();
  assert.equal(recorder.getState().durationMillis, 1500); assert.equal(await recorder.finish(), 'file:///isolated-voice.m4a');
  assert.equal(recorder.getState().phase, 'ready'); assert.equal(h.state.stopped, 1); assert.equal(h.state.released, 1); assert.equal(h.state.interval, null);
  assert.equal(await recorder.finish(), 'file:///isolated-voice.m4a'); assert.equal(h.state.stopped, 1); assert.equal(h.state.removed.length, 0);
  await recorder.cancel(); assert.equal(recorder.getState().phase, 'idle'); assert.equal(h.state.removed.length, 1); assert.equal(h.state.modes.at(-1).allowsRecording, false);
});
test('short/interrupted recordings cannot upload and always release the microphone', async () => {
  for (const kind of ['short', 'interrupted']) {
    const h = fixture(); const recorder = h.recorder(); await recorder.start(); if (kind === 'short') h.state.durationMillis = 100; else h.state.failStop = true;
    await assert.rejects(recorder.finish(), kind === 'short' ? /too short/ : /interrupted/);
    assert.equal(recorder.getState().phase, 'idle'); assert.equal(h.state.released, 1); assert.equal(h.state.interval, null); assert.equal(h.state.modes.at(-1).allowsRecording, false);
  }
});
test('another recorder serially stops/releases the previous microphone owner', async () => {
  const h = fixture(); const first = h.recorder(); const second = h.recorder(); await first.start(); await second.start();
  assert.equal(first.getState().phase, 'idle'); assert.equal(second.getState().phase, 'recording'); assert.equal(h.state.stopped, 1); assert.equal(h.state.released, 1); await second.dispose(); await first.dispose();
});
test('disposing a previous recorder cannot reset the new recorder audio session', async () => {
  const h = fixture(); const first = h.recorder(); const second = h.recorder(); await first.start(); await second.start();
  const count = h.state.modes.length; await first.dispose(); assert.equal(h.state.modes.length, count); assert.equal(h.state.modes.at(-1).allowsRecording, true); await second.dispose();
});
test('inline playback reports progress, pauses and resumes the same player', async () => {
  const h = fixture(); const player = h.player(); await player.toggle();
  assert.equal(h.state.loads, 1); assert.equal(h.state.playerCreates, 1); assert.equal(h.state.plays, 1); assert.equal(h.state.playback.at(-1).playing, true);
  h.state.playerListeners.playbackStatusUpdate({ playing: true, currentTime: 4, duration: 12, isLoaded: true }); assert.equal(h.state.playback.at(-1).currentTime, 4);
  await player.toggle(); assert.equal(h.state.pauses, 1); assert.equal(h.state.playback.at(-1).playing, false);
  await player.toggle(); assert.equal(h.state.playerCreates, 1); assert.equal(h.state.plays, 2); await player.dispose(); assert.equal(h.state.released, 1);
});
test('replaying completed voice seeks to the start', async () => {
  const h = fixture(); const player = h.player(); await player.toggle(); h.state.player.playing = false; h.state.player.currentTime = 12;
  await player.toggle(); assert.deepEqual(h.state.seek, [0]); await player.dispose();
});
test('playback closes recording; recording closes playback', async () => {
  const h = fixture(); const recorder = h.recorder(); const player = h.player(); await recorder.start(); await player.toggle();
  assert.equal(recorder.getState().phase, 'idle'); assert.equal(h.state.released, 1); assert.equal(h.state.plays, 1);
  await recorder.start(); assert.equal(h.state.pauses, 1); assert.equal(h.state.released, 2); await recorder.dispose(); await player.dispose();
});
test('scope disposal/background releases players and rejects stale playback updates', async () => {
  const h = fixture(); const player = h.player(); await player.toggle(); const oldListener = h.state.playerListeners.playbackStatusUpdate; const count = h.state.playback.length;
  h.state.current = false; await player.dispose(); oldListener({ playing: true, currentTime: 10, duration: 12, isLoaded: true });
  assert.equal(h.state.released, 1); assert.equal(Object.keys(h.state.playerListeners).length, 0); assert.equal(h.state.playback.length, count);
});
test('rapid playback taps create only one player', async () => {
  const h = fixture(); const player = h.player(); await Promise.all([player.toggle(), player.toggle(), player.toggle()]);
  assert.equal(h.state.playerCreates, 1); assert.equal(h.state.plays, 1); await player.dispose();
});
