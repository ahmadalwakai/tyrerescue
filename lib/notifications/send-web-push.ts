// lib/notifications/send-web-push.ts

import type { PushPayload } from './types';

/**
 * Sends web push notification to all active subscriptions.
 *
 * Uses dynamic import for `web-push` to avoid bundling it in client code.
 * This function should ONLY be called from server-side code (API routes, server actions).
 */
export async function sendWebPushToAll(payload: PushPayload): Promise<void> {
  // Dynamic import — web-push is server-only
  const webpush = await import('web-push');
  const { db } = await import('@/lib/db');
  const { pushSubscriptions } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[WebPush] VAPID keys not configured. Skipping push.');
    }
    return;
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.isActive, true));

  if (subscriptions.length === 0) return;

  const pushPayload = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          pushPayload,
          {
            TTL: 60 * 60,
            urgency: payload.urgency ?? 'normal',
          }
        );
      } catch (err: unknown) {
        const error = err as { statusCode?: number };
        if (error.statusCode === 404 || error.statusCode === 410) {
          console.log(
            `[WebPush] Subscription expired (${error.statusCode}), deactivating:`,
            sub.endpoint.slice(0, 50)
          );
          await db
            .update(pushSubscriptions)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(pushSubscriptions.id, sub.id));
        } else {
          console.error(
            '[WebPush] Send failed for endpoint:',
            sub.endpoint.slice(0, 50),
            error
          );
        }
      }
    })
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  if (process.env.NODE_ENV === 'development') {
    console.log(
      `[WebPush] Sent to ${succeeded}/${subscriptions.length} subscriptions (${failed} failed)`
    );
  }
}
