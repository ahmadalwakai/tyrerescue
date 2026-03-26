import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api } from '@/api/client';

/** Notification types that represent critical job alerts. */
const JOB_ALERT_TYPES = new Set([
  'new_job', 'job_assigned', 'new_assignment', 'reassignment', 'upcoming_v2',
]);

const CRITICAL_SOUND_FILE = 'unvversfiled_ringtone_021_365652.mp3';

// Configure how notifications appear when app is in foreground.
// For remote job alert pushes: suppress the system presentation because
// expo-notifications may re-present the notification on a default channel
// (losing the custom sound). We fire our own local notification on the
// correct channel instead — see fireLocalCriticalNotification.
// For local echo notifications (_localEcho flag): allow presentation so the
// native channel sound + vibration plays.
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

/**
 * Create all versioned Android notification channels.
 * New channel IDs (v4/v3) ensure fresh settings — old cached channels are abandoned.
 */
async function createAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  // Critical job channel — MAX importance, custom sound, vibration, bypass DND
  await Notifications.setNotificationChannelAsync('jobs_critical_v4', {
    name: 'Job Alerts',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lightColor: '#F97316',
    sound: CRITICAL_SOUND_FILE,
    enableVibrate: true,
    bypassDnd: true,
  });

  // Upcoming job channel — HIGH importance, sound + vibration
  await Notifications.setNotificationChannelAsync('jobs_upcoming_v3', {
    name: 'Upcoming Job Reminders',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400, 200, 400],
    lightColor: '#F97316',
    sound: CRITICAL_SOUND_FILE,
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

/**
 * Register for push notifications and send the native FCM device token to backend.
 * Returns the device push token string, or null if registration fails.
 * Idempotent within a single app session.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (pushRegistrationInFlight) return pushRegistrationInFlight;

  pushRegistrationInFlight = (async () => {
    if (!Device.isDevice) {
      return null;
    }

    // Check / request permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    // Create Android notification channels (must be done before any notification arrives)
    await createAndroidChannels();

    // Get native device push token (FCM token on Android, APNs token on iOS).
    // This bypasses the Expo Push relay entirely.
    let pushToken: string;
    try {
      const tokenData = await Notifications.getDevicePushTokenAsync();
      pushToken = typeof tokenData.data === 'string'
        ? tokenData.data
        : JSON.stringify(tokenData.data);
    } catch (tokenErr) {
      console.error('[notif] Failed to get native device token:', tokenErr);
      return null;
    }

    // Send native token to backend with tokenType = 'fcm'
    try {
      await api('/api/driver/push-token', {
        method: 'POST',
        body: { pushToken, platform: Platform.OS, tokenType: 'fcm' },
      });
    } catch (regErr) {
      console.error('[notif] Failed to register token with backend:', regErr);
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
 * notification channel, guaranteeing native sound + vibration regardless of
 * expo-av state. The _localEcho flag prevents the notification handler from
 * suppressing it and prevents the received-listener from re-processing it.
 */
export async function fireLocalCriticalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channelId = 'jobs_critical_v4',
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { ...data, _localEcho: true },
      sound: CRITICAL_SOUND_FILE,
    },
    trigger: { channelId },
  });
}

/**
 * Listen for notification taps and return a cleanup function.
 */
export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void,
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(handler);
}

/**
 * Listen for incoming notifications while app is foregrounded.
 */
export function addNotificationReceivedListener(
  handler: (notification: Notifications.Notification) => void,
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(handler);
}
