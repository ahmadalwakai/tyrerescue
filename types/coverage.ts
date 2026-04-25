/**
 * Shared coverage-check types. Imported by the lib helper, the API route,
 * and the homepage `<PostcodeChecker />` client component.
 */

export type CoverageTier = 'core' | 'extended' | 'outside';

export interface CoverageResult {
  /** Whether we will dispatch a fitter (true for core + extended). */
  covered: boolean;
  /** Estimated time to arrive on-site in minutes, or null if outside coverage. */
  etaMinutes: number | null;
  /** Distance from the workshop in statute miles (rounded to 1 decimal). */
  distanceMiles: number;
  /** Human-friendly area name (e.g. "Glasgow", "Edinburgh", "Stirling"). */
  area: string;
  /** Postcode in canonical form, e.g. "G31 1PD". */
  postcode: string;
  tier: CoverageTier;
}

/** Subset of the postcodes.io `GET /postcodes/:postcode` response we use. */
export interface PostcodesIoResponse {
  status: number;
  result: {
    postcode: string;
    latitude: number;
    longitude: number;
    admin_district: string | null;
    admin_county: string | null;
    region: string | null;
    country: string | null;
  } | null;
}

/** Standard error envelope returned by `/api/coverage/check`. */
export interface CoverageErrorResponse {
  error: string;
  code: 'invalid_postcode' | 'not_found' | 'rate_limited' | 'network' | 'unknown';
}
