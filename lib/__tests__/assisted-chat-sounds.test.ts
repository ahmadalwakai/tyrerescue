import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChatSoundTracker, type ChatSoundMessage } from '../../assisted-chat-app/src/lib/chat-sound-tracker';

function message(id: string, extra: Partial<ChatSoundMessage> = {}): ChatSoundMessage {
  return { id, senderId: 'driver-1', senderRole: 'driver', messageType: 'text', createdAt: '2026-10-22T12:00:00.000Z', ...extra };
}

describe('foreground chat sound message decisions', () => {
  it('silences existing history and repeated polling, then sounds a new incoming message only once', () => {
    const tracker = createChatSoundTracker('admin-1');
    expect(tracker.observe([message('existing')])).toBe(false);
    expect(tracker.observe([message('existing')])).toBe(false);
    const next = message('new', { createdAt: '2026-10-22T12:00:01.000Z' });
    expect(tracker.observe([message('existing'), next])).toBe(true);
    expect(tracker.observe([message('existing'), next])).toBe(false);
  });

  it('does not sound for edits, admin messages, notes, self messages, or deleted messages', () => {
    const tracker = createChatSoundTracker('admin-1');
    tracker.observe([message('existing')]);
    expect(tracker.observe([
      message('existing', { createdAt: '2026-10-22T12:00:01.000Z' }),
      message('another-admin', { senderRole: 'admin' }),
      message('note', { messageType: 'admin_note' }),
      message('self', { senderId: 'admin-1' }),
      message('deleted', { deleted: true }),
    ])).toBe(false);
  });

  it('silences older pagination but accepts different incoming IDs with the same latest timestamp', () => {
    const tracker = createChatSoundTracker();
    tracker.observe([message('latest')]);
    expect(tracker.observe([message('older', { createdAt: '2026-10-21T12:00:00.000Z' })])).toBe(false);
    expect(tracker.observe([message('same-time')])).toBe(true);
  });

  it('collapses several new driver/customer messages into one receive decision', () => {
    const tracker = createChatSoundTracker();
    tracker.observe([]);
    expect(tracker.observe([message('one'), message('two', { senderRole: 'customer' })])).toBe(true);
    expect(tracker.observe([message('one'), message('two')])).toBe(false);
  });

  it('does not sound for malformed dates and resets to a silent baseline on re-entry', () => {
    const tracker = createChatSoundTracker();
    tracker.observe([]);
    expect(tracker.observe([message('invalid', { createdAt: 'invalid' })])).toBe(false);
    expect(tracker.observe([message('valid')])).toBe(true);
    tracker.reset();
    expect(tracker.observe([message('new-baseline')])).toBe(false);
  });

  it('deduplicates a confirmed server send ID', () => {
    const tracker = createChatSoundTracker();
    expect(tracker.confirmSent('confirmed-server-id')).toBe(true);
    expect(tracker.confirmSent('confirmed-server-id')).toBe(false);
    expect(tracker.confirmSent('another-server-id')).toBe(true);
  });
});

type NotificationData = { type?: string; version?: number; bookingId?: string };
type Notification = { request: { identifier: string; content: { data: NotificationData } } };
type Behavior = { shouldPlaySound: boolean; shouldSetBadge: boolean; shouldShowBanner: boolean; shouldShowList: boolean };
type SoundSession = { play(kind: 'send' | 'receive'): Promise<boolean>; dispose(): void };
interface Facade {
  createForegroundChatSoundSession(isCurrent: () => boolean): SoundSession;
  addAdminNotificationReceivedListener(callback: (data: NotificationData) => void): { remove(): void };
  addAdminNotificationResponseListener(callback: (data: NotificationData) => void): { remove(): void };
  getLastAdminNotificationResponseData(): Promise<unknown>;
}

const notificationSource = fs.readFileSync(path.resolve(__dirname, '../../assisted-chat-app/src/lib/notifications.ts'), 'utf8');
const compiled = ts.transpileModule(notificationSource, { compilerOptions: {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
} }).outputText;

function harness() {
  const state = { platform: 'ios', current: true, foreground: 'active', startupDisabled: false };
  const appState = { get currentState() { return state.foreground; } };
  let handler!: { handleNotification(notification: Notification): Promise<Behavior> };
  let received!: (notification: Notification) => void;
  let responded!: (response: { notification: Notification }) => void;
  const permissions = vi.fn(async () => ({ status: 'granted', ios: { allowsSound: true } }));
  const scheduled = vi.fn(async (request: { identifier: string; content: { data: NotificationData } }) => request.identifier);
  const native = {
    setNotificationHandler: vi.fn((value: typeof handler) => { handler = value; }),
    getPermissionsAsync: permissions,
    scheduleNotificationAsync: scheduled,
    cancelScheduledNotificationAsync: vi.fn(async () => undefined),
    dismissNotificationAsync: vi.fn(async () => undefined),
    addNotificationReceivedListener: vi.fn((value: typeof received) => { received = value; return { remove: vi.fn() }; }),
    addNotificationResponseReceivedListener: vi.fn((value: typeof responded) => { responded = value; return { remove: vi.fn() }; }),
    getLastNotificationResponseAsync: vi.fn(async () => ({ notification: { request: {
      identifier: 'stale-local-sound', content: { data: { type: 'assisted_chat_sound', version: 1 } },
    } } })),
  };
  const fixture = { exports: {} };
  const imports: string[] = [];
  const logging = new Proxy({}, { get: () => vi.fn() });
  new vm.Script(compiled).runInNewContext({
    module: fixture, exports: fixture.exports, console: { error: vi.fn(), warn: vi.fn() },
    setTimeout, clearTimeout, process: { env: {} },
    require: (id: string) => {
      imports.push(id);
      if (id === 'react-native') return { Platform: { get OS() { return state.platform; } }, AppState: appState };
      if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: {} };
      if (id === 'expo-device') return { isDevice: true };
      if (id === 'expo-notifications') return native;
      if (id === './api') return {};
      if (id === './startup-logging') return logging;
      if (id === './notification-startup-config') return { isNotificationStartupDisabled: () => state.startupDisabled };
      if (id === './notification-safety') return {
        normalizePermissionResponse: (value: { status?: string }) => value.status,
        extractNotificationResponseData: (response: { notification?: Notification }) => response?.notification?.request?.content?.data,
      };
      throw new Error(`Unexpected sound test module ${id}`);
    },
  });
  const facade = fixture.exports as Facade;
  return { state, facade, native, imports, get handler() { return handler; },
    get received() { return received; }, get responded() { return responded; },
    session: () => facade.createForegroundChatSoundSession(() => state.current),
  };
}

afterEach(() => { vi.useRealTimers(); });

describe('iOS foreground chat sound-only native requests', () => {
  it('loads no native notification module until playback and keeps the request free of customer data', async () => {
    vi.useFakeTimers();
    const h = harness();
    expect(h.imports).not.toContain('expo-notifications');
    const session = h.session();
    await expect(session.play('send')).resolves.toBe(true);
    const request = h.native.scheduleNotificationAsync.mock.calls[0][0];
    expect(request).toMatchObject({ content: { sound: 'chat-send.wav', data: { type: 'assisted_chat_sound', version: 1 } }, trigger: null });
    expect(request.content).not.toHaveProperty('title');
    expect(request.content).not.toHaveProperty('body');
    const behavior = await h.handler.handleNotification({ request });
    expect(behavior).toMatchObject({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: false, shouldShowList: false });
    expect(request.content).toHaveProperty('interruptionLevel', 'active');
    session.dispose();
    await vi.runAllTimersAsync();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the distinct downloaded receive filename and preserves ordinary push behavior', async () => {
    vi.useFakeTimers();
    const h = harness(); const session = h.session();
    await session.play('receive');
    expect(h.native.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.objectContaining({ sound: 'chat-receive.wav' }),
    }));
    expect(await h.handler.handleNotification({ request: { identifier: 'real-push', content: { data: { type: 'urgent_booking' } } } }))
      .toMatchObject({ shouldPlaySound: true, shouldShowBanner: true, shouldShowList: true, shouldSetBadge: true });
    session.dispose();
  });

  it.each(['denied', 'undetermined'])('does not prompt or schedule when notification permission is %s', async (status) => {
    const h = harness();
    h.native.getPermissionsAsync.mockResolvedValue({ status, ios: { allowsSound: true } });
    await expect(h.session().play('send')).resolves.toBe(false);
    expect(h.native.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('does not schedule when iOS sound permission is disabled', async () => {
    const h = harness();
    h.native.getPermissionsAsync.mockResolvedValue({ status: 'granted', ios: { allowsSound: false } });
    await expect(h.session().play('receive')).resolves.toBe(false);
    expect(h.native.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it.each(['android', 'web'])('does not load native notification playback on %s', async (platform) => {
    const h = harness(); h.state.platform = platform;
    await expect(h.session().play('send')).resolves.toBe(false);
    expect(h.imports).not.toContain('expo-notifications');
  });

  it('honors the startup isolation flag before loading a native module', async () => {
    const h = harness(); h.state.startupDisabled = true;
    await expect(h.session().play('send')).resolves.toBe(false);
    expect(h.imports).not.toContain('expo-notifications');
  });

  it('silences a background, expired, unregistered, or disposed request at delivery time', async () => {
    vi.useFakeTimers();
    const h = harness(); const session = h.session();
    await session.play('receive');
    const request = h.native.scheduleNotificationAsync.mock.calls[0][0];
    h.state.foreground = 'background';
    expect((await h.handler.handleNotification({ request })).shouldPlaySound).toBe(false);
    h.state.foreground = 'active'; h.state.current = false;
    expect((await h.handler.handleNotification({ request })).shouldPlaySound).toBe(false);
    h.state.current = true;
    await vi.advanceTimersByTimeAsync(2_001);
    expect((await h.handler.handleNotification({ request })).shouldPlaySound).toBe(false);
    session.dispose();
    expect(h.native.cancelScheduledNotificationAsync).toHaveBeenCalledWith(request.identifier);
    expect(h.native.dismissNotificationAsync).toHaveBeenCalledWith(request.identifier);
  });

  it('ignores a permission read that returns after closing or switching chat', async () => {
    const h = harness(); let resolve!: (value: { status: string; ios: { allowsSound: boolean } }) => void;
    h.native.getPermissionsAsync.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const session = h.session(); const playing = session.play('send');
    await vi.waitFor(() => expect(h.native.getPermissionsAsync).toHaveBeenCalledOnce());
    session.dispose(); resolve({ status: 'granted', ios: { allowsSound: true } });
    await expect(playing).resolves.toBe(false);
    expect(h.native.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('filters sound-only deliveries/responses from admin alerts, header counters, and pending navigation', async () => {
    vi.useFakeTimers();
    const h = harness(); const received = vi.fn(); const responded = vi.fn();
    const receiveSubscription = h.facade.addAdminNotificationReceivedListener(received);
    const responseSubscription = h.facade.addAdminNotificationResponseListener(responded);
    await vi.waitFor(() => expect(h.native.addNotificationResponseReceivedListener).toHaveBeenCalledOnce());
    const sound = { request: { identifier: 'sound-only', content: { data: { type: 'assisted_chat_sound', version: 1 } } } };
    h.received(sound); h.responded({ notification: sound });
    expect(received).not.toHaveBeenCalled(); expect(responded).not.toHaveBeenCalled();
    await expect(h.facade.getLastAdminNotificationResponseData()).resolves.toBeNull();
    const real = { request: { identifier: 'booking-push', content: { data: { type: 'urgent_booking', bookingId: 'booking-fixture' } } } };
    h.received(real); h.responded({ notification: real });
    expect(received).toHaveBeenCalledWith(real.request.content.data);
    expect(responded).toHaveBeenCalledWith(real.request.content.data);
    receiveSubscription.remove(); responseSubscription.remove();
  });
});

describe('downloaded chat sound assets', () => {
  it.each([
    ['chat-send.wav', '3d9e86003f8ebd1a3f6f3d8af65b6b682562a46d532ccd204dcba21305b950ff'],
    ['chat-receive.wav', 'f9d0ef5a5c740c2ac250ac3876db9e4340669044a5bf78ae09192918db3e2ebc'],
  ])('preserves the downloaded %s PCM WAV and includes it in native sound resources', (name, sha) => {
    const buffer = fs.readFileSync(path.resolve(__dirname, '../../assisted-chat-app/assets/sounds', name));
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(buffer.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(crypto.createHash('sha256').update(buffer).digest('hex')).toBe(sha);
    const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../assisted-chat-app/app.json'), 'utf8'));
    const plugin = config.expo.plugins.find((entry: unknown) => Array.isArray(entry) && entry[0] === 'expo-notifications');
    expect(plugin[1].sounds).toContain(`./assets/sounds/${name}`);
  });
});
