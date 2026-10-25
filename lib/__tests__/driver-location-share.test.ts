import { describe, expect, it, vi } from 'vitest';
import {
  DRIVER_LOCATION_MAX_AGE_MS,
  prepareDriverLocationPin,
  shareDriverLocation,
} from '../../assisted-chat-app/src/lib/driver-location-share';

const now = Date.parse('2026-10-21T12:00:00.000Z');
const expected = { bookingRef: 'TR-LOCATION-TEST', bookingId: 'booking-1' };
const booking = {
  id: expected.bookingId, refNumber: expected.bookingRef,
  status: 'arrived', driverId: 'driver-1', customerPhone: '07400 123456',
  lat: '55.900000', lng: '-4.300000',
};
const driver = {
  id: 'driver-1', name: 'Test driver',
  currentLat: '55.850123', currentLng: '-4.251234',
  locationAt: new Date(now - 10_000).toISOString(),
};
function payload(changes: { booking?: Record<string, unknown>; assignedDriver?: Record<string, unknown> | null } = {}) {
  return {
    booking: { ...booking, ...changes.booking },
    assignedDriver: changes.assignedDriver === null ? null : { ...driver, ...changes.assignedDriver },
    // Neither the customer destination nor a cached tracking pin is shareable.
    tracking: { driverLat: 1, driverLng: 2, customerUrl: 'https://example.invalid/track/customer/private-token' },
  };
}
function dependencies(response: unknown = payload()) {
  return {
    fetchBooking: vi.fn(async () => response),
    copy: vi.fn(async (url: string) => Boolean(url)),
    openWhatsApp: vi.fn(async (url: string) => { void url; }),
    isCurrent: vi.fn(() => true),
    now: () => now,
  };
}

describe('driver GPS pin sharing privacy and freshness', () => {
  it('shares the raw assigned driver coordinates, retaining precision and no tracking token', () => {
    const pin = prepareDriverLocationPin(payload(), expected, now);
    const url = new URL(pin.url);
    expect(url.origin).toBe('https://www.google.com');
    expect(url.pathname).toBe('/maps/search/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('query')).toBe('55.850123,-4.251234');
    expect(pin.url).not.toContain('track');
    expect(pin.url).not.toContain('token');
    expect(pin.url).not.toContain(booking.lat);
  });

  it.each(['driver_assigned', 'en_route', 'arrived', 'on_site', 'in_progress'])(
    'allows location sharing while the driver is %s', (status) => {
      expect(prepareDriverLocationPin(payload({ booking: { status } }), expected, now).url).toContain('maps/search');
    },
  );

  it.each(['completed', 'cancelled', 'refunded', 'awaiting_payment'])(
    'does not disclose a driver location after the booking becomes %s', (status) => {
      expect(() => prepareDriverLocationPin(payload({ booking: { status } }), expected, now)).toThrow('active booking');
    },
  );

  it('rejects a different booking or a driver that is no longer assigned', () => {
    expect(() => prepareDriverLocationPin(payload({ booking: { refNumber: 'OTHER' } }), expected, now)).toThrow('booking changed');
    expect(() => prepareDriverLocationPin(payload({ booking: { id: 'other-booking' } }), expected, now)).toThrow('booking changed');
    expect(() => prepareDriverLocationPin(payload({ booking: { driverId: 'new-driver' } }), expected, now)).toThrow('Assign a driver');
    expect(() => prepareDriverLocationPin(payload({ assignedDriver: null }), expected, now)).toThrow('Assign a driver');
  });

  it.each([
    { currentLat: null }, { currentLat: '' }, { currentLat: '   ' },
    { currentLat: 'not-a-number' }, { currentLat: Infinity }, { currentLat: true },
    { currentLat: 91 }, { currentLng: -181 }, { currentLng: {} },
    { currentLat: 0, currentLng: 0 },
  ])('rejects missing or invalid coordinates: %j', (changes) => {
    expect(() => prepareDriverLocationPin(payload({ assignedDriver: changes }), expected, now)).toThrow('No driver GPS');
  });

  it('keeps valid zero latitude rather than treating it as missing', () => {
    const pin = prepareDriverLocationPin(payload({ assignedDriver: { currentLat: 0, currentLng: -4.251234 } }), expected, now);
    expect(new URL(pin.url).searchParams.get('query')).toBe('0,-4.251234');
  });

  it('blocks stale, missing, invalid and future timestamps', () => {
    const stale = new Date(now - DRIVER_LOCATION_MAX_AGE_MS - 1).toISOString();
    expect(() => prepareDriverLocationPin(payload({ assignedDriver: { locationAt: stale } }), expected, now)).toThrow('over 3 minutes old');
    for (const locationAt of [null, '', 'invalid', new Date(now + 60_000).toISOString()]) {
      expect(() => prepareDriverLocationPin(payload({ assignedDriver: { locationAt } }), expected, now)).toThrow('timestamp is unavailable');
    }
  });

  it('uses the saved customer number and explains that the pin is a fixed position', () => {
    const pin = prepareDriverLocationPin(payload(), expected, now);
    const whatsapp = new URL(pin.whatsappUrl!);
    expect(whatsapp.pathname).toBe('/447400123456');
    const message = whatsapp.searchParams.get('text')!;
    expect(message).toContain(pin.url);
    expect(message).toContain('GPS updated:');
    expect(message).toContain('fixed position');
    expect(message).toContain(expected.bookingRef);
    expect(message).not.toContain('private-token');
  });
});

describe('driver location copy and WhatsApp actions', () => {
  it('fetches a new saved position for each action instead of sharing a cached map marker', async () => {
    const deps = dependencies();
    await shareDriverLocation({ ...expected, method: 'copy' }, deps);
    deps.fetchBooking.mockResolvedValue(payload({ assignedDriver: { currentLat: '55.850987' } }));
    await shareDriverLocation({ ...expected, method: 'copy' }, deps);
    expect(deps.fetchBooking).toHaveBeenCalledTimes(2);
    expect(new URL(deps.copy.mock.calls[0][0]).searchParams.get('query')).toBe('55.850123,-4.251234');
    expect(new URL(deps.copy.mock.calls[1][0]).searchParams.get('query')).toBe('55.850987,-4.251234');
    expect(deps.openWhatsApp).not.toHaveBeenCalled();
  });

  it('opens WhatsApp with the current saved booking recipient and does not send automatically', async () => {
    const deps = dependencies(payload({ booking: { customerPhone: '07700 900123' } }));
    await shareDriverLocation({ ...expected, method: 'whatsapp' }, deps);
    expect(deps.openWhatsApp).toHaveBeenCalledOnce();
    expect(new URL(deps.openWhatsApp.mock.calls[0][0]).pathname).toBe('/447700900123');
    expect(deps.copy).not.toHaveBeenCalled();
  });

  it('suppresses both actions if the booking, project or login session changed during the fetch', async () => {
    const deps = dependencies();
    deps.isCurrent.mockReturnValue(false);
    for (const method of ['copy', 'whatsapp'] as const) {
      await expect(shareDriverLocation({ ...expected, method }, deps)).rejects.toThrow('session changed');
    }
    expect(deps.copy).not.toHaveBeenCalled();
    expect(deps.openWhatsApp).not.toHaveBeenCalled();
  });

  it('does not fall back to a cached location after a failed fetch or stale response', async () => {
    const deps = dependencies();
    deps.fetchBooking.mockRejectedValueOnce(new Error('offline'));
    await expect(shareDriverLocation({ ...expected, method: 'copy' }, deps)).rejects.toThrow('offline');
    deps.fetchBooking.mockResolvedValueOnce(payload({ assignedDriver: { locationAt: new Date(now - 600_000).toISOString() } }));
    await expect(shareDriverLocation({ ...expected, method: 'whatsapp' }, deps)).rejects.toThrow('over 3 minutes old');
    expect(deps.copy).not.toHaveBeenCalled();
    expect(deps.openWhatsApp).not.toHaveBeenCalled();
  });

  it('allows copying without a customer phone, but never opens WhatsApp to an unknown recipient', async () => {
    const deps = dependencies(payload({ booking: { customerPhone: null } }));
    await shareDriverLocation({ ...expected, method: 'copy' }, deps);
    await expect(shareDriverLocation({ ...expected, method: 'whatsapp' }, deps)).rejects.toThrow('Add the customer phone');
    expect(deps.copy).toHaveBeenCalledOnce();
    expect(deps.openWhatsApp).not.toHaveBeenCalled();
  });

  it('reports a clipboard failure instead of claiming the link was copied', async () => {
    const deps = dependencies();
    deps.copy.mockResolvedValue(false);
    await expect(shareDriverLocation({ ...expected, method: 'copy' }, deps)).rejects.toThrow('Could not copy');
  });

  it('never shares a stale pin when the operator cancels the warning', async () => {
    const deps = {
      ...dependencies(payload({ assignedDriver: { locationAt: new Date(now - 600_000).toISOString() } })),
      confirmLastKnown: vi.fn(async () => false),
    };
    await expect(shareDriverLocation({ ...expected, method: 'copy' }, deps)).rejects.toThrow('cancelled');
    expect(deps.confirmLastKnown).toHaveBeenCalledOnce();
    expect(deps.fetchBooking).toHaveBeenCalledOnce();
    expect(deps.copy).not.toHaveBeenCalled();
    expect(deps.openWhatsApp).not.toHaveBeenCalled();
  });

  it('re-checks the saved assignment after confirmation and includes the stale warning in copied content', async () => {
    const oldTime = new Date(now - 600_000).toISOString();
    const deps = {
      ...dependencies(payload({ assignedDriver: { locationAt: oldTime } })),
      confirmLastKnown: vi.fn(async () => true),
    };
    const pin = await shareDriverLocation({ ...expected, method: 'copy' }, deps);
    expect(deps.fetchBooking).toHaveBeenCalledTimes(2);
    expect(pin.isLastKnown).toBe(true);
    expect(deps.copy).toHaveBeenCalledWith(expect.stringContaining('Last known location'));
    expect(deps.copy).toHaveBeenCalledWith(expect.stringContaining('GPS updated:'));
    expect(deps.copy).toHaveBeenCalledWith(expect.stringContaining('Please confirm it with your driver'));
  });

  it('blocks the former driver if assignment changes while the stale warning is open', async () => {
    const deps = {
      ...dependencies(payload({ assignedDriver: { locationAt: new Date(now - 600_000).toISOString() } })),
      confirmLastKnown: vi.fn(async () => true),
    };
    deps.fetchBooking.mockResolvedValueOnce(payload({ assignedDriver: { locationAt: new Date(now - 600_000).toISOString() } }));
    deps.fetchBooking.mockResolvedValueOnce(payload({ booking: { driverId: 'new-driver' }, assignedDriver: { id: 'new-driver' } }));
    await expect(shareDriverLocation({ ...expected, method: 'copy' }, deps)).rejects.toThrow('driver or location changed');
    expect(deps.copy).not.toHaveBeenCalled();
    expect(deps.openWhatsApp).not.toHaveBeenCalled();
  });

  it('does not disclose a pin if the booking closes while the stale warning is open', async () => {
    const stale = payload({ assignedDriver: { locationAt: new Date(now - 600_000).toISOString() } });
    const deps = { ...dependencies(stale), confirmLastKnown: vi.fn(async () => true) };
    deps.fetchBooking.mockResolvedValueOnce(stale).mockResolvedValueOnce(payload({ booking: { status: 'completed' } }));
    await expect(shareDriverLocation({ ...expected, method: 'whatsapp' }, deps)).rejects.toThrow('active booking');
    expect(deps.openWhatsApp).not.toHaveBeenCalled();
  });
});
