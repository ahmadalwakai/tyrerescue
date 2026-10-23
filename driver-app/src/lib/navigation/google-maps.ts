/**
 * Google Maps external navigation URL builders.
 *
 * Two safe URL helpers:
 *  - buildGoogleMapsNavigationUrl: driving directions to known coordinates.
 *  - buildGoogleMapsSearchUrl: address text search when coordinates are missing.
 *
 * No new packages. No geocoding. No unofficial endpoints.
 * These are plain HTTPS URLs that the OS opens in Google Maps or a browser.
 */

import type { NavigationCoordinates } from './waze';

export type { NavigationCoordinates };

/**
 * Build a Google Maps driving-directions URL for a known coordinate.
 * Falls back to the web URL (works even without the Maps app installed).
 */
export function buildGoogleMapsNavigationUrl(destination: NavigationCoordinates): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${destination.lat},${destination.lng}`,
    travelmode: 'driving',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Build a Google Maps text-search URL from an address string.
 * Use ONLY when coordinates are unavailable — never synthesise coordinates.
 * Throws if the address is empty after trimming.
 */
export function buildGoogleMapsSearchUrl(query: string): string {
  const q = query.trim();
  if (!q) throw new Error('Invalid address');
  const params = new URLSearchParams({ api: '1', query: q });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}
