type Subscription = { remove: () => void };

export const DRIVER_JOBS_URGENT_CHANNEL_ID = 'driver_jobs_urgent_v10';
export const JOBS_UPCOMING_CHANNEL_ID = 'jobs_upcoming_v4';

function noopSubscription(): Subscription {
  return { remove: () => {} };
}

export async function registerForPushNotifications(): Promise<string | null> {
  return null;
}

export async function unregisterPushToken(): Promise<void> {
  // Push notifications are native-only in the driver app.
}

export async function fireLocalCriticalNotification(): Promise<string> {
  return '';
}

export async function getLastNotificationResponse(): Promise<null> {
  return null;
}

export function addNotificationResponseListener(): Subscription {
  return noopSubscription();
}

export function addNotificationReceivedListener(): Subscription {
  return noopSubscription();
}
