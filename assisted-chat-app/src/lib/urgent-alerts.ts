import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import {
  registerAdminPushNotifications,
  getDeviceFcmToken,
  getUrgentAlertsPermissionStatus,
  presentLocalUrgentBookingNotification,
} from './notifications';

export { isUrgentBookingNotificationData } from './notifications';

export type UrgentAlertsStatus = 'active' | 'no_permission' | 'unavailable';

/**
 * AsyncStorage key that records whether this device has already subscribed
 * to the urgent_bookings FCM topic. We skip the subscription API call on
 * every subsequent app launch to avoid unnecessary network traffic.
 * The flag is a simple "1" string; its presence means "subscribed".
 */
const TOPIC_SUBSCRIBED_KEY = 'assistedChat.urgentBookingTopicSubscribed.v1';
const TOPIC_SUBSCRIBED_TOKEN_KEY = 'assistedChat.urgentBookingTopicSubscribedToken.v1';
const DIRECT_TOKEN_REGISTERED_KEY = 'assistedChat.directFcmRegistered.v1';
const DIRECT_TOKEN_REGISTERED_TOKEN_KEY = 'assistedChat.directFcmRegisteredToken.v1';

/**
 * Initialize urgent alerts on admin app startup.
 *
 * Steps:
 *   1. Set up Android notification channels + request permission + register
 *      the Expo push token with the backend (existing path, unchanged).
 *   2. Subscribe this device to the `urgent_bookings` FCM topic so the backend
 *      can deliver topic messages without managing per-device token lists.
 *
 * Call this once when the admin is authenticated, replacing the previous
 * `registerAdminPushNotifications()` call. Idempotent — safe to call on
 * every app launch. Never throws.
 */
export async function initializeUrgentAlerts(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await registerAdminPushNotifications();
    await registerDirectUrgentBookingToken();
    await subscribeToUrgentBookingTopic();
  } catch (err) {
    console.error('[urgent-alerts] initialization error:', err);
  }
}

/**
 * Register this device's raw Android FCM token so backend can send direct
 * token messages (primary urgent path).
 */
export async function registerDirectUrgentBookingToken(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    const fcmToken = await getDeviceFcmToken();
    if (!fcmToken) {
      console.log('[urgent-alerts] FCM device token unavailable — direct token registration skipped');
      return false;
    }

    const [existing, existingToken] = await Promise.all([
      AsyncStorage.getItem(DIRECT_TOKEN_REGISTERED_KEY),
      AsyncStorage.getItem(DIRECT_TOKEN_REGISTERED_TOKEN_KEY),
    ]);
    if (existing === '1' && existingToken === fcmToken) {
      return true;
    }

    await api.post('/api/mobile/admin/native-alert-token', {
      token: fcmToken,
      platform: 'android',
    });

    await Promise.all([
      AsyncStorage.setItem(DIRECT_TOKEN_REGISTERED_KEY, '1'),
      AsyncStorage.setItem(DIRECT_TOKEN_REGISTERED_TOKEN_KEY, fcmToken),
    ]);

    console.log(`[urgent-alerts] direct FCM token registered tokenSuffix=${fcmToken.slice(-8)}`);
    return true;
  } catch (err) {
    console.error('[urgent-alerts] direct token registration failed:', err);
    return false;
  }
}

/**
 * Subscribe this Android device to the `urgent_bookings` FCM topic.
 *
 * Obtains the raw FCM device token (not the Expo push token) via
 * `getDevicePushTokenAsync` and posts it to `/api/mobile/admin/topic-subscribe`.
 * The backend uses the FCM Instance ID API to register the subscription.
 *
 * Idempotent — skips the network call if the device has already subscribed
 * (flag stored in AsyncStorage). The flag is cleared on logout; on the next
 * login the subscription is refreshed.
 *
 * Returns true if the subscription was confirmed (or was already done).
 * Returns false on iOS, web, simulator, or if the token is unavailable.
 */
export async function subscribeToUrgentBookingTopic(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  // TODO: Preferred approach — client-side topic subscription:
  //   import messaging from '@react-native-firebase/messaging';
  //   await messaging().subscribeToTopic('urgent_bookings');
  // This requires:
  //   1. @react-native-firebase/app + @react-native-firebase/messaging in package.json
  //   2. google-services.json added to the assisted-chat-app root
  //   3. @react-native-firebase/app plugin configured in app.json
  //   4. expo prebuild to generate the native android/ folder (bare workflow)
  // Until those prerequisites are met, we use the backend IID batchAdd approach
  // below (POST /api/mobile/admin/topic-subscribe), which is functionally
  // equivalent but requires a server round-trip.

  try {
    const fcmToken = await getDeviceFcmToken();
    if (!fcmToken) {
      console.log('[urgent-alerts] FCM device token unavailable — topic subscription skipped');
      return false;
    }

    // Skip if we've already subscribed this exact token.
    const [existing, existingToken] = await Promise.all([
      AsyncStorage.getItem(TOPIC_SUBSCRIBED_KEY),
      AsyncStorage.getItem(TOPIC_SUBSCRIBED_TOKEN_KEY),
    ]);
    if (existing === '1' && existingToken === fcmToken) return true;

    await api.post('/api/mobile/admin/topic-subscribe', { token: fcmToken });
    await Promise.all([
      AsyncStorage.setItem(TOPIC_SUBSCRIBED_KEY, '1'),
      AsyncStorage.setItem(TOPIC_SUBSCRIBED_TOKEN_KEY, fcmToken),
    ]);
    console.log('[urgent-alerts] subscribed to urgent_bookings FCM topic');
    return true;
  } catch (err) {
    console.error('[urgent-alerts] topic subscription failed:', err);
    return false;
  }
}

/**
 * Clear the topic subscription flag so that the next call to
 * `subscribeToUrgentBookingTopic` re-subscribes the device.
 * Call on admin logout alongside `unregisterAdminPushNotifications`.
 */
export async function clearTopicSubscriptionFlag(): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem(TOPIC_SUBSCRIBED_KEY),
      AsyncStorage.removeItem(TOPIC_SUBSCRIBED_TOKEN_KEY),
      AsyncStorage.removeItem(DIRECT_TOKEN_REGISTERED_KEY),
      AsyncStorage.removeItem(DIRECT_TOKEN_REGISTERED_TOKEN_KEY),
    ]);
  } catch {
    // ignore
  }
}

/**
 * Get the current urgent alerts status for display.
 *
 * 'active'         — permission granted and topic subscription confirmed.
 * 'no_permission'  — the admin has not granted notification permissions.
 * 'unavailable'    — running on web, iOS, or a simulator (push unavailable).
 *
 * Does not trigger any permission request.
 */
export async function getUrgentAlertsStatus(): Promise<UrgentAlertsStatus> {
  if (Platform.OS !== 'android') return 'unavailable';
  const permission = await getUrgentAlertsPermissionStatus();
  if (permission !== 'granted') return 'no_permission';
  try {
    const subscribed = await AsyncStorage.getItem(TOPIC_SUBSCRIBED_KEY);
    return subscribed === '1' ? 'active' : 'no_permission';
  } catch {
    return 'no_permission';
  }
}

/**
 * Trigger a local urgent booking alert (foreground supplement).
 * Wraps `presentLocalUrgentBookingNotification` from notifications.ts.
 * Call when the polling hook detects a new emergency booking while the
 * app is open, or from a dev test action.
 */
export async function showLocalUrgentBookingAlert(args: {
  bookingId: string;
  title?: string;
  body?: string;
}): Promise<void> {
  if (Platform.OS === 'web') return;
  await presentLocalUrgentBookingNotification(args);
}
