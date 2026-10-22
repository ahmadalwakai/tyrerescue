import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useCustomerAccount } from './customer-account';
import { listBookingAccess } from './customer-booking-access';
import { customerPushScope, registerCustomerPushDevice } from './customer-push-device';
export { customerPushScope } from './customer-push-device';

type RegisterCustomerPushInput = {
  authToken?: string | null;
  refNumber?: string | null;
  email?: string | null;
  bookingAccessToken?: string | null;
  notificationScope?: number;
};

type DriverNearbyNotificationInput = {
  refNumber: string;
  driverName?: string | null;
  etaMinutes?: number | null;
  distanceMiles?: number | null;
};

const BOOKING_UPDATES_CHANNEL_ID = 'booking_updates';

let cachedExpoPushToken: string | null = null;
let tokenRequest: Promise<string | null> | null = null;

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

function getProjectId() {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return Constants.easConfig?.projectId ?? extra?.eas?.projectId ?? null;
}

async function ensureBookingUpdatesChannelAsync() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(BOOKING_UPDATES_CHANNEL_ID, {
    name: 'Booking updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#F97316',
  });
}

async function ensureCustomerNotificationPermissionAsync() {
  if (Platform.OS === 'web') return false;

  const current = await Notifications.getPermissionsAsync();
  let granted =
    current.granted ||
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    granted =
      requested.granted ||
      requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  }

  return granted;
}

async function getExpoPushToken() {
  if (Platform.OS === 'web') return null;
  if (cachedExpoPushToken) return cachedExpoPushToken;
  if (tokenRequest) return tokenRequest;

  tokenRequest = (async () => {
    await ensureBookingUpdatesChannelAsync();
    if (!(await ensureCustomerNotificationPermissionAsync())) return null;

    const projectId = getProjectId();
    const pushToken = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    cachedExpoPushToken = pushToken.data;
    return cachedExpoPushToken;
  })().finally(() => {
    tokenRequest = null;
  });

  return tokenRequest;
}

function getNearbyNotificationBody(input: DriverNearbyNotificationInput) {
  const driverLabel = input.driverName?.trim() || 'Your driver';
  const details = [
    typeof input.etaMinutes === 'number' ? `about ${input.etaMinutes} min away` : null,
    typeof input.distanceMiles === 'number' ? `${input.distanceMiles.toFixed(input.distanceMiles < 1 ? 1 : 0)} mi away` : null,
  ].filter(Boolean);

  if (details.length) return `${driverLabel} is ${details.join(', ')}.`;
  return `${driverLabel} is near your location.`;
}

export async function notifyCustomerDriverNearbyAsync(input: DriverNearbyNotificationInput) {
  try {
    const scope = customerPushScope();
    if (Platform.OS === 'web') return false;

    await ensureBookingUpdatesChannelAsync();
    if (!(await ensureCustomerNotificationPermissionAsync())) return false;
    if (scope !== customerPushScope()) return false;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Your driver is nearby',
        body: getNearbyNotificationBody(input),
        sound: true,
        data: {
          event: 'driver_nearby',
          ref: input.refNumber,
          url: `/track?ref=${encodeURIComponent(input.refNumber)}`,
        },
      },
      trigger: Platform.OS === 'android' ? { channelId: BOOKING_UPDATES_CHANNEL_ID } : null,
    });

    return true;
  } catch (error) {
    console.warn('[customer-notifications] driver nearby notification failed', error);
    return false;
  }
}

export async function registerForCustomerPushNotificationsAsync(input: RegisterCustomerPushInput = {}) {
  try {
    const scope = input.notificationScope ?? customerPushScope();
    const token = await getExpoPushToken();
    if (!token) return null;
    const registered = await registerCustomerPushDevice({ ...input, token, scope, platform: Platform.OS === 'android' ? 'android' : 'ios' });
    return registered ? token : null;
  } catch (error) {
    console.warn('[customer-notifications] registration failed', error);
    return null;
  }
}

function extractTrackingRef(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as Record<string, unknown>;
  const ref = data.ref;
  if (typeof ref === 'string' && ref.trim()) return ref.trim().toUpperCase();

  const url = data.url;
  if (typeof url !== 'string') return null;

  try {
    const parsed = new URL(url);
    const urlRef = parsed.searchParams.get('ref');
    return urlRef?.trim().toUpperCase() || null;
  } catch {
    return null;
  }
}

function openTrackingFromResponse(response: Notifications.NotificationResponse) {
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  const data = response.notification.request.content.data as Record<string, unknown>;
  if (data.type === 'customer_chat_message' && typeof data.conversationId === 'string') {
    router.push({ pathname: '/chat', params: { conversationId: data.conversationId,
      ...(typeof data.refNumber === 'string' ? { ref: data.refNumber } : {}),
      ...(typeof data.bookingId === 'string' ? { bookingId: data.bookingId } : {}) } });
    return;
  }
  const ref = extractTrackingRef(response);
  if (!ref) return;
  router.push({ pathname: '/track', params: { ref } });
}

export function CustomerNotificationBootstrap() {
  const { token, loading } = useCustomerAccount();

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;

    try {
      const lastResponse = Notifications.getLastNotificationResponse();
      if (lastResponse) {
        openTrackingFromResponse(lastResponse);
        Notifications.clearLastNotificationResponse();
      }
    } catch {
      // Native notifications can be unavailable in web/simulator contexts.
    }

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      openTrackingFromResponse(response);
      try {
        Notifications.clearLastNotificationResponse();
      } catch {
        // Ignore native cleanup failures; the app route has already changed.
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (loading) return;
    let active = true;
    const register = async () => {
      if (!active) return;
      if (token) await registerForCustomerPushNotificationsAsync({ authToken: token });
      else for (const receipt of await listBookingAccess()) {
        if (!active) return;
        await registerForCustomerPushNotificationsAsync(receipt);
      }
    };
    void register();
    const timer = setInterval(() => { void register(); }, 5 * 60_000);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void register(); });
    return () => { active = false; clearInterval(timer); listener.remove(); };
  }, [loading, token]);

  return null;
}
