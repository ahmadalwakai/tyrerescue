import { sendAdminExpoPush } from './expo-admin-push';
import { isFcmConfigured, sendFcmTopicNotification } from './fcm';

const STATUS_UPDATES_TOPIC = 'booking_updates';
const STATUS_UPDATES_CHANNEL = 'booking_updates';

export interface AdminStatusPushArgs {
  bookingId: string;
  refNumber: string;
  title: string;
  body: string;
  type?: string;
  sourceLabel?: string | null;
}

/**
 * Send a standard (non-urgent) push notification to all admin devices.
 * Used for driver status changes, assignment confirmations, and other
 * booking lifecycle events that don't require the urgent alert sound.
 *
 * Delivery:
 *  1. FCM topic `booking_updates` when FCM is configured
 *  2. Expo push relay for iOS (and Android when FCM is absent)
 *
 * Never throws.
 */
export async function sendAdminStatusUpdatePush(args: AdminStatusPushArgs): Promise<void> {
  const { bookingId, refNumber, title, body } = args;
  const notifType = args.type ?? 'booking_update';

  const data: Record<string, string> = {
    type: notifType,
    bookingId,
    refNumber,
    title,
    body,
  };
  if (args.sourceLabel) data.sourceLabel = args.sourceLabel;

  if (isFcmConfigured()) {
    try {
      await sendFcmTopicNotification(
        STATUS_UPDATES_TOPIC,
        title,
        body,
        data,
        {
          priority: 'NORMAL',
          ttl: '600s',
          includeNotification: true,
          channelId: STATUS_UPDATES_CHANNEL,
        },
      );
    } catch (err) {
      console.error('[admin-status-push] FCM topic send failed:', err);
    }
  }

  // Always send via Expo relay — covers iOS installs and Android when FCM absent.
  await sendAdminExpoPush({
    title,
    body,
    data: { type: notifType, bookingId, refNumber },
    channelId: STATUS_UPDATES_CHANNEL,
  });
}
