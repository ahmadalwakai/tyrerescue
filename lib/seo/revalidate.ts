import { revalidatePath } from 'next/cache';

/**
 * Fire-and-forget revalidation of one or more app paths.
 *
 * Used by admin mutation handlers to invalidate ISR cache entries for SEO
 * pages immediately after a content change, instead of waiting for the
 * 1-week / 1-day revalidate window. Errors are swallowed so cache misses
 * never break an admin save.
 *
 * For external callers (CI, CMS webhooks) use POST /api/revalidate which
 * enforces the REVALIDATE_SECRET header and a path allowlist.
 */
export function revalidateSeoPaths(paths: ReadonlyArray<string>): void {
  for (const path of paths) {
    if (typeof path !== 'string' || !path.startsWith('/')) continue;
    try {
      revalidatePath(path);
    } catch (error) {
      // Never let cache invalidation crash the calling handler.
      console.error('[seo] revalidatePath failed for', path, error);
    }
  }
}
