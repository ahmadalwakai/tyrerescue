import { timingSafeEqual } from 'node:crypto';

/**
 * True only when CRON_SECRET is configured and the request carries
 * `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends).
 *
 * Comparing against `Bearer ${process.env.CRON_SECRET}` directly would
 * accept the literal header `Bearer undefined` whenever the secret is unset.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const provided = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
