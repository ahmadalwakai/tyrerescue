import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api } from '@/api/client';

// Configure how notifications appear when app is in foreground.
// We always show the system heads-up banner so the native Android notification
// appears even when the app is open. shouldPlaySound is true so the channel
// sound plays natively (dedupe prevents double-play with in-app sound).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let pushRegistered = false;

/**
 * Create all versioned Android notification channels.
 * New channel IDs (v3/v2) ensure fresh settings — old cached channels are abandoned.
 */
async function createAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  // Critical job channel — MAX importance, custom sound, vibration, bypass DND
  await Notifications.setNotificationChannelAsync('jobs_critical_v3', {
    name: 'Job Alerts',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lightColor: '#F97316',
    sound: 'new_job.wav',
    enableVibrate: true,
    bypassDnd: true,
  });

  // Upcoming job channel — HIGH importance, sound + vibration
  await Notifications.setNotificationChannelAsync('jobs_upcoming_v2', {
    name: 'Upcoming Job Reminders',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400, 200, 400],
    lightColor: '#F97316',
    sound: 'new_job.wav',
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
    sound: 'new_job.wav',
    enableVibrate: true,
    bypassDnd: true,
  });
  await Notifications.setNotificationChannelAsync('jobs_v2', {
    name: 'New Jobs (Legacy v2)',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lightColor: '#F97316',
    sound: 'new_job.wav',
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
  if (pushRegistered) return null;
  pushRegistered = true;

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
  }

  return pushToken;
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
  pushRegistered = false;
}

/**
 * Schedule a local notification on the critical job channel.
 * Used in foreground to trigger native sound + vibration through the channel,
 * ensuring sound works even if expo-av fails.
 */
export async function fireLocalCriticalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'new_job.wav',
    },
    trigger: null, // immediate
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
