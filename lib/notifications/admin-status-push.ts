import { sendAdminExpoPushWithResult, type ExpoPushSendResult } from './expo-admin-push';
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
  data?: Record<string, string>;
  /** Restrict Expo acceptance accounting, e.g. to iPhone installs. */
  platforms?: Array<'android' | 'ios'>;
  /** Retry the iOS relay without duplicating the first Android topic attempt. */
  skipFcm?: boolean;
}

/**
 * Send a standard (non-urgent) push notification to all admin devices.
 * Used for driver status changes, assignment confirmations, and other
 * booking lifecycle events that don't require the urgent alert sound.
 *
 * Delivery:
 *  1. FCM topic `booking_updates` when FCM is configured
 *  2. Expo push relay, optionally restricted by `platforms`
 *
 * Never throws.
 */
export async function sendAdminStatusUpdatePushWithResult(args: AdminStatusPushArgs): Promise<ExpoPushSendResult> {
  try {
    const { bookingId, refNumber, title, body } = args;
    const notifType = args.type ?? 'booking_update';

    const data: Record<string, string> = {
      ...args.data,
      type: notifType,
      bookingId,
      refNumber,
      title,
      body,
    };
    if (args.sourceLabel) data.sourceLabel = args.sourceLabel;

    // Start the iOS relay immediately; FCM availability must not delay APNs.
    const expoResult = sendAdminExpoPushWithResult({
      title, body, data, channelId: STATUS_UPDATES_CHANNEL, platforms: args.platforms, ttl: 600,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fcmAttempt = async () => {
      try {
        if (args.skipFcm || !isFcmConfigured()) return;
        // The existing FCM helper does not expose an abort signal. Bound the
        // caller's wait while leaving its promise handled if it finishes later.
        await Promise.race([sendFcmTopicNotification(
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
        ), new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            console.error('[admin-status-push] FCM topic send timed out');
            resolve();
          }, 8_000);
        })]);
      } catch {
        console.error('[admin-status-push] FCM topic send failed');
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    };

    const [result] = await Promise.all([expoResult, fcmAttempt()]);
    return result;
  } catch {
    console.error('[admin-status-push] send failed');
    return { accepted: 0, failed: 0, unavailable: true };
  }
}

/** Existing callers keep the best-effort, awaitable void contract. */
export async function sendAdminStatusUpdatePush(args: AdminStatusPushArgs): Promise<void> {
  try {
    await sendAdminStatusUpdatePushWithResult(args);
  } catch {
    console.error('[admin-status-push] send failed');
  }
}
