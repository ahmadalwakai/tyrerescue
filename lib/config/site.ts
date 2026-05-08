/** Single source of truth for the canonical production URL. */
export const SITE_URL = 'https://www.tyrerescue.uk' as const;

/**
 * Canonical site URL for SEO use only (metadataBase, sitemap, robots,
 * canonical tags, OG/Twitter URLs, JSON-LD). This MUST always return the
 * production domain — never localhost — even in development, so that
 * crawlers and dev previews emit correct production URLs.
 */
export function getSiteUrl(): string {
  return SITE_URL;
}

const LOCAL_HOST_PATTERNS = ['localhost', '127.0.0.1', '0.0.0.0'];

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function looksLocal(value: string): boolean {
  return LOCAL_HOST_PATTERNS.some((p) => value.includes(p));
}

/**
 * Origin used for clickable links emitted by the server (Stripe
 * success/cancel URLs, email/SMS booking and tracking links, password reset
 * links, admin-generated customer links, etc.).
 *
 * Behaviour:
 *  - In production: ALWAYS returns the canonical SITE_URL. Any env
 *    misconfiguration that would point production traffic at localhost is
 *    ignored and logged.
 *  - In dev/test: prefers explicit env overrides
 *    (`NEXT_PUBLIC_APP_URL` → `APP_URL` → `NEXT_PUBLIC_BASE_URL` →
 *    `NEXTAUTH_URL`) so that locally-generated links are clickable.
 *  - Never returns a trailing slash.
 */
export function getAppOrigin(): string {
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    // Defensive guard: surface misconfiguration loudly but never serve a
    // localhost link to a real customer.
    const candidates = [
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.APP_URL,
      process.env.NEXT_PUBLIC_BASE_URL,
      process.env.NEXTAUTH_URL,
    ].filter((v): v is string => Boolean(v && v.trim()));

    for (const c of candidates) {
      if (looksLocal(c)) {
        // eslint-disable-next-line no-console
        console.error(
          `[site] Refusing to use localhost URL "${c}" in production; falling back to ${SITE_URL}`,
        );
      }
    }
    return SITE_URL;
  }

  const dev =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    'http://localhost:3000';

  return stripTrailingSlash(dev);
}

/**
 * Origin for URLs embedded in **outbound customer messages** — SMS, email,
 * WhatsApp, push notifications, etc. — that real customers will click.
 *
 * This ALWAYS returns the canonical production `SITE_URL`, even in
 * development, because:
 *   - SMS/email providers are real (Voodoo, ZeptoMail) and a misconfigured
 *     `NEXTAUTH_URL=http://localhost:3000` in `.env.local` would otherwise
 *     send a real customer a localhost link they cannot open.
 *   - The tracking page (`/tracking/[ref]`) is a public page that is always
 *     reachable on the production domain.
 *
 * If you need the env-aware origin for an internal redirect (e.g. Stripe
 * `success_url` during local Stripe CLI testing), use `getAppOrigin()` instead.
 */
export function getOutboundUrl(): string {
  return SITE_URL;
}
