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
  channel_id: string;
  sound?: string;
  notification_priority?: 'PRIORITY_MIN' | 'PRIORITY_LOW' | 'PRIORITY_DEFAULT' | 'PRIORITY_HIGH' | 'PRIORITY_MAX';
  default_vibrate_timings?: boolean;
  vibrate_timings?: string[];
  visibility?: 'PRIVATE' | 'PUBLIC' | 'SECRET';
  default_sound?: boolean;
}

interface FcmMessage {
  token: string;
  notification?: { title: string; body: string };
  data?: Record<string, string>;
  android?: {
    priority?: 'normal' | 'high';
    ttl?: string;
    notification?: FcmAndroidNotification;
  };
}

interface FcmSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

let cachedAuth: InstanceType<typeof google.auth.JWT> | null = null;

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

  const channel = androidConfig?.channelId ?? 'jobs_critical_v3';
  const soundName = androidConfig?.sound ?? 'new_job';

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
