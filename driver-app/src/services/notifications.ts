import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from '@/api/client';

/** Notification types that represent critical job alerts. */
const JOB_ALERT_TYPES = new Set([
  'new_job', 'job_assigned', 'new_assignment', 'reassignment', 'upcoming_v2',
]);

const CRITICAL_SOUND_FILE = 'unvversfiled_ringtone_021_365652.mp3';
// Soft background heads-up / tray notification sound. The loud
// `unvversfiled_ringtone_021_365652.mp3` is reserved for the full-screen
// lock-screen pop-up (played by the native DriverJobAlertActivity); the
// background channel notification now uses this gentler tone instead.
const BACKGROUND_SOUND_FILE = 'notification_tone.mp3';

// Active heads-up channel ids. Urgent job alerts share the native full-screen
// channel and stay silent; the app/native alert activities own the looping
// sound and vibration so there is one controllable source to stop.
export const DRIVER_JOBS_URGENT_CHANNEL_ID = 'driver_jobs_urgent_v10';
export const JOBS_UPCOMING_CHANNEL_ID = 'jobs_upcoming_v4';
export const DRIVER_JOB_NOTIFICATION_CATEGORY_ID = 'driverjobalert';
export const DRIVER_JOB_WITH_CALL_NOTIFICATION_CATEGORY_ID = 'driverjobalertcall';
export const NOTIFICATION_ACTION_OPEN_JOB = 'OPEN_JOB';
export const NOTIFICATION_ACTION_NAVIGATE = 'NAVIGATE';
export const NOTIFICATION_ACTION_CALL_CUSTOMER = 'CALL_CUSTOMER';

// Configure how notifications appear when app is in foreground.
// For remote job alert pushes: suppress the system presentation because
// expo-notifications may re-present the notification on a default channel
// (losing the custom sound). We fire our own local notification on the
// correct channel instead — see fireLocalCriticalNotification.
// For local echo notifications (_localEcho flag): allow presentation on the
// selected channel. Urgent new-job echoes are silent; upcoming reminders still
// use their softer channel sound.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown> | undefined;
    const type = typeof data?.type === 'string' ? data.type : null;
    const isLocalEcho = data?._localEcho === true;
    const isJobAlert = !!type && JOB_ALERT_TYPES.has(type);
    const isForeground = AppState.currentState === 'active';

    if (isForeground && isJobAlert && !isLocalEcho) {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      };
    }

    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

let pushRegistrationInFlight: Promise<string | null> | null = null;

function noopNotificationSubscription(): Notifications.EventSubscription {
  return { remove: () => {} } as Notifications.EventSubscription;
}

/**
 * Create all versioned Android notification channels.
 * New channel IDs (v4/v3) ensure fresh settings — old cached channels are abandoned.
 */
async function createAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  // Critical job channel — MAX importance, silent, bypass DND. v10 aligns with
  // the native full-screen notifier and keeps sound/vibration owned by the
  // alert UI, avoiding duplicate ringing loops.
  await Notifications.setNotificationChannelAsync(DRIVER_JOBS_URGENT_CHANNEL_ID, {
    name: 'Job Alerts',
    importance: Notifications.AndroidImportance.MAX,
    lightColor: '#F97316',
    sound: null,
    enableVibrate: false,
    bypassDnd: true,
  });

  // Upcoming job channel — HIGH importance, background tone + vibration.
  // v4: bumped from v3 to pick up the softer background tone.
  await Notifications.setNotificationChannelAsync(JOBS_UPCOMING_CHANNEL_ID, {
    name: 'Upcoming Job Reminders',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400, 200, 400],
    lightColor: '#F97316',
    sound: BACKGROUND_SOUND_FILE,
    enableVibrate: true,
    bypassDnd: true,
  });

  // Messages channel
  await Notifications.setNotificationChannelAsync('messages_v2', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 100, 100, 100],
    lightColor: '#3B82F6',
    sound: 'default',
    enableVibrate: true,
  });

  // Updates channel
  await Notifications.setNotificationChannelAsync('updates_v2', {
    name: 'App Updates',
    importance: Notifications.AndroidImportance.DEFAULT,
  });

  // Legacy channels — keep for backward compatibility with in-flight notifications
  await Notifications.setNotificationChannelAsync('driver_jobs_urgent_v9', {
    name: 'Job Alerts (Legacy v9)',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lightColor: '#F97316',
    sound: BACKGROUND_SOUND_FILE,
    enableVibrate: true,
    bypassDnd: true,
  });
  await Notifications.setNotificationChannelAsync('driver_jobs_urgent_v8', {
    name: 'Job Alerts (Legacy v8)',
    importance: Notifications.AndroidImportance.MAX,
    lightColor: '#F97316',
    sound: null,
    enableVibrate: false,
    bypassDnd: true,
  });
  await Notifications.setNotificationChannelAsync('driver_jobs_urgent_v6', {
    name: 'Job Alerts (Legacy v6)',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lightColor: '#F97316',
    sound: CRITICAL_SOUND_FILE,
    enableVibrate: true,
    bypassDnd: true,
  });
  await Notifications.setNotificationChannelAsync('jobs_upcoming_v3', {
    name: 'Upcoming Job Reminders (Legacy v3)',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400, 200, 400],
    lightColor: '#F97316',
    sound: CRITICAL_SOUND_FILE,
    enableVibrate: true,
    bypassDnd: true,
  });
  await Notifications.setNotificationChannelAsync('driver_jobs_urgent_v5', {
    name: 'Job Alerts (Legacy v5)',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lightColor: '#F97316',
    sound: CRITICAL_SOUND_FILE,
    enableVibrate: true,
    bypassDnd: true,
  });
  await Notifications.setNotificationChannelAsync('jobs', {
    name: 'New Jobs (Legacy)',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lightColor: '#F97316',
    sound: CRITICAL_SOUND_FILE,
    enableVibrate: true,
    bypassDnd: true,
  });
  await Notifications.setNotificationChannelAsync('jobs_v2', {
    name: 'New Jobs (Legacy v2)',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lightColor: '#F97316',
    sound: CRITICAL_SOUND_FILE,
    enableVibrate: true,
    bypassDnd: true,
  });
}

async function registerNotificationCategories(): Promise<void> {
  if (Platform.OS === 'web') return;

  const openJobAction = {
    identifier: NOTIFICATION_ACTION_OPEN_JOB,
    buttonTitle: 'Open route',
    options: { opensAppToForeground: true },
  };

  await Notifications.setNotificationCategoryAsync(
    DRIVER_JOB_NOTIFICATION_CATEGORY_ID,
    [openJobAction],
    {
      previewPlaceholder: 'New driver job',
      categorySummaryFormat: '%u driver job alerts',
    },
  );

  await Notifications.setNotificationCategoryAsync(
    DRIVER_JOB_WITH_CALL_NOTIFICATION_CATEGORY_ID,
    [openJobAction],
    {
      previewPlaceholder: 'New driver job',
      categorySummaryFormat: '%u driver job alerts',
    },
  );
}

function getExpoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

function getJobNotificationCategory(data?: Record<string, unknown>): string {
  void data;
  return DRIVER_JOB_NOTIFICATION_CATEGORY_ID;
}

/**
 * Register for push notifications and send the device token to backend.
 * Android keeps the native FCM token so the existing full-screen-intent
 * watcher can receive data-only job alerts. iOS uses an Expo Push token,
 * which the backend relays to APNs with Apple-compliant Time Sensitive
 * notification metadata. We deliberately do not request Critical Alerts here:
 * Critical Alerts require Apple entitlement approval and must stay disabled
 * until approved.
 * Returns the device push token string, or null if registration fails.
 * Idempotent within a single app session.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (pushRegistrationInFlight) return pushRegistrationInFlight;

  pushRegistrationInFlight = (async () => {
    if (!Device.isDevice) {
      return null;
    }

    await registerNotificationCategories();

    // Check / request permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync(
        Platform.OS === 'ios'
          ? {
              ios: {
                allowAlert: true,
                allowBadge: true,
                allowSound: true,
                allowCriticalAlerts: false,
              },
            }
          : undefined,
      );
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    // Create Android notification channels (must be done before any notification arrives)
    await createAndroidChannels();

    let pushToken: string;
    let tokenType: 'fcm' | 'expo';
    try {
      if (Platform.OS === 'ios') {
        const projectId = getExpoProjectId();
        const tokenData = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        pushToken = tokenData.data;
        tokenType = 'expo';
      } else {
        const tokenData = await Notifications.getDevicePushTokenAsync();
        pushToken = typeof tokenData.data === 'string'
          ? tokenData.data
          : JSON.stringify(tokenData.data);
        tokenType = 'fcm';
      }
    } catch {
      return null;
    }

    try {
      await api('/api/driver/push-token', {
        method: 'POST',
        body: { pushToken, platform: Platform.OS, tokenType },
      });
    } catch {
      return null;
    }

    return pushToken;
  })();

  try {
    return await pushRegistrationInFlight;
  } finally {
    pushRegistrationInFlight = null;
  }
}

/**
 * Unregister push token from backend (e.g. on logout).
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    await api('/api/driver/push-token', {
      method: 'DELETE',
    });
  } catch {
    // Non-fatal
  }
  pushRegistrationInFlight = null;
}

/**
 * Schedule a local notification on the specified channel (defaults to critical).
 * Uses ChannelAwareTriggerInput to deliver immediately on the correct Android
 * notification channel. The _localEcho flag prevents the notification handler
 * from suppressing it and prevents the received-listener from re-processing it.
 */
export async function fireLocalCriticalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channelId = DRIVER_JOBS_URGENT_CHANNEL_ID,
): Promise<string> {
  if (Platform.OS === 'web') return '';
  const content: Notifications.NotificationContentInput = {
    title,
    body,
    data: { ...data, _localEcho: true },
    sound: BACKGROUND_SOUND_FILE,
    categoryIdentifier: getJobNotificationCategory(data),
    interruptionLevel: Platform.OS === 'ios' ? 'timeSensitive' : undefined,
  };

  return Notifications.scheduleNotificationAsync({
    content,
    trigger: Platform.OS === 'android' ? { channelId } : null,
  });
}

/**
 * Read the notification that opened the app. Expo does not implement this on web.
 */
export async function getLastNotificationResponse(): Promise<Notifications.NotificationResponse | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await Notifications.getLastNotificationResponseAsync();
  } catch {
    return null;
  }
}

/**
 * Listen for notification taps and return a cleanup function.
 */
export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void,
): Notifications.EventSubscription {
  if (Platform.OS === 'web') return noopNotificationSubscription();
  return Notifications.addNotificationResponseReceivedListener(handler);
}

/**
 * Listen for incoming notifications while app is foregrounded.
 */
export function addNotificationReceivedListener(
  handler: (notification: Notifications.Notification) => void,
): Notifications.EventSubscription {
  if (Platform.OS === 'web') return noopNotificationSubscription();
  return Notifications.addNotificationReceivedListener(handler);
}
