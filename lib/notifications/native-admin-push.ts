import { db } from '@/lib/db';
import { adminPushTokens } from '@/lib/db/schema';
import { sendFcmNotification, isFcmConfigured } from './fcm';

/**
 * Sends an urgent booking FCM push to all registered native admin alert devices.
 *
 * Native tokens are distinguished from Expo tokens by the absence of the
 * "ExponentPushToken[" prefix. Both token types share the admin_push_tokens table.
 *
 * Usage (call from booking creation / payment confirmation flow):
 *
 *   import { sendNativeAdminAlertPush } from '@/lib/notifications/native-admin-push';
 *
 *   await sendNativeAdminAlertPush({
 *     bookingId: booking.id,
 *     customerPhone: booking.customerPhone,
 *     createdAt: booking.createdAt?.toISOString() ?? '',
 *   });
 *
 * Required env vars (already configured in lib/env.ts):
 *   FCM_PROJECT_ID
 *   FCM_SERVICE_ACCOUNT_JSON
 */

interface UrgentBookingAlertArgs {
  bookingId: string;
  customerPhone?: string;
  createdAt?: string;
  title?: string;
  body?: string;
}

interface SendResult {
  sent: number;
  failed: number;
  skipped: number;
  reason?: string;
}

export async function sendNativeAdminAlertPush(
  args: UrgentBookingAlertArgs,
): Promise<SendResult> {
  if (!isFcmConfigured()) {
    console.warn('[native-admin-push] FCM not configured — skipping native push');
    return { sent: 0, failed: 0, skipped: 1, reason: 'FCM not configured' };
  }

  const rows = await db
    .select({ token: adminPushTokens.token })
    .from(adminPushTokens);

  // Native FCM tokens do NOT start with "ExponentPushToken["
  const nativeTokens = rows
    .map((r) => r.token)
    .filter((t) => !t.startsWith('ExponentPushToken['));

  if (nativeTokens.length === 0) {
    return { sent: 0, failed: 0, skipped: 1, reason: 'No native tokens registered' };
  }

  const title = args.title ?? 'Emergency booking received';
  const body  = args.body  ?? 'Open Assisted Chat now';

  const data: Record<string, string> = {
    type:      'urgent_booking',
    bookingId: args.bookingId,
    url:       `tyrerescue-assisted://bookings/${args.bookingId}`,
  };
  if (args.customerPhone) data.customerPhone = args.customerPhone;
  if (args.createdAt)     data.createdAt     = args.createdAt;

  let sent   = 0;
  let failed = 0;

  for (const token of nativeTokens) {
    const result = await sendFcmNotification(
      token,
      title,
      body,
      data,
      {
        channelId:            'urgent_bookings_v1',
        priority:             'high',
        sound:                'urgent_booking',
        notificationPriority: 'PRIORITY_MAX',
        vibrateTimings:       ['0s', '0.5s', '0.25s', '0.5s', '0.25s', '0.9s'],
        visibility:           'PUBLIC',
      },
    );

    if (result.success) {
      sent++;
    } else {
      failed++;
      console.error(
        `[native-admin-push] FCM send failed for token ${token.slice(0, 20)}…: ${result.error}`,
      );
    }
  }

  return { sent, failed, skipped: 0 };
}
