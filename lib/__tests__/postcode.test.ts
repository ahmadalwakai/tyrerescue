import { describe, expect, it } from 'vitest';
import {
  WORKSHOP_COORDS,
  haversineMiles,
  normalizePostcode,
  validateUkPostcode,
} from '@/lib/postcode';

describe('validateUkPostcode', () => {
  it.each([
    'G31 1PD',
    'g311pd',
    'EH1 1YZ',
    'M1 1AA',
    'M60 1NW',
    'CR2 6XH',
    'DN55 1PT',
    'W1A 1HQ',
    'EC1A 1BB',
    '  SW1A 2AA  ',
  ])('accepts %s', (pc) => {
    expect(validateUkPostcode(pc)).toBe(true);
  });

  it.each(['', '   ', 'ABC', '12345', '123 456', 'G311PDX', 'NOT A POSTCODE'])(
    'rejects %s',
    (pc) => {
      expect(validateUkPostcode(pc)).toBe(false);
    }
  );
});

describe('normalizePostcode', () => {
  it('uppercases and adds the canonical single space', () => {
    expect(normalizePostcode('g311pd')).toBe('G31 1PD');
    expect(normalizePostcode('  g31  1pd  ')).toBe('G31 1PD');
    expect(normalizePostcode('G31 1PD')).toBe('G31 1PD');
    expect(normalizePostcode('sw1a2aa')).toBe('SW1A 2AA');
    expect(normalizePostcode('m11ae')).toBe('M1 1AE');
  });
});

describe('haversineMiles', () => {
  it('returns 0 for identical points', () => {
    const { lat, lng } = WORKSHOP_COORDS;
    expect(haversineMiles(lat, lng, lat, lng)).toBeCloseTo(0, 5);
  });

  it('matches the known Glasgow → Edinburgh distance (~41 miles)', () => {
    // EH1 1YZ ≈ 55.9521, -3.1965
    const d = haversineMiles(
      WORKSHOP_COORDS.lat,
      WORKSHOP_COORDS.lng,
      55.9521,
      -3.1965
    );
    expect(d).toBeGreaterThan(38);
    expect(d).toBeLessThan(45);
  });

  it('is symmetric', () => {
    const a = haversineMiles(55.86, -4.22, 51.5, -0.12);
    const b = haversineMiles(51.5, -0.12, 55.86, -4.22);
    expect(a).toBeCloseTo(b, 6);
  });
});
