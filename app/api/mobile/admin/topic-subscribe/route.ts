import { NextRequest, NextResponse } from 'next/server';
import { isFcmConfigured, subscribeTokensToFcmTopic } from '@/lib/notifications/fcm';
import { getMobileAdminUser, unauthorizedResponse } from '../_lib';

/**
 * POST /api/mobile/admin/topic-subscribe
 *
 * Subscribe a raw Android FCM device token to the `urgent_bookings` FCM topic.
 *
 * Called automatically by the Assisted Chat app on first open after notification
 * permissions are granted. The app obtains the raw FCM token via
 * `Notifications.getDevicePushTokenAsync()` (expo-notifications) and posts it here.
 *
 * After subscription, the backend can send one FCM topic message to
 * `urgent_bookings` and all subscribed Assisted Chat app instances will
 * receive it — no per-device token management required.
 *
 * Auth  : Authorization: Bearer <admin JWT>
 * Body  : { "token": "<raw_android_fcm_device_token>" }
 * Returns: { "ok": true } on success or error details on failure.
 *
 * Important:
 *   This endpoint does NOT store the token in the database.
 *   Topic subscription is managed entirely by FCM.
 *   The admin never sees this token.
 *
 * TODO: This endpoint exists because assisted-chat-app does not yet have
 *   @react-native-firebase/messaging installed. Once the app switches to
 *   bare workflow (expo prebuild) with:
 *     - @react-native-firebase/app + @react-native-firebase/messaging
 *     - google-services.json configured in app.json plugins
 *   the app should call messaging().subscribeToTopic('urgent_bookings')
 *   client-side and this endpoint can be removed.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { token } = body as { token?: string };

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  // Reject Expo push tokens — this endpoint is for raw Android FCM tokens only.
  if (token.startsWith('ExponentPushToken[')) {
    return NextResponse.json(
      { error: 'Use /api/mobile/admin/push-token for Expo push tokens' },
      { status: 400 },
    );
  }

  if (!isFcmConfigured()) {
    // FCM not configured on this environment (e.g. development without service account).
    // Return success so the app does not retry indefinitely.
    console.warn('[topic-subscribe] FCM not configured — subscription skipped');
    return NextResponse.json({ ok: true, skipped: true });
  }

  const result = await subscribeTokensToFcmTopic([token.trim()], 'urgent_bookings');

  if (result.error && result.successCount === 0) {
    console.error('[topic-subscribe] FCM subscription failed:', result.error);
    return NextResponse.json(
      { error: 'Failed to subscribe to urgent_bookings topic', detail: result.error },
      { status: 502 },
    );
  }

  if (result.failureCount > 0) {
    console.warn(`[topic-subscribe] Partial subscription failure: ${result.failureCount} failed, ${result.successCount} succeeded`);
  } else {
    console.log(`[topic-subscribe] Subscribed device token to urgent_bookings (user: ${user.id})`);
  }

  return NextResponse.json({ ok: true });
}
