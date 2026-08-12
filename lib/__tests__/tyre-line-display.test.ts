import { describe, expect, it } from 'vitest';

import {
  applyPrimaryTyreEditToSnapshot,
  formatTyreDisplayLine,
  resolveBookingTyreDisplay,
  totalTyreLineQuantity,
} from '../bookings/tyre-line-display';

describe('booking tyre-line display adapter', () => {
  it('uses canonical snapshot tyre lines before conflicting booking rows or legacy fields', () => {
    const resolved = resolveBookingTyreDisplay({
      priceSnapshot: {
        tyreLines: [
          { normalizedSize: '205/55R16', quantity: 1, axle: 'front', loadIndex: '91', speedIndex: 'V' },
          { normalizedSize: '225/45R17', quantity: 2, axle: 'rear', runFlat: true },
        ],
      },
      tyreRows: [{ sizeDisplay: '195/55R16', quantity: 4, brand: 'Wrong' }],
      tyreSizeDisplay: '175/65R14',
      quantity: 1,
    });

    expect(resolved.source).toBe('canonical');
    expect(resolved.lines.map(formatTyreDisplayLine)).toEqual([
      'Front: 205/55R16 91V x1',
      'Rear: 225/45R17 run-flat x2',
    ]);
    expect(totalTyreLineQuantity(resolved.lines)).toBe(3);
  });

  it('falls back when the canonical array is malformed', () => {
    const resolved = resolveBookingTyreDisplay({
      priceSnapshot: { tyreLines: [{ normalizedSize: 'not-a-size', quantity: 2 }] },
      tyreRows: [{ sizeDisplay: '205/55R16', quantity: 1, brand: 'Budget', pattern: 'B1' }],
      tyreSizeDisplay: '175/65R14',
      quantity: 2,
    });

    expect(resolved.source).toBe('booking_tyres');
    expect(resolved.lines.map(formatTyreDisplayLine)).toEqual(['205/55R16 - Budget B1 x1']);
  });

  it('edits only the first canonical tyre line and preserves the rest of the snapshot', () => {
    const snapshot = {
      subtotal: 200,
      tyreLines: [
        { id: 'front', normalizedSize: '205/55R16', quantity: 1, axle: 'front' },
        { id: 'rear', normalizedSize: '225/45R17', quantity: 2, axle: 'rear', xl: true },
      ],
      metadata: { keep: true },
    };

    const result = applyPrimaryTyreEditToSnapshot(snapshot, {
      tyreSizeDisplay: '215/50R17',
      quantity: 3,
    });

    expect(result.usedCanonical).toBe(true);
    expect(result.tyreSizeDisplay).toBe('215/50R17');
    expect(result.quantity).toBe(5);
    expect(result.priceSnapshot).toEqual({
      subtotal: 200,
      tyreLines: [
        { id: 'front', normalizedSize: '215/50R17', quantity: 3, axle: 'front' },
        { id: 'rear', normalizedSize: '225/45R17', quantity: 2, axle: 'rear', xl: true },
      ],
      metadata: { keep: true },
    });
  });
});
