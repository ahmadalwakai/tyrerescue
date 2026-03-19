import { describe, it, expect } from 'vitest';
import {
  parseTyreSize,
  validateTyreSize,
  normalizeTyreSize,
  STANDARD_TYRE_SIZE_REGEX,
  COMPACT_TYRE_SIZE_REGEX,
} from '../inventory/tyre-size';

describe('parseTyreSize', () => {
  it('parses standard sizes', () => {
    const r = parseTyreSize('205/55/R16');
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.size).toEqual({
        sizeDisplay: '205/55/R16',
        width: 205,
        aspect: 55,
        rim: 16,
        isCommercial: false,
      });
    }
  });

  it('parses compact sizes (no aspect)', () => {
    const r = parseTyreSize('155/R13');
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.size.sizeDisplay).toBe('155/R13');
      expect(r.size.width).toBe(155);
      expect(r.size.aspect).toBe(0);
      expect(r.size.rim).toBe(13);
    }
  });

  it('parses commercial sizes', () => {
    const r = parseTyreSize('175/R16C');
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.size.sizeDisplay).toBe('175/R16C');
      expect(r.size.isCommercial).toBe(true);
    }
  });

  it('parses commercial standard sizes', () => {
    const r = parseTyreSize('215/65/R16C');
    expect(r.valid).toBe(true);
    if (r.valid) {
      expect(r.size.sizeDisplay).toBe('215/65/R16C');
      expect(r.size.isCommercial).toBe(true);
      expect(r.size.width).toBe(215);
      expect(r.size.aspect).toBe(65);
      expect(r.size.rim).toBe(16);
    }
  });

  it('is case insensitive', () => {
    const r = parseTyreSize('205/55/r16');
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.size.sizeDisplay).toBe('205/55/R16');
  });

  it('trims whitespace', () => {
    const r = parseTyreSize('  205/55/R16  ');
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.size.sizeDisplay).toBe('205/55/R16');
  });

  it('rejects empty input', () => {
    const r = parseTyreSize('');
    expect(r.valid).toBe(false);
  });

  it('rejects garbage input', () => {
    const r = parseTyreSize('not-a-tyre');
    expect(r.valid).toBe(false);
  });

  it('rejects out-of-range width', () => {
    const r = parseTyreSize('50/55/R16');
    expect(r.valid).toBe(false);
  });

  it('rejects out-of-range rim', () => {
    const r = parseTyreSize('205/55/R50');
    expect(r.valid).toBe(false);
  });
});

describe('validateTyreSize', () => {
  it('returns valid: true for valid sizes', () => {
    expect(validateTyreSize('205/55/R16').valid).toBe(true);
  });

  it('returns valid: false with error for invalid sizes', () => {
    const r = validateTyreSize('garbage');
    expect(r.valid).toBe(false);
    expect(r.error).toBeDefined();
  });
});

describe('normalizeTyreSize', () => {
  it('normalizes valid sizes to canonical form', () => {
    expect(normalizeTyreSize('  205/55/r16  ')).toBe('205/55/R16');
  });

  it('falls back to trimmed uppercase for invalid input', () => {
    expect(normalizeTyreSize('  weird  ')).toBe('WEIRD');
  });
});

describe('regex patterns', () => {
  it('standard pattern matches 3-digit/2-3-digit/Rdigits', () => {
    expect(STANDARD_TYRE_SIZE_REGEX.test('205/55/R16')).toBe(true);
    expect(STANDARD_TYRE_SIZE_REGEX.test('155/R13')).toBe(false);
  });

  it('compact pattern matches 3-digit/Rdigits', () => {
    expect(COMPACT_TYRE_SIZE_REGEX.test('155/R13')).toBe(true);
    expect(COMPACT_TYRE_SIZE_REGEX.test('205/55/R16')).toBe(false);
  });
});
