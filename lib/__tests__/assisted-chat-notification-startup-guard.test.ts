import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DISABLE_ENV = 'EXPO_PUBLIC_ASSISTED_CHAT_DISABLE_NOTIFICATION_STARTUP';

const mocks = vi.hoisted(() => {
  const startupNoop = vi.fn();
  const asyncNoop = vi.fn().mockResolvedValue(undefined);

  return {
    expoNotificationsFactory: vi.fn(() => {
      throw new Error('expo-notifications import factory was invoked while startup is disabled');
    }),
    apiPost: vi.fn().mockResolvedValue({ ok: true }),
    apiDel: vi.fn().mockResolvedValue({ ok: true }),
    asyncStorageGetItem: vi.fn().mockResolvedValue(null),
    asyncStorageSetItem: vi.fn().mockResolvedValue(undefined),
    asyncStorageRemoveItem: vi.fn().mockResolvedValue(undefined),
    startupNoop,
    asyncNoop,
    startUrgentWatcher: vi.fn().mockResolvedValue(true),
    stopUrgentWatcher: vi.fn().mockResolvedValue(true),
    setUrgentWatcherAuth: vi.fn().mockResolvedValue(true),
    clearUrgentWatcherAuth: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

vi.mock('expo-device', () => ({
  isDevice: true,
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: {} },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: mocks.asyncStorageGetItem,
    setItem: mocks.asyncStorageSetItem,
    removeItem: mocks.asyncStorageRemoveItem,
  },
}));

vi.mock('expo-notifications', mocks.expoNotificationsFactory);

vi.mock('../../assisted-chat-app/src/lib/startup-logging', () => ({
  logStartupCheckpoint: mocks.startupNoop,
  logStartupModuleCompleted: mocks.startupNoop,
  logStartupModuleFailed: mocks.startupNoop,
  logStartupModuleStarted: mocks.startupNoop,
}));

vi.mock('../../assisted-chat-app/src/lib/api', () => ({
  API_BASE_URL: 'https://www.tyrerescue.uk',
  api: {
    del: mocks.apiDel,
    post: mocks.apiPost,
    hasAdminToken: true,
  },
  getAdminToken: () => 'admin-token',
}));

vi.mock('../../assisted-chat-app/src/lib/urgent-watcher', () => ({
  canUseFullScreenIntent: vi.fn().mockResolvedValue(true),
  clearUrgentWatcherAuth: mocks.clearUrgentWatcherAuth,
  openFullScreenIntentSettings: vi.fn().mockResolvedValue(false),
  setUrgentWatcherAuth: mocks.setUrgentWatcherAuth,
  startUrgentWatcher: mocks.startUrgentWatcher,
  stopUrgentWatcher: mocks.stopUrgentWatcher,
}));

describe('Assisted Chat notification startup guard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env[DISABLE_ENV] = 'true';
  });

  afterEach(() => {
    delete process.env[DISABLE_ENV];
  });

  it('does not invoke the expo-notifications import factory when startup is disabled', async () => {
    const notifications = await import('../../assisted-chat-app/src/lib/notifications');
    const urgentAlerts = await import('../../assisted-chat-app/src/lib/urgent-alerts');

    await expect(notifications.registerAdminPushNotifications()).resolves.toBeNull();
    await expect(notifications.readAdminNotificationPermissionStatus()).resolves.toBe('undetermined');
    await expect(notifications.requestAdminNotificationPermission()).resolves.toBe('undetermined');
    await expect(notifications.getLastAdminNotificationResponseData()).resolves.toBeNull();
    await expect(notifications.getDeviceFcmToken()).resolves.toBeNull();
    await expect(notifications.clearAdminBadge()).resolves.toBeUndefined();
    await expect(
      notifications.presentLocalUrgentBookingNotification({ bookingId: 'booking-123' }),
    ).resolves.toBeUndefined();

    expect(notifications.addAdminNotificationReceivedListener(() => undefined)).toBeNull();
    expect(notifications.addAdminNotificationResponseListener(() => undefined)).toBeNull();

    await expect(urgentAlerts.initializeUrgentAlerts()).resolves.toBeUndefined();
    await expect(urgentAlerts.registerDirectUrgentBookingToken()).resolves.toBe(false);
    await expect(urgentAlerts.subscribeToUrgentBookingTopic()).resolves.toBe(false);
    await expect(urgentAlerts.showLocalUrgentBookingAlert({ bookingId: 'booking-123' }))
      .resolves
      .toBeUndefined();
    await expect(urgentAlerts.ensureUrgentAlertsArmed()).resolves.toMatchObject({
      armed: false,
      fullScreenIntentGranted: true,
      watcherStarted: false,
    });

    expect(mocks.expoNotificationsFactory).not.toHaveBeenCalled();
    expect(mocks.startUrgentWatcher).not.toHaveBeenCalled();
    expect(mocks.setUrgentWatcherAuth).not.toHaveBeenCalled();
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });
});
