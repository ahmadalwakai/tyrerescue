import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api } from './api';

// ─── Channel IDs ─────────────────────────────────────────────────────────────

export const URGENT_BOOKINGS_CHANNEL_ID = 'urgent-bookings';
// v1 channel matches the channel ID used by the backend FCM topic send.
// Both channels share the same settings — v1 is targeted by FCM-delivered
// messages, while urgent-bookings is used for Expo relay and local alerts.
export const URGENT_BOOKINGS_V1_CHANNEL_ID = 'urgent_bookings_v1';
export const DEFAULT_CHANNEL_ID = 'default';
// Legacy channel kept for backward compatibility with the app.json
// `defaultChannel` and any push tokens already registered on the backend.
export const LEGACY_BOOKINGS_CHANNEL_ID = 'admin_bookings';

// AsyncStorage key consumed by AssistedChatScreen on mount: when the user
// taps a push notification while the app is killed/background, expo-router
// may not be ready to navigate yet, so we persist a "please open bookings"
// flag and the screen clears it once handled.
export const PENDING_OPEN_BOOKINGS_KEY = 'assistedChat.pendingOpenBookings.v1';

// AsyncStorage key for the last urgent booking id the operator has
// acknowledged (either by tapping "Open bookings" or "Dismiss for now").
// Persisted so the popup + sound do not come back when the app is closed
// and reopened on the SAME booking.
export const DISMISSED_URGENT_BOOKING_ID_KEY =
  'assistedChat.dismissedUrgentBookingId.v1';

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

// ─── Android Channels ────────────────────────────────────────────────────────

// Helper to read enum values defensively in case a future expo-notifications
// version renames or drops a member. We never want a missing enum to crash
// the registration flow on production devices.
function getImportance(
  preferred: 'MAX' | 'HIGH' | 'DEFAULT',
): Notifications.AndroidImportance {
  const enumRef = Notifications.AndroidImportance as unknown as
    | Record<string, Notifications.AndroidImportance | undefined>
    | undefined;
  const max = enumRef?.MAX;
  const high = enumRef?.HIGH;
  const def = enumRef?.DEFAULT;
  if (preferred === 'MAX' && typeof max === 'number') return max;
  if ((preferred === 'MAX' || preferred === 'HIGH') && typeof high === 'number') return high;
  if (typeof def === 'number') return def;
  // Fallback to numeric Android value (DEFAULT = 3) — safe last resort.
  return 3 as Notifications.AndroidImportance;
}

function getPublicVisibility(): Notifications.AndroidNotificationVisibility | undefined {
  const enumRef = Notifications.AndroidNotificationVisibility as unknown as
    | Record<string, Notifications.AndroidNotificationVisibility | undefined>
    | undefined;
  const v = enumRef?.PUBLIC;
  return typeof v === 'number' ? v : undefined;
}

// Custom alert sound bundled at `assets/sounds/urgent-booking.mp3` and
// registered in `app.json` under `expo.plugins["expo-notifications"].sounds`.
// The Expo config plugin copies it into Android's `res/raw/` at build time
// so the sound name below resolves on a real device APK.
//
// IMPORTANT (Android channel semantics):
//   Once a channel is created on a device with a given sound, the sound
//   CANNOT be changed for that channel id without the user uninstalling
//   the app (or you bumping the channel id). The `urgent-bookings` channel
//   id below is new, so a fresh APK install picks up this sound.
//
// IMPORTANT (web/Expo Go):
//   Expo Go and web preview cannot bundle custom Android raw resources
//   from the managed workflow. The notification will silently fall back
//   to the system default sound in those environments. Real APK builds
//   are the only place this custom sound is guaranteed to play.
const URGENT_SOUND: string = 'urgent_booking.mp3';

async function setupAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const publicVisibility = getPublicVisibility();

  try {
    await Notifications.setNotificationChannelAsync(URGENT_BOOKINGS_CHANNEL_ID, {
      name: 'Urgent bookings',
      importance: getImportance('MAX'),
      sound: URGENT_SOUND,
      vibrationPattern: [0, 500, 250, 500, 250, 900],
      enableVibrate: true,
      lightColor: '#F97316',
      bypassDnd: false,
      ...(publicVisibility !== undefined ? { lockscreenVisibility: publicVisibility } : {}),
    });
  } catch (err) {
    console.warn('[notif] failed to set up urgent-bookings channel:', err);
  }

  try {
    await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
      name: 'General',
      importance: getImportance('DEFAULT'),
      sound: 'default',
      enableVibrate: true,
    });
  } catch (err) {
    console.warn('[notif] failed to set up default channel:', err);
  }

  // urgent_bookings_v1: targeted by FCM topic messages from the backend.
  // Same sound/vibration settings as urgent-bookings — exists so the two
  // delivery paths (Expo relay + FCM topic) both land on a high-importance
  // channel without duplicating configuration.
  try {
    await Notifications.setNotificationChannelAsync(URGENT_BOOKINGS_V1_CHANNEL_ID, {
      name: 'Urgent bookings (native)',
      importance: getImportance('MAX'),
      sound: URGENT_SOUND,
      vibrationPattern: [0, 500, 250, 500, 250, 900],
      enableVibrate: true,
      lightColor: '#F97316',
      bypassDnd: false,
      ...(publicVisibility !== undefined ? { lockscreenVisibility: publicVisibility } : {}),
    });
  } catch (err) {
    console.warn('[notif] failed to set up urgent_bookings_v1 channel:', err);
  }

  // Keep the legacy channel in sync so any push payload still targeting
  // `admin_bookings` keeps working at MAX importance.
  try {
    await Notifications.setNotificationChannelAsync(LEGACY_BOOKINGS_CHANNEL_ID, {
      name: 'Booking Alerts',
      importance: getImportance('MAX'),
      vibrationPattern: [0, 300, 150, 300],
      lightColor: '#F97316',
      sound: 'default',
      enableVibrate: true,
      bypassDnd: false,
    });
  } catch (err) {
    console.warn('[notif] failed to set up legacy admin_bookings channel:', err);
  }
}

/**
 * Trigger a local high-importance notification while the app is in the
 * foreground. Used as a belt-and-braces audible cue when the urgent
 * in-app popup is displayed (the popup itself is the primary signal —
 * this only adds sound + vibration through the Android channel).
 */
export async function presentLocalUrgentBookingNotification(args: {
  bookingId: string;
  title?: string;
  body?: string;
}): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await scheduleNotificationSafe({
      title: args.title ?? 'Emergency booking received',
      body: args.body ?? 'Open Assisted Chat now',
      bookingId: args.bookingId,
    });
  } catch (err) {
    console.warn('[notif] failed to present local urgent notification:', err);
  }
}

async function scheduleNotificationSafe(args: {
  title: string;
  body: string;
  bookingId: string;
}): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: args.title,
      body: args.body,
      sound: URGENT_SOUND,
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: [0, 500, 250, 500, 250, 900],
      data: { type: 'urgent_booking', bookingId: args.bookingId },
      ...(Platform.OS === 'android'
        ? { channelId: URGENT_BOOKINGS_CHANNEL_ID }
        : {}),
    },
    trigger: null,
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
    // Web has no expo-notifications push surface; bail early so a web
    // preview does not spam permission / token errors.
    if (Platform.OS === 'web') {
      return null;
    }

    // Physical device required for push tokens.
    if (!Device.isDevice) {
      console.log('[notif] push not available on simulator');
      return null;
    }

    // Always set up channels first so any push that arrives between this
    // call and token registration already targets the right channel.
    await setupAndroidChannels();

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

// ─── Pending Open-Bookings Flag (notification tap → modal open) ─────────────

/** Persist the "open bookings on next app focus" request. */
export async function setPendingOpenBookings(): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_OPEN_BOOKINGS_KEY, '1');
  } catch {
    // ignore — pending flag is a best-effort UX nicety
  }
}

/** Consume the pending flag and clear it. Returns true if a request was set. */
export async function consumePendingOpenBookings(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(PENDING_OPEN_BOOKINGS_KEY);
    if (!v) return false;
    await AsyncStorage.removeItem(PENDING_OPEN_BOOKINGS_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect whether a notification response payload describes an urgent
 * booking. Backend should send `data: { type: "urgent_booking", ... }`.
 */
export function isUrgentBookingNotificationData(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const t = (data as { type?: unknown }).type;
  return t === 'urgent_booking';
}

// ─── Dismissed Urgent Booking Memory (survives app restart) ─────────────────

/** Read the last acknowledged urgent booking id, if any. */
export async function getDismissedUrgentBookingId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(DISMISSED_URGENT_BOOKING_ID_KEY);
  } catch {
    return null;
  }
}

/** Persist the urgent booking id the operator has acknowledged. */
export async function setDismissedUrgentBookingId(bookingId: string): Promise<void> {
  if (!bookingId) return;
  try {
    await AsyncStorage.setItem(DISMISSED_URGENT_BOOKING_ID_KEY, bookingId);
  } catch {
    // ignore — best-effort
  }
}

// ─── Raw FCM Device Token (for topic subscription) ───────────────────────────

/**
 * Get the raw Android FCM device token (not the Expo push token).
 *
 * This is the native token required by the FCM Instance ID API for topic
 * subscription. The app posts it to the backend once, which subscribes it
 * to the `urgent_bookings` topic. After that, the backend sends one topic
 * message and FCM delivers it to all subscribed devices.
 *
 * Returns null on web, iOS simulator, or if token retrieval fails.
 * The token is never shown to the admin.
 */
export async function getDeviceFcmToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) return null;
  try {
    const tokenData = await Notifications.getDevicePushTokenAsync();
    if (tokenData.type === 'android' && tokenData.data) return tokenData.data;
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the current notification permission status without triggering a
 * permission request. Used by urgent-alerts.ts for status display.
 */
export async function getUrgentAlertsPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  if (Platform.OS === 'web') return 'undetermined';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch {
    return 'undetermined';
  }
}
