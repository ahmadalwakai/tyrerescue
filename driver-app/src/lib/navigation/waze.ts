/**
 * Official Waze external navigation URL builder.
 *
 * Opens the customer destination in Waze via its documented public deep link.
 * No Waze API key is used. No unofficial endpoints. No police/camera/hazard/
 * crash/jam data is fetched into this app.
 */

export type NavigationCoordinates = {
  lat: number;
  lng: number;
};

/**
 * Type guard for NavigationCoordinates. Validates that the value is a non-null
 * object with finite lat/lng within geographic bounds.
 */
export function isValidNavigationCoordinate(
  value: unknown,
): value is NavigationCoordinates {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  const { lat, lng } = obj;
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Build the official Waze deep-link URL for external navigation to a destination.
 *
 * Uses the documented public Waze URL scheme:
 *   https://waze.com/ul?ll={lat},{lng}&navigate=yes
 *
 * The driver's device handles the deep link: Waze opens if installed,
 * otherwise the system browser opens the Waze web app.
 */
export function buildWazeNavigationUrl(destination: NavigationCoordinates): string {
  const params = new URLSearchParams({
    ll: `${destination.lat},${destination.lng}`,
    navigate: 'yes',
  });
  return `https://waze.com/ul?${params.toString()}`;
}
