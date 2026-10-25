import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  valid: true,
  rows: [] as unknown[][],
  select: vi.fn(),
  session: { bookingId: 'isolated-booking', lastLatitude: '56', lastLongitude: '-3', lastUpdatedAt: new Date() },
}));
vi.mock('@/lib/db', () => ({ db: { select: (...args: unknown[]) => {
  mocks.select(...args);
  return { from() { return this; }, innerJoin() { return this; }, where() { return this; }, limit: async () => mocks.rows.shift() ?? [] };
} } }));
vi.mock('@/lib/tracking-session', () => ({ getTrackingSessionByBookingId: async () => mocks.session }));
vi.mock('@/lib/tracking/shared-access', () => ({ sharedTrackingBookingId: () => 'isolated-booking', verifySharedTrackingToken: async () => mocks.valid }));
import { GET } from '@/app/api/tracking/shared/[token]/route';

const booking = { status: 'en_route', lat: '55.86', lng: '-4.25', driverId: 'isolated-driver' };
const call = () => GET(new Request('https://isolated.invalid/api/tracking/shared/isolated-token'), { params: Promise.resolve({ token: 'isolated-token' }) });
beforeEach(() => {
  mocks.valid = true;
  mocks.select.mockClear();
  mocks.session.lastUpdatedAt = new Date();
  mocks.rows = [[booking], [{ lat: '56', lng: '-3', locationAt: new Date(), name: 'Driver PrivateSurname' }]];
});

describe('family tracking lifecycle', () => {
  it.each(['completed', 'cancelled', 'cancelled_refund_pending', 'refunded', 'refunded_partial'])('ends %s tracking without disclosing a later location or its update time', async status => {
    mocks.rows[0] = [{ ...booking, status }];
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status, customerLat: 55.86, customerLng: -4.25,
      driverLat: null, driverLng: null, driverName: null, driverLocationAt: null });
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.rows).toHaveLength(1);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('preserves fresh location for an active booking without exposing customer contact or booking reference', async () => {
    const response = await call();
    expect(await response.json()).toEqual({ status: 'en_route', customerLat: 55.86, customerLng: -4.25,
      driverLat: 56, driverLng: -3, driverName: 'Driver', driverLocationAt: expect.any(String) });
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });
  it('rejects an expired or revoked family link before reading the booking', async () => {
    mocks.valid = false;
    const response = await call();
    expect(response.status).toBe(404);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
