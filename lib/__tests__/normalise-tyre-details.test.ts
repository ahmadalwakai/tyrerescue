import { describe, it, expect } from 'vitest';
import {
  normaliseTyreDetailsFromDb,
  hasValidTyreDetails,
  isRepairOrAssessService,
  formatGBP,
  type BookingTyreSourceFields,
  type RawBookingTyreRow,
} from '../bookings/normalise-tyre-details';

function booking(overrides: Partial<BookingTyreSourceFields> = {}): BookingTyreSourceFields {
  return {
    tyreSizeDisplay: null,
    quantity: 1,
    lockingNutStatus: null,
    serviceType: 'tyre_replacement',
    notes: null,
    ...overrides,
  };
}

function tyreRow(overrides: Partial<RawBookingTyreRow> = {}): RawBookingTyreRow {
  return {
    brand: 'Budget',
    pattern: 'Budget 205/40R18',
    sizeDisplay: '205/40R18',
    width: 205,
    aspect: 40,
    rim: 18,
    quantity: 1,
    unitPrice: '90.00',
    service: 'fit',
    ...overrides,
  };
}

describe('normaliseTyreDetailsFromDb', () => {
  it('returns item with quantity 1 and correct label for a selected tyre (working booking)', () => {
    const result = normaliseTyreDetailsFromDb(
      booking({ tyreSizeDisplay: '205/40/R18', quantity: 1 }),
      [tyreRow()],
    );

    expect(result.items).toHaveLength(1);
    expect(result.quantity).toBe(1);
    expect(result.items[0].brand).toBe('Budget');
    expect(result.items[0].model).toBe('Budget 205/40R18');
    expect(result.items[0].size).toBe('205/40R18');
    expect(result.items[0].price).toBe(90);
    expect(result.items[0].service).toBe('fit');
  });

  it('uses sizeDisplay from tyreProducts row when booking tyreSizeDisplay is null', () => {
    const result = normaliseTyreDetailsFromDb(booking({ tyreSizeDisplay: null, quantity: 1 }), [
      tyreRow({ sizeDisplay: '205/55R16' }),
    ]);
    expect(result.size).toBeUndefined();
    expect(result.items[0].size).toBe('205/55R16');
  });

  it('falls back to width/aspect/rim when sizeDisplay is null', () => {
    const result = normaliseTyreDetailsFromDb(booking(), [
      tyreRow({ sizeDisplay: null, width: 205, aspect: 55, rim: 16 }),
    ]);
    expect(result.items[0].size).toBe('205/55R16');
  });

  it('returns quantity from booking when items list is empty (repair booking)', () => {
    const result = normaliseTyreDetailsFromDb(
      booking({ serviceType: 'puncture_repair', quantity: 1, tyreSizeDisplay: '205/40R18' }),
      [],
    );

    expect(result.items).toHaveLength(0);
    expect(result.quantity).toBe(1);
    expect(result.size).toBe('205/40R18');
  });

  it('returns quantity 0 when items empty and booking.quantity is 0 (old orphan booking)', () => {
    const result = normaliseTyreDetailsFromDb(
      booking({ serviceType: 'tyre_replacement', quantity: 0, tyreSizeDisplay: null }),
      [],
    );
    expect(result.items).toHaveLength(0);
    expect(result.quantity).toBe(0);
  });

  it('does not overwrite tyre items when Stripe payment fields change (simulate webhook)', () => {
    // Webhook only updates booking status/paymentType; tyre rows are unchanged.
    // This test verifies the normaliser still reads tyre rows correctly after a payment.
    const result = normaliseTyreDetailsFromDb(
      booking({ serviceType: 'tyre_replacement', quantity: 1 }),
      [tyreRow({ quantity: 1, unitPrice: '90.00' })],
    );
    expect(result.items).toHaveLength(1);
    expect(result.quantity).toBe(1);
  });

  it('reads hasLockingNutKey correctly', () => {
    const withKey = normaliseTyreDetailsFromDb(
      booking({ lockingNutStatus: 'has_key' }),
      [],
    );
    expect(withKey.hasLockingNutKey).toBe(true);

    const noKey = normaliseTyreDetailsFromDb(
      booking({ lockingNutStatus: 'no_key' }),
      [],
    );
    expect(noKey.hasLockingNutKey).toBe(false);

    const standard = normaliseTyreDetailsFromDb(
      booking({ lockingNutStatus: 'standard' }),
      [],
    );
    expect(standard.hasLockingNutKey).toBeNull();

    const missing = normaliseTyreDetailsFromDb(
      booking({ lockingNutStatus: null }),
      [],
    );
    expect(missing.hasLockingNutKey).toBeNull();
  });

  it('extracts fitting location from notes', () => {
    const shop = normaliseTyreDetailsFromDb(
      booking({ notes: 'Something\nFitting location: shop' }),
      [],
    );
    expect(shop.fittingLocation).toBe('shop');

    const mobile = normaliseTyreDetailsFromDb(
      booking({ notes: 'Fitting location: mobile' }),
      [],
    );
    expect(mobile.fittingLocation).toBe('mobile');

    const none = normaliseTyreDetailsFromDb(booking({ notes: 'No special notes' }), []);
    expect(none.fittingLocation).toBeNull();
  });

  it('sums quantity across multiple tyre rows', () => {
    const result = normaliseTyreDetailsFromDb(booking({ quantity: 2 }), [
      tyreRow({ quantity: 1 }),
      tyreRow({ quantity: 1, brand: 'Premium', pattern: 'PremiumX' }),
    ]);
    expect(result.items).toHaveLength(2);
    expect(result.quantity).toBe(2);
  });
});

describe('hasValidTyreDetails', () => {
  it('is true when items exist', () => {
    const result = normaliseTyreDetailsFromDb(booking(), [tyreRow()]);
    expect(hasValidTyreDetails(result)).toBe(true);
  });

  it('is true when size + quantity > 0 even with no items', () => {
    const result = normaliseTyreDetailsFromDb(
      booking({ tyreSizeDisplay: '205/40R18', quantity: 1, serviceType: 'puncture_repair' }),
      [],
    );
    expect(hasValidTyreDetails(result)).toBe(true);
  });

  it('is false for an old booking with no tyre data', () => {
    const result = normaliseTyreDetailsFromDb(
      booking({ tyreSizeDisplay: null, quantity: 0 }),
      [],
    );
    expect(hasValidTyreDetails(result)).toBe(false);
  });
});

describe('isRepairOrAssessService', () => {
  it('returns true for wizard values', () => {
    expect(isRepairOrAssessService('repair')).toBe(true);
    expect(isRepairOrAssessService('assess')).toBe(true);
  });

  it('returns true for admin quick-book mapped values', () => {
    expect(isRepairOrAssessService('puncture_repair')).toBe(true);
    expect(isRepairOrAssessService('locking_nut_removal')).toBe(true);
  });

  it('returns false for fit/replacement services', () => {
    expect(isRepairOrAssessService('fit')).toBe(false);
    expect(isRepairOrAssessService('tyre_replacement')).toBe(false);
    expect(isRepairOrAssessService('both')).toBe(false);
  });
});

describe('formatGBP', () => {
  it('formats a number to GBP', () => {
    expect(formatGBP(90)).toBe('£90.00');
    expect(formatGBP(479.59)).toBe('£479.59');
    expect(formatGBP(0)).toBe('£0.00');
  });

  it('accepts a string', () => {
    expect(formatGBP('90.00')).toBe('£90.00');
  });
});
