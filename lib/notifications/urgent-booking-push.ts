import { isFcmConfigured, sendFcmTopicNotification } from './fcm';
import { sendAdminExpoPush } from './expo-admin-push';

/**
 * FCM topic that all Assisted Chat app installs subscribe to on first open.
 * The backend sends one message; FCM fans it out to every subscribed device.
 * No per-device token iteration is needed on the backend side.
 */
const URGENT_BOOKINGS_TOPIC = 'urgent_bookings';

/**
 * Android notification channel that must exist on the receiving device.
 * Created by the Assisted Chat app on startup via expo-notifications.
 * Must match `URGENT_BOOKINGS_V1_CHANNEL_ID` in the app's notifications.ts.
 */
const URGENT_CHANNEL_ID = 'urgent_bookings_v1';

interface UrgentBookingPushArgs {
  bookingId: string;
  customerPhone?: string;
  createdAt?: string;
  title?: string;
  body?: string;
}

/**
 * Send an urgent booking push notification to all admin devices.
 *
 * Delivery strategy (in priority order):
 *
 * 1. FCM topic message (if FCM_PROJECT_ID + FCM_SERVICE_ACCOUNT_JSON are set):
 *    Sends to topic `urgent_bookings`. Every Assisted Chat app that has called
 *    `/api/mobile/admin/topic-subscribe` will receive this instantly, even if
 *    the app is killed. No token list management required on the backend.
 *
 * 2. Expo push relay fallback (if FCM is not configured):
 *    Falls back to the Expo Push Service using registered ExponentPushTokens.
 *    This path works in development and staging where FCM may not be set up.
 *
 * Idempotency:
 *    This function is fire-and-forget. Call sites (Stripe webhook) are already
 *    idempotent — duplicate Stripe events are filtered before this is reached.
 *
 * Never throws — all errors are logged only.
 */
export async function sendUrgentBookingTopicPush(args: UrgentBookingPushArgs): Promise<void> {
  const title = args.title ?? 'Emergency booking received';
  const body = args.body ?? 'Open Assisted Chat now';

  const data: Record<string, string> = {
    type: 'urgent_booking',
    bookingId: args.bookingId,
  };
  if (args.customerPhone) data.customerPhone = args.customerPhone;
  if (args.createdAt) data.createdAt = args.createdAt;

  if (isFcmConfigured()) {
    const result = await sendFcmTopicNotification(
      URGENT_BOOKINGS_TOPIC,
      title,
      body,
      data,
      {
        channelId: URGENT_CHANNEL_ID,
        priority: 'high',
        sound: 'urgent_booking',
        notificationPriority: 'PRIORITY_MAX',
        vibrateTimings: ['0s', '0.5s', '0.25s', '0.5s', '0.25s', '0.9s'],
        visibility: 'PUBLIC',
      },
    );

    if (result.success) {
      console.log(`[urgent-booking-push] FCM topic message sent (messageId: ${result.messageId ?? 'unknown'})`);
    } else {
      console.error(`[urgent-booking-push] FCM topic send failed: ${result.error}`);
      // Attempt Expo fallback so the alert is not lost
      void sendExpoFallback(title, body, args.bookingId);
    }
    return;
  }

  // FCM not configured — use Expo push relay as fallback
  console.log('[urgent-booking-push] FCM not configured, falling back to Expo push relay');
  void sendExpoFallback(title, body, args.bookingId);
}

async function sendExpoFallback(title: string, body: string, bookingId: string): Promise<void> {
  try {
    await sendAdminExpoPush({
      title,
      body,
      data: { type: 'urgent_booking', bookingId },
      sound: 'default',
      channelId: URGENT_CHANNEL_ID,
    });
  } catch (err) {
    console.error('[urgent-booking-push] Expo fallback failed:', err);
  }
}
