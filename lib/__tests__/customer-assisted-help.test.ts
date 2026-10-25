import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';

const state = vi.hoisted(() => ({ db: null as unknown as PgliteDatabase<typeof schema>, notify: vi.fn(), push: vi.fn(), rateLimit: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: new Proxy({}, { get: (_, key) => Reflect.get(state.db, key) }) }));
vi.mock('@/lib/notifications', () => ({ createAdminNotification: state.notify }));
vi.mock('@/lib/notifications/expo-admin-push', () => ({ sendAdminExpoPush: state.push }));
vi.mock('@/lib/security', () => ({ getClientIp: () => 'isolated', checkRateLimit: state.rateLimit, RATE_LIMITS: { callback: { limit: 5, windowMs: 600_000 } },
  rateLimitedResponse: () => Response.json({ error: 'Too many requests' }, { status: 429 }) }));

import { GET, POST } from '@/app/api/mobile/customer/assisted-help/route';
import { signAssistedHelpAccess, verifyAssistedHelpAccess } from '../customer-assisted-help';
import { signCustomerBookingAccessToken } from '../customer-booking-access';

let pg: PGlite;
const base = 'https://isolated.invalid/api/mobile/customer/assisted-help';
const input = { name: 'Synthetic Customer', phone: '07700900123', address: 'Synthetic roadside location', lat: 55.86, lng: -4.25,
  vehicleReg: 'AB12 CDE', vehicleMake: 'Synthetic make', vehicleModel: 'Synthetic model', photoUrl: 'https://isolated.invalid/tyre-photos/fixture.jpg', contactConsent: true };
const post = (body: unknown, token = '') => POST(new Request(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Assistance-Access': token }, body: JSON.stringify(body) }));
const get = (requestId: string, token = '', query = '') => GET(new Request(`${base}?requestId=${requestId}${query}`, { headers: { 'X-Assistance-Access': token } }));
beforeEach(async () => {
  vi.stubEnv('CUSTOMER_BOOKING_ACCESS_SECRET', 'isolated-assistance-test-secret-32-characters');
  vi.clearAllMocks(); state.rateLimit.mockResolvedValue({ ok: true });
  state.notify.mockResolvedValue(undefined); state.push.mockResolvedValue(undefined);
  pg = new PGlite(); state.db = drizzle(pg, { schema });
  await pg.exec(`CREATE TABLE call_me_back (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(100) NOT NULL, phone varchar(20) NOT NULL,
    notes text, status text NOT NULL DEFAULT 'pending', resolved_at timestamptz, resolved_by uuid, created_at timestamptz DEFAULT now());`);
});
afterEach(async () => { await pg.close(); vi.unstubAllEnvs(); });

describe('tyre size assistance with the existing callback workflow', () => {
  it('prepares a restorable capability without creating a callback or charging anything', async () => {
    const response = await post({ action: 'prepare' }); const prepared = await response.json();
    expect(await verifyAssistedHelpAccess(prepared.accessToken, prepared.requestId)).toBe(true);
    expect(await state.db.select().from(schema.callMeBack)).toHaveLength(0);
    expect(await (await get(prepared.requestId, prepared.accessToken)).json()).toEqual({ requestId: prepared.requestId, status: 'not_received' });
    expect(state.notify).not.toHaveBeenCalled();
  });

  it('stores location, registration and photo once and replays concurrent or lost-response retries safely', async () => {
    const prepared = await (await post({ action: 'prepare' })).json();
    const responses = await Promise.all([post({ ...input, requestId: prepared.requestId }, prepared.accessToken), post({ ...input, requestId: prepared.requestId }, prepared.accessToken)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 201]);
    const [row] = await state.db.select().from(schema.callMeBack);
    expect(row).toMatchObject({ id: prepared.requestId, name: input.name, phone: input.phone, status: 'pending' });
    expect(row.notes).toContain(input.address); expect(row.notes).toContain('55.86, -4.25');
    expect(row.notes).toContain(input.vehicleReg); expect(row.notes).toContain(input.photoUrl);
    expect(row.notes).toContain('before a separate booking and payment');
    expect(state.notify).toHaveBeenCalledTimes(1); expect(state.push).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(state.push.mock.calls)).not.toMatch(/07700900123|Synthetic|https?:/);
    const retry = await post({ ...input, name: 'Changed after timeout', requestId: prepared.requestId }, prepared.accessToken);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ requestId: prepared.requestId, status: 'pending', requiresTeamConfirmation: true, paymentRequired: false });
    const rows = await state.db.select().from(schema.callMeBack); expect(rows).toHaveLength(1); expect(rows[0].name).toBe(input.name);
  });

  it('requires a valid phone, map pin, vehicle or photo, contact consent and the matching capability before insertion', async () => {
    const prepared = await (await post({ action: 'prepare' })).json();
    for (const change of [{ phone: '1234' }, { lat: 91 }, { contactConsent: false }, { vehicleReg: '', photoUrl: undefined }, { photoUrl: 'http://isolated.invalid/photo.jpg' }]) {
      expect((await post({ ...input, requestId: prepared.requestId, ...change }, prepared.accessToken)).status).toBe(400);
    }
    expect((await post({ ...input, requestId: prepared.requestId })).status).toBe(403);
    const other = '20000000-0000-4000-8000-000000000002';
    expect((await post({ ...input, requestId: other }, prepared.accessToken)).status).toBe(403);
    expect(await state.db.select().from(schema.callMeBack)).toHaveLength(0);
    expect(state.push).not.toHaveBeenCalled();
  });

  it('restores the real team status while exposing no contact details and rejecting query or booking credentials', async () => {
    const prepared = await (await post({ action: 'prepare' })).json();
    await post({ ...input, requestId: prepared.requestId }, prepared.accessToken);
    expect((await get(prepared.requestId)).status).toBe(403);
    expect((await get(prepared.requestId, '', `&accessToken=${prepared.accessToken}`)).status).toBe(403);
    const bookingToken = await signCustomerBookingAccessToken({ bookingId: prepared.requestId, refNumber: 'TYR-ISOLATED' });
    expect((await get(prepared.requestId, bookingToken)).status).toBe(403);
    expect((await get('20000000-0000-4000-8000-000000000002', prepared.accessToken)).status).toBe(403);
    await state.db.update(schema.callMeBack).set({ status: 'resolved', resolvedAt: new Date('2026-10-23T10:00:00Z') }).where(eq(schema.callMeBack.id, prepared.requestId));
    const response = await get(prepared.requestId, prepared.accessToken); const status = await response.json();
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(status).toMatchObject({ status: 'reviewed', reviewedAt: '2026-10-23T10:00:00.000Z', paymentRequired: false, requiresTeamConfirmation: true });
    expect(JSON.stringify(status)).not.toMatch(/Synthetic|07700900123|AB12|photo|notes/);
    const independent = await signAssistedHelpAccess('20000000-0000-4000-8000-000000000002');
    expect((await get(prepared.requestId, independent)).status).toBe(403);
  });

  it('keeps the saved request successful when administrator alert transport fails', async () => {
    state.notify.mockRejectedValue(new Error('Isolated notification failure')); state.push.mockRejectedValue(new Error('Isolated relay failure'));
    const prepared = await (await post({ action: 'prepare' })).json();
    expect((await post({ ...input, requestId: prepared.requestId }, prepared.accessToken)).status).toBe(201);
    expect(await state.db.select().from(schema.callMeBack)).toHaveLength(1);
    state.rateLimit.mockResolvedValue({ ok: false });
    expect((await post({ action: 'prepare' })).status).toBe(429);
  });

  it('keeps creation limits while status refreshes and retrying the same capability use independent budgets', async () => {
    const counts = new Map<string, number>();
    state.rateLimit.mockImplementation(async (key: string, config: { limit: number; windowMs: number }) => {
      const count = (counts.get(key) ?? 0) + 1; counts.set(key, count);
      return { ok: count <= config.limit };
    });
    const prepared = await (await post({ action: 'prepare' })).json();
    for (let index = 0; index < 4; index++) expect((await post({ action: 'prepare' })).status).toBe(200);
    expect((await post({ action: 'prepare' })).status).toBe(429);
    expect((await post({ ...input, requestId: prepared.requestId }, prepared.accessToken)).status).toBe(201);
    for (let index = 0; index < 8; index++) expect((await get(prepared.requestId, prepared.accessToken)).status).toBe(200);
    expect((await post({ ...input, requestId: prepared.requestId }, prepared.accessToken)).status).toBe(200);
    expect(await state.db.select().from(schema.callMeBack)).toHaveLength(1);
    expect(state.rateLimit.mock.calls.filter(([, config]) => config.limit === 30)).toHaveLength(10);
  });
});
