/**
 * Postcode coverage checker — calls the free postcodes.io API to geocode a
 * UK postcode, then derives a coverage tier + ETA from straight-line
 * distance to the Tyre Rescue workshop.
 *
 * Results are memoised in-process for 1 hour so the same postcode hitting
 * the API repeatedly (e.g. several site visitors checking the same area)
 * does not produce duplicate outbound requests.
 */

import {
  WORKSHOP_COORDS,
  haversineMiles,
  normalizePostcode,
  validateUkPostcode,
} from '@/lib/postcode';
import type {
  CoverageResult,
  CoverageTier,
  PostcodesIoResponse,
} from '@/types/coverage';

const POSTCODES_IO_BASE = 'https://api.postcodes.io/postcodes';
const FETCH_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 60 * 60 * 1_000; // 1 hour

interface CacheEntry {
  result: CoverageResult;
  expiresAt: number;
}

const coverageCache = new Map<string, CacheEntry>();

export class CoverageError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid_postcode' | 'not_found' | 'network' | 'unknown'
  ) {
    super(message);
    this.name = 'CoverageError';
  }
}

function tierFor(distanceMiles: number): { tier: CoverageTier; etaMinutes: number | null; covered: boolean } {
  if (distanceMiles < 30) {
    return { tier: 'core', etaMinutes: 45, covered: true };
  }
  if (distanceMiles <= 60) {
    return { tier: 'extended', etaMinutes: 90, covered: true };
  }
  return { tier: 'outside', etaMinutes: null, covered: false };
}

function pickArea(payload: NonNullable<PostcodesIoResponse['result']>): string {
  return (
    payload.admin_district ||
    payload.admin_county ||
    payload.region ||
    payload.country ||
    'Unknown area'
  );
}

/**
 * Resolve coverage for a postcode. Throws `CoverageError` for known failure
 * modes; lets unexpected errors bubble so the API route can log them.
 */
export async function getCoverageForPostcode(postcode: string): Promise<CoverageResult> {
  if (!validateUkPostcode(postcode)) {
    throw new CoverageError('That does not look like a UK postcode.', 'invalid_postcode');
  }

  const normalized = normalizePostcode(postcode);
  const cacheKey = normalized;

  const cached = coverageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${POSTCODES_IO_BASE}/${encodeURIComponent(normalized)}`, {
      signal: controller.signal,
      // postcodes.io is open data; cache aggressively at the network layer
      // too. `next: { revalidate }` is a Next.js extension safe to ignore on
      // other runtimes.
      next: { revalidate: 3600 },
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new CoverageError('Postcode lookup timed out — please try again.', 'network');
    }
    throw new CoverageError('Could not reach the postcode service.', 'network');
  }
  clearTimeout(timeoutId);

  if (response.status === 404) {
    throw new CoverageError('We could not find that postcode.', 'not_found');
  }
  if (!response.ok) {
    throw new CoverageError('Postcode service returned an error.', 'unknown');
  }

  const payload = (await response.json()) as PostcodesIoResponse;
  if (!payload.result) {
    throw new CoverageError('We could not find that postcode.', 'not_found');
  }

  const distanceMiles =
    Math.round(
      haversineMiles(
        WORKSHOP_COORDS.lat,
        WORKSHOP_COORDS.lng,
        payload.result.latitude,
        payload.result.longitude
      ) * 10
    ) / 10;

  const { tier, etaMinutes, covered } = tierFor(distanceMiles);

  const result: CoverageResult = {
    covered,
    etaMinutes,
    distanceMiles,
    area: pickArea(payload.result),
    postcode: normalized,
    tier,
  };

  coverageCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/** Test seam — wipes the in-memory cache. Not exported via barrel. */
export function __clearCoverageCacheForTests(): void {
  coverageCache.clear();
}
