import { api } from '@/api/client';
import { isValidCoord, type Coordinates, type FetchDirectionsOptions, type FetchDirectionsResult } from './directions';
import { readProtectedNavigationResponse } from '@/lib/navigation/protectedNavigation';

/** Server-owned road directions, authenticated using the driver's existing session. */
export async function fetchProtectedJobDirections(
  bookingRef: string, origin: Coordinates, destination: Coordinates,
  signal?: AbortSignal, options: FetchDirectionsOptions = {},
): Promise<FetchDirectionsResult> {
  if (signal?.aborted) return { error: { kind: 'aborted', message: 'Request aborted' } };
  if (!bookingRef || !isValidCoord(origin) || !isValidCoord(destination)) {
    return { error: { kind: 'invalid-coords', message: 'A valid driver and customer location are required.' } };
  }
  const params = new URLSearchParams({
    lat: origin.lat.toFixed(6), lng: origin.lng.toFixed(6), navigation: '1',
    language: options.language === 'ar' ? 'ar' : 'en',
  });
  for (const key of ['motorways', 'tolls', 'ferries'] as const) {
    if (options.avoid?.[key]) params.set(key, 'avoid');
  }
  try {
    const response = await api<unknown>(`/api/driver/jobs/${encodeURIComponent(bookingRef)}/route?${params}`, { signal });
    if (signal?.aborted) return { error: { kind: 'aborted', message: 'Request aborted' } };
    return readProtectedNavigationResponse(response, bookingRef, origin, destination);
  } catch {
    return signal?.aborted ? { error: { kind: 'aborted', message: 'Request aborted' } }
      : { error: { kind: 'network', message: 'Unable to load road guidance. Check your connection and retry.' } };
  }
}
