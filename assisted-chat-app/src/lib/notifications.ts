import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api } from './api';

// ─── Notification Handler ────────────────────────────────────────────────────

// Show notification banner + play sound when app is in foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Android Channel ─────────────────────────────────────────────────────────

async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('admin_bookings', {
    name: 'Booking Alerts',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 300, 150, 300],
    lightColor: '#F97316',
    sound: 'default',
    enableVibrate: true,
    bypassDnd: false,
  });
}

// ─── Registration ─────────────────────────────────────────────────────────────

let registrationInFlight: Promise<string | null> | null = null;

/**
 * Request push notification permissions, register the Expo push token,
 * and upload it to the server. Returns the token or null if unavailable.
 */
export async function registerAdminPushNotifications(): Promise<string | null> {
  if (registrationInFlight) return registrationInFlight;

  registrationInFlight = (async () => {
    // Physical device required for push tokens.
    if (!Device.isDevice) {
      console.log('[notif] push not available on simulator');
      return null;
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[notif] push permission denied');
      return null;
    }

    await setupAndroidChannel();

    let token: string;
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      token = tokenData.data;
    } catch (err) {
      console.error('[notif] failed to get Expo push token:', err);
      return null;
    }

    // Upload token to server (fire-and-forget — don't block UI).
    api
      .post('/api/mobile/admin/push-token', {
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      })
      .catch((err: unknown) => console.error('[notif] failed to upload push token:', err));

    return token;
  })();

  return registrationInFlight;
}

/**
 * Clear the app icon badge count. Call when the app becomes active or
 * the admin opens the bookings list.
 */
export async function clearAdminBadge(): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // Badge not supported — ignore.
  }
}

/**
 * Unregister push notifications and remove the token from the server.
 * Call on admin logout.
 */
export async function unregisterAdminPushNotifications(): Promise<void> {
  registrationInFlight = null;
  try {
    await api.del('/api/mobile/admin/push-token');
  } catch {
    // Best-effort.
  }
}
