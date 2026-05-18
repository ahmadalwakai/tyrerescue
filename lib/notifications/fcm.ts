import { google } from 'googleapis';

/**
 * Direct Firebase Cloud Messaging (HTTP v1 API) client.
 *
 * Replaces Expo Push relay for production notification delivery.
 * Authenticates via a Google service account and sends to native FCM device tokens.
 *
 * Required environment variables:
 *   FCM_PROJECT_ID          — Firebase project ID (e.g. "tyrerescue-driver")
 *   FCM_SERVICE_ACCOUNT_JSON — Full JSON string of the Firebase service account key
 */

interface FcmAndroidNotification {
  title?: string;
  body?: string;
  channel_id: string;
  sound?: string;
  notification_priority?: 'PRIORITY_MIN' | 'PRIORITY_LOW' | 'PRIORITY_DEFAULT' | 'PRIORITY_HIGH' | 'PRIORITY_MAX';
  default_vibrate_timings?: boolean;
  vibrate_timings?: string[];
  visibility?: 'PRIVATE' | 'PUBLIC' | 'SECRET';
  default_sound?: boolean;
}

// A message can target either a single device token or a topic.
// Only one of `token` or `topic` should be set per message.
interface FcmMessage {
  token?: string;
  topic?: string;
  notification?: { title: string; body: string };
  data?: Record<string, string>;
  android?: {
    priority?: 'normal' | 'high' | 'NORMAL' | 'HIGH';
    ttl?: string;
    notification?: FcmAndroidNotification;
  };
}

interface FcmSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
}

let cachedAuth: InstanceType<typeof google.auth.JWT> | null = null;
const DEFAULT_CRITICAL_SOUND = 'unvversfiled_ringtone_021_365652';

function getAuth(): InstanceType<typeof google.auth.JWT> | null {
  if (cachedAuth) return cachedAuth;

  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  try {
    const sa = JSON.parse(raw) as { client_email: string; private_key: string };
    cachedAuth = new google.auth.JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
    return cachedAuth;
  } catch {
    return null;
  }
}

function getProjectId(): string | null {
  if (process.env.FCM_PROJECT_ID) return process.env.FCM_PROJECT_ID;
  // Try to extract from service account JSON
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as { project_id?: string };
    return sa.project_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Check whether FCM direct delivery is configured.
 */
export function isFcmConfigured(): boolean {
  return !!getAuth() && !!getProjectId();
}

/**
 * Send a push notification directly via FCM HTTP v1 API.
 */
export async function sendFcmNotification(
  deviceToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  androidConfig?: {
    channelId?: string;
    priority?: 'normal' | 'high';
    sound?: string;
    defaultSound?: boolean;
    notificationPriority?: FcmAndroidNotification['notification_priority'];
    vibrateTimings?: string[];
    visibility?: FcmAndroidNotification['visibility'];
  },
): Promise<FcmSendResult> {
  const auth = getAuth();
  const projectId = getProjectId();

  if (!auth || !projectId) {
    return { success: false, error: 'FCM not configured: missing service account or project ID' };
  }

  const channel = androidConfig?.channelId ?? 'jobs_critical_v4';
  const soundName = androidConfig?.sound ?? DEFAULT_CRITICAL_SOUND;

  const message: FcmMessage = {
    token: deviceToken,
    notification: { title, body },
    data: data ?? undefined,
    android: {
      priority: androidConfig?.priority ?? 'high',
      ttl: '300s',
      notification: {
        channel_id: channel,
        sound: soundName,
        default_sound: androidConfig?.defaultSound,
        notification_priority: androidConfig?.notificationPriority ?? 'PRIORITY_MAX',
        default_vibrate_timings: false,
        vibrate_timings: androidConfig?.vibrateTimings ?? ['0s', '0.5s', '0.2s', '0.5s', '0.2s', '0.5s'],
        visibility: androidConfig?.visibility ?? 'PUBLIC',
      },
    },
  };

  try {
    const tokenRes = await auth.getAccessToken();
    const accessToken = tokenRes.token;
    if (!accessToken) {
      return { success: false, error: 'Failed to obtain FCM access token' };
    }

    const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;

    const res = await fetch(url, {

      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { success: false, error: `FCM ${res.status}: ${text}` };
    }

    const result = await res.json() as { name?: string };
    return { success: true, messageId: result.name ?? undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'FCM send error' };
  }
}

/**
 * Send a data message to a single FCM registration token.
 *
 * By default this omits notification fields so Android can deliver directly
 * to FirebaseMessagingService. Callers may opt into an Android notification
 * fallback without adding a top-level notification payload.
 */
export async function sendFcmDataMessageToToken(
  deviceToken: string,
  data: Record<string, string>,
  androidConfig?: {
    priority?: 'normal' | 'high' | 'NORMAL' | 'HIGH';
    ttl?: string;
    notification?: {
      title: string;
      body: string;
      channelId: string;
      sound?: string;
      defaultSound?: boolean;
      notificationPriority?: FcmAndroidNotification['notification_priority'];
      defaultVibrateTimings?: boolean;
      vibrateTimings?: string[];
      visibility?: FcmAndroidNotification['visibility'];
    };
  },
): Promise<FcmSendResult> {
  const auth = getAuth();
  const projectId = getProjectId();

  if (!auth || !projectId) {
    return { success: false, error: 'FCM not configured: missing service account or project ID' };
  }

  const message: FcmMessage = {
    token: deviceToken,
    data,
    android: {
      priority: androidConfig?.priority ?? 'HIGH',
      ttl: androidConfig?.ttl ?? '300s',
      notification: androidConfig?.notification
        ? {
          title: androidConfig.notification.title,
          body: androidConfig.notification.body,
          channel_id: androidConfig.notification.channelId,
          sound: androidConfig.notification.sound,
          default_sound: androidConfig.notification.defaultSound,
          notification_priority: androidConfig.notification.notificationPriority ?? 'PRIORITY_HIGH',
          default_vibrate_timings: androidConfig.notification.defaultVibrateTimings ?? false,
          vibrate_timings: androidConfig.notification.vibrateTimings ?? ['0s', '0.5s', '0.25s', '0.5s', '0.25s', '0.9s'],
          visibility: androidConfig.notification.visibility ?? 'PUBLIC',
        }
        : undefined,
    },
  };

  try {
    const tokenRes = await auth.getAccessToken();
    const accessToken = tokenRes.token;
    if (!accessToken) {
      return { success: false, error: 'Failed to obtain FCM access token' };
    }

    const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let errorCode: string | undefined;
      try {
        const parsed = JSON.parse(text) as { error?: { status?: string; details?: Array<{ errorCode?: string }> } };
        errorCode = parsed.error?.details?.[0]?.errorCode ?? parsed.error?.status;
      } catch {
        // Keep raw text fallback below.
      }
      return {
        success: false,
        error: `FCM token ${res.status}: ${text}`,
        errorCode,
      };
    }

    const result = await res.json() as { name?: string };
    return { success: true, messageId: result.name ?? undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'FCM token send error' };
  }
}

/**
 * Send a notification to an FCM topic (e.g. "urgent_bookings").
 *
 * All devices subscribed to that topic receive the message simultaneously.
 * The backend never needs to iterate over individual device tokens.
 * Requires the same service account auth as sendFcmNotification().
 */
export async function sendFcmTopicNotification(
  topic: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  androidConfig?: {
    channelId?: string;
    priority?: 'normal' | 'high' | 'NORMAL' | 'HIGH';
    ttl?: string;
    includeNotification?: boolean;
    sound?: string;
    defaultSound?: boolean;
    notificationPriority?: FcmAndroidNotification['notification_priority'];
    vibrateTimings?: string[];
    visibility?: FcmAndroidNotification['visibility'];
  },
): Promise<FcmSendResult> {
  const auth = getAuth();
  const projectId = getProjectId();

  if (!auth || !projectId) {
    return { success: false, error: 'FCM not configured: missing service account or project ID' };
  }

  const channel = androidConfig?.channelId ?? 'urgent_bookings_v1';
  const soundName = androidConfig?.sound ?? 'urgent_booking';
  const includeNotification = androidConfig?.includeNotification !== false;

  const message: FcmMessage = {
    topic,
    notification: includeNotification ? { title, body } : undefined,
    data: data ?? undefined,
    android: {
      priority: androidConfig?.priority ?? 'high',
      ttl: androidConfig?.ttl ?? '300s',
      notification: includeNotification
        ? {
          channel_id: channel,
          sound: soundName,
          default_sound: androidConfig?.defaultSound,
          notification_priority: androidConfig?.notificationPriority ?? 'PRIORITY_MAX',
          default_vibrate_timings: false,
          vibrate_timings: androidConfig?.vibrateTimings ?? ['0s', '0.5s', '0.25s', '0.5s', '0.25s', '0.9s'],
          visibility: androidConfig?.visibility ?? 'PUBLIC',
        }
        : undefined,
    },
  };

  try {
    const tokenRes = await auth.getAccessToken();
    const accessToken = tokenRes.token;
    if (!accessToken) {
      return { success: false, error: 'Failed to obtain FCM access token' };
    }

    const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { success: false, error: `FCM topic ${res.status}: ${text}` };
    }

    const result = await res.json() as { name?: string };
    return { success: true, messageId: result.name ?? undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'FCM topic send error' };
  }
}

interface TopicSubscriptionResult {
  successCount: number;
  failureCount: number;
  error?: string;
}

/**
 * Subscribe one or more raw FCM device tokens to a topic via the
 * Firebase Instance ID API.
 *
 * Use the same service-account OAuth2 token as sendFcmNotification().
 * After subscription, sendFcmTopicNotification(topic, ...) delivers to all
 * subscribed devices without the backend managing individual tokens.
 *
 * Endpoint: POST https://iid.googleapis.com/iid/v1:batchAdd
 */
export async function subscribeTokensToFcmTopic(
  tokens: string[],
  topic: string,
): Promise<TopicSubscriptionResult> {
  if (tokens.length === 0) {
    return { successCount: 0, failureCount: 0 };
  }

  const auth = getAuth();
  if (!auth) {
    return { successCount: 0, failureCount: tokens.length, error: 'FCM service account not configured' };
  }

  try {
    const tokenRes = await auth.getAccessToken();
    const accessToken = tokenRes.token;
    if (!accessToken) {
      return { successCount: 0, failureCount: tokens.length, error: 'Failed to obtain FCM access token' };
    }

    const res = await fetch('https://iid.googleapis.com/iid/v1:batchAdd', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'access_token_auth': 'true',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: `/topics/${topic}`,
        registration_tokens: tokens,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { successCount: 0, failureCount: tokens.length, error: `IID API ${res.status}: ${text}` };
    }

    const result = await res.json() as { results?: Array<{ error?: string }> };
    let successCount = 0;
    let failureCount = 0;
    for (const r of result.results ?? []) {
      if (r.error) {
        failureCount++;
      } else {
        successCount++;
      }
    }
    return { successCount, failureCount };
  } catch (err) {
    return {
      successCount: 0,
      failureCount: tokens.length,
      error: err instanceof Error ? err.message : 'IID subscription error',
    };
  }
}
