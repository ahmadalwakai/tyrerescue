export type BookingCoordinate = string | number | null | undefined;

function validCoordinate(value: BookingCoordinate, limit: number): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = typeof value === 'string' ? value.trim() : String(value);
  if (!text || (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) && Math.abs(numeric) <= limit ? text : null;
}

/** The saved latitude first, then longitude, ready to paste into a map. */
export function formatBookingCoordinatesForCopy(lat: BookingCoordinate, lng: BookingCoordinate): string {
  const latitude = validCoordinate(lat, 90);
  const longitude = validCoordinate(lng, 180);
  return latitude !== null && longitude !== null ? `${latitude}, ${longitude}` : '';
}
