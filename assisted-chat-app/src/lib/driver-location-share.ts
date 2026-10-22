import { buildWhatsAppUrl } from './customer-message';
import { normalizePhoneForWhatsApp } from './money';

export const DRIVER_LOCATION_MAX_AGE_MS = 180_000;
export type DriverLocationShareMethod = 'copy' | 'whatsapp';

const ACTIVE_STATUSES = new Set([
  'assigned', 'driver_assigned', 'en_route', 'arrived', 'on_site', 'in_progress',
]);

export function isDriverLocationShareableStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

export class DriverLocationShareError extends Error {
  constructor(public readonly code: string, message: string, public readonly recordedAt?: string) {
    super(message);
    this.name = 'DriverLocationShareError';
  }
}

export interface DriverLocationShareRequest {
  bookingRef: string;
  bookingId?: string | null;
  method: DriverLocationShareMethod;
}

export interface DriverLocationPin {
  url: string;
  whatsappUrl: string | null;
  recordedAt: string;
  driverName: string | null;
  driverId: string;
  isLastKnown: boolean;
  message: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function coordinate(value: unknown, limit: number): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? parsed : null;
}

/** Use the assigned driver's raw GPS, never a destination or tracking-session pin. */
export function prepareDriverLocationPin(
  payload: unknown,
  expected: Pick<DriverLocationShareRequest, 'bookingRef' | 'bookingId'>,
  now = Date.now(),
  options: { allowLastKnown?: boolean } = {},
): DriverLocationPin {
  const response = record(payload);
  const booking = record(response?.booking);
  const driver = record(response?.assignedDriver);
  if (!booking || booking.refNumber !== expected.bookingRef
    || (expected.bookingId && booking.id !== expected.bookingId)) {
    throw new DriverLocationShareError('booking_changed', 'This booking changed. Reopen it and try again.');
  }
  if (!isDriverLocationShareableStatus(text(booking.status) ?? '')) {
    throw new DriverLocationShareError('booking_closed', 'Driver location can only be shared for an active booking.');
  }
  if (!driver || !text(driver.id) || driver.id !== booking.driverId) {
    throw new DriverLocationShareError('driver_unassigned', 'Assign a driver to this booking before sharing their location.');
  }
  const lat = coordinate(driver.currentLat, 90);
  const lng = coordinate(driver.currentLng, 180);
  if (lat === null || lng === null || (lat === 0 && lng === 0)) {
    throw new DriverLocationShareError('location_unavailable', 'No driver GPS position is available. Ask the driver to update their location.');
  }
  const recordedAt = text(driver.locationAt);
  const timestamp = recordedAt ? Date.parse(recordedAt) : NaN;
  if (!Number.isFinite(now) || !Number.isFinite(timestamp) || timestamp > now) {
    throw new DriverLocationShareError('location_unavailable', 'The driver location timestamp is unavailable. Ask the driver to update their location.');
  }
  const isLastKnown = now - timestamp > DRIVER_LOCATION_MAX_AGE_MS;
  if (isLastKnown && !options.allowLastKnown) {
    throw new DriverLocationShareError('location_stale',
      'Driver location is over 3 minutes old. Ask the driver to open their app to refresh GPS.',
      new Date(timestamp).toISOString());
  }
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  const time = new Date(timestamp).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/London',
  });
  const message = [
    isLastKnown ? 'Last known location of your driver:' : 'Your driver is at the location below:', url,
    `GPS updated: ${time} (UK time).`,
    ...(isLastKnown ? ['This location has not updated recently. Please confirm it with your driver.'] : []),
    'This pin shows a fixed position and does not move with the driver.',
    `Booking: ${expected.bookingRef}`,
  ].join('\n');
  // The saved booking is authoritative: never send to a different draft's phone.
  const phone = text(booking.customerPhone);
  const normalized = phone ? normalizePhoneForWhatsApp(phone) : null;
  const whatsappUrl = phone && normalized && /^\d{10,15}$/.test(normalized)
    ? buildWhatsAppUrl(phone, message) : null;
  return { url, whatsappUrl, recordedAt: new Date(timestamp).toISOString(),
    driverName: text(driver.name), driverId: driver.id as string, isLastKnown, message };
}

export interface DriverLocationShareDependencies {
  fetchBooking: (bookingRef: string) => Promise<unknown>;
  copy: (url: string) => Promise<boolean>;
  openWhatsApp: (url: string) => Promise<void>;
  isCurrent: () => boolean;
  confirmLastKnown?: (recordedAt: string) => Promise<boolean>;
  now?: () => number;
}

/** Re-fetch on every action; a failed/changed request must never share a cached pin. */
export async function shareDriverLocation(
  request: DriverLocationShareRequest,
  dependencies: DriverLocationShareDependencies,
): Promise<DriverLocationPin> {
  const payload = await dependencies.fetchBooking(request.bookingRef);
  if (!dependencies.isCurrent()) {
    throw new DriverLocationShareError('context_changed', 'The selected booking or session changed. Try again.');
  }
  let pin: DriverLocationPin;
  try {
    pin = prepareDriverLocationPin(payload, request, (dependencies.now ?? Date.now)());
  } catch (error) {
    if (!(error instanceof DriverLocationShareError) || error.code !== 'location_stale'
      || !error.recordedAt || !dependencies.confirmLastKnown) throw error;
    const previous = prepareDriverLocationPin(payload, request, (dependencies.now ?? Date.now)(), { allowLastKnown: true });
    const confirmed = await dependencies.confirmLastKnown(error.recordedAt);
    if (!confirmed) throw new DriverLocationShareError('share_cancelled', 'Location sharing cancelled.');
    if (!dependencies.isCurrent()) throw new DriverLocationShareError('context_changed', 'The selected booking or session changed. Try again.');
    // The operator may leave the warning open: re-check assignment and phone
    // before sharing, and never expose the former driver's pin after reassignment.
    const latest = await dependencies.fetchBooking(request.bookingRef);
    if (!dependencies.isCurrent()) throw new DriverLocationShareError('context_changed', 'The selected booking or session changed. Try again.');
    pin = prepareDriverLocationPin(latest, request, (dependencies.now ?? Date.now)(), { allowLastKnown: true });
    if (pin.driverId !== previous.driverId || Date.parse(pin.recordedAt) < Date.parse(previous.recordedAt)) {
      throw new DriverLocationShareError('booking_changed', 'The driver or location changed. Reopen the booking and try again.');
    }
  }
  if (request.method === 'copy') {
    if (!await dependencies.copy(pin.isLastKnown ? pin.message : pin.url)) {
      throw new DriverLocationShareError('copy_failed', 'Could not copy the driver location. Try again.');
    }
  } else {
    if (!pin.whatsappUrl) {
      throw new DriverLocationShareError('phone_missing', 'Add the customer phone to this booking, or copy the driver location link.');
    }
    await dependencies.openWhatsApp(pin.whatsappUrl);
  }
  return pin;
}
