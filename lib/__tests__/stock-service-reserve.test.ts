import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Stock service — reserveStock (B2B soft hold)
 *
 * A hold must never deduct physical stock: the expiry cron releases holds
 * with restoreStock=false, so a deducting hold would lose stock forever.
 */

type Row = Record<string, unknown>;
interface QueryResult { rows: Row[]; rowCount?: number }

class MockClient {
  public log: Array<{ sql: string; params: unknown[] }> = [];
  public handlers: Array<(sql: string, params: unknown[]) => QueryResult | null> = [];

  query = vi.fn(async (sql: string, params: unknown[] = []): Promise<QueryResult> => {
    this.log.push({ sql, params });
    for (const h of this.handlers) {
      const r = h(sql, params);
      if (r !== null) return r;
    }
    return { rows: [], rowCount: 0 };
  });

  release = vi.fn();
}

let mockClient: MockClient;

vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => vi.fn()),
  Pool: vi.fn(function MockPool() {
    return {
      connect: vi.fn(async () => mockClient),
      end: vi.fn(),
    };
  }),
}));

import { reserveStock } from '@/lib/inventory/stock-service';

function findQuery(fragment: string) {
  return mockClient.log.filter((q) => q.sql.includes(fragment));
}

function givenProduct(stock: number, held: number, availableNew = true) {
  mockClient.handlers.push((sql) => {
    if (sql.includes('FROM tyre_products') && sql.includes('FOR UPDATE')) {
      return { rows: [{ id: 'tyre-1', stock_new: stock, available_new: availableNew, price_new: '50.00' }] };
    }
    if (sql.includes('SUM(quantity)') && sql.includes('inventory_reservations')) {
      return { rows: [{ held }] };
    }
    if (sql.includes('INSERT INTO inventory_reservations')) {
      return { rows: [{ id: 'res-1' }], rowCount: 1 };
    }
    return null;
  });
}

const expiresAt = new Date(Date.now() + 60 * 60_000);

beforeEach(() => {
  mockClient = new MockClient();
});

describe('reserveStock', () => {
  it('creates a hold without touching physical stock', async () => {
    givenProduct(5, 1);

    const result = await reserveStock({ tyreId: 'tyre-1', quantity: 2, expiresAt, actor: 'webhook' });

    expect(result).toEqual({ success: true, reservationId: 'res-1', stockAfter: 2 });
    expect(findQuery('UPDATE tyre_products')).toHaveLength(0);
    const movement = findQuery('INSERT INTO inventory_movements')[0];
    expect(movement.sql).toContain("'reserve', 0");
    expect(movement.params[1]).toBe(5); // stock_after is the unchanged physical stock
    expect(findQuery('COMMIT')).toHaveLength(1);
  });

  it('rejects a hold larger than stock minus active holds', async () => {
    givenProduct(5, 4);

    const result = await reserveStock({ tyreId: 'tyre-1', quantity: 2, expiresAt, actor: 'webhook' });

    expect(result).toMatchObject({ success: false, code: 'INSUFFICIENT_STOCK' });
    expect(findQuery('INSERT INTO inventory_reservations')).toHaveLength(0);
    expect(findQuery('ROLLBACK')).toHaveLength(1);
  });

  it('only counts unreleased, unexpired holds as held', async () => {
    givenProduct(5, 0);

    await reserveStock({ tyreId: 'tyre-1', quantity: 1, expiresAt, actor: 'webhook' });

    const heldQuery = findQuery('SUM(quantity)')[0];
    expect(heldQuery.sql).toContain('released = false');
    expect(heldQuery.sql).toContain('expires_at > NOW()');
  });

  it('waits for the row lock instead of failing under contention', async () => {
    givenProduct(5, 0);

    await reserveStock({ tyreId: 'tyre-1', quantity: 1, expiresAt, actor: 'webhook' });

    const lock = findQuery('FROM tyre_products')[0];
    expect(lock.sql).toContain('FOR UPDATE');
    expect(lock.sql).not.toContain('SKIP LOCKED');
  });

  it('rejects unavailable products', async () => {
    givenProduct(5, 0, false);

    const result = await reserveStock({ tyreId: 'tyre-1', quantity: 1, expiresAt, actor: 'webhook' });

    expect(result).toMatchObject({ success: false, code: 'UNAVAILABLE' });
  });
});
