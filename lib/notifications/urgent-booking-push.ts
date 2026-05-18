import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminPushTokens } from '@/lib/db/schema';
import { isFcmConfigured, sendFcmDataMessageToToken, sendFcmTopicNotification } from './fcm';
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
 * Must match `URGENT_BOOKINGS_V3_CHANNEL_ID` in the app's notifications.ts.
 *
 * v3: bumped from v2 because Android channel settings are sticky. Devices that
 * had v2 created with the wrong sound/importance never receive updated settings
 * unless the channel id changes (or the user uninstalls + reinstalls). v1/v2
 * are kept only in historical comments — no active code path targets them.
 */
const URGENT_CHANNEL_ID = 'urgent_bookings_v3';
const URGENT_SOUND = 'urgent_booking';

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
  const body = args.body ?? 'A new emergency booking needs immediate action.';

  const data: Record<string, string> = {
    type: 'urgent_booking',
    bookingId: String(args.bookingId),
    title,
    body,
  };
  if (args.customerPhone) data.customerPhone = String(args.customerPhone);
  if (args.createdAt) data.createdAt = String(args.createdAt);

  let directTokensFound = 0;
  let directSuccessCount = 0;
  let directFailureCount = 0;
  let topicFallbackAttempted = false;
  let topicFallbackSucceeded = false;

  if (isFcmConfigured()) {
    try {
      const rows = await db
        .select({ token: adminPushTokens.token, platform: adminPushTokens.platform })
        .from(adminPushTokens)
        .where(eq(adminPushTokens.platform, 'android'));

      const directTokens = Array.from(
        new Set(
          rows
            .map((r) => r.token.trim())
            .filter((token) => token.length > 0)
            .filter((token) => !token.startsWith('ExponentPushToken[')),
        ),
      );

      directTokensFound = directTokens.length;

      // DATA-ONLY high priority FCM. We intentionally do NOT include a
      // `notification` payload (top-level or android.notification) for direct
      // Android token sends. A notification payload causes Android to deliver
      // through the system tray when the app is backgrounded and bypass
      // FirebaseMessagingService.onMessageReceived — which would prevent the
      // native UrgentBookingMessagingService from posting the full-screen /
      // call-style notification and launching UrgentBookingAlertActivity.
      const settled = await Promise.allSettled(
        directTokens.map(async (token) => {
          const suffix = token.slice(-8);
          const result = await sendFcmDataMessageToToken(token, data, {
            priority: 'HIGH',
            ttl: '300s',
          });
          return { token, suffix, result };
        }),
      );

      const invalidOrUnregistered: string[] = [];

      for (const item of settled) {
        if (item.status !== 'fulfilled') {
          directFailureCount++;
          console.error('[urgent-booking-push] direct send failed before FCM response');
          continue;
        }

        const { token, suffix, result } = item.value;
        if (result.success) {
          directSuccessCount++;
          console.log(`[urgent-booking-push] direct send success tokenSuffix=${suffix} bookingId=${args.bookingId}`);
          continue;
        }

        directFailureCount++;
        console.error(
          `[urgent-booking-push] direct send failed tokenSuffix=${suffix} bookingId=${args.bookingId} error=${result.error ?? 'unknown'}`,
        );

        const code = (result.errorCode ?? '').toUpperCase();
        if (
          code === 'UNREGISTERED'
          || code === 'INVALID_ARGUMENT'
          || (result.error ?? '').toUpperCase().includes('UNREGISTERED')
        ) {
          invalidOrUnregistered.push(token);
        }
      }

      const staleTokens = Array.from(new Set(invalidOrUnregistered));
      if (staleTokens.length > 0) {
        await db
          .delete(adminPushTokens)
          .where(
            and(
              eq(adminPushTokens.platform, 'android'),
              inArray(adminPushTokens.token, staleTokens),
            ),
          );
        for (const token of staleTokens) {
          console.warn(
            `[urgent-booking-push] removed invalid token tokenSuffix=${token.slice(-8)}`,
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[urgent-booking-push] direct token phase error bookingId=${args.bookingId} error=${message}`);
    }

    const shouldAttemptTopicFallback =
      directTokensFound === 0
      || directSuccessCount === 0
      || directFailureCount > 0;

    if (shouldAttemptTopicFallback) {
      topicFallbackAttempted = true;
      try {
        const result = await sendFcmTopicNotification(
          URGENT_BOOKINGS_TOPIC,
          title,
          body,
          data,
          {
            priority: 'HIGH',
            ttl: '300s',
            // Include the notification block so the topic fan-out also
            // reaches killed/background apps via the Android system tray.
            includeNotification: true,
            channelId: URGENT_CHANNEL_ID,
            sound: URGENT_SOUND,
            notificationPriority: 'PRIORITY_MAX',
            visibility: 'PUBLIC',
          },
        );
        topicFallbackSucceeded = result.success;
        if (!result.success) {
          console.error(`[urgent-booking-push] topic fallback failed bookingId=${args.bookingId} error=${result.error}`);
        }
      } catch (err) {
        topicFallbackSucceeded = false;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[urgent-booking-push] topic fallback exception bookingId=${args.bookingId} error=${message}`);
      }
    }

    console.log(
      `[urgent-booking-push] summary bookingId=${args.bookingId} directTokensFound=${directTokensFound} directSendSuccess=${directSuccessCount} directSendFailure=${directFailureCount} topicFallbackAttempted=${topicFallbackAttempted ? 'yes' : 'no'} topicFallback=${topicFallbackSucceeded ? 'success' : 'failure'}`,
    );
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
