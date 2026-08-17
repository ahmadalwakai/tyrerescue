import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
interface QueryResult { rows: Row[]; rowCount?: number }

class MockClient {
  public log: Array<{ sql: string; params: unknown[] }> = [];
  public handlers: Array<(sql: string, params: unknown[]) => QueryResult | null> = [];

  query = vi.fn(async (sql: string, params: unknown[] = []): Promise<QueryResult> => {
    this.log.push({ sql, params });
    for (const handler of this.handlers) {
      const result = handler(sql, params);
      if (result !== null) return result;
    }
    return { rows: [], rowCount: 0 };
  });

  release = vi.fn();
}

let mockClient: MockClient;

vi.mock('@neondatabase/serverless', () => ({
  Pool: vi.fn(function MockPool() {
    return {
      connect: vi.fn(async () => mockClient),
      end: vi.fn(),
    };
  }),
}));

import {
  endStockShift,
  recordCityStockMovement,
  reverseCityStockSale,
  startStockShift,
} from '@/lib/stock/city-stock-service';

beforeEach(() => {
  mockClient = new MockClient();
});

function findQuery(fragment: string) {
  return mockClient.log.filter((entry) => entry.sql.includes(fragment));
}

describe('startStockShift', () => {
  it('starts a shift when the user has active city access', async () => {
    mockClient.handlers.push((sql) => {
      if (sql.includes('FROM stock_shifts') && sql.includes('idempotency_key = $1')) {
        return { rows: [] };
      }
      if (sql.includes('FROM stock_cities c') && sql.includes('stock_user_city_access')) {
        return { rows: [{ id: 'access-1' }] };
      }
      if (sql.includes('WHERE user_id = $1 AND ended_at IS NULL')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO stock_shifts')) {
        return {
          rows: [{
            id: 'shift-1',
            user_id: 'user-1',
            city_id: 'city-1',
            started_at: '2026-08-11T10:00:00.000Z',
            ended_at: null,
            status: 'active',
          }],
          rowCount: 1,
        };
      }
      return null;
    });

    const result = await startStockShift({
      userId: 'user-1',
      cityId: 'city-1',
      idempotencyKey: 'shift:user-1:city-1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.alreadyStarted).toBe(false);
      expect(result.shift.cityId).toBe('city-1');
    }
  });

  it('rejects starting a second active shift in another city', async () => {
    mockClient.handlers.push((sql) => {
      if (sql.includes('FROM stock_cities c') && sql.includes('stock_user_city_access')) {
        return { rows: [{ id: 'access-1' }] };
      }
      if (sql.includes('WHERE user_id = $1 AND ended_at IS NULL')) {
        return {
          rows: [{
            id: 'shift-1',
            user_id: 'user-1',
            city_id: 'city-2',
            started_at: '2026-08-11T10:00:00.000Z',
            ended_at: null,
            status: 'active',
          }],
        };
      }
      return null;
    });

    const result = await startStockShift({ userId: 'user-1', cityId: 'city-1' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('ACTIVE_SHIFT_EXISTS');
    }
    expect(findQuery('INSERT INTO stock_shifts')).toHaveLength(0);
  });
});

describe('recordCityStockMovement', () => {
  it('deducts city stock once for a garage sale with an active shift', async () => {
    mockClient.handlers.push((sql) => {
      if (sql.includes('FROM stock_shifts') && sql.includes('WHERE id = $1')) {
        return { rows: [{ id: 'shift-1', city_id: 'city-1', ended_at: null, status: 'active' }] };
      }
      if (sql.includes('FROM stock_movements') && sql.includes('idempotency_key = $1')) {
        return { rows: [] };
      }
      if (sql.includes('FROM stock_inventory_balances')) {
        return { rows: [{ id: 'balance-1', current_stock: 5 }] };
      }
      if (sql.includes('UPDATE stock_inventory_balances')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO stock_movements')) {
        return {
          rows: [{
            id: 'movement-1',
            city_id: 'city-1',
            tyre_product_id: 'tyre-1',
            movement_type: 'SALE',
            quantity_delta: -2,
            previous_balance: 5,
            resulting_balance: 3,
          }],
          rowCount: 1,
        };
      }
      return null;
    });

    const result = await recordCityStockMovement({
      cityId: 'city-1',
      tyreProductId: 'tyre-1',
      movementType: 'SALE',
      quantityDelta: -2,
      actorUserId: 'user-1',
      shiftId: 'shift-1',
      saleChannel: 'GARAGE',
      idempotencyKey: 'sale:city-1:tyre-1:shift-1:1',
      requireActiveShift: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.movement.balanceBefore).toBe(5);
      expect(result.movement.balanceAfter).toBe(3);
      expect(result.movement.alreadyApplied).toBe(false);
    }
    expect(findQuery('UPDATE stock_inventory_balances')).toHaveLength(1);
    expect(findQuery('UPDATE tyre_products')).toHaveLength(1);
    expect(findQuery('INSERT INTO stock_movements')).toHaveLength(1);
  });

  it('returns an existing movement for an idempotent retry without changing city stock again', async () => {
    mockClient.handlers.push((sql) => {
      if (sql.includes('FROM stock_movements') && sql.includes('idempotency_key = $1')) {
        return {
          rows: [{
            id: 'movement-1',
            city_id: 'city-1',
            tyre_product_id: 'tyre-1',
            movement_type: 'RECEIVED',
            quantity_delta: 4,
            previous_balance: 0,
            resulting_balance: 4,
          }],
        };
      }
      return null;
    });

    const result = await recordCityStockMovement({
      cityId: 'city-1',
      tyreProductId: 'tyre-1',
      movementType: 'RECEIVED',
      quantityDelta: 4,
      idempotencyKey: 'received:city-1:tyre-1:po-1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.movement.alreadyApplied).toBe(true);
      expect(result.movement.balanceAfter).toBe(4);
    }
    expect(findQuery('UPDATE stock_inventory_balances')).toHaveLength(0);
    expect(findQuery('UPDATE tyre_products')).toHaveLength(1);
    expect(findQuery('INSERT INTO stock_movements')).toHaveLength(0);
  });

  it('refuses to oversell city stock', async () => {
    mockClient.handlers.push((sql) => {
      if (sql.includes('FROM stock_movements') && sql.includes('idempotency_key = $1')) {
        return { rows: [] };
      }
      if (sql.includes('FROM stock_inventory_balances')) {
        return { rows: [{ id: 'balance-1', current_stock: 1 }] };
      }
      return null;
    });

    const result = await recordCityStockMovement({
      cityId: 'city-1',
      tyreProductId: 'tyre-1',
      movementType: 'SALE',
      quantityDelta: -2,
      bookingId: 'booking-1',
      saleChannel: 'EMERGENCY_CALL_OUT',
      idempotencyKey: 'booking-sale:booking-1:tyre-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INSUFFICIENT_STOCK');
    }
    expect(findQuery('INSERT INTO stock_movements')).toHaveLength(0);
    expect(findQuery('UPDATE tyre_products')).toHaveLength(0);
  });
});

describe('endStockShift', () => {
  it('ends an active shift once', async () => {
    mockClient.handlers.push((sql) => {
      if (sql.includes('FROM stock_shifts') && sql.includes('WHERE id = $1')) {
        return {
          rows: [{
            id: 'shift-1',
            user_id: 'user-1',
            city_id: 'city-1',
            started_at: '2026-08-11T10:00:00.000Z',
            ended_at: null,
            status: 'active',
          }],
        };
      }
      if (sql.includes('UPDATE stock_shifts')) {
        return {
          rows: [{
            id: 'shift-1',
            user_id: 'user-1',
            city_id: 'city-1',
            started_at: '2026-08-11T10:00:00.000Z',
            ended_at: '2026-08-11T12:00:00.000Z',
            status: 'ended',
          }],
          rowCount: 1,
        };
      }
      return null;
    });

    const result = await endStockShift({
      shiftId: 'shift-1',
      requesterUserId: 'user-1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.alreadyEnded).toBe(false);
      expect(result.shift.status).toBe('ended');
    }
    expect(findQuery('UPDATE stock_shifts')).toHaveLength(1);
  });

  it('does not let another user end a shift without an admin override reason', async () => {
    mockClient.handlers.push((sql) => {
      if (sql.includes('FROM stock_shifts') && sql.includes('WHERE id = $1')) {
        return {
          rows: [{
            id: 'shift-1',
            user_id: 'user-1',
            city_id: 'city-1',
            started_at: '2026-08-11T10:00:00.000Z',
            ended_at: null,
            status: 'active',
          }],
        };
      }
      return null;
    });

    const result = await endStockShift({
      shiftId: 'shift-1',
      requesterUserId: 'user-2',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN');
    }
    expect(findQuery('UPDATE stock_shifts')).toHaveLength(0);
  });

  it('refuses an accidental immediate driver shift end', async () => {
    mockClient.handlers.push((sql) => {
      if (sql.includes('FROM stock_shifts') && sql.includes('WHERE id = $1')) {
        return {
          rows: [{
            id: 'shift-1',
            user_id: 'user-1',
            city_id: 'city-1',
            started_at: new Date().toISOString(),
            ended_at: null,
            status: 'active',
          }],
        };
      }
      return null;
    });

    const result = await endStockShift({
      shiftId: 'shift-1',
      requesterUserId: 'user-1',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_INPUT');
    }
    expect(findQuery('UPDATE stock_shifts')).toHaveLength(0);
  });
});

describe('reverseCityStockSale', () => {
  it('creates a SALE_REVERSAL movement instead of deleting the original sale', async () => {
    mockClient.handlers.push((sql) => {
      if (sql.includes('FROM stock_movements') && sql.includes('idempotency_key = $1')) {
        return { rows: [] };
      }
      if (sql.includes('FROM stock_movements') && sql.includes('WHERE id = $1') && sql.includes('FOR UPDATE')) {
        return {
          rows: [{
            id: 'sale-1',
            city_id: 'city-1',
            tyre_product_id: 'tyre-1',
            movement_type: 'SALE',
            quantity_delta: -2,
            booking_id: 'booking-1',
            sale_channel: 'GARAGE',
          }],
        };
      }
      if (sql.includes('WHERE reverses_movement_id = $1')) {
        return { rows: [] };
      }
      if (sql.includes('FROM stock_inventory_balances')) {
        return { rows: [{ id: 'balance-1', current_stock: 3 }] };
      }
      if (sql.includes('UPDATE stock_inventory_balances')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO stock_movements')) {
        return {
          rows: [{
            id: 'reversal-1',
            city_id: 'city-1',
            tyre_product_id: 'tyre-1',
            movement_type: 'SALE_REVERSAL',
            quantity_delta: 2,
            previous_balance: 3,
            resulting_balance: 5,
          }],
          rowCount: 1,
        };
      }
      return null;
    });

    const result = await reverseCityStockSale({
      movementId: 'sale-1',
      actorUserId: 'user-1',
      idempotencyKey: 'undo:sale-1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.movement.movementType).toBe('SALE_REVERSAL');
      expect(result.movement.balanceAfter).toBe(5);
      expect(result.movement.alreadyApplied).toBe(false);
    }
  });
});
