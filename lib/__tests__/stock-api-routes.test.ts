import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const dbMock = vi.hoisted(() => {
  const state = {
    results: [] as unknown[][],
  };
  return {
    state,
    select: vi.fn(() => {
      const result = state.results.shift() ?? [];
      const builder: {
        from: ReturnType<typeof vi.fn>;
        innerJoin: ReturnType<typeof vi.fn>;
        where: ReturnType<typeof vi.fn>;
        limit: ReturnType<typeof vi.fn>;
      } = {
        from: vi.fn(() => builder),
        innerJoin: vi.fn(() => builder),
        where: vi.fn(() => builder),
        limit: vi.fn(async () => result),
      };
      return builder;
    }),
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: dbMock.select,
  },
  drivers: {
    id: 'drivers.id',
    userId: 'drivers.user_id',
  },
  stockShifts: {
    id: 'stock_shifts.id',
    userId: 'stock_shifts.user_id',
    cityId: 'stock_shifts.city_id',
    status: 'stock_shifts.status',
    endedAt: 'stock_shifts.ended_at',
  },
  users: {
    id: 'users.id',
    email: 'users.email',
    name: 'users.name',
    phone: 'users.phone',
  },
}));

vi.mock('../../app/api/stock/_lib', () => ({
  canUseSharedStockWorkerMode: vi.fn(() => false),
  getStockApiUser: vi.fn(),
  getStockCityAccess: vi.fn(),
  stockCorsPreflight: () => new NextResponse(null, { status: 204 }),
  stockJsonResponse: (_request: Request, payload: unknown, init?: ResponseInit) => NextResponse.json(payload, init),
  unauthorizedResponse: () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  forbiddenResponse: (message = 'Forbidden') => NextResponse.json({ error: message }, { status: 403 }),
  validationErrorResponse: (error: unknown) => NextResponse.json({ error }, { status: 400 }),
  statusForCityStockError: vi.fn((code: string) => {
    if (code === 'FORBIDDEN') return 403;
    if (code === 'INVALID_INPUT') return 400;
    if (code === 'NO_ACTIVE_SHIFT') return 404;
    return 409;
  }),
}));

vi.mock('@/lib/stock/city-stock-service', () => ({
  endStockShift: vi.fn(),
  recordCityStockMovement: vi.fn(),
  reverseCityStockSale: vi.fn(),
  startStockShift: vi.fn(),
}));

const stockLib = await import('../../app/api/stock/_lib');
const stockService = await import('@/lib/stock/city-stock-service');
const movementRoute = await import('../../app/api/stock/movements/route');
const startShiftRoute = await import('../../app/api/stock/shifts/start/route');
const endShiftRoute = await import('../../app/api/stock/shifts/end/route');

const getStockApiUserMock = vi.mocked(stockLib.getStockApiUser);
const getStockCityAccessMock = vi.mocked(stockLib.getStockCityAccess);
const canUseSharedStockWorkerModeMock = vi.mocked(stockLib.canUseSharedStockWorkerMode);
const recordCityStockMovementMock = vi.mocked(stockService.recordCityStockMovement);
const startStockShiftMock = vi.mocked(stockService.startStockShift);
const endStockShiftMock = vi.mocked(stockService.endStockShift);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CITY_ID = '22222222-2222-4222-8222-222222222222';
const TYRE_ID = '33333333-3333-4333-8333-333333333333';
const SHIFT_ID = '44444444-4444-4444-8444-444444444444';
const BOOKING_ID = '55555555-5555-4555-8555-555555555555';
const WORKER_USER_ID = '66666666-6666-4666-8666-666666666666';

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('stock movement route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.state.results = [];
    getStockApiUserMock.mockResolvedValue({
      id: USER_ID,
      email: 'driver@example.test',
      name: 'Driver',
      role: 'driver',
    });
    getStockCityAccessMock.mockResolvedValue({
      city: { id: CITY_ID, slug: 'glasgow', name: 'Glasgow' },
      roleInCity: 'operator',
    });
    recordCityStockMovementMock.mockResolvedValue({
      success: true,
      movement: {
        movementId: 'movement-1',
        cityId: CITY_ID,
        tyreProductId: TYRE_ID,
        movementType: 'SALE',
        quantityDelta: -1,
        balanceBefore: 3,
        balanceAfter: 2,
        alreadyApplied: false,
      },
    });
  });

  it('rejects unauthorised users before reading movement input', async () => {
    getStockApiUserMock.mockResolvedValue(null);

    const response = await movementRoute.POST(
      jsonRequest('https://example.test/api/stock/movements', {}),
    );

    expect(response.status).toBe(401);
    expect(recordCityStockMovementMock).not.toHaveBeenCalled();
  });

  it('requires a booking id for emergency call-out sales', async () => {
    const response = await movementRoute.POST(
      jsonRequest('https://example.test/api/stock/movements', {
        cityId: CITY_ID,
        tyreProductId: TYRE_ID,
        movementType: 'SALE',
        quantityDelta: -1,
        shiftId: SHIFT_ID,
        saleChannel: 'EMERGENCY_CALL_OUT',
      }),
    );

    expect(response.status).toBe(400);
    expect(recordCityStockMovementMock).not.toHaveBeenCalled();
  });

  it('records a garage sale as the authenticated user and requires an active shift', async () => {
    const response = await movementRoute.POST(
      jsonRequest('https://example.test/api/stock/movements', {
        cityId: CITY_ID,
        tyreProductId: TYRE_ID,
        movementType: 'SALE',
        quantityDelta: -1,
        shiftId: SHIFT_ID,
        saleChannel: 'GARAGE',
        idempotencyKey: 'sale:garage:1',
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.movement.balanceAfter).toBe(2);
    expect(recordCityStockMovementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: USER_ID,
        bookingId: null,
        cityId: CITY_ID,
        idempotencyKey: 'sale:garage:1',
        requireActiveShift: true,
        saleChannel: 'GARAGE',
        shiftId: SHIFT_ID,
      }),
    );
  });

  it('records an emergency sale only when a booking id is present', async () => {
    const response = await movementRoute.POST(
      jsonRequest('https://example.test/api/stock/movements', {
        cityId: CITY_ID,
        tyreProductId: TYRE_ID,
        movementType: 'SALE',
        quantityDelta: -1,
        shiftId: SHIFT_ID,
        bookingId: BOOKING_ID,
        saleChannel: 'EMERGENCY_CALL_OUT',
      }),
    );

    expect(response.status).toBe(201);
    expect(recordCityStockMovementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: BOOKING_ID,
        saleChannel: 'EMERGENCY_CALL_OUT',
      }),
    );
  });

  it('records shared iPad stock movements as the selected worker', async () => {
    getStockApiUserMock.mockResolvedValue({
      id: USER_ID,
      email: 'ahmad33wakaa@gmail.com',
      name: 'Stock Admin',
      role: 'admin',
    });
    getStockCityAccessMock.mockResolvedValue({
      city: { id: CITY_ID, slug: 'glasgow', name: 'Glasgow' },
      roleInCity: 'manager',
    });
    canUseSharedStockWorkerModeMock.mockReturnValue(true);
    dbMock.state.results = [
      [{ userId: WORKER_USER_ID }],
      [{ id: SHIFT_ID }],
    ];

    const response = await movementRoute.POST(
      jsonRequest('https://example.test/api/stock/movements', {
        cityId: CITY_ID,
        tyreProductId: TYRE_ID,
        movementType: 'RECEIVED',
        quantityDelta: 2,
        shiftId: SHIFT_ID,
        workerUserId: WORKER_USER_ID,
        idempotencyKey: 'shared-ipad:received:1',
        metadata: { source: 'stock-app' },
      }),
    );

    expect(response.status).toBe(201);
    expect(dbMock.select).toHaveBeenCalledTimes(2);
    expect(recordCityStockMovementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: WORKER_USER_ID,
        cityId: CITY_ID,
        idempotencyKey: 'shared-ipad:received:1',
        requireActiveShift: true,
        shiftId: SHIFT_ID,
        metadata: expect.objectContaining({
          source: 'stock-app',
          sharedStockAdminUserId: USER_ID,
          sharedStockAdminEmail: 'ahmad33wakaa@gmail.com',
        }),
      }),
    );
  });
});

describe('stock shift routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStockApiUserMock.mockResolvedValue({
      id: USER_ID,
      email: 'driver@example.test',
      name: 'Driver',
      role: 'driver',
    });
  });

  it('starts a shift and returns 201 when it is new', async () => {
    startStockShiftMock.mockResolvedValue({
      success: true,
      alreadyStarted: false,
      shift: {
        id: SHIFT_ID,
        userId: USER_ID,
        cityId: CITY_ID,
        startedAt: '2026-08-11T10:00:00.000Z',
        endedAt: null,
        status: 'active',
      },
    });

    const response = await startShiftRoute.POST(
      jsonRequest('https://example.test/api/stock/shifts/start', {
        cityId: CITY_ID,
        idempotencyKey: 'shift:start:1',
      }),
    );

    expect(response.status).toBe(201);
    expect(startStockShiftMock).toHaveBeenCalledWith({
      userId: USER_ID,
      cityId: CITY_ID,
      idempotencyKey: 'shift:start:1',
    });
  });

  it('maps stock shift service errors to HTTP errors', async () => {
    startStockShiftMock.mockResolvedValue({
      success: false,
      code: 'FORBIDDEN',
      error: 'User does not have active access to this stock city',
    });

    const response = await startShiftRoute.POST(
      jsonRequest('https://example.test/api/stock/shifts/start', {
        cityId: CITY_ID,
      }),
    );

    expect(response.status).toBe(403);
  });

  it('does not let a driver submit an admin override reason while ending a shift', async () => {
    const response = await endShiftRoute.POST(
      jsonRequest('https://example.test/api/stock/shifts/end', {
        shiftId: SHIFT_ID,
        adminOverrideReason: 'closing forgotten shift',
      }),
    );

    expect(response.status).toBe(403);
    expect(endStockShiftMock).not.toHaveBeenCalled();
  });
});
