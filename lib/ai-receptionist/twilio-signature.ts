import 'server-only';

/** Public base URL Twilio is configured to call (signatures are computed over it). */
export function twilioWebhookBaseUrl(): string {
  return (process.env.TWILIO_WEBHOOK_URL ?? 'https://www.tyrerescue.uk').replace(/\/$/, '');
}

/**
 * Verify `X-Twilio-Signature` for a form-encoded webhook.
 *
 * Twilio signs the full URL it requested, query string included, so the
 * gather callback (`?step=…&callSid=…`) must be verified with its query.
 * Outside production the check is skipped so local testing works without
 * Twilio; in production a missing auth token rejects every request.
 */
export async function isValidTwilioRequest(request: Request, rawBody: string): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') return true;

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;

  try {
    const { validateRequest } = await import('twilio');
    const signature = request.headers.get('x-twilio-signature') ?? '';
    const { pathname, search } = new URL(request.url);
    const params = Object.fromEntries(new URLSearchParams(rawBody));
    return validateRequest(authToken, signature, twilioWebhookBaseUrl() + pathname + search, params);
  } catch {
    return false;
  }
}
