import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from '@/api/client';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowInForeground: true,
  }),
});

/**
 * Register for push notifications and send token to backend.
 * Returns the Expo push token string, or null if registration fails.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    // Push notifications don't work on emulators
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

  // Android notification channels — versioned so sound/vibration changes take effect
  if (Platform.OS === 'android') {
    // Delete old stale channel that may have no sound configured
    try {
      await Notifications.deleteNotificationChannelAsync('jobs');
    } catch {
      // Channel may not exist — safe to ignore
    }

    await Notifications.setNotificationChannelAsync('jobs_v2', {
      name: 'New Jobs',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500, 200, 500],
      lightColor: '#F97316',
      sound: 'new_job.wav',
      enableVibrate: true,
      bypassDnd: true,
    });
    console.log('[notif] Created Android channel jobs_v2 with sound new_job.wav');

    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 100, 100, 100],
      lightColor: '#3B82F6',
    });

    await Notifications.setNotificationChannelAsync('updates', {
      name: 'App Updates',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  // Get Expo push token — must use explicit projectId for production EAS builds
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    'c97a7bac-50da-42d8-9aef-3071d6b00925';

  let pushToken: string;
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    pushToken = tokenData.data;
    console.log('[notif] Push token obtained:', pushToken.slice(0, 20) + '...');
  } catch (tokenErr) {
    console.error('[notif] Failed to get push token:', tokenErr);
    return null;
  }

  // Send token to backend
  try {
    await api('/api/driver/push-token', {
      method: 'POST',
      body: { pushToken, platform: Platform.OS },
    });
    console.log('[notif] Push token registered with backend');
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
