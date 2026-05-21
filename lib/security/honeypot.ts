/**
 * Honeypot field convention for public forms.
 *
 * The field is rendered visually hidden and aria-hidden, with tabIndex=-1
 * and autoComplete="off", so real users never fill it. Bots that blindly
 * fill every input give themselves away.
 */
export const HONEYPOT_FIELD = 'companyWebsite';

export function isHoneypotFilled(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const v = (body as Record<string, unknown>)[HONEYPOT_FIELD];
  return typeof v === 'string' && v.trim().length > 0;
}
