import { describe, expect, it } from 'vitest';
import { createTrackingRequestScope, isTrackingLocationFresh } from '../../tyre-rescue/src/tracking-state';
import { latestDriverLocation } from '../tracking/location-sample';
import { bookingRepeatParams, recentCustomerVehicles } from '../../tyre-rescue/src/customer-vehicles';
import type { CustomerBookingSummary } from '../../tyre-rescue/src/customer-account';

const booking = (overrides: Partial<CustomerBookingSummary> = {}): CustomerBookingSummary => ({
  bookingId: 'booking-a', refNumber: 'TR-A', status: 'completed', bookingType: 'emergency', serviceType: 'replacement', addressLine: 'Private street',
  totalAmount: 12000, tyreSizeDisplay: '205/55 R16', tyreQuantity: 2, vehicleReg: 'AB12 CDE', vehicleMake: 'Ford', vehicleModel: 'Focus', scheduledAt: null, createdAt: null, invoiceDownloadToken: 'secret', ...overrides,
});

describe('customer tracking lifecycle', () => {
  it('rejects earlier reference and unmounted request results', () => {
    const scope = createTrackingRequestScope();
    const first = scope.begin();
    const second = scope.begin();
    expect(scope.current(first)).toBe(false);
    expect(scope.current(second)).toBe(true);
    scope.invalidate();
    expect(scope.current(second)).toBe(false);
  });
  it('does not treat missing, stale or future driver coordinates as live', () => {
    const now = Date.parse('2026-10-22T12:00:00Z');
    expect(isTrackingLocationFresh(null, now)).toBe(false);
    expect(isTrackingLocationFresh('2026-10-22T11:56:59Z', now)).toBe(false);
    expect(isTrackingLocationFresh('2026-10-22T12:00:31Z', now)).toBe(false);
    expect(isTrackingLocationFresh('2026-10-22T11:59:50Z', now)).toBe(true);
  });
  it('chooses the freshest complete location pair, preserving zeros and negatives', () => {
    const now = Date.parse('2026-10-22T12:00:00Z');
    const selected = latestDriverLocation([
      { lat: 55, lng: -4, updatedAt: new Date(now - 90_000) },
      { lat: '0', lng: '-1.123456', updatedAt: new Date(now - 5_000) },
      { lat: 56, lng: null, updatedAt: new Date(now) },
      { lat: 91, lng: 2, updatedAt: new Date(now) },
    ], now);
    expect(selected?.lat).toBe(0);
    expect(selected?.lng).toBe(-1.123456);
  });
});

describe('vehicle reuse', () => {
  it('reuses the vehicle and tyre details without price, invoice, payment or address', () => {
    const params = bookingRepeatParams(booking());
    expect(params).toEqual({ repeatRef: 'TR-A', vehicleReg: 'AB12 CDE', vehicleMake: 'Ford', vehicleModel: 'Focus', tyreSizeDisplay: '205/55 R16', tyreQuantity: '2', serviceType: 'replacement' });
    expect(params).not.toHaveProperty('totalAmount');
    expect(params).not.toHaveProperty('addressLine');
    expect(params).not.toHaveProperty('invoiceDownloadToken');
  });
  it('deduplicates registrations without spaces and retains the latest tyre size', () => {
    const newest = booking();
    expect(recentCustomerVehicles([newest, booking({ vehicleReg: 'ab12cde', tyreSizeDisplay: '185/55 R15' })])).toEqual([newest]);
  });
});
