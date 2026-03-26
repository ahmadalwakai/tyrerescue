import { db, drivers, driverNotifications, driverSoundSettings } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { sendFcmNotification, isFcmConfigured } from './fcm';

/** Map event types to Android notification channel IDs (versioned). */
const EVENT_CHANNEL_MAP: Record<string, string> = {
  new_job: 'jobs_critical_v4',
  job_assigned: 'jobs_critical_v4',
  new_assignment: 'jobs_critical_v4',
  reassignment: 'jobs_critical_v4',
  upcoming_v2: 'jobs_upcoming_v3',
  chat_message: 'messages_v2',
  status_update: 'updates_v2',
};

const CRITICAL_SOUND_FILE = 'unvversfiled_ringtone_021_365652.mp3';

/** Critical event types that require maximum urgency. */
const CRITICAL_EVENTS = new Set(['new_job', 'job_assigned', 'new_assignment', 'reassignment', 'upcoming_v2']);

/** Fetch admin-configured sound file for a given event type. Falls back to new_job.wav. */
async function getSoundForEvent(eventType: string): Promise<string> {
  try {
    const [row] = await db
      .select({ soundFile: driverSoundSettings.soundFile, enabled: driverSoundSettings.enabled })
      .from(driverSoundSettings)
      .where(eq(driverSoundSettings.event, eventType))
      .limit(1);

    if (row && row.enabled) {
      if (CRITICAL_EVENTS.has(eventType)) {
        return row.soundFile === 'new_job.wav' ? CRITICAL_SOUND_FILE : row.soundFile;
      }
      return row.soundFile;
    }
    if (row && !row.enabled) {
      return CRITICAL_EVENTS.has(eventType) ? CRITICAL_SOUND_FILE : 'default';
    }
  } catch {
    // Table may not exist yet — fall back
  }
  return CRITICAL_EVENTS.has(eventType) ? CRITICAL_SOUND_FILE : 'new_job.wav';
}

/** Detect whether a push token is an Expo token vs native FCM device token. */
function isExpoToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

/**
 * Legacy Expo Push API fallback for devices still running old app versions
 * with ExpoPushTokens. Used ONLY during migration — to be removed.
 */
async function sendViaExpoPushFallback(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channelId?: string,
  soundFile?: string,
): Promise<boolean> {
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data,
        sound: soundFile ?? CRITICAL_SOUND_FILE,
        channelId: channelId ?? 'jobs_critical_v4',
        priority: 'high',
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send a push notification to a specific driver.
 *
 * Primary path: direct FCM HTTP v1 API (native device token).
 * Fallback path: Expo Push relay (for old app versions with ExpoPushToken).
 *
 * Also persists the notification to the driver_notifications table for inbox history.
 * Returns true if the notification was sent successfully.
 */
export async function sendDriverPushNotification(
  driverId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channelId?: string,
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

  const eventType = (data?.type as string) ?? 'system';
  const soundFile = await getSoundForEvent(eventType);
  const effectiveChannel = channelId
    ? EVENT_CHANNEL_MAP[channelId] ?? channelId
    : EVENT_CHANNEL_MAP[eventType] ?? 'jobs_critical_v4';
  const isCritical = CRITICAL_EVENTS.has(eventType);

  // Stringify data values for FCM (requires all string values)
  const stringData: Record<string, string> = {};
  if (data) {
    for (const [k, v] of Object.entries(data)) {
      stringData[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
  }

  // ── Primary path: direct FCM ──
  if (!isExpoToken(driver.pushToken) && isFcmConfigured()) {
    const result = await sendFcmNotification(
      driver.pushToken,
      title,
      body,
      stringData,
      {
        channelId: effectiveChannel,
        priority: 'high',
        sound: soundFile.replace(/\.(wav|mp3|ogg)$/i, ''),
        notificationPriority: isCritical ? 'PRIORITY_MAX' : 'PRIORITY_HIGH',
        vibrateTimings: isCritical
          ? ['0s', '0.5s', '0.2s', '0.5s', '0.2s', '0.5s']
          : ['0s', '0.3s', '0.15s', '0.3s'],
        visibility: 'PUBLIC',
      },
    );

    if (result.success) {
      console.log(`[push/fcm] Sent to driver ${driverId}: channel=${effectiveChannel} msgId=${result.messageId}`);
      return true;
    }
    console.error(`[push/fcm] Failed for driver ${driverId}: ${result.error}`);
    return false;
  }

  // ── Fallback: Expo Push relay (old app versions) ──
  const sent = await sendViaExpoPushFallback(
    driver.pushToken,
    title,
    body,
    data,
    effectiveChannel,
    soundFile,
  );
  if (sent) {
    console.log(`[push/expo-fallback] Sent to driver ${driverId}: channel=${effectiveChannel}`);
  }
  return sent;
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
    'new_job',
  );
}

/**
 * Notify driver of a job reassignment.
 */
export async function notifyDriverReassignment(
  driverId: string,
  refNumber: string,
  address: string,
): Promise<boolean> {
  return sendDriverPushNotification(
    driverId,
    'Job Reassigned to You',
    `Job ${refNumber} at ${address}. Tap to review.`,
    { type: 'reassignment', ref: refNumber },
    'reassignment',
  );
}

/**
 * Notify driver of an upcoming scheduled job (v2 — urgent reminder).
 */
export async function notifyDriverUpcomingJob(
  driverId: string,
  refNumber: string,
  address: string,
  minutesUntil: number,
): Promise<boolean> {
  const timeLabel = minutesUntil <= 1 ? 'now' : `in ${minutesUntil} min`;
  return sendDriverPushNotification(
    driverId,
    'Upcoming Job Reminder',
    `Job ${refNumber} starts ${timeLabel}. ${address}`,
    { type: 'upcoming_v2', ref: refNumber, minutesUntil: String(minutesUntil) },
    'upcoming_v2',
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
    'chat_message',
  );
}

/**
 * Notify driver of a job status update (e.g. admin cancelled, booking paid, etc.)
 */
export async function notifyDriverStatusUpdate(
  driverId: string,
  refNumber: string,
  title: string,
  body: string,
): Promise<boolean> {
  return sendDriverPushNotification(
    driverId,
    title,
    body,
    { type: 'status_update', ref: refNumber },
    'status_update',
  );
}
