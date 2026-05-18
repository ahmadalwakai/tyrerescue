import AsyncStorage from '@react-native-async-storage/async-storage';

export const URGENT_BOOKINGS_CHANNEL_ID = 'urgent-bookings';
export const URGENT_BOOKINGS_V1_CHANNEL_ID = 'urgent_bookings_v1';
export const DEFAULT_CHANNEL_ID = 'default';
export const LEGACY_BOOKINGS_CHANNEL_ID = 'admin_bookings';
export const PENDING_OPEN_BOOKINGS_KEY = 'assistedChat.pendingOpenBookings.v1';
export const DISMISSED_URGENT_BOOKING_ID_KEY =
  'assistedChat.dismissedUrgentBookingId.v1';

export interface NotificationSubscription {
  remove: () => void;
}

export async function presentLocalUrgentBookingNotification(_args: {
  bookingId: string;
  title?: string;
  body?: string;
}): Promise<void> {
  void _args;
  return undefined;
}

export function addAdminNotificationReceivedListener(
  _listener: () => void,
): NotificationSubscription | null {
  void _listener;
  return null;
}

export function addAdminNotificationResponseListener(
  _listener: (data: unknown) => void,
): NotificationSubscription | null {
  void _listener;
  return null;
}

export async function registerAdminPushNotifications(): Promise<string | null> {
  return null;
}

export async function clearAdminBadge(): Promise<void> {
  return undefined;
}

export async function unregisterAdminPushNotifications(): Promise<void> {
  return undefined;
}

export async function setPendingOpenBookings(): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_OPEN_BOOKINGS_KEY, '1');
  } catch {
    // ignore
  }
}

export async function consumePendingOpenBookings(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(PENDING_OPEN_BOOKINGS_KEY);
    if (!value) return false;
    await AsyncStorage.removeItem(PENDING_OPEN_BOOKINGS_KEY);
    return true;
  } catch {
    return false;
  }
}

export function isUrgentBookingNotificationData(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  return (data as { type?: unknown }).type === 'urgent_booking';
}

export async function getDismissedUrgentBookingId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(DISMISSED_URGENT_BOOKING_ID_KEY);
  } catch {
    return null;
  }
}

export async function setDismissedUrgentBookingId(bookingId: string): Promise<void> {
  if (!bookingId) return;
  try {
    await AsyncStorage.setItem(DISMISSED_URGENT_BOOKING_ID_KEY, bookingId);
  } catch {
    // ignore
  }
}

export async function getDeviceFcmToken(): Promise<string | null> {
  return null;
}

export async function getUrgentAlertsPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  return 'undetermined';
}