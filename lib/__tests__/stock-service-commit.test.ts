import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Stock service — commitReservationsForBooking + restoreBookingStock
 *
 * These tests mock the @neondatabase/serverless Pool so we can verify
 * the SQL flow: idempotency markers, FOR UPDATE locking, atomic
 * conditional UPDATEs and movement logging.
 */

// In-memory SQL recorder.
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
  Pool: vi.fn(function MockPool() {
    return {
      connect: vi.fn(async () => mockClient),
      end: vi.fn(),
    };
  }),
}));

import {
  commitReservationsForBooking,
  restoreBookingStock,
} from '@/lib/inventory/stock-service';

beforeEach(() => {
  mockClient = new MockClient();
});

function findQuery(client: MockClient, fragment: string) {
  return client.log.filter((q) => q.sql.includes(fragment));
}

describe('commitReservationsForBooking', () => {
  it('is a no-op when a sale movement already exists (idempotency)', async () => {
    mockClient.handlers.push((sql) => {
      if (sql.includes("movement_type = 'sale'") && sql.includes('SELECT id FROM inventory_movements')) {
        return { rows: [{ id: 'existing-sale' }] };
      }
      return null;
    });

    const result = await commitReservationsForBooking({
      bookingId: 'booking-1',
      actor: 'webhook',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.alreadyCommitted).toBe(true);
      expect(result.committedTyres).toEqual([]);
    }
    // No UPDATE on tyre_products
    expect(findQuery(mockClient, 'UPDATE tyre_products')).toHaveLength(0);
  });

  it('deducts physical stock once and logs a sale movement', async () => {
    let stock = 5;
    mockClient.handlers.push((sql, params) => {
      if (sql.includes('SELECT id FROM inventory_movements') && sql.includes("movement_type = 'sale'")) {
        return { rows: [] }; // no prior sale
      }
      if (sql.includes('SELECT tyre_id, quantity') && sql.includes('booking_tyres')) {
        return { rows: [{ tyre_id: 'tyre-1', quantity: 2 }] };
      }
      if (sql.includes('SELECT id, stock_new FROM tyre_products')) {
        return { rows: [{ id: params[0], stock_new: stock }] };
      }
      if (sql.includes('UPDATE tyre_products') && sql.includes('stock_new = stock_new - ')) {
        const qty = params[0] as number;
        stock -= qty;
        return { rows: [{ stock_new: stock }], rowCount: 1 };
      }
      if (sql.includes('UPDATE inventory_reservations')) {
        return { rows: [], rowCount: 1 };
      }
      return null;
    });

    const result = await commitReservationsForBooking({
      bookingId: 'booking-1',
      actor: 'webhook',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.alreadyCommitted).toBe(false);
      expect(result.committedTyres).toEqual([
        { tyreId: 'tyre-1', quantity: 2, stockAfter: 3 },
      ]);
    }

    // Sale movement logged exactly once
    const saleInserts = mockClient.log.filter(
      (q) => q.sql.includes('INSERT INTO inventory_movements') && q.sql.includes("'sale'"),
    );
    expect(saleInserts).toHaveLength(1);
    // Reservations marked released
    expect(findQuery(mockClient, 'UPDATE inventory_reservations')).toHaveLength(1);
  });

  it('refuses to oversell when conditional UPDATE returns 0 rows', async () => {
    mockClient.handlers.push((sql, params) => {
      if (sql.includes('SELECT id FROM inventory_movements')) return { rows: [] };
      if (sql.includes('SELECT tyre_id, quantity') && sql.includes('booking_tyres')) {
        return { rows: [{ tyre_id: 'tyre-1', quantity: 2 }] };
      }
      if (sql.includes('SELECT id, stock_new FROM tyre_products')) {
        return { rows: [{ id: params[0], stock_new: 1 }] };
      }
      if (sql.includes('UPDATE tyre_products')) {
        return { rows: [], rowCount: 0 }; // simulate concurrent depletion
      }
      return null;
    });

    const result = await commitReservationsForBooking({
      bookingId: 'booking-1',
      actor: 'webhook',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INSUFFICIENT_STOCK');
    }
  });

  it('aggregates duplicate booking_tyres rows for the same tyre', async () => {
    let stock = 10;
    let updateCount = 0;
    mockClient.handlers.push((sql, params) => {
      if (sql.includes('SELECT id FROM inventory_movements')) return { rows: [] };
      if (sql.includes('SELECT tyre_id, quantity') && sql.includes('booking_tyres')) {
        return {
          rows: [
            { tyre_id: 'tyre-1', quantity: 2 },
            { tyre_id: 'tyre-1', quantity: 1 },
          ],
        };
      }
      if (sql.includes('SELECT id, stock_new FROM tyre_products')) {
        return { rows: [{ id: params[0], stock_new: stock }] };
      }
      if (sql.includes('UPDATE tyre_products')) {
        updateCount++;
        const qty = params[0] as number;
        stock -= qty;
        return { rows: [{ stock_new: stock }], rowCount: 1 };
      }
      return null;
    });

    const result = await commitReservationsForBooking({
      bookingId: 'booking-1',
      actor: 'webhook',
    });

    expect(result.success).toBe(true);
    expect(updateCount).toBe(1); // one update with combined qty=3
    if (result.success) {
      expect(result.committedTyres[0]).toEqual({
        tyreId: 'tyre-1',
        quantity: 3,
        stockAfter: 7,
      });
    }
  });
});

describe('restoreBookingStock idempotency', () => {
  it('does not restore stock when no sale movement exists (unpaid cancel)', async () => {
    mockClient.handlers.push((sql) => {
      if (sql.includes('booking_tyres')) {
        return { rows: [{ tyre_id: 'tyre-1', quantity: 2 }] };
      }
      if (sql.includes('inventory_reservations') && sql.includes('SELECT id')) {
        return { rows: [{ id: 'res-1' }] }; // unreleased
      }
      if (sql.includes('UPDATE inventory_reservations')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('SELECT id FROM inventory_movements') && sql.includes("movement_type = 'sale'")) {
        return { rows: [] }; // no sale → never paid
      }
      return null;
    });

    const result = await restoreBookingStock({
      bookingId: 'booking-1',
      reason: 'cancel',
      actor: 'admin',
    });

    expect(result.success).toBe(true);
    // Reservations released, but stock NOT restored.
    expect(findQuery(mockClient, 'stock_new = stock_new + ')).toHaveLength(0);
  });

  it('restores stock once when a sale exists and no prior restore', async () => {
    let stock = 3;
    mockClient.handlers.push((sql, params) => {
      if (sql.includes('booking_tyres')) {
        return { rows: [{ tyre_id: 'tyre-1', quantity: 2 }] };
      }
      if (sql.includes('inventory_reservations') && sql.includes('SELECT id')) {
        return { rows: [] };
      }
      if (sql.includes("movement_type = 'sale'")) {
        return { rows: [{ id: 'sale-1' }] };
      }
      if (sql.includes("'refund-restore', 'cancel-restore'")) {
        return { rows: [] };
      }
      if (sql.includes('SELECT id FROM tyre_products WHERE')) {
        return { rows: [{ id: params[0] }] };
      }
      if (sql.includes('UPDATE tyre_products') && sql.includes('stock_new = stock_new + ')) {
        const qty = params[0] as number;
        stock += qty;
        return { rows: [{ stock_new: stock }], rowCount: 1 };
      }
      return null;
    });

    const result = await restoreBookingStock({
      bookingId: 'booking-1',
      reason: 'cancel',
      actor: 'admin',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.restoredProducts).toEqual([
        { productId: 'tyre-1', quantityRestored: 2 },
      ]);
    }
    expect(findQuery(mockClient, 'stock_new = stock_new + ')).toHaveLength(1);
  });

  it('skips restore if a prior restore movement exists (idempotency)', async () => {
    mockClient.handlers.push((sql) => {
      if (sql.includes('booking_tyres')) {
        return { rows: [{ tyre_id: 'tyre-1', quantity: 2 }] };
      }
      if (sql.includes('inventory_reservations') && sql.includes('SELECT id')) {
        return { rows: [] };
      }
      if (sql.includes("movement_type = 'sale'")) {
        return { rows: [{ id: 'sale-1' }] };
      }
      if (sql.includes("'refund-restore', 'cancel-restore'")) {
        return { rows: [{ id: 'restore-1' }] }; // already restored
      }
      return null;
    });

    const result = await restoreBookingStock({
      bookingId: 'booking-1',
      reason: 'refund',
      actor: 'admin',
    });

    expect(result.success).toBe(true);
    expect(findQuery(mockClient, 'stock_new = stock_new + ')).toHaveLength(0);
  });
});
