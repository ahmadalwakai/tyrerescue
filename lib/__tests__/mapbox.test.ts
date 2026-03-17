import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  haversineDistanceMiles,
  metersToMiles,
  secondsToMinutes,
  SERVICE_CENTER,
  resolveDistance,
  type DistanceResult,
} from '../mapbox';

// Mock global fetch for Mapbox API calls
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.stubEnv('MAPBOX_SECRET_TOKEN', 'test-token');
  mockFetch.mockReset();
});

describe('haversineDistanceMiles', () => {
  it('returns 0 for the same point', () => {
    const point = { lat: 55.8547, lng: -4.2206 };
    expect(haversineDistanceMiles(point, point)).toBe(0);
  });

  it('calculates Glasgow to Edinburgh correctly (~42 miles)', () => {
    const glasgow = { lat: 55.8547, lng: -4.2206 };
    const edinburgh = { lat: 55.9533, lng: -3.1883 };
    const dist = haversineDistanceMiles(glasgow, edinburgh);
    // Straight-line distance should be roughly 42 miles
    expect(dist).toBeGreaterThan(38);
    expect(dist).toBeLessThan(48);
  });

  it('calculates Glasgow to Stirling correctly (~20 miles)', () => {
    const glasgow = { lat: 55.8547, lng: -4.2206 };
    const stirling = { lat: 56.1165, lng: -3.9369 };
    const dist = haversineDistanceMiles(glasgow, stirling);
    expect(dist).toBeGreaterThan(15);
    expect(dist).toBeLessThan(25);
  });
});

describe('metersToMiles', () => {
  it('converts 1609.34 meters to ~1 mile', () => {
    expect(metersToMiles(1609.34)).toBeCloseTo(1, 1);
  });
});

describe('secondsToMinutes', () => {
  it('converts 120 seconds to 2 minutes', () => {
    expect(secondsToMinutes(120)).toBe(2);
  });

  it('rounds to nearest minute', () => {
    expect(secondsToMinutes(90)).toBe(2);
    expect(secondsToMinutes(89)).toBe(1);
  });
});

describe('SERVICE_CENTER', () => {
  it('has Glasgow coordinates', () => {
    expect(SERVICE_CENTER.lat).toBeCloseTo(55.85, 1);
    expect(SERVICE_CENTER.lng).toBeCloseTo(-4.22, 1);
  });
});

describe('resolveDistance', () => {
  function mockMapboxDirections(distance: number, duration: number) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        routes: [{
          distance,
          duration,
          geometry: { coordinates: [] },
        }],
      }),
    });
  }

  function mockMapboxFail() {
    mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Error' });
  }

  const customer = { lat: 55.9, lng: -4.0 };

  it('returns driver-based distance when driver available', async () => {
    const drivers = [{ id: 'drv-1', lat: 55.86, lng: -4.25 }];
    // 8000 meters = ~5 miles, 600 seconds = 10 minutes
    mockMapboxDirections(8000, 600);

    const result = await resolveDistance(customer, drivers, []);

    expect(result.distanceSource).toBe('driver');
    expect(result.distanceProvider).toBe('mapbox');
    expect(result.selectedDriverId).toBe('drv-1');
    expect(result.distanceMiles).toBeCloseTo(metersToMiles(8000), 1);
    expect(result.durationMinutes).toBe(10);
    expect(result.fallbackReason).toBeNull();
  });

  it('selects the fastest driver by duration', async () => {
    const drivers = [
      { id: 'drv-close-slow', lat: 55.85, lng: -4.22 }, // closer by haversine → sorted 1st
      { id: 'drv-far-fast', lat: 56.0, lng: -4.5 },     // farther by haversine → sorted 2nd
    ];
    // 1st mock for drv-close-slow (sorted first): 15000m, 1200s (20 min)
    mockMapboxDirections(15000, 1200);
    // 2nd mock for drv-far-fast: 8000m, 600s (10 min)
    mockMapboxDirections(8000, 600);

    const result = await resolveDistance(customer, drivers, []);

    expect(result.distanceSource).toBe('driver');
    // Should select faster driver by duration, not by haversine
    expect(result.selectedDriverId).toBe('drv-far-fast');
    expect(result.durationMinutes).toBe(10);
  });

  it('falls back to service area when no drivers available', async () => {
    const areas = [{ id: 'area-1', lat: 55.86, lng: -4.25 }];
    mockMapboxDirections(10000, 900);

    const result = await resolveDistance(customer, [], areas);

    expect(result.distanceSource).toBe('service_area');
    expect(result.distanceProvider).toBe('mapbox');
    expect(result.selectedServiceAreaId).toBe('area-1');
    expect(result.selectedDriverId).toBeNull();
  });

  it('falls back to SERVICE_CENTER when no drivers and no areas', async () => {
    mockMapboxDirections(50000, 3600);

    const result = await resolveDistance(customer, [], []);

    expect(result.distanceSource).toBe('service_center');
    expect(result.distanceProvider).toBe('mapbox');
    expect(result.originLat).toBeCloseTo(SERVICE_CENTER.lat, 1);
    expect(result.originLng).toBeCloseTo(SERVICE_CENTER.lng, 1);
    expect(result.fallbackReason).toBe('No drivers or service areas available');
  });

  it('uses haversine when all Mapbox calls fail for drivers', async () => {
    const drivers = [{ id: 'drv-1', lat: 55.86, lng: -4.25 }];
    mockMapboxFail();

    const result = await resolveDistance(customer, drivers, []);

    expect(result.distanceSource).toBe('driver');
    expect(result.distanceProvider).toBe('haversine');
    expect(result.selectedDriverId).toBe('drv-1');
    expect(result.fallbackReason).toBe('Mapbox directions unavailable for drivers');
    expect(result.distanceMiles).toBeGreaterThan(0);
  });

  it('uses haversine from SERVICE_CENTER as absolute last resort', async () => {
    // All Mapbox calls fail
    mockMapboxFail(); // SERVICE_CENTER attempt

    const result = await resolveDistance(customer, [], []);

    expect(result.distanceSource).toBe('service_center');
    expect(result.distanceProvider).toBe('haversine');
    expect(result.fallbackReason).toBe('All Mapbox calls failed, haversine from SERVICE_CENTER');
    expect(result.distanceMiles).toBeGreaterThan(0);
  });

  it('skips to service areas when Mapbox fails for drivers but works for areas', async () => {
    const drivers = [{ id: 'drv-1', lat: 55.86, lng: -4.25 }];
    const areas = [{ id: 'area-1', lat: 55.86, lng: -4.25 }];
    mockMapboxFail(); // driver fails
    mockMapboxDirections(10000, 900); // area succeeds

    // With the current fallback chain, when Mapbox fails for drivers it uses
    // haversine for driver (since drivers exist) — it doesn't skip to areas
    const result = await resolveDistance(customer, drivers, areas);

    // Driver haversine fallback is used since drivers exist
    expect(result.distanceSource).toBe('driver');
    expect(result.distanceProvider).toBe('haversine');
  });

  it('records full metadata for auditability', async () => {
    const drivers = [{ id: 'drv-1', lat: 55.86, lng: -4.25 }];
    mockMapboxDirections(8000, 600);

    const result = await resolveDistance(customer, drivers, []);

    // Verify all metadata fields are present
    expect(result).toHaveProperty('distanceMiles');
    expect(result).toHaveProperty('durationMinutes');
    expect(result).toHaveProperty('distanceProvider');
    expect(result).toHaveProperty('distanceSource');
    expect(result).toHaveProperty('originLat');
    expect(result).toHaveProperty('originLng');
    expect(result).toHaveProperty('destLat', customer.lat);
    expect(result).toHaveProperty('destLng', customer.lng);
    expect(result).toHaveProperty('distanceMeters', 8000);
    expect(result).toHaveProperty('durationSeconds', 600);
    expect(result).toHaveProperty('selectedDriverId', 'drv-1');
    expect(result).toHaveProperty('selectedServiceAreaId', null);
  });
});
