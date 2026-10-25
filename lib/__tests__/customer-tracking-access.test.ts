import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ access: false, role: null as string | null, legacySession: null as null | { bookingId: string }, rows: [] as unknown[][], directions: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { select: () => ({ from() { return this; }, where() { return this; }, limit: async () => mocks.rows.shift() ?? [], orderBy: async () => mocks.rows.shift() ?? [] }) } }));
vi.mock('@/lib/auth', () => ({ authMobile: async () => mocks.role ? { user: { role: mocks.role } } : null }));
vi.mock('@/lib/customer-booking-access', () => ({ authorizeCustomerBooking: async () => mocks.access,
  getCustomerBookingAccessToken: (request: Request) => request.headers.get('X-Booking-Access'), verifyCustomerBookingAccessToken: async (token: string) => token === 'valid-cookie-proof' }));
vi.mock('@/lib/tracking-session', () => ({ getTrackingSessionByCustomerToken: async () => mocks.legacySession }));
vi.mock('@/lib/mapbox', () => ({ getDirections: (...args: unknown[]) => mocks.directions(...args), metersToMiles: (meters: number) => meters / 1609, secondsToMinutes: (seconds: number) => Math.round(seconds / 60) }));
import { GET } from '@/app/api/tracking/[ref]/route';

const booking = { id: 'booking-a', refNumber: 'TR-A', userId: 'owner-a', sourceApp: 'tyrerescue', sourceLabel: 'Tyre Rescue', status: 'en_route', bookingType: 'emergency', lat: '55', lng: '-4', driverId: 'driver-a', addressLine: 'Private address', scheduledAt: null };
const call = () => GET(new NextRequest('https://example.test/api/tracking/TR-A'), { params: Promise.resolve({ ref: 'TR-A' }) });
beforeEach(() => { mocks.access = false; mocks.role = null; mocks.legacySession = null; mocks.rows = [[booking]]; mocks.directions.mockReset(); });

describe('customer tracking access and privacy', () => {
  it('blocks a booking reference before reading location, status history or driver contacts', async () => {
    const response = await call();
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty('addressLine');
    expect(mocks.rows).toHaveLength(0);
    expect(mocks.directions).not.toHaveBeenCalled();
  });
  it('returns an owner/capability-authorized booking but hides internal notes and stale ETA', async () => {
    mocks.access = true;
    const old = new Date(Date.now() - 300_000);
    mocks.rows.push([{ status: 'en_route', timestamp: old, note: 'Internal confidential dispatch note' }], [], [{ currentLat: '0', currentLng: '-1', locationAt: old, userId: 'driver-user' }], [{ name: 'Driver PrivateSurname', phone: '07000000000' }]);
    const response = await call();
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(payload.bookingId).toBe('booking-a');
    expect(payload.driverName).toBe('Driver');
    expect(payload.driverLat).toBe(0);
    expect(payload.statusHistory[0].note).toBe(null);
    expect(payload.etaMinutes).toBe(null);
    expect(payload.routeCoordinates).toBe(null);
    expect(mocks.directions).not.toHaveBeenCalled();
  });
  it.each(['completed', 'cancelled', 'cancelled_refund_pending', 'refunded', 'refunded_partial'])('ends %s tracking before reading a driver location from a later job', async (status) => {
    mocks.access = true;
    const finishedAt = new Date(Date.now() - 60_000);
    const fresh = new Date();
    mocks.rows = [[{ ...booking, status }], [{ status, timestamp: finishedAt, note: 'Internal only' }],
      [{ lastLatitude: '56', lastLongitude: '-3', lastUpdatedAt: fresh }],
      [{ currentLat: '56', currentLng: '-3', locationAt: fresh, userId: 'driver-user' }]];
    const response = await call();
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ status, driverLat: null, driverLng: null, driverLocationAt: null,
      etaMinutes: null, estimatedArrivalAt: null, distanceMiles: null, routeCoordinates: null,
      completedAt: status === 'completed' ? finishedAt.toISOString() : null });
    expect(payload.statusHistory).toEqual([{ status, timestamp: finishedAt.toISOString(), note: null }]);
    expect(mocks.rows).toHaveLength(2);
    expect(mocks.directions).not.toHaveBeenCalled();
  });
  it('preserves the existing authenticated admin tracking map caller', async () => {
    mocks.role = 'admin';
    mocks.rows = [[{ ...booking, driverId: null }], [], []];
    expect((await call()).status).toBe(200);
  });
  it('preserves a scoped legacy location link without upgrading it to chat access', async () => {
    mocks.legacySession = { bookingId: booking.id };
    mocks.rows = [[{ ...booking, driverId: null }], [], []];
    const response = await GET(new NextRequest('https://example.test/api/tracking/TR-A', { headers: { 'X-Tracking-Token': 'a'.repeat(64) } }), { params: Promise.resolve({ ref: 'TR-A' }) });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.canChat).toBe(false);
    expect(payload.driverPhone).toBe(null);
  });
  it('does not let a legacy token read a different booking reference', async () => {
    mocks.legacySession = { bookingId: 'different-booking' };
    const response = await GET(new NextRequest('https://example.test/api/tracking/TR-A', { headers: { 'X-Tracking-Token': 'a'.repeat(64) } }), { params: Promise.resolve({ ref: 'TR-A' }) });
    expect(response.status).toBe(403);
  });
  it('transfers only a verified booking proof for a secure website-to-app handoff', async () => {
    mocks.access = true;
    for (const proof of ['valid-cookie-proof', 'invalid-proof']) {
      mocks.rows = [[{ ...booking, driverId: null }], [], []];
      const response = await GET(new NextRequest('https://example.test/api/tracking/TR-A', { headers: { 'X-Booking-Access': proof } }), { params: Promise.resolve({ ref: 'TR-A' }) });
      const payload = await response.json();
      expect(payload.bookingAccessToken).toBe(proof === 'valid-cookie-proof' ? proof : undefined);
    }
  });
});
