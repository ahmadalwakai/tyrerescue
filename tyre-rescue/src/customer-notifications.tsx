import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useCustomerAccount } from './customer-account';
import { requestJson } from './api';
import { listBookingAccess } from './customer-booking-access';
import { customerPushScope, registerCustomerPushDevice } from './customer-push-device';
import { CUSTOMER_NOTIFICATION_CATEGORIES, CUSTOMER_NOTIFICATION_CHANNEL,
  createCustomerNotificationInbox, customerNotificationHasAccess, customerNotificationTarget } from './customer-notification-contract';
import { customerNotificationPermission } from './customer-notification-permissions';
import { createCustomerNotificationBadge, subscribeCustomerNotificationBadgeRefresh } from './customer-notification-badge';
export { customerPushScope } from './customer-push-device';

type RegisterCustomerPushInput = {
  authToken?: string | null; refNumber?: string | null; email?: string | null;
  bookingAccessToken?: string | null; notificationScope?: number; requestPermission?: boolean;
};

let cachedExpoPushToken: { value: string; savedAt: number } | null = null;
let tokenRequest: { generation: number; promise: Promise<string | null> } | null = null;
let tokenGeneration = 0;
let currentDevicePushToken: Notifications.DevicePushToken | null = null;
let setupRequest: Promise<void> | null = null;
let permissionRequest: Promise<Notifications.NotificationPermissionsStatus> | null = null;
let foregroundAudience: (() => { ready: boolean; customerId: string | null; scope: number; bookingRefs: string[] }) | null = null;

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async notification => {
      const audience = foregroundAudience?.();
      const target = customerNotificationTarget({ actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER, notification }, Notifications.DEFAULT_ACTION_IDENTIFIER);
      let show = false;
      if (target && audience?.ready && audience.scope === customerPushScope()) {
        const guestRefs = target.recipientCustomerId ? [] : await listBookingAccess().then(items => items.map(item => item.refNumber)).catch(() => []);
        const current = foregroundAudience?.();
        show = Boolean(current?.ready && current.scope === audience.scope && audience.scope === customerPushScope() && customerNotificationHasAccess(target, {
          customerId: current.customerId, bookingRefs: current.bookingRefs, guestRefs,
        }));
      }
      return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: show };
    },
  });
}

export async function prepareCustomerNotificationsAsync() {
  if (Platform.OS === 'web') return;
  if (!setupRequest) setupRequest = (async () => {
    await Promise.all(CUSTOMER_NOTIFICATION_CATEGORIES.map(category =>
      Notifications.setNotificationCategoryAsync(category.identifier, category.actions, { previewPlaceholder: 'Tyre Rescue update' })));
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CUSTOMER_NOTIFICATION_CHANNEL, {
      name: 'Booking updates', importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250], lightColor: '#F97316',
    });
  })().catch(error => { setupRequest = null; throw error; });
  return setupRequest;
}

export async function readCustomerNotificationPermissionAsync() {
  if (Platform.OS === 'web') return customerNotificationPermission(null, Platform.OS);
  return customerNotificationPermission(await Notifications.getPermissionsAsync(), Platform.OS);
}

export async function requestCustomerNotificationPermissionAsync() {
  if (Platform.OS === 'web') return customerNotificationPermission(null, Platform.OS);
  await prepareCustomerNotificationsAsync();
  const current = await Notifications.getPermissionsAsync();
  if (!customerNotificationPermission(current, Platform.OS).canRequest) return customerNotificationPermission(current, Platform.OS);
  if (!permissionRequest) permissionRequest = Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  }).finally(() => { permissionRequest = null; });
  return customerNotificationPermission(await permissionRequest, Platform.OS);
}

function invalidatePushToken() {
  tokenGeneration += 1;
  cachedExpoPushToken = null;
  tokenRequest = null;
}

async function getExpoPushToken(requestPermission: boolean) {
  if (Platform.OS === 'web') return null;
  await prepareCustomerNotificationsAsync();
  const permission = requestPermission ? await requestCustomerNotificationPermissionAsync() : await readCustomerNotificationPermissionAsync();
  if (!permission.canReceive) { invalidatePushToken(); return null; }
  if (cachedExpoPushToken && Date.now() - cachedExpoPushToken.savedAt < 5 * 60_000) return cachedExpoPushToken.value;
  if (tokenRequest?.generation === tokenGeneration) return tokenRequest.promise;
  const generation = tokenGeneration;
  const promise = (async () => {
    const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
    const projectId = Constants.easConfig?.projectId ?? extra?.eas?.projectId;
    const pushToken = await Notifications.getExpoPushTokenAsync({ ...(projectId ? { projectId } : {}),
      ...(currentDevicePushToken ? { devicePushToken: currentDevicePushToken } : {}) });
    if (generation !== tokenGeneration) return null;
    cachedExpoPushToken = { value: pushToken.data, savedAt: Date.now() };
    return pushToken.data;
  })().finally(() => { if (tokenRequest?.generation === generation) tokenRequest = null; });
  tokenRequest = { generation, promise };
  return promise;
}

export async function registerForCustomerPushNotificationsAsync(input: RegisterCustomerPushInput = {}) {
  try {
    const scope = input.notificationScope ?? customerPushScope();
    const token = await getExpoPushToken(input.requestPermission ?? true);
    if (!token || scope !== customerPushScope()) return null;
    const registered = await registerCustomerPushDevice({ ...input, token, scope, platform: Platform.OS === 'android' ? 'android' : 'ios' });
    return registered ? token : null;
  } catch {
    console.warn('[customer-notifications] registration unavailable; retry on foreground');
    return null;
  }
}

export async function refreshCustomerPushRegistrationAsync(authToken?: string | null) {
  if (Platform.OS === 'web') return;
  const notificationScope = customerPushScope();
  if (authToken) await registerForCustomerPushNotificationsAsync({ authToken, notificationScope, requestPermission: false });
  else for (const receipt of await listBookingAccess()) {
    if (notificationScope !== customerPushScope()) return;
    await registerForCustomerPushNotificationsAsync({ ...receipt, notificationScope, requestPermission: false });
  }
}

function clearLastResponse() {
  try { Notifications.clearLastNotificationResponse(); } catch { /* Not available in every runtime. */ }
}

export function CustomerNotificationBootstrap() {
  const account = useCustomerAccount();
  const navigation = useRootNavigationState();
  const latest = useRef(account);
  const audienceScope = useRef(customerPushScope());
  latest.current = account;
  audienceScope.current = customerPushScope();
  const accountHydrated = useRef(!account.loading);
  if (!account.loading) accountHydrated.current = true;
  const inbox = useRef(createCustomerNotificationInbox());
  const [responseRevision, setResponseRevision] = useState(0);
  const [badge] = useState(() => createCustomerNotificationBadge({
    listBookingAccess,
    setBadgeCountAsync: count => Notifications.setBadgeCountAsync(count),
    requestCount: async (headers, refNumber) => {
      const result = await requestJson<{ unreadCount: number }>(`/api/mobile/customer/notifications/unread${refNumber ? `?ref=${encodeURIComponent(refNumber)}` : ''}`, { headers });
      return result.unreadCount;
    },
  }));
  const badgeInitialized = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web' || (!badgeInitialized.current && account.loading)) return;
    badgeInitialized.current = true;
    void badge.setSession({ token: account.token, revision: account.sessionRevision });
    if (!account.loading) void badge.refresh();
  }, [account.loading, account.sessionRevision, account.token, badge]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const refresh = () => { if (!latest.current.loading) void badge.refresh(); };
    const received = Notifications.addNotificationReceivedListener(refresh);
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const unsubscribe = subscribeCustomerNotificationBadgeRefresh(refresh);
    return () => { received.remove(); foreground.remove(); unsubscribe(); void badge.clear(); };
  }, [badge]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const audience = () => ({ ready: !latest.current.loading, customerId: latest.current.profile?.id ?? null, scope: audienceScope.current,
      bookingRefs: latest.current.bookings.map(booking => booking.refNumber) });
    foregroundAudience = audience;
    void prepareCustomerNotificationsAsync().catch(() => {});
    const accept = (response: Notifications.NotificationResponse) => {
      const target = customerNotificationTarget(response, Notifications.DEFAULT_ACTION_IDENTIFIER);
      if (target && inbox.current.offer(target, accountHydrated.current ? latest.current.sessionRevision : null)) setResponseRevision(value => value + 1);
      clearLastResponse();
    };
    const responseListener = Notifications.addNotificationResponseReceivedListener(accept);
    try { const response = Notifications.getLastNotificationResponse(); if (response) accept(response); } catch { /* Unsupported runtime. */ }
    const tokenListener = Notifications.addPushTokenListener(deviceToken => {
      if (currentDevicePushToken?.type === deviceToken.type && currentDevicePushToken.data === deviceToken.data) return;
      currentDevicePushToken = deviceToken;
      invalidatePushToken();
      if (!latest.current.loading) void refreshCustomerPushRegistrationAsync(latest.current.token).catch(() => {});
    });
    return () => { responseListener.remove(); tokenListener.remove(); if (foregroundAudience === audience) foregroundAudience = null; };
  }, []);

  useEffect(() => {
    if (!responseRevision) return;
    const target = inbox.current.take(Boolean(navigation?.key) && !account.loading, account.sessionRevision);
    if (!target) return;
    let active = true;
    const revision = account.sessionRevision;
    const scope = customerPushScope();
    const current = () => active && latest.current.sessionRevision === revision && scope === customerPushScope() && !latest.current.loading;
    void (async () => {
      const guestRefs = (await listBookingAccess()).map(item => item.refNumber);
      if (!current()) return;
      let hasAccess = customerNotificationHasAccess(target, {
        customerId: latest.current.profile?.id ?? null,
        bookingRefs: latest.current.bookings.map(booking => booking.refNumber), guestRefs,
      });
      if (!hasAccess && latest.current.token && !target.recipientCustomerId) {
        await latest.current.refresh();
        if (!current()) return;
        hasAccess = customerNotificationHasAccess(target, {
          customerId: latest.current.profile?.id ?? null,
          bookingRefs: latest.current.bookings.map(booking => booking.refNumber), guestRefs,
        });
      }
      if (!current()) return;
      if (!hasAccess) { router.push('/account'); return; }
      if (target.destination === 'chat') router.push({ pathname: '/chat', params: { ref: target.ref,
        ...(target.conversationId ? { conversationId: target.conversationId } : {}),
        ...(target.bookingId ? { bookingId: target.bookingId } : {}) } });
      else router.push({ pathname: target.destination === 'service-report' ? '/service-report' : '/track', params: { ref: target.ref } });
    })().catch(() => { if (current()) router.push('/account'); });
    return () => { active = false; };
  }, [account.loading, account.sessionRevision, navigation?.key, responseRevision]);

  useEffect(() => {
    if (Platform.OS === 'web' || account.loading) return;
    let active = true;
    let busy = false;
    const register = async () => {
      if (!active || busy) return;
      busy = true;
      try { await refreshCustomerPushRegistrationAsync(account.token); } catch { /* Retry when connection returns. */ }
      finally { busy = false; }
    };
    void register();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void register(); }, 5 * 60_000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void register(); });
    return () => { active = false; clearInterval(timer); listener.remove(); };
  }, [account.loading, account.token, account.sessionRevision]);
  return null;
}
