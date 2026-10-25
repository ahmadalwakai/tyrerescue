// Real isolated PostgreSQL predicates prove assignment scope; no live database.
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../db/schema';

const state = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema>, session: null as null | { user: { id: string; role: string } }, directions: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: new Proxy({}, { get: (_, key) => Reflect.get(state.db, key) }) }));
vi.mock('@/lib/auth', () => ({ authMobile: async () => state.session }));
vi.mock('@/lib/customer-booking-access', () => ({ authorizeCustomerBooking: async () => false, getCustomerBookingAccessToken: () => null, verifyCustomerBookingAccessToken: async () => false }));
vi.mock('@/lib/tracking-session', () => ({ getTrackingSessionByCustomerToken: async () => null }));
vi.mock('@/lib/mapbox', () => ({ getDirections: (...args: unknown[]) => state.directions(...args), metersToMiles: (meters: number) => meters / 1609, secondsToMinutes: (seconds: number) => Math.round(seconds / 60) }));
import { GET } from '@/app/api/tracking/[ref]/route';

const pg = new PGlite();
const driverUserA = '10000000-0000-4000-8000-000000000001';
const driverUserB = '10000000-0000-4000-8000-000000000002';
const driverA = '20000000-0000-4000-8000-000000000001';
const driverB = '20000000-0000-4000-8000-000000000002';
const bookingId = '30000000-0000-4000-8000-000000000001';
const call = () => GET(new NextRequest('https://isolated.invalid/api/tracking/TYR-DRIVER-SCOPE'), { params: Promise.resolve({ ref: 'TYR-DRIVER-SCOPE' }) });

beforeAll(async () => {
  const dialect = new PgDialect();
  for (const table of [schema.users, schema.drivers, schema.bookings, schema.trackingSessions, schema.bookingStatusHistory]) {
    const { name, columns } = getTableConfig(table);
    const definitions = columns.map(column => {
      let defaultSql = '';
      if (column.default !== undefined) defaultSql = ` DEFAULT ${typeof column.default === 'object'
        ? dialect.sqlToQuery(column.default as Parameters<PgDialect['sqlToQuery']>[0]).sql
        : typeof column.default === 'string' ? `'${column.default}'` : column.default}`;
      return `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}${column.notNull ? ' NOT NULL' : ''}${defaultSql}`;
    });
    await pg.exec(`CREATE TABLE "${name}" (${definitions.join(',')})`);
  }
  state.db = drizzle(pg, { schema });
}, 30_000);
beforeEach(async () => {
  state.session = { user: { id: driverUserA, role: 'driver' } }; state.directions.mockReset();
  await pg.exec('TRUNCATE booking_status_history,tracking_sessions,bookings,drivers,users');
  await state.db.insert(schema.users).values([
    { id: driverUserA, email: 'driver-a@isolated.invalid', name: 'Driver A', role: 'driver' },
    { id: driverUserB, email: 'driver-b@isolated.invalid', name: 'Driver B', role: 'driver' },
  ]);
  await state.db.insert(schema.drivers).values([{ id: driverA, userId: driverUserA, currentLat: '55.86', currentLng: '-4.25', locationAt: new Date() }, { id: driverB, userId: driverUserB }]);
  await state.db.insert(schema.bookings).values({ id: bookingId, refNumber: 'TYR-DRIVER-SCOPE', driverId: driverA,
    status: 'en_route', bookingType: 'emergency', serviceType: 'fit', addressLine: 'Isolated customer address', lat: '55.87', lng: '-4.26',
    customerName: 'Synthetic Customer', customerEmail: 'customer@isolated.invalid', customerPhone: '07000000000', quantity: 1,
    priceSnapshot: {}, subtotal: '100', vatAmount: '0', totalAmount: '100' });
  await state.db.insert(schema.bookingStatusHistory).values({ bookingId, toStatus: 'en_route', note: 'Internal dispatch note' });
});
afterAll(async () => { await pg.close(); });

describe('legacy driver tracking fallback keeps exact assignment scope', () => {
  it('allows the assigned driver and route fallback without customer chat or transferable access', async () => {
    state.directions.mockResolvedValue({ duration: 600, distance: 1609, geometry: { coordinates: [[-4.25, 55.86], [-4.26, 55.87]] } });
    const response = await call(), payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ bookingId, customerLat: 55.87, customerLng: -4.26, driverLat: 55.86, driverLng: -4.25,
      addressLine: 'Isolated customer address', canChat: false, driverPhone: null, etaMinutes: 10 });
    expect(payload.bookingAccessToken).toBeUndefined();
    expect(payload.statusHistory[0].note).toBeNull();
    expect(payload.routeCoordinates).toEqual([[-4.25, 55.86], [-4.26, 55.87]]);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('denies another authenticated driver before calculating a route', async () => {
    state.session!.user.id = driverUserB;
    const response = await call();
    expect(response.status).toBe(403); expect(await response.json()).not.toHaveProperty('customerLat');
    expect(state.directions).not.toHaveBeenCalled();
  });
  it('revokes the previous driver immediately when dispatch reassigns the booking', async () => {
    expect((await call()).status).toBe(200);
    await state.db.update(schema.bookings).set({ driverId: driverB }).where(eq(schema.bookings.id, bookingId));
    expect((await call()).status).toBe(403);
    state.session!.user.id = driverUserB;
    expect((await call()).status).toBe(200);
  });
  it('does not treat a driver record ID as its authenticated user identity', async () => {
    state.session!.user.id = driverA;
    expect((await call()).status).toBe(403);
  });
  it.each(['customer', 'unknown'])('does not grant a %s session driver privileges from a matching user ID', async role => {
    state.session!.user.role = role;
    expect((await call()).status).toBe(403);
  });
  it('keeps unassigned bookings and anonymous references private', async () => {
    await state.db.update(schema.bookings).set({ driverId: null }).where(eq(schema.bookings.id, bookingId));
    expect((await call()).status).toBe(403);
    state.session = null;
    expect((await call()).status).toBe(403);
  });
});
