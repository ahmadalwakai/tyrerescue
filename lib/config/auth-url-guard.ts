/**
 * Production guard for the Auth.js (NextAuth v5) base URL.
 *
 * Auth.js reads `AUTH_URL` first, then falls back to `NEXTAUTH_URL`. The
 * resolved value becomes the base for every OAuth `redirect_uri` (including
 * `/api/auth/callback/google`) and for every `signIn`/`signOut` redirect.
 *
 * If a deploy ever ends up with one of those env vars pointing at a
 * localhost URL in production (e.g. an accidentally-pulled dev env or a
 * stale Vercel project setting), real users get redirected to
 * `http://localhost:3000/api/auth/callback/google` and Google rejects /
 * cannot return them to the site. This module enforces, at module load:
 *
 *   - In production: any AUTH_URL/NEXTAUTH_URL that is missing or points
 *     at localhost/127.0.0.1/0.0.0.0 is replaced with the canonical
 *     production origin and a clear server-side error is logged. We never
 *     throw here so an Auth.js bootstrap problem cannot brick the entire
 *     app, but the misconfiguration is impossible to miss in logs.
 *   - In dev/test: env values are left untouched so local sign-in against
 *     `http://localhost:3000` continues to work.
 *
 * Import this module exactly once, before `NextAuth(...)` is invoked.
 */
import { SITE_URL } from '@/lib/config/site';

const LOCAL_PATTERNS = ['localhost', '127.0.0.1', '0.0.0.0'];

function looksLocal(value: string | undefined): boolean {
  if (!value) return false;
  return LOCAL_PATTERNS.some((p) => value.includes(p));
}

function enforceAuthUrl(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const authUrl = process.env.AUTH_URL;
  const nextAuthUrl = process.env.NEXTAUTH_URL;

  const authBad = looksLocal(authUrl);
  const nextAuthBad = looksLocal(nextAuthUrl);

  if (authBad || nextAuthBad || (!authUrl && !nextAuthUrl)) {
    if (authBad) {
      // eslint-disable-next-line no-console
      console.error(
        `[auth] Refusing AUTH_URL="${authUrl}" in production; overriding with ${SITE_URL}. ` +
          `Fix the Vercel project env var to avoid this warning.`,
      );
    }
    if (nextAuthBad) {
      // eslint-disable-next-line no-console
      console.error(
        `[auth] Refusing NEXTAUTH_URL="${nextAuthUrl}" in production; overriding with ${SITE_URL}. ` +
          `Fix the Vercel project env var to avoid this warning.`,
      );
    }

    // Force both vars to the canonical production origin. Auth.js will then
    // emit `${SITE_URL}/api/auth/callback/google` as the OAuth redirect_uri
    // and use it for every signIn/signOut redirect.
    process.env.AUTH_URL = SITE_URL;
    process.env.NEXTAUTH_URL = SITE_URL;
  }
}

enforceAuthUrl();
