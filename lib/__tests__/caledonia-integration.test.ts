import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  leftJoin: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(),
  execute: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/db', async () => ({
  ...await import('../db/schema'),
  db: { select: mocks.select, insert: mocks.insert, execute: mocks.execute },
}));
vi.mock('@/lib/utils', () => ({ generateRefNumber: () => 'TYR-2026-TEST1' }));
vi.mock('@/lib/notifications/urgent-booking-push', () => ({ sendUrgentBookingTopicPush: mocks.push }));

import { POST } from '../../app/api/integrations/caledonia-tyres/bookings/route';
import { GET, PATCH } from '../../app/api/integrations/projects/jobs/[ref]/route';
import { handleProjectBookingHandoff } from '../integrations/booking-handoff';
import { getProjectSource } from '../integrations/project-sources';

const externalReference = 'CT-0123456789ABCDEF';
const baseUrl = 'https://www.tyrerescue.uk';
const context = { params: Promise.resolve({ ref: 'TYR-2026-TEST1' }) };
const existing = {
  id: '00000000-0000-4000-8000-000000000001',
  refNumber: 'TYR-2026-TEST1',
  sourceApp: 'caledonia_tyres',
  sourceLabel: 'Caledonia Tyres',
  externalReference,
  status: 'awaiting_payment',
  driverId: null,
};

function directInput(extra: Record<string, unknown> = {}) {
  return {
    sourceApp: 'caledonia_tyres', externalReference,
    customerName: 'Readiness Test', customerEmail: 'test@example.com', customerPhone: '07700900000',
    addressLine: '1 Test Street, Glasgow G1 1AA', lat: 55.8642, lng: -4.2518,
    bookingType: 'mobile_fitting', serviceType: 'replacement', quantity: 1,
    tyreSizeDisplay: '205/55 R16', vehicleReg: 'AB12 CDE',
    scheduledAt: '2026-11-20T09:00:00.000Z', paymentType: 'cash', status: 'awaiting_payment',
    totalAmount: '125.99', ...extra,
  };
}

function request(method: string, body?: unknown, sourceApp = 'caledonia_tyres', key: string | null = 'test-key') {
  return new Request(`${baseUrl}/api/integrations/projects/jobs/TYR-2026-TEST1?sourceApp=${sourceApp}`, {
    method, headers: { 'content-type': 'application/json', ...(key ? { 'x-integration-key': key } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('CALEDONIA_TYRES_INTEGRATION_SECRET', 'test-key');
  vi.stubEnv('EDINBURGH_TYRE_FITTING_INTEGRATION_SECRET', 'edinburgh-key');
  const selection = { from: mocks.from, leftJoin: mocks.leftJoin, where: mocks.where, limit: mocks.limit };
  mocks.select.mockReturnValue(selection);
  mocks.from.mockReturnValue(selection);
  mocks.leftJoin.mockReturnValue(selection);
  mocks.where.mockReturnValue(selection);
  mocks.limit.mockResolvedValue([]);
  const insertion = { values: mocks.values, onConflictDoNothing: mocks.onConflictDoNothing, returning: mocks.returning };
  mocks.insert.mockReturnValue(insertion);
  mocks.values.mockReturnValue(insertion);
  mocks.onConflictDoNothing.mockReturnValue(insertion);
  mocks.returning.mockResolvedValue([]);
  mocks.execute.mockResolvedValue({ rows: [] });
  mocks.push.mockResolvedValue(undefined);
});

describe('Caledonia direct booking handoff', () => {
  it('requires the integration key even for a dry run', async () => {
    const response = await POST(request('POST', directInput({ dryRun: true }), 'caledonia_tyres', null));
    expect(response.status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('validates a dry run without reading or writing bookings or sending notifications', async () => {
    const response = await POST(request('POST', directInput({ dryRun: true })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, dryRun: true });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it.each([
    { lat: 91 }, { lng: -181 }, { totalAmount: 'not-money' }, { totalAmount: -1 },
    { customerName: '' }, { vehicleReg: 'WAY-TOO-LONG-REG' }, { scheduledAt: 'tomorrow' },
    { externalReference: 'OTHER-REFERENCE' }, { dryRun: 'true' },
  ])('rejects invalid direct booking data %j without side effects', async (extra) => {
    const response = await POST(request('POST', directInput({ dryRun: true, ...extra })));
    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('does not let a dry run enter the quote or link-existing booking branches', async () => {
    for (const extra of [{ quoteId: '00000000-0000-4000-8000-000000000002' }, { tyreRescueRefNumber: existing.refNumber }]) {
      expect((await POST(request('POST', directInput({ dryRun: true, ...extra })))).status).toBe(400);
    }
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('returns the original booking for an existing external reference', async () => {
    mocks.limit.mockResolvedValueOnce([existing]);
    const response = await POST(request('POST', directInput()));
    expect(response.status).toBe(409);
    expect((await response.json()).booking.refNumber).toBe(existing.refNumber);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('recovers a concurrently inserted external reference through the unique index', async () => {
    mocks.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([existing]);
    const response = await POST(request('POST', directInput()));
    expect(response.status).toBe(409);
    expect((await response.json()).booking.refNumber).toBe(existing.refNumber);
    expect(mocks.onConflictDoNothing).toHaveBeenCalledOnce();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledOnce();
  });

  it('creates an unpaid cash request, records its source and alerts Assisted Chat', async () => {
    mocks.returning.mockResolvedValueOnce([{ ...existing, customerName: 'Readiness Test', customerPhone: '07700900000', totalAmount: '125.99' }]);
    const response = await POST(request('POST', directInput()));
    expect(response.status).toBe(201);
    expect(mocks.values.mock.calls[0][0]).toMatchObject({
      sourceApp: 'caledonia_tyres', externalReference, totalAmount: '125.99', status: 'awaiting_payment', paymentType: 'cash',
    });
    expect(mocks.values.mock.calls[1][0]).toMatchObject({ bookingId: existing.id, toStatus: 'awaiting_payment', actorRole: 'system' });
    expect(mocks.push).toHaveBeenCalledOnce();
  });

  it('preserves the established cash default and insert behaviour for existing sources', async () => {
    mocks.returning.mockResolvedValueOnce([{ ...existing, sourceApp: 'edinburgh_tyre_fitting', status: 'paid', customerName: 'Readiness Test', customerPhone: '07700900000', totalAmount: '125.99' }]);
    const body = directInput();
    delete (body as { status?: string }).status;
    const source = getProjectSource('edinburgh_tyre_fitting')!;
    const response = await handleProjectBookingHandoff(request('POST', body), source, body);
    expect(response.status).toBe(201);
    expect(mocks.values.mock.calls[0][0].status).toBe('paid');
    expect(mocks.onConflictDoNothing).not.toHaveBeenCalled();
  });
});

describe('source-scoped integration job access and cancellation', () => {
  it('requires authentication before reading a job', async () => {
    expect((await GET(request('GET', undefined, 'caledonia_tyres', 'wrong-key'), context)).status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('keeps GET source-filtered and preserves its public tracking contract', async () => {
    mocks.limit.mockResolvedValueOnce([existing]);
    const response = await GET(request('GET'), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ refNumber: existing.refNumber, status: 'awaiting_payment', externalReference, driver: null });
    const filter = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(filter.sql).toContain('"bookings"."source_app" =');
    expect(filter.params).toContain('caledonia_tyres');
  });

  it('requires the key for cancellation', async () => {
    expect((await PATCH(request('PATCH', { status: 'cancelled', externalReference }, 'caledonia_tyres', null), context)).status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('does not enable cancellation for an existing project', async () => {
    expect((await PATCH(request('PATCH', { status: 'cancelled', externalReference }, 'edinburgh_tyre_fitting', 'edinburgh-key'), context)).status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('requires both the source and external reference to match the target booking', async () => {
    const response = await PATCH(request('PATCH', { status: 'cancelled', externalReference }), context);
    expect(response.status).toBe(404);
    const filter = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(filter.sql).toContain('"bookings"."source_app" =');
    expect(filter.sql).toContain('"bookings"."external_reference" =');
    expect(filter.params).toContain('caledonia_tyres');
    expect(filter.params).toContain(externalReference);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('returns an already cancelled booking without updating or adding history again', async () => {
    mocks.limit.mockResolvedValueOnce([{ ...existing, status: 'cancelled' }]);
    const response = await PATCH(request('PATCH', { status: 'cancelled', externalReference }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ refNumber: existing.refNumber, status: 'cancelled' });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'paid', driverId: null }, { status: 'deposit_paid', driverId: null },
    { status: 'awaiting_payment', driverId: 'assigned-driver' }, { status: 'driver_assigned', driverId: 'assigned-driver' },
  ])('rejects a paid or assigned request %j', async (state) => {
    mocks.limit.mockResolvedValueOnce([{ ...existing, ...state }]);
    expect((await PATCH(request('PATCH', { status: 'cancelled', externalReference }), context)).status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('atomically cancels an unpaid, unassigned request with its audit history', async () => {
    mocks.limit.mockResolvedValueOnce([existing]);
    mocks.execute.mockResolvedValueOnce({ rows: [{ refNumber: existing.refNumber, status: 'cancelled' }] });
    const response = await PATCH(request('PATCH', { status: 'cancelled', externalReference }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ refNumber: existing.refNumber, status: 'cancelled' });
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
    expect(query.sql).toContain('WITH cancelled AS');
    expect(query.sql).toContain('"bookings"."status" = \'awaiting_payment\'');
    expect(query.sql).toContain('"bookings"."driver_id" IS NULL');
    expect(query.sql).toContain('INSERT INTO "booking_status_history"');
    expect(query.sql).toContain("'cancelled', 'system'");
    expect(query.params).toContain('caledonia_tyres');
    expect(query.params).toContain(externalReference);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('does not overwrite an assignment that arrives during cancellation', async () => {
    mocks.limit.mockResolvedValueOnce([existing]).mockResolvedValueOnce([{ ...existing, status: 'driver_assigned', driverId: 'driver' }]);
    const response = await PATCH(request('PATCH', { status: 'cancelled', externalReference }), context);
    expect(response.status).toBe(409);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it('treats a concurrent successful cancellation as an idempotent success', async () => {
    mocks.limit.mockResolvedValueOnce([existing]).mockResolvedValueOnce([{ ...existing, status: 'cancelled' }]);
    expect((await PATCH(request('PATCH', { status: 'cancelled', externalReference }), context)).status).toBe(200);
  });

  it('rejects any update other than cancellation without querying a job', async () => {
    expect((await PATCH(request('PATCH', { status: 'paid', externalReference }), context)).status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
