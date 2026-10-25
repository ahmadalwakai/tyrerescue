import { toNativeMapCoordinate } from './nativeMapModel';

/** Official Apple Maps URL. Do not substitute a guessed customer coordinate. */
export function buildAppleMapsNavigationUrl(point: unknown, address?: string | null): string | null {
  const coordinate = toNativeMapCoordinate(point);
  const destination = coordinate
    ? `${coordinate.latitude},${coordinate.longitude}`
    : address?.trim();
  if (!destination) return null;
  return `https://maps.apple.com/?${new URLSearchParams({ daddr: destination, dirflg: 'd' }).toString()}`;
}
