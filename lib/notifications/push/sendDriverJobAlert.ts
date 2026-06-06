import { sendFcmDataMessageToToken, getDriverFcmCredentials } from '../fcm';

/**
 * Driver new-job / reassignment alert sender.
 *
 * Sends a STRICT DATA-ONLY FCM message so the Android driver app's native
 * `DriverJobMessagingService.onMessageReceived` is woken while the app is
 * backgrounded, killed, or the screen is locked. A top-level `notification`
 * (or `android.notification`) payload would be swallowed by the OS and routed
 * to the system tray instead of the service, which means NO full-screen intent,
 * NO custom sound, and NO lock-screen Activity. Hence this path must never emit
 * a notification block.
 *
 * The app accepts any of these `data.type` values (ACCEPTED_TYPES):
 *   new_job | JOB_ASSIGNED | DRIVER_JOB_ASSIGNED | driver_new_job |
 *   new_driver_job | job_assigned | new_assignment | reassignment
 * We send the canonical `new_job`.
 */
export interface DriverJobAlertPayload {
  token: string;
  ref: string;
  title?: string;
  body?: string;
  address?: string;
  url?: string;
  jobId?: string;
  assignmentId?: string;
  amountToCollectPence?: number;
  jobPricePence?: number;
  paymentStatus?: string;
  paymentType?: string;
}

export type DriverJobAlertResult =
  | { ok: true; messageId?: string }
  | { ok: false; code: string; error?: string };

/**
 * FCM error codes / patterns that mean the registration token is dead
 * (app uninstalled, token rotated, push disabled). Callers should prune the
 * token from storage when they see one of these.
 */
const STALE_TOKEN_CODES = new Set([
  'UNREGISTERED',
  'NOT_FOUND',
  'INVALID_ARGUMENT',
  'INVALID_REGISTRATION',
  'SENDER_ID_MISMATCH',
]);

export function isStaleDriverTokenCode(code: string | undefined, errorText?: string): boolean {
  if (code && STALE_TOKEN_CODES.has(code)) return true;
  if (!errorText) return false;
  const t = errorText.toLowerCase();
  return (
    t.includes('registration-token-not-registered') ||
    t.includes('invalid-registration-token') ||
    t.includes('requested entity was not found') ||
    t.includes('unregistered')
  );
}

/**
 * Dev-only regression guard: the new-job alert MUST be data-only. Throw in
 * development if a `notification` key ever leaks into the outgoing payload so
 * the mistake is caught in tests/local runs rather than silently breaking
 * background delivery in production.
 */
function assertDataOnly(data: Record<string, string>): void {
  if (process.env.NODE_ENV === 'production') return;
  if ('notification' in data) {
    throw new Error(
      '[sendDriverJobAlert] outgoing message must be DATA-ONLY: found a `notification` key. ' +
        'A notification payload is swallowed by Android in the background and breaks the ' +
        'native full-screen alert.',
    );
  }
}

function put(data: Record<string, string>, key: string, value: string | undefined): void {
  if (value != null && value !== '') data[key] = value;
}

/**
 * Send the data-only driver job alert. Never throws past this function in
 * production: messaging failures are returned as a typed `{ ok: false, code }`
 * so the caller can prune dead tokens and continue.
 */
export async function sendDriverJobAlert(
  payload: DriverJobAlertPayload,
): Promise<DriverJobAlertResult> {
  // Build the strict data-only payload. Every value MUST be a string — FCM
  // rejects non-string data values. Include the alias keys the native handler
  // reads so any client version resolves the field (e.g. address|location).
  const data: Record<string, string> = {
    type: 'new_job',
    ref: payload.ref,
    bookingRef: payload.ref,
  };
  put(data, 'title', payload.title ?? 'New Job Assigned');
  put(data, 'body', payload.body ?? `Job ${payload.ref}. Tap to accept.`);
  put(data, 'address', payload.address);
  put(data, 'location', payload.address);
  put(data, 'url', payload.url);
  put(data, 'jobId', payload.jobId);
  put(data, 'assignmentId', payload.assignmentId);
  if (payload.amountToCollectPence != null) {
    const v = String(payload.amountToCollectPence);
    data.amountToCollectPence = v;
    data.collectAmount = v;
  }
  if (payload.jobPricePence != null) {
    const v = String(payload.jobPricePence);
    data.jobPricePence = v;
    data.price = v;
  }
  put(data, 'paymentStatus', payload.paymentStatus);
  put(data, 'paymentType', payload.paymentType);

  assertDataOnly(data);

  // Use the driver app's OWN Firebase project credentials. The driver app is
  // in a different Firebase project than the admin/assisted-chat apps, so the
  // global FCM_* creds would fail with SENDER_ID_MISMATCH for driver tokens.
  const result = await sendFcmDataMessageToToken(
    payload.token,
    data,
    {
      priority: 'HIGH',
      ttl: '300s',
      // Intentionally NO `notification` — data-only so the native service wakes.
    },
    getDriverFcmCredentials(),
  );

  if (result.success) {
    return { ok: true, messageId: result.messageId };
  }
  return { ok: false, code: result.errorCode ?? 'SEND_FAILED', error: result.error };
}
