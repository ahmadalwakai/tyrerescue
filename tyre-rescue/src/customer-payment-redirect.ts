const CALLBACK_HOST = 'stripe-redirect';
const CALLBACK_PATHS = new Set(['/stripe-redirect', '/stripe-redirect/']);

/** Recognise our bank return URL without retaining its payment query parameters. */
export function isStripeRedirectUrl(url: string): boolean {
  if (typeof url !== 'string') return false;
  const base = url.split(/[?#]/, 1)[0];
  if (!base || /[\u0000-\u0020\u007f\\]/.test(base)) return false;

  try {
    const parsed = new URL(base);
    if (parsed.protocol !== 'tyrerescue:' || parsed.username || parsed.password || parsed.port) return false;
    if (parsed.hostname.toLowerCase() === CALLBACK_HOST) return parsed.pathname === '' || parsed.pathname === '/';
    return parsed.hostname === '' && CALLBACK_PATHS.has(parsed.pathname);
  } catch {
    return false;
  }
}

/** Router may supply either the original URL or its already-normalised app path. */
export function rewriteStripeRedirectPath({ path, initial }: { path: string; initial: boolean }): string {
  if (typeof path !== 'string') return '/';
  const base = path.split(/[?#]/, 1)[0];
  const normalisedCallback = CALLBACK_PATHS.has(base) || base === CALLBACK_HOST || base === `${CALLBACK_HOST}/`;
  if (!isStripeRedirectUrl(path) && !normalisedCallback) return path;

  // Keep a warm checkout mounted. A cold launch restores its durable payment
  // attempt on the Book screen; the SDK callback is owned by the provider.
  return initial ? '/' : '';
}
