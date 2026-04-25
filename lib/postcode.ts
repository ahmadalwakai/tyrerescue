/**
 * UK postcode utilities — pure, dependency-free, safe to use on server or client.
 *
 * `validateUkPostcode` covers the full GOV.UK PAF specification:
 *  - Standard formats (e.g. `M1 1AA`, `M60 1NW`, `CR2 6XH`, `DN55 1PT`,
 *    `W1A 1HQ`, `EC1A 1BB`).
 *  - Optional whitespace between the outward and inward parts.
 *  - Case-insensitive.
 */

export const WORKSHOP_COORDS: Readonly<{ lat: number; lng: number; postcode: string }> = {
  lat: 55.8576,
  lng: -4.2229,
  postcode: 'G31 1PD',
};

const UK_POSTCODE_REGEX =
  /^([Gg][Ii][Rr] 0[Aa]{2})$|^((([A-Za-z][0-9]{1,2})|(([A-Za-z][A-Ha-hJ-Yj-y][0-9]{1,2})|(([A-Za-z][0-9][A-Za-z])|([A-Za-z][A-Ha-hJ-Yj-y][0-9]?[A-Za-z]))))\s*[0-9][A-Za-z]{2})$/;

/**
 * Returns true when the string is a syntactically valid UK postcode.
 * Whitespace and case are ignored. Does NOT verify the postcode actually
 * exists in the Royal Mail database (use `getCoverageForPostcode` for that).
 */
export function validateUkPostcode(postcode: string): boolean {
  if (typeof postcode !== 'string') return false;
  const trimmed = postcode.trim();
  if (trimmed.length === 0) return false;
  return UK_POSTCODE_REGEX.test(trimmed);
}

/**
 * Returns the postcode in canonical Royal Mail form: uppercase, single
 * space separating outward and inward halves (e.g. `g311pd` → `G31 1PD`).
 *
 * The input must be a valid UK postcode — if it isn't, the function returns
 * the trimmed-uppercased input unchanged so callers can still display it.
 */
export function normalizePostcode(postcode: string): string {
  const compact = postcode.replace(/\s+/g, '').toUpperCase();
  if (compact.length < 5 || compact.length > 7) {
    return compact;
  }
  // Inward code is always the last 3 chars (digit + 2 letters).
  const inward = compact.slice(-3);
  const outward = compact.slice(0, compact.length - 3);
  return `${outward} ${inward}`;
}

/**
 * Great-circle distance in statute miles between two lat/lng points using
 * the Haversine formula. Accurate to within a few metres at UK scales.
 */
export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const earthRadiusMiles = 3958.7613;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}
