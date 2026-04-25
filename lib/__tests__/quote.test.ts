import { describe, expect, it } from 'vitest';
import { calculateQuote, isNightTime } from '@/lib/quote';
import type { TyreSize } from '@/types/vehicle';

const SIZE_16: TyreSize = { width: '205', aspect: '55', rim: '16' };
const SIZE_18_LOWPRO: TyreSize = { width: '235', aspect: '40', rim: '18' };

const DAY = new Date('2026-04-25T14:00:00');
const NIGHT = new Date('2026-04-25T23:30:00');
const EARLY = new Date('2026-04-25T05:00:00');

describe('calculateQuote', () => {
  it('returns a positive range for a single budget fitting on a 16" wheel', () => {
    const q = calculateQuote({ tyreSize: SIZE_16, service: 'fitting', quantity: 1 });
    expect(q.from).toBeGreaterThan(0);
    expect(q.to).toBeGreaterThan(q.from);
    expect(q.fittingFee).toBe(20);
    expect(q.currency).toBe('GBP');
    expect(q.breakdown.length).toBeGreaterThan(0);
  });

  it('scales linearly with quantity', () => {
    const one = calculateQuote({ tyreSize: SIZE_16, service: 'fitting', quantity: 1 });
    const two = calculateQuote({ tyreSize: SIZE_16, service: 'fitting', quantity: 2 });
    expect(two.from).toBe(one.from * 2);
    expect(two.to).toBe(one.to * 2);
  });

  it('emergency callout uses the higher fitting fee (£49)', () => {
    const e = calculateQuote({ tyreSize: SIZE_16, service: 'emergency', quantity: 1 }, DAY);
    const f = calculateQuote({ tyreSize: SIZE_16, service: 'fitting', quantity: 1 }, DAY);
    expect(e.fittingFee).toBe(49);
    expect(e.from).toBeGreaterThan(f.from);
    expect(e.notes.some((n) => /emergency/i.test(n))).toBe(true);
    expect(e.surcharge).toBeUndefined();
  });

  it('puncture repair returns a flat band independent of size', () => {
    const small = calculateQuote({
      tyreSize: { width: '175', aspect: '65', rim: '14' },
      service: 'punctureRepair',
      quantity: 1,
    });
    const big = calculateQuote({
      tyreSize: { width: '255', aspect: '45', rim: '19' },
      service: 'punctureRepair',
      quantity: 1,
    });
    expect(small.from).toBe(big.from);
    expect(small.to).toBe(big.to);
  });

  it('flags a 20% premium for 17"+ rims', () => {
    const r17 = calculateQuote({
      tyreSize: { width: '225', aspect: '45', rim: '17' },
      service: 'fitting',
      quantity: 1,
    });
    expect(r17.notes.some((n) => /20%/.test(n))).toBe(true);
  });

  it('flags a run-flat / low-profile note for ≤40 series on 18"+', () => {
    const q = calculateQuote({ tyreSize: SIZE_18_LOWPRO, service: 'fitting', quantity: 1 });
    expect(q.notes.some((n) => /run-flat|low-profile/i.test(n))).toBe(true);
  });

  it('clamps quantity to 1..4', () => {
    expect(calculateQuote({ tyreSize: SIZE_16, service: 'fitting', quantity: 0 }).quantity).toBe(1);
    expect(calculateQuote({ tyreSize: SIZE_16, service: 'fitting', quantity: 99 }).quantity).toBe(4);
    expect(
      calculateQuote({ tyreSize: SIZE_16, service: 'fitting', quantity: 2.7 }).quantity
    ).toBe(2);
  });
});

describe('isNightTime', () => {
  it('treats 22:00–05:59 local as night', () => {
    expect(isNightTime(NIGHT)).toBe(true);
    expect(isNightTime(EARLY)).toBe(true);
    expect(isNightTime(new Date('2026-04-25T22:00:00'))).toBe(true);
    expect(isNightTime(new Date('2026-04-25T05:59:00'))).toBe(true);
  });

  it('treats 06:00–21:59 local as daytime', () => {
    expect(isNightTime(DAY)).toBe(false);
    expect(isNightTime(new Date('2026-04-25T06:00:00'))).toBe(false);
    expect(isNightTime(new Date('2026-04-25T21:59:00'))).toBe(false);
  });
});

describe('calculateQuote night surcharge', () => {
  it('applies +15% night surcharge to emergency at night', () => {
    const day = calculateQuote({ tyreSize: SIZE_16, service: 'emergency', quantity: 1 }, DAY);
    const night = calculateQuote({ tyreSize: SIZE_16, service: 'emergency', quantity: 1 }, NIGHT);
    expect(night.surcharge).toBeDefined();
    expect(night.surcharge?.multiplier).toBe(1.15);
    expect(night.from).toBe(Math.round(day.from * 1.15));
    expect(night.to).toBe(Math.round(day.to * 1.15));
    expect(night.notes.some((n) => /night surcharge/i.test(n))).toBe(true);
  });

  it('does NOT apply night surcharge to fitting service at night', () => {
    const night = calculateQuote({ tyreSize: SIZE_16, service: 'fitting', quantity: 1 }, NIGHT);
    expect(night.surcharge).toBeUndefined();
  });

  it('does NOT apply night surcharge to puncture repair at night', () => {
    const night = calculateQuote(
      { tyreSize: SIZE_16, service: 'punctureRepair', quantity: 1 },
      NIGHT
    );
    expect(night.surcharge).toBeUndefined();
  });

  it('does NOT apply night surcharge to emergency during the day', () => {
    const day = calculateQuote({ tyreSize: SIZE_16, service: 'emergency', quantity: 1 }, DAY);
    expect(day.surcharge).toBeUndefined();
  });
});
