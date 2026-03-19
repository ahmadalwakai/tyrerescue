import { describe, it, expect } from 'vitest';
import {
  computeSnapshot,
  classifyStockLevel,
  sanitizeInt,
  validateStockValue,
  validateSizeFormat,
  validatePrice,
  runDiagnostics,
  LOW_STOCK_THRESHOLD,
  getStockBadge,
  isLowStock,
  type StockRecord,
  type ReservationRecord,
} from '../inventory/stock-domain';

/* ── helpers ──────────────────────────────────────────────── */

function makeProduct(overrides: Partial<StockRecord> = {}): StockRecord {
  return {
    id: 'prod-1',
    catalogueId: 'cat-1',
    brand: 'Budget',
    pattern: 'Economy',
    sizeDisplay: '205/55/R16',
    season: 'allseason',
    width: 205,
    aspect: 55,
    rim: 16,
    priceNew: '49.99',
    stockNew: 10,
    stockOrdered: 0,
    isLocalStock: true,
    availableNew: true,
    slug: 'budget-economy-205-55-r16',
    barcode: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeReservation(overrides: Partial<ReservationRecord> = {}): ReservationRecord {
  return {
    id: 'res-1',
    tyreId: 'prod-1',
    bookingId: 'book-1',
    quantity: 2,
    expiresAt: new Date(Date.now() + 60_000).toISOString(), // future
    released: false,
    ...overrides,
  };
}

/* ── sanitizeInt ──────────────────────────────────────────── */

describe('sanitizeInt', () => {
  it('returns 0 for null/undefined', () => {
    expect(sanitizeInt(null)).toBe(0);
    expect(sanitizeInt(undefined)).toBe(0);
  });

  it('floors floats', () => {
    expect(sanitizeInt(3.7)).toBe(3);
  });

  it('clamps negative to 0', () => {
    expect(sanitizeInt(-5)).toBe(0);
  });

  it('returns NaN as 0', () => {
    expect(sanitizeInt(NaN)).toBe(0);
  });

  it('passes through valid ints', () => {
    expect(sanitizeInt(10)).toBe(10);
  });
});

/* ── validateStockValue ───────────────────────────────────── */

describe('validateStockValue', () => {
  it('rejects null', () => {
    const r = validateStockValue(null);
    expect(r.valid).toBe(false);
  });

  it('rejects NaN', () => {
    const r = validateStockValue('abc');
    expect(r.valid).toBe(false);
  });

  it('rejects negative', () => {
    const r = validateStockValue(-3);
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Negative');
  });

  it('warns on float', () => {
    const r = validateStockValue(3.5);
    expect(r.valid).toBe(false);
    expect(r.value).toBe(3);
  });

  it('accepts valid integer', () => {
    const r = validateStockValue(10);
    expect(r.valid).toBe(true);
    expect(r.value).toBe(10);
  });
});

/* ── validateSizeFormat ───────────────────────────────────── */

describe('validateSizeFormat', () => {
  it('accepts 205/55/R16', () => {
    expect(validateSizeFormat('205/55/R16').valid).toBe(true);
  });

  it('accepts 195/65/R15C', () => {
    expect(validateSizeFormat('195/65/R15C').valid).toBe(true);
  });

  it('accepts no-aspect format 195/R15', () => {
    expect(validateSizeFormat('195/R15').valid).toBe(true);
  });

  it('rejects empty string', () => {
    expect(validateSizeFormat('').valid).toBe(false);
  });

  it('rejects random text', () => {
    expect(validateSizeFormat('hello').valid).toBe(false);
  });
});

/* ── validatePrice ────────────────────────────────────────── */

describe('validatePrice', () => {
  it('accepts null (unpriced)', () => {
    expect(validatePrice(null).valid).toBe(true);
  });

  it('accepts valid price', () => {
    expect(validatePrice('49.99').valid).toBe(true);
  });

  it('rejects negative', () => {
    expect(validatePrice('-10').valid).toBe(false);
  });

  it('rejects NaN', () => {
    expect(validatePrice('abc').valid).toBe(false);
  });
});

/* ── computeSnapshot ──────────────────────────────────────── */

describe('computeSnapshot', () => {
  it('computes basic snapshot without reservations', () => {
    const snap = computeSnapshot(makeProduct({ stockNew: 10, stockOrdered: 5 }), []);
    expect(snap.physicalStock).toBe(10);
    expect(snap.orderedStock).toBe(5);
    expect(snap.reservedStock).toBe(0);
    expect(snap.availableStock).toBe(10);
    expect(snap.isLowStock).toBe(false);
    expect(snap.isOutOfStock).toBe(false);
    expect(snap.isOvercommitted).toBe(false);
  });

  it('subtracts active reservations', () => {
    const snap = computeSnapshot(
      makeProduct({ stockNew: 5 }),
      [makeReservation({ quantity: 3 })],
    );
    expect(snap.reservedStock).toBe(3);
    expect(snap.availableStock).toBe(2);
  });

  it('ignores released reservations', () => {
    const snap = computeSnapshot(
      makeProduct({ stockNew: 5 }),
      [makeReservation({ quantity: 3, released: true })],
    );
    expect(snap.reservedStock).toBe(0);
    expect(snap.availableStock).toBe(5);
  });

  it('ignores expired reservations', () => {
    const snap = computeSnapshot(
      makeProduct({ stockNew: 5 }),
      [makeReservation({ quantity: 3, expiresAt: new Date(Date.now() - 60_000).toISOString() })],
    );
    expect(snap.reservedStock).toBe(0);
    expect(snap.availableStock).toBe(5);
  });

  it('detects overcommitted', () => {
    const snap = computeSnapshot(
      makeProduct({ stockNew: 2 }),
      [makeReservation({ quantity: 5 })],
    );
    expect(snap.isOvercommitted).toBe(true);
    expect(snap.availableStock).toBe(-3);
  });

  it('detects low stock', () => {
    const snap = computeSnapshot(makeProduct({ stockNew: LOW_STOCK_THRESHOLD }), []);
    expect(snap.isLowStock).toBe(true);
  });

  it('detects out of stock', () => {
    const snap = computeSnapshot(makeProduct({ stockNew: 0 }), []);
    expect(snap.isOutOfStock).toBe(true);
  });

  it('treats null stockNew as 0', () => {
    const snap = computeSnapshot(makeProduct({ stockNew: null }), []);
    expect(snap.physicalStock).toBe(0);
    expect(snap.isOutOfStock).toBe(true);
  });
});

/* ── classifyStockLevel ───────────────────────────────────── */

describe('classifyStockLevel', () => {
  it('returns in-stock', () => {
    expect(classifyStockLevel(computeSnapshot(makeProduct({ stockNew: 20 }), []))).toBe('in-stock');
  });

  it('returns low-stock', () => {
    expect(classifyStockLevel(computeSnapshot(makeProduct({ stockNew: 2 }), []))).toBe('low-stock');
  });

  it('returns out-of-stock', () => {
    expect(classifyStockLevel(computeSnapshot(makeProduct({ stockNew: 0 }), []))).toBe('out-of-stock');
  });

  it('returns overcommitted', () => {
    expect(classifyStockLevel(computeSnapshot(
      makeProduct({ stockNew: 1 }),
      [makeReservation({ quantity: 5 })],
    ))).toBe('overcommitted');
  });
});

/* ── runDiagnostics ───────────────────────────────────────── */

describe('runDiagnostics', () => {
  const catalogueIds = new Set(['cat-1', 'cat-2']);

  it('returns clean summary for healthy data', () => {
    const products = [makeProduct()];
    const result = runDiagnostics(products, [], catalogueIds);
    expect(result.totalProducts).toBe(1);
    expect(result.issues.length).toBe(0);
    expect(result.duplicates.length).toBe(0);
    expect(result.orphans.length).toBe(0);
    expect(result.inStock).toBe(1);
  });

  it('detects negative stock', () => {
    const products = [makeProduct({ stockNew: -5 })];
    const result = runDiagnostics(products, [], catalogueIds);
    // sanitizeInt clamps to 0, but the raw check uses validateStockValue
    const negIssues = result.issues.filter(i => i.type === 'negative-stock');
    expect(negIssues.length).toBe(1);
  });

  it('detects null price on available product', () => {
    const products = [makeProduct({ priceNew: null, availableNew: true })];
    const result = runDiagnostics(products, [], catalogueIds);
    const issues = result.issues.filter(i => i.type === 'null-price-available');
    expect(issues.length).toBe(1);
  });

  it('detects zero stock but available', () => {
    const products = [makeProduct({ stockNew: 0, availableNew: true, isLocalStock: true })];
    const result = runDiagnostics(products, [], catalogueIds);
    const issues = result.issues.filter(i => i.type === 'zero-stock-available');
    expect(issues.length).toBe(1);
  });

  it('detects overcommitted', () => {
    const products = [makeProduct({ stockNew: 1 })];
    const reservations = [makeReservation({ quantity: 5 })];
    const result = runDiagnostics(products, reservations, catalogueIds);
    expect(result.overcommitted).toBe(1);
    const issues = result.issues.filter(i => i.type === 'overcommitted');
    expect(issues.length).toBe(1);
  });

  it('detects missing catalogue link', () => {
    const products = [makeProduct({ catalogueId: null })];
    const result = runDiagnostics(products, [], catalogueIds);
    expect(result.orphans.length).toBe(1);
    const issues = result.issues.filter(i => i.type === 'missing-catalogue');
    expect(issues.length).toBe(1);
  });

  it('detects orphan (catalogue ID not in set)', () => {
    const products = [makeProduct({ catalogueId: 'nonexistent' })];
    const result = runDiagnostics(products, [], catalogueIds);
    expect(result.orphans.length).toBe(1);
    const issues = result.issues.filter(i => i.type === 'orphan-product');
    expect(issues.length).toBe(1);
  });

  it('detects duplicate size+brand', () => {
    const products = [
      makeProduct({ id: 'prod-1' }),
      makeProduct({ id: 'prod-2' }),
    ];
    const result = runDiagnostics(products, [], catalogueIds);
    expect(result.duplicates.length).toBe(1);
    expect(result.duplicates[0].productIds).toEqual(['prod-1', 'prod-2']);
  });

  it('detects invalid size format', () => {
    const products = [makeProduct({ sizeDisplay: 'INVALID' })];
    const result = runDiagnostics(products, [], catalogueIds);
    const issues = result.issues.filter(i => i.type === 'invalid-size-format');
    expect(issues.length).toBe(1);
  });

  it('detects unreleased expired reservations', () => {
    const products = [makeProduct()];
    const reservations = [
      makeReservation({ released: false, expiresAt: new Date(Date.now() - 60_000).toISOString() }),
    ];
    const result = runDiagnostics(products, reservations, catalogueIds);
    const issues = result.issues.filter(i => i.type === 'unreleased-expired');
    expect(issues.length).toBe(1);
  });

  it('sorts issues by severity (errors first)', () => {
    const products = [
      makeProduct({ id: 'p1', stockNew: -1 }),    // error: negative-stock
      makeProduct({ id: 'p2', sizeDisplay: 'BAD' }), // warning: invalid-size-format
    ];
    const result = runDiagnostics(products, [], catalogueIds);
    const severities = result.issues.map(i => i.severity);
    const errorIdx = severities.indexOf('error');
    const warningIdx = severities.indexOf('warning');
    expect(errorIdx).toBeLessThan(warningIdx);
  });

  it('computes correct totals', () => {
    const products = [
      makeProduct({ id: 'p1', stockNew: 10, stockOrdered: 5 }),
      makeProduct({ id: 'p2', stockNew: 20, stockOrdered: 3, catalogueId: 'cat-2' }),
    ];
    const reservations = [
      makeReservation({ tyreId: 'p1', quantity: 2 }),
    ];
    const result = runDiagnostics(products, reservations, catalogueIds);
    expect(result.totalPhysicalStock).toBe(30);
    expect(result.totalReservedStock).toBe(2);
    expect(result.totalAvailableStock).toBe(28);
    expect(result.totalOrderedStock).toBe(8);
  });
});

// ── getStockBadge ──

describe('getStockBadge', () => {
  it('returns "Available for fitting" for local stock above threshold', () => {
    const badge = getStockBadge(5, true);
    expect(badge.text).toBe('Available for fitting');
    expect(badge.level).toBe('in-stock');
  });

  it('returns "Available for fitting" with limited stock subtext for local stock 1-3', () => {
    const badge = getStockBadge(2, true);
    expect(badge.text).toBe('Available for fitting');
    expect(badge.level).toBe('low-stock');
    expect(badge.subtext).toBe('Limited stock');
  });

  it('returns "Out of stock" for zero stock', () => {
    const badge = getStockBadge(0, true);
    expect(badge.text).toBe('Out of stock');
    expect(badge.level).toBe('out-of-stock');
  });

  it('returns "Out of stock" for null stock', () => {
    const badge = getStockBadge(null, true);
    expect(badge.text).toBe('Out of stock');
    expect(badge.level).toBe('out-of-stock');
  });

  it('returns "Out of stock" for non-local stock', () => {
    const badge = getStockBadge(10, false);
    expect(badge.text).toBe('Out of stock');
    expect(badge.level).toBe('out-of-stock');
  });

  it('returns "Special order" when isOrderOnly flag set', () => {
    const badge = getStockBadge(0, false, { isOrderOnly: true });
    expect(badge.text).toBe('Special order');
    expect(badge.level).toBe('order-only');
    expect(badge.subtext).toBeDefined();
  });

  it('uses custom lead time label', () => {
    const badge = getStockBadge(0, false, { isOrderOnly: true, leadTimeLabel: '5 days' });
    expect(badge.subtext).toBe('5 days');
  });
});

// ── isLowStock ──

describe('isLowStock', () => {
  it('returns true for stock at threshold', () => {
    expect(isLowStock(LOW_STOCK_THRESHOLD)).toBe(true);
  });

  it('returns true for stock below threshold', () => {
    expect(isLowStock(1)).toBe(true);
  });

  it('returns false for stock above threshold', () => {
    expect(isLowStock(LOW_STOCK_THRESHOLD + 1)).toBe(false);
  });

  it('returns true for null stock', () => {
    expect(isLowStock(null)).toBe(true);
  });
});
