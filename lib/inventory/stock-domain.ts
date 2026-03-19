/**
 * Stock Domain — Single Source of Truth
 *
 * Pure functions for stock math, validation, classification, and diagnostics.
 * No DB access — all functions accept plain data and return computed results.
 * Used by API routes, admin UI, tests, and diagnostics.
 */

// ── Types ──────────────────────────────────────────────────

export interface StockRecord {
  id: string;
  catalogueId: string | null;
  brand: string;
  pattern: string;
  sizeDisplay: string;
  season: string;
  width: number;
  aspect: number;
  rim: number;
  priceNew: string | null;      // decimal stored as string
  stockNew: number | null;
  stockOrdered: number | null;
  isLocalStock: boolean | null;
  availableNew: boolean | null;
  slug: string;
  barcode: string | null;
  updatedAt: Date | string | null;
}

export interface ReservationRecord {
  id: string;
  tyreId: string | null;
  bookingId: string | null;
  quantity: number;
  expiresAt: Date | string;
  released: boolean | null;
}

export interface StockSnapshot {
  physicalStock: number;         // stockNew (what's on the shelf)
  orderedStock: number;          // stockOrdered (incoming)
  reservedStock: number;         // unreleased, non-expired reservations
  availableStock: number;        // physicalStock - reservedStock
  isLowStock: boolean;           // availableStock 1–3
  isOutOfStock: boolean;         // availableStock <= 0
  isOvercommitted: boolean;      // reservedStock > physicalStock
}

export type StockLevel = 'in-stock' | 'low-stock' | 'out-of-stock' | 'overcommitted';

export interface StockIssue {
  type: StockIssueType;
  severity: 'error' | 'warning' | 'info';
  productId: string;
  sizeDisplay: string;
  brand: string;
  message: string;
  details?: Record<string, unknown>;
}

export type StockIssueType =
  | 'negative-stock'
  | 'nan-stock'
  | 'null-price-available'
  | 'zero-stock-available'
  | 'overcommitted'
  | 'missing-catalogue'
  | 'orphan-product'
  | 'duplicate-size-brand'
  | 'invalid-size-format'
  | 'stale-reservation'
  | 'unreleased-expired'
  | 'price-without-stock';

export interface DiagnosticsSummary {
  totalProducts: number;
  totalPhysicalStock: number;
  totalReservedStock: number;
  totalAvailableStock: number;
  totalOrderedStock: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  overcommitted: number;
  withIssues: number;
  issues: StockIssue[];
  duplicates: DuplicateGroup[];
  orphans: string[];             // product IDs with no catalogue link
  checkedAt: string;
}

export interface DuplicateGroup {
  key: string;                   // "brand|sizeDisplay"
  productIds: string[];
  sizes: string[];
  brands: string[];
}

// ── Constants ──────────────────────────────────────────────

export const LOW_STOCK_THRESHOLD = 3;
export const OUT_OF_STOCK_THRESHOLD = 0;
export const SIZE_REGEX = /^(\d{3})\/(\d{2,3})\/R(\d{2})(C?)$/i;
export const SIZE_REGEX_NO_ASPECT = /^(\d{3})\/R(\d{2})(C?)$/i;

// ── Stock Badge (for UI) ───────────────────────────────────

export interface StockBadge {
  text: string;
  level: StockLevel | 'order-only';
}

/**
 * Derive a user-facing stock badge from raw stock numbers.
 * Centralises the threshold logic used by TyreCard, TyreDetailClient,
 * StepTyreSelection, and cron scans.
 */
export function getStockBadge(
  stock: number | null,
  isLocalStock: boolean | null,
  opts?: { isOrderOnly?: boolean; leadTimeLabel?: string | null },
): StockBadge & { subtext?: string } {
  if (opts?.isOrderOnly) {
    return {
      text: 'Order Only',
      level: 'order-only',
      subtext: opts.leadTimeLabel || '2\u20133 working days',
    };
  }
  const s = sanitizeInt(stock);
  if (isLocalStock && s > LOW_STOCK_THRESHOLD) {
    return { text: 'In Stock', level: 'in-stock' };
  }
  if (isLocalStock && s >= 1) {
    return { text: 'Low Stock', level: 'low-stock' };
  }
  return { text: 'Out of Stock', level: 'out-of-stock' };
}

// ── Pure stock math ────────────────────────────────────────

export function computeSnapshot(
  product: Pick<StockRecord, 'stockNew' | 'stockOrdered'>,
  reservations: Pick<ReservationRecord, 'quantity' | 'released' | 'expiresAt'>[],
  now: Date = new Date(),
): StockSnapshot {
  const physicalStock = sanitizeInt(product.stockNew);
  const orderedStock = sanitizeInt(product.stockOrdered);

  const reservedStock = reservations
    .filter(r => !r.released && new Date(r.expiresAt) > now)
    .reduce((sum, r) => sum + sanitizeInt(r.quantity), 0);

  const availableStock = physicalStock - reservedStock;

  return {
    physicalStock,
    orderedStock,
    reservedStock,
    availableStock,
    isLowStock: availableStock > 0 && availableStock <= LOW_STOCK_THRESHOLD,
    isOutOfStock: availableStock <= 0,
    isOvercommitted: reservedStock > physicalStock,
  };
}

export function classifyStockLevel(snapshot: StockSnapshot): StockLevel {
  if (snapshot.isOvercommitted) return 'overcommitted';
  if (snapshot.isOutOfStock) return 'out-of-stock';
  if (snapshot.isLowStock) return 'low-stock';
  return 'in-stock';
}

// ── Validation ─────────────────────────────────────────────

export function sanitizeInt(value: number | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function validateStockValue(value: unknown): { valid: boolean; value: number; error?: string } {
  if (value == null) return { valid: false, value: 0, error: 'Stock value is null/undefined' };
  const n = Number(value);
  if (!Number.isFinite(n)) return { valid: false, value: 0, error: `Stock value is not a number: ${value}` };
  if (n < 0) return { valid: false, value: 0, error: `Negative stock: ${n}` };
  if (!Number.isInteger(n)) return { valid: false, value: Math.floor(n), error: `Non-integer stock: ${n}` };
  return { valid: true, value: n };
}

export function validateSizeFormat(sizeDisplay: string): { valid: boolean; error?: string } {
  if (!sizeDisplay || typeof sizeDisplay !== 'string') {
    return { valid: false, error: 'Empty or non-string size' };
  }
  const trimmed = sizeDisplay.trim();
  if (SIZE_REGEX.test(trimmed) || SIZE_REGEX_NO_ASPECT.test(trimmed)) {
    return { valid: true };
  }
  return { valid: false, error: `Invalid size format: "${trimmed}". Expected NNN/NN/RNN or NNN/RNN` };
}

/**
 * Check whether a product counts as low stock for alert purposes.
 * Used by cron/low-stock-scan and admin dashboards.
 */
export function isLowStock(stockNew: number | null): boolean {
  return sanitizeInt(stockNew) <= LOW_STOCK_THRESHOLD;
}

export function validatePrice(priceNew: string | null): { valid: boolean; error?: string } {
  if (priceNew == null) return { valid: true }; // null price is allowed (not priced yet)
  const n = parseFloat(priceNew);
  if (!Number.isFinite(n)) return { valid: false, error: `Non-numeric price: ${priceNew}` };
  if (n < 0) return { valid: false, error: `Negative price: ${priceNew}` };
  return { valid: true };
}

// ── Diagnostics ────────────────────────────────────────────

export function runDiagnostics(
  products: StockRecord[],
  reservations: ReservationRecord[],
  catalogueIds: Set<string>,
  now: Date = new Date(),
): DiagnosticsSummary {
  const issues: StockIssue[] = [];
  const duplicates: DuplicateGroup[] = [];
  const orphans: string[] = [];

  let totalPhysical = 0;
  let totalReserved = 0;
  let totalAvailable = 0;
  let totalOrdered = 0;
  let inStock = 0;
  let lowStock = 0;
  let outOfStock = 0;
  let overcommitted = 0;

  // Group reservations by tyreId
  const reservationsByTyre = new Map<string, ReservationRecord[]>();
  for (const r of reservations) {
    if (!r.tyreId) continue;
    const list = reservationsByTyre.get(r.tyreId) ?? [];
    list.push(r);
    reservationsByTyre.set(r.tyreId, list);
  }

  // Detect duplicates: same brand + sizeDisplay
  const sizeMap = new Map<string, StockRecord[]>();
  for (const p of products) {
    const key = `${p.brand.toLowerCase()}|${p.sizeDisplay.toLowerCase()}`;
    const list = sizeMap.get(key) ?? [];
    list.push(p);
    sizeMap.set(key, list);
  }

  for (const [key, group] of sizeMap) {
    if (group.length > 1) {
      duplicates.push({
        key,
        productIds: group.map(p => p.id),
        sizes: group.map(p => p.sizeDisplay),
        brands: group.map(p => p.brand),
      });
      for (const p of group) {
        issues.push({
          type: 'duplicate-size-brand',
          severity: 'warning',
          productId: p.id,
          sizeDisplay: p.sizeDisplay,
          brand: p.brand,
          message: `Duplicate: ${group.length} products share ${p.brand} ${p.sizeDisplay}`,
          details: { duplicateCount: group.length },
        });
      }
    }
  }

  // Check stale / unreleased-expired reservations
  for (const r of reservations) {
    if (!r.released && new Date(r.expiresAt) <= now) {
      issues.push({
        type: 'unreleased-expired',
        severity: 'warning',
        productId: r.tyreId ?? 'unknown',
        sizeDisplay: '',
        brand: '',
        message: `Reservation ${r.id.slice(0, 8)} expired at ${new Date(r.expiresAt).toISOString()} but not released`,
        details: { reservationId: r.id, expiresAt: new Date(r.expiresAt).toISOString(), quantity: r.quantity },
      });
    }
  }

  // Per-product checks
  for (const p of products) {
    const snap = computeSnapshot(p, reservationsByTyre.get(p.id) ?? [], now);
    totalPhysical += snap.physicalStock;
    totalReserved += snap.reservedStock;
    totalAvailable += snap.availableStock;
    totalOrdered += snap.orderedStock;

    const level = classifyStockLevel(snap);
    if (level === 'in-stock') inStock++;
    else if (level === 'low-stock') lowStock++;
    else if (level === 'out-of-stock') outOfStock++;
    else if (level === 'overcommitted') overcommitted++;

    // Check: negative or NaN stock
    const stockVal = validateStockValue(p.stockNew);
    if (!stockVal.valid) {
      issues.push({
        type: p.stockNew != null && Number(p.stockNew) < 0 ? 'negative-stock' : 'nan-stock',
        severity: 'error',
        productId: p.id,
        sizeDisplay: p.sizeDisplay,
        brand: p.brand,
        message: stockVal.error!,
      });
    }

    // Check: null price but flagged as available
    if (p.availableNew && p.priceNew == null) {
      issues.push({
        type: 'null-price-available',
        severity: 'error',
        productId: p.id,
        sizeDisplay: p.sizeDisplay,
        brand: p.brand,
        message: `Available but no price set`,
      });
    }

    // Check: zero stock but flagged as available (with local stock)
    if (p.availableNew && p.isLocalStock && snap.physicalStock === 0) {
      issues.push({
        type: 'zero-stock-available',
        severity: 'warning',
        productId: p.id,
        sizeDisplay: p.sizeDisplay,
        brand: p.brand,
        message: `Local stock flagged available but physical stock is 0`,
      });
    }

    // Check: overcommitted
    if (snap.isOvercommitted) {
      issues.push({
        type: 'overcommitted',
        severity: 'error',
        productId: p.id,
        sizeDisplay: p.sizeDisplay,
        brand: p.brand,
        message: `Reserved (${snap.reservedStock}) exceeds physical stock (${snap.physicalStock})`,
        details: { reserved: snap.reservedStock, physical: snap.physicalStock },
      });
    }

    // Check: missing catalogue link
    if (!p.catalogueId) {
      orphans.push(p.id);
      issues.push({
        type: 'missing-catalogue',
        severity: 'warning',
        productId: p.id,
        sizeDisplay: p.sizeDisplay,
        brand: p.brand,
        message: `No catalogue link (catalogueId is null)`,
      });
    } else if (!catalogueIds.has(p.catalogueId)) {
      orphans.push(p.id);
      issues.push({
        type: 'orphan-product',
        severity: 'error',
        productId: p.id,
        sizeDisplay: p.sizeDisplay,
        brand: p.brand,
        message: `Catalogue ID ${p.catalogueId.slice(0, 8)} does not exist`,
      });
    }

    // Check: invalid size format
    const sizeCheck = validateSizeFormat(p.sizeDisplay);
    if (!sizeCheck.valid) {
      issues.push({
        type: 'invalid-size-format',
        severity: 'warning',
        productId: p.id,
        sizeDisplay: p.sizeDisplay,
        brand: p.brand,
        message: sizeCheck.error!,
      });
    }
  }

  // Sort issues: errors first, then warnings, then info
  const severityOrder = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    totalProducts: products.length,
    totalPhysicalStock: totalPhysical,
    totalReservedStock: totalReserved,
    totalAvailableStock: Math.max(0, totalAvailable),
    totalOrderedStock: totalOrdered,
    inStock,
    lowStock,
    outOfStock,
    overcommitted,
    withIssues: new Set(issues.map(i => i.productId)).size,
    issues,
    duplicates,
    orphans,
    checkedAt: now.toISOString(),
  };
}
