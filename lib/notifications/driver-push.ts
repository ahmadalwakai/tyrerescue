import { db, drivers, driverNotifications, driverSoundSettings } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { sendFcmNotification, isFcmConfigured, getDriverFcmCredentials } from './fcm';
import { sendDriverJobAlert } from './push/sendDriverJobAlert';
import type { PaymentSummary } from '@/lib/payments/payment-summary';

/**
 * FCM HTTP v1 error codes / patterns that mean the device's registration
 * token is no longer valid (app uninstalled, token rotated, push disabled).
 * When we see these we MUST clear the token from the DB so we stop trying
 * to deliver to it. See:
 * https://firebase.google.com/docs/cloud-messaging/manage-tokens#detect-invalid-token-responses-from-the-fcm-backend
 */
const STALE_TOKEN_CODES = new Set([
  'UNREGISTERED',
  'NOT_FOUND',
  'INVALID_ARGUMENT',
  'INVALID_REGISTRATION',
  'SENDER_ID_MISMATCH',
]);

function isStaleTokenError(errorCode: string | undefined, errorText: string | undefined): boolean {
  if (errorCode && STALE_TOKEN_CODES.has(errorCode)) return true;
  if (!errorText) return false;
  const t = errorText.toLowerCase();
  return (
    t.includes('registration-token-not-registered') ||
    t.includes('invalid-registration-token') ||
    t.includes('requested entity was not found') ||
    t.includes('unregistered')
  );
}

async function clearStaleDriverToken(
  driverId: string,
  tokenSuffix: string,
  reason: string,
): Promise<void> {
  try {
    await db
      .update(drivers)
      .set({ pushToken: null, pushTokenPlatform: null })
      .where(eq(drivers.id, driverId));
    console.warn(
      `[driver-push] staleTokensRemoved driverId=${driverId} tokenSuffix=${tokenSuffix} reason=${reason} count=1`,
    );
  } catch (err) {
    console.error(
      `[driver-push] failed to clear stale FCM token driverId=${driverId} tokenSuffix=${tokenSuffix}:`,
      err,
    );
  }
}

const DRIVER_JOBS_URGENT_CHANNEL_ID = 'driver_jobs_urgent_v10';
const JOBS_UPCOMING_CHANNEL_ID = 'jobs_upcoming_v4';

/** Map event types to Android notification channel IDs (versioned). */
const EVENT_CHANNEL_MAP: Record<string, string> = {
  new_job: DRIVER_JOBS_URGENT_CHANNEL_ID,
  job_assigned: DRIVER_JOBS_URGENT_CHANNEL_ID,
  new_assignment: DRIVER_JOBS_URGENT_CHANNEL_ID,
  reassignment: DRIVER_JOBS_URGENT_CHANNEL_ID,
  upcoming_v2: JOBS_UPCOMING_CHANNEL_ID,
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
        channelId: channelId ?? DRIVER_JOBS_URGENT_CHANNEL_ID,
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
  const payloadType = (data?.type as string) ?? 'system';
  console.log(
    `[driver-push] driverPushStarted driverId=${driverId} payloadType=${payloadType} bookingRef=${
      (data?.ref as string) ?? 'unknown'
    }`,
  );
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
    console.warn(
      `[driver-push] noTokenForDriver driverId=${driverId} payloadType=${payloadType} tokensFound=0`,
    );
    const eventType = (data?.type as string) ?? 'system';
    if (CRITICAL_EVENTS.has(eventType)) {
      console.warn(
        `[driver-push] native data-only driver_new_job skipped driverId=${driverId} bookingRef=${
          (data?.ref as string) ?? 'unknown'
        } reason=no_push_token`,
      );
    }
    return false;
  }

  console.log(
    `[driver-push] tokensFound driverId=${driverId} payloadType=${payloadType} tokensFound=1 tokenSuffix=${driver.pushToken.slice(-8)}`,
  );

  const eventType = (data?.type as string) ?? 'system';
  const soundFile = await getSoundForEvent(eventType);
  const effectiveChannel = channelId
    ? EVENT_CHANNEL_MAP[channelId] ?? channelId
    : EVENT_CHANNEL_MAP[eventType] ?? DRIVER_JOBS_URGENT_CHANNEL_ID;
  const isCritical = CRITICAL_EVENTS.has(eventType);

  // Stringify data values for FCM (requires all string values)
  const stringData: Record<string, string> = {};
  if (data) {
    for (const [k, v] of Object.entries(data)) {
      stringData[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
  }

  const usesExpoToken = isExpoToken(driver.pushToken);

  // Driver app lives in its OWN Firebase project (tyrerescuedriver). Use its
  // dedicated service account so sends are authenticated for the correct
  // project; otherwise driver tokens fail with SENDER_ID_MISMATCH and never
  // arrive in the background. Falls back to global FCM_* when unset.
  const driverFcmCredentials = getDriverFcmCredentials();

  // Native tokens require direct FCM; never route them through Expo fallback.
  if (!usesExpoToken && !isFcmConfigured(driverFcmCredentials)) {
    console.error('[push/fcm] FCM is not configured for native push tokens');
    return false;
  }

  // ── Primary path: direct FCM ──
  if (!usesExpoToken) {
    // For critical job-assignment events, send a data-only message so the
    // driver-app's native DriverJobMessagingService can wake the screen via
    // a full-screen-intent. Top-level `notification` blocks would otherwise
    // bypass that service when the app is backgrounded/killed on Android.
    if (isCritical) {
      // Delegate to the dedicated DATA-ONLY helper. A `notification` payload
      // would be swallowed by Android in the background and break the native
      // full-screen lock-screen alert, so this path never emits one.
      const tokenSuffix = driver.pushToken.slice(-6);
      const bookingRef = (data?.ref as string) ?? 'unknown';
      console.log(
        `[driver-push] native data-only new_job attempt driverId=${driverId} bookingRef=${bookingRef} type=new_job platform=android:fcm hasToken=true tokenSuffix=${tokenSuffix}`,
      );

      const toPence = (v: unknown): number | undefined => {
        if (typeof v !== 'string' || v.length === 0) return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      };

      const alertResult = await sendDriverJobAlert({
        token: driver.pushToken,
        ref: typeof data?.ref === 'string' ? data.ref : bookingRef,
        title,
        body,
        address: typeof data?.address === 'string' ? data.address : undefined,
        url: typeof data?.url === 'string' ? data.url : undefined,
        jobId: typeof data?.jobId === 'string' ? data.jobId : undefined,
        assignmentId: typeof data?.assignmentId === 'string' ? data.assignmentId : undefined,
        amountToCollectPence: toPence(data?.amountToCollectPence),
        depositAmountPence: toPence(data?.depositAmountPence),
        jobPricePence: toPence(data?.jobPricePence),
        paymentStatus: typeof data?.paymentStatus === 'string' ? data.paymentStatus : undefined,
        paymentType: typeof data?.paymentType === 'string' ? data.paymentType : undefined,
      });

      if (alertResult.ok) {
        console.log(
          `[driver-push] pushSendSuccess driverId=${driverId} payloadType=new_job bookingRef=${bookingRef} messageId=${alertResult.messageId} tokenSuffix=${tokenSuffix} transport=fcm-v1-data`,
        );
        return true;
      }
      console.error(
        `[driver-push] pushSendFailure driverId=${driverId} payloadType=new_job bookingRef=${bookingRef} tokenSuffix=${tokenSuffix} error=${alertResult.error} errorCode=${alertResult.code}`,
      );
      if (isStaleTokenError(alertResult.code, alertResult.error)) {
        await clearStaleDriverToken(driverId, tokenSuffix, alertResult.code);
      }
      return false;
    }

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
      driverFcmCredentials,
    );

    if (result.success) {
      console.log(
        `[driver-push] pushSendSuccess driverId=${driverId} payloadType=${payloadType} channel=${effectiveChannel} messageId=${result.messageId} transport=fcm-v1-notification`,
      );
      console.log(`[push/fcm] Sent to driver ${driverId}: channel=${effectiveChannel} msgId=${result.messageId}`);
      return true;
    }
    const tokenSuffix = driver.pushToken.slice(-6);
    console.error(
      `[driver-push] pushSendFailure driverId=${driverId} payloadType=${payloadType} tokenSuffix=${tokenSuffix} errorCode=${result.errorCode ?? 'none'} error=${result.error}`,
    );
    console.error(
      `[push/fcm] Failed for driver ${driverId} tokenSuffix=${tokenSuffix} errorCode=${result.errorCode ?? 'none'}: ${result.error}`,
    );
    if (isStaleTokenError(result.errorCode, result.error)) {
      await clearStaleDriverToken(driverId, tokenSuffix, result.errorCode ?? 'token_invalid');
    }
    return false;
  }

  // ── Fallback: Expo Push relay (old app versions) ──
  // The new-job alert MUST be data-only (handled above for native tokens) so
  // the native full-screen lock-screen alert can fire. The Expo relay only
  // delivers notification-style title/body pushes, which Android swallows in
  // the background — so we never route critical job alerts through it. A
  // legacy Expo-token client must upgrade to a native FCM token to receive
  // the urgent alert.
  if (isCritical) {
    console.warn(
      `[driver-push] critical new_job NOT sent via Expo relay (notification-style) driverId=${driverId} bookingRef=${
        (data?.ref as string) ?? 'unknown'
      } reason=expo_token_needs_native_upgrade`,
    );
    return false;
  }

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
 *
 * `payment` (optional) is forwarded into the FCM data payload so the driver
 * app can render "Collect £X" inline without a follow-up fetch.
 */
export async function notifyDriverNewJob(
  driverId: string,
  refNumber: string,
  address: string,
  payment?: PaymentSummary | null,
  jobId?: string | null,
): Promise<boolean> {
  return sendDriverPushNotification(
    driverId,
    'New Job Assigned',
    `Job ${refNumber} at ${address}. Tap to accept.`,
    {
      type: 'new_job',
      ref: refNumber,
      address,
      jobId: jobId ?? '',
      paymentType: String(payment?.method ?? 'unknown'),
      paymentStatus: String(payment?.state ?? 'unknown'),
      amountToCollectPence: String(payment?.amountToCollectPence ?? ''),
      depositAmountPence: String(payment?.depositAmountPence ?? ''),
      jobPricePence: String(payment?.totalPence ?? ''),
    },
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
  payment?: PaymentSummary | null,
  jobId?: string | null,
): Promise<boolean> {
  return sendDriverPushNotification(
    driverId,
    'Job Reassigned to You',
    `Job ${refNumber} at ${address}. Tap to review.`,
    {
      type: 'reassignment',
      ref: refNumber,
      address,
      jobId: jobId ?? '',
      paymentType: String(payment?.method ?? 'unknown'),
      paymentStatus: String(payment?.state ?? 'unknown'),
      amountToCollectPence: String(payment?.amountToCollectPence ?? ''),
      depositAmountPence: String(payment?.depositAmountPence ?? ''),
      jobPricePence: String(payment?.totalPence ?? ''),
    },
    'reassignment',
  );
}

/**
 * Notify driver that an online payment was received for one of their jobs.
 *
 * This is a NORMAL (non-urgent) notification — it deliberately uses the
 * `status_update` channel, NOT the critical full-screen job-alert path, so it
 * never triggers the lock-screen siren reserved for new job assignments.
 */
export async function notifyDriverPaymentReceived(
  driverId: string,
  refNumber: string,
  amountPence: number,
  jobId?: string | null,
): Promise<boolean> {
  const amountLabel =
    Number.isFinite(amountPence) && amountPence > 0
      ? ` (£${(amountPence / 100).toFixed(2)})`
      : '';
  return sendDriverPushNotification(
    driverId,
    'Payment received',
    `Payment received for ${refNumber}${amountLabel}.`,
    {
      type: 'payment_received',
      ref: refNumber,
      jobId: jobId ?? '',
      amountPence: String(Number.isFinite(amountPence) ? amountPence : ''),
    },
    'status_update',
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
