import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), select: vi.fn(), limit: vi.fn(), provider: vi.fn(), legacy: vi.fn(), rate: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireDriverMobile: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));
vi.mock('@/lib/driver-navigation-directions', () => ({ getDriverNavigationDirections: mocks.provider }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('@/lib/mapbox', () => ({
  getDirections: mocks.legacy, haversineDistanceMiles: () => 1,
  metersToMiles: (value: number) => value / 1609.344,
  secondsToMinutes: (value: number) => Math.round(value / 60),
}));
import { GET } from '../../app/api/driver/jobs/[ref]/route/route';

const row = { bookingRef: 'TEST-ONLY-ROUTE', status: 'en_route', addressLine: 'Customer address', customerLat: '55', customerLng: '-3.998', driverId: 'assigned-driver' };
const route = {
  geometry: [[-4, 55], [-3.999, 55], [-3.998, 55]], distanceMeters: 130, durationSeconds: 40,
  steps: [{ instruction: 'Head east', location: [-4, 55] }],
};
const request = (query = 'navigation=1&lat=55&lng=-4') => new Request(`https://www.tyrerescue.uk/api/driver/jobs/${row.bookingRef}/route?${query}`) as NextRequest;
const context = () => ({ params: Promise.resolve({ ref: row.bookingRef }) });

describe('protected assigned-driver navigation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ driverId: row.driverId });
    const query = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: mocks.limit };
    mocks.select.mockReturnValue(query);
    mocks.limit.mockResolvedValue([row]);
    mocks.provider.mockResolvedValue({ routes: [route] });
    mocks.legacy.mockResolvedValue(null);
    mocks.rate.mockResolvedValue({ ok: true, remaining: 29, retryAfterSeconds: 0 });
  });
  it('requires authentication before reading a booking or requesting directions', async () => {
    mocks.auth.mockRejectedValueOnce(new Error('No session'));
    const response = await GET(request(), context());
    expect(response.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it('does not expose a customer or provider route to an unassigned driver', async () => {
    mocks.limit.mockResolvedValueOnce([{ ...row, driverId: 'other-driver' }]);
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it('returns provider turns and a versioned real road route for the assigned driver without cache storage', async () => {
    const response = await GET(request('navigation=1&originLat=55&originLng=-4&language=ar&motorways=avoid'), context());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.bookingRef).toBe(row.bookingRef);
    expect(body.source).toBe('mapbox');
    expect(body.navigation).toEqual({ version: 1, routes: [route] });
    expect(body.geometry.coordinates).toEqual(route.geometry);
    expect(mocks.provider).toHaveBeenCalledWith({ lat: 55, lng: -4 }, { lat: 55, lng: -3.998 }, {
      language: 'ar', avoid: { motorways: true, tolls: false, ferries: false },
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Authorization');
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it.each(['navigation=1', 'navigation=1&lat=55', 'navigation=1&lat=&lng=-4',
    'navigation=1&lat=91&lng=-4', 'navigation=1&lat=55x&lng=-4', 'navigation=1&lat=0&lng=0', 'navigation=1&lat=55&lng=-181'])
    ('rejects malformed GPS coordinates before contacting the provider: %s', async (query) => {
      expect((await GET(request(query), context())).status).toBe(400);
      expect(mocks.provider).not.toHaveBeenCalled();
    });
  it('does not request a route for a booking with missing or invalid customer coordinates', async () => {
    mocks.limit.mockResolvedValueOnce([{ ...row, customerLat: null }]);
    expect((await GET(request(), context())).status).toBe(422);
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it('limits route refreshes per authenticated driver before a billable provider request', async () => {
    mocks.rate.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 12 });
    const response = await GET(request(), context());
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('12');
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it('returns an unavailable error on provider failure without a straight line or invented maneuver', async () => {
    mocks.provider.mockResolvedValueOnce({ error: { kind: 'network', message: 'Road guidance unavailable.' } });
    const response = await GET(request(), context());
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.code).toBe('NAVIGATION_UNAVAILABLE');
    expect(body).not.toHaveProperty('geometry');
    expect(body).not.toHaveProperty('navigation');
    expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it('keeps the legacy marker-only contract available without requiring a GPS fix', async () => {
    const response = await GET(request(''), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ bookingRef: row.bookingRef, customerLocation: { lat: 55, lng: -3.998 }, driverLocation: null, navigation: null });
    expect(mocks.provider).not.toHaveBeenCalled();
  });
});
