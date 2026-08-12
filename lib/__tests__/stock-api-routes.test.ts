import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('../../app/api/stock/_lib', () => ({
  getStockApiUser: vi.fn(),
  getStockCityAccess: vi.fn(),
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
const recordCityStockMovementMock = vi.mocked(stockService.recordCityStockMovement);
const startStockShiftMock = vi.mocked(stockService.startStockShift);
const endStockShiftMock = vi.mocked(stockService.endStockShift);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CITY_ID = '22222222-2222-4222-8222-222222222222';
const TYRE_ID = '33333333-3333-4333-8333-333333333333';
const SHIFT_ID = '44444444-4444-4444-8444-444444444444';
const BOOKING_ID = '55555555-5555-4555-8555-555555555555';

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
