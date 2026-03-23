import { db, drivers, driverNotifications } from '@/lib/db';
import { eq } from 'drizzle-orm';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
}

/**
 * Send a push notification to a specific driver via Expo Push API.
 * Also persists the notification to the driver_notifications table for inbox history.
 * Returns true if the notification was sent successfully.
 */
export async function sendDriverPushNotification(
  driverId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channelId = 'jobs',
): Promise<boolean> {
  // Persist to notification history regardless of push delivery
  try {
    await db.insert(driverNotifications).values({
      driverId,
      type: (data?.type as string) ?? 'system',
      title,
      body,
      bookingRef: (data?.ref as string) ?? null,
      metadata: data ?? null,
    });
  } catch (err) {
    console.error(`[push] Failed to persist notification for driver ${driverId}:`, err);
  }

  // Look up the driver's push token
  const [driver] = await db
    .select({ pushToken: drivers.pushToken })
    .from(drivers)
    .where(eq(drivers.id, driverId))
    .limit(1);

  if (!driver?.pushToken) {
    return false;
  }

  const message: ExpoPushMessage = {
    to: driver.pushToken,
    title,
    body,
    data,
    sound: channelId === 'jobs' ? 'new-job.wav' : 'default',
    channelId,
    priority: 'high',
  };

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!res.ok) {
      console.error(`[push] Failed to send to driver ${driverId}: ${res.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[push] Error sending to driver ${driverId}:`, error);
    return false;
  }
}

/**
 * Notify driver of a new job assignment.
 */
export async function notifyDriverNewJob(
  driverId: string,
  refNumber: string,
  address: string,
): Promise<boolean> {
  return sendDriverPushNotification(
    driverId,
    'New Job Assigned',
    `Job ${refNumber} at ${address}. Tap to accept.`,
    { type: 'new_job', ref: refNumber },
    'jobs',
  );
}

/**
 * Notify driver of a new chat message.
 */
export async function notifyDriverNewMessage(
  driverId: string,
  conversationId: string,
  senderName: string,
  preview: string,
): Promise<boolean> {
  return sendDriverPushNotification(
    driverId,
    `Message from ${senderName}`,
    preview.length > 100 ? `${preview.slice(0, 97)}...` : preview,
    { type: 'chat_message', conversationId },
    'messages',
  );
}
