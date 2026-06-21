import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { API, requestJson } from './api';
import { useCustomerAccount } from './customer-account';

type RegisterCustomerPushInput = {
  authToken?: string | null;
  refNumber?: string | null;
  email?: string | null;
};

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

async function getExpoPushToken() {
  if (Platform.OS === 'web') return null;
  if (cachedExpoPushToken) return cachedExpoPushToken;
  if (tokenRequest) return tokenRequest;

  tokenRequest = (async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('booking_updates', {
        name: 'Booking updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#F97316',
      });
    }

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

    if (!granted) return null;

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

export async function registerForCustomerPushNotificationsAsync(input: RegisterCustomerPushInput = {}) {
  try {
    const token = await getExpoPushToken();
    if (!token) return null;

    await requestJson<{ ok: boolean }>(API.customerPushToken, {
      method: 'POST',
      headers: input.authToken ? { Authorization: `Bearer ${input.authToken}` } : undefined,
      body: JSON.stringify({
        token,
        platform: Platform.OS === 'android' ? 'android' : 'ios',
        refNumber: input.refNumber ?? undefined,
        email: input.email ?? undefined,
      }),
    });

    return token;
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
  const ref = extractTrackingRef(response);
  if (!ref) return;
  router.push({ pathname: '/track', params: { ref } });
}

export function CustomerNotificationBootstrap() {
  const { token, profile, bookings } = useCustomerAccount();
  const latestRef = bookings[0]?.refNumber ?? null;

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
    if (!token || !latestRef) return;
    void registerForCustomerPushNotificationsAsync({
      authToken: token,
      refNumber: latestRef,
      email: profile?.email ?? null,
    });
  }, [latestRef, profile?.email, token]);

  return null;
}
