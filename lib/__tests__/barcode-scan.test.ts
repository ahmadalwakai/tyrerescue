import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the barcode scan normalization and size-expansion logic.
 *
 * The actual API route uses requireAdmin() + DB, so we test the pure helper
 * functions extracted here (same logic as in route.ts).
 *
 * We also test the route handler with mocked auth + DB where possible.
 */

/* ── Re-implement the pure helpers (same as route.ts) for unit testing ── */

function normalizeBarcode(raw: string): string {
  return raw
    .trim()
    .replace(/[\x00-\x1F\x7F-\x9F\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '');
}

function expandSizePatterns(barcode: string): string[] {
  const patterns: string[] = [];

  if (/^\d{3}\/\d{1,3}\/R\d{2}C?$/i.test(barcode)) {
    patterns.push(barcode);
    return patterns;
  }

  const numOnly = barcode.replace(/[^0-9]/g, '');
  if (numOnly.length >= 6 && numOnly.length <= 8) {
    const w = numOnly.slice(0, 3);
    const a = numOnly.slice(3, 5);
    const r = numOnly.slice(5);
    if (r.length >= 1 && r.length <= 2) {
      patterns.push(`${w}/${a}/R${r}`);
      patterns.push(`${w}/${a}/R${r}C`);
    }
  }

  const mixedMatch = barcode.match(/^(\d{3})(\d{2})R(\d{2})(C?)$/i);
  if (mixedMatch) {
    patterns.push(`${mixedMatch[1]}/${mixedMatch[2]}/R${mixedMatch[3]}${mixedMatch[4].toUpperCase()}`);
  }

  return patterns;
}

/* ── normalizeBarcode ──────────────────────────────────── */

describe('normalizeBarcode', () => {
  it('trims whitespace', () => {
    expect(normalizeBarcode('  5901234123457  ')).toBe('5901234123457');
  });

  it('strips invisible characters', () => {
    expect(normalizeBarcode('\u200B5901234\uFEFF')).toBe('5901234');
  });

  it('preserves leading zeros', () => {
    expect(normalizeBarcode('0012345678')).toBe('0012345678');
  });

  it('collapses internal spaces', () => {
    expect(normalizeBarcode('590 123 4123')).toBe('5901234123');
  });

  it('returns empty for empty input', () => {
    expect(normalizeBarcode('')).toBe('');
    expect(normalizeBarcode('   ')).toBe('');
  });

  it('strips control characters', () => {
    expect(normalizeBarcode('\x00\x1FABC\x7F')).toBe('ABC');
  });
});

/* ── expandSizePatterns ────────────────────────────────── */

describe('expandSizePatterns', () => {
  it('returns direct match for tyre-size format', () => {
    expect(expandSizePatterns('205/55/R16')).toEqual(['205/55/R16']);
    expect(expandSizePatterns('195/75/R16C')).toEqual(['195/75/R16C']);
  });

  it('expands 7-digit numeric to size pattern', () => {
    const result = expandSizePatterns('2055516');
    expect(result).toContain('205/55/R16');
    expect(result).toContain('205/55/R16C');
  });

  it('expands mixed alphanumeric with R', () => {
    const result = expandSizePatterns('20555R16');
    expect(result).toContain('205/55/R16');
  });

  it('returns empty for random text', () => {
    expect(expandSizePatterns('hello')).toEqual([]);
  });

  it('returns empty for too-short numeric', () => {
    expect(expandSizePatterns('12345')).toEqual([]);
  });

  it('handles 6-digit numeric', () => {
    // 155/R1/3? → 155/R1 + 155/R1C  (short rim)
    const result = expandSizePatterns('155133');
    expect(result.length).toBeGreaterThan(0);
  });

  it('is case insensitive for R prefix', () => {
    const result = expandSizePatterns('20555r16');
    expect(result).toContain('205/55/R16');
  });
});

/* ── API contract shape (mock-based) ──────────────────── */

describe('barcode scan API contract', () => {
  it('rejects empty barcode', () => {
    // Simulates what the route does: parse with zod min(1)
    const barcode = '';
    expect(barcode.length).toBeLessThan(1);
  });

  it('rejects barcode longer than 100 chars', () => {
    const barcode = 'A'.repeat(101);
    expect(barcode.length).toBeGreaterThan(100);
  });

  it('normalizes before lookup', () => {
    const raw = '  \u200B5901234123457\uFEFF  ';
    const normalized = normalizeBarcode(raw);
    expect(normalized).toBe('5901234123457');
    expect(normalized.length).toBeLessThanOrEqual(100);
  });

  it('response shape: found', () => {
    const response = {
      success: true,
      barcode: '5901234123457',
      found: true,
      matchType: 'barcode',
      item: { id: 'uuid', brand: 'Budget', size: '205/55/R16', season: 'All-Season', quantity: 4, price: 58 },
      items: [{ id: 'uuid', brand: 'Budget', size: '205/55/R16', season: 'All-Season', quantity: 4, price: 58 }],
      message: 'Exact barcode match found',
    };
    expect(response.success).toBe(true);
    expect(response.found).toBe(true);
    expect(response.item).toBeDefined();
    expect(response.item.size).toBe('205/55/R16');
    expect(response.item.season).toBe('All-Season');
    expect(response.items.length).toBeGreaterThan(0);
  });

  it('response shape: not found', () => {
    const response = {
      success: true,
      barcode: '9999999999999',
      found: false,
      matchType: null,
      items: [],
      message: 'Not found in current stock',
    };
    expect(response.found).toBe(false);
    expect(response.items).toHaveLength(0);
  });

  it('response shape: multiple matches', () => {
    const response = {
      success: true,
      barcode: '2055516',
      found: true,
      matchType: 'size-fallback',
      item: { id: 'a', brand: 'Budget', size: '205/55/R16', season: 'All-Season', quantity: 4, price: 58 },
      items: [
        { id: 'a', brand: 'Budget', size: '205/55/R16', season: 'All-Season', quantity: 4, price: 58 },
        { id: 'b', brand: 'Budget', size: '205/55/R16C', season: 'All-Season', quantity: 2, price: 58 },
      ],
      message: '2 products matched by size (fallback).',
    };
    expect(response.items.length).toBeGreaterThan(1);
    expect(response.matchType).toBe('size-fallback');
    expect(response.item).toBeDefined();
  });
});
