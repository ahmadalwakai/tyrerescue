import { describe, expect, it } from 'vitest';
import {
  nativeMapCameraPlan, nativeMapHeading, nativeMapMarkerRotation, nativeRouteSegments,
  navigationMapAltitude, toNativeMapCoordinate,
} from '../../driver-app/src/lib/navigation/nativeMapModel';
import { buildAppleMapsNavigationUrl } from '../../driver-app/src/lib/navigation/apple-maps';

const driver = [-4.25, 55.86];
const customer = [-4.22, 55.87];
const road = [driver, [-4.24, 55.863], [-4.23, 55.866], customer];
const input = {
  driver, customer, route: road, followMode: 'heading_up' as const, following: true,
  heading: 120, depth: '3d' as const, zoom: 17.4, viewportHeight: 850,
  resetCamera: true, locationFresh: true,
};

describe('native navigation coordinate boundaries', () => {
  it('converts GeoJSON longitude-first to MapKit latitude fields without moving either pin', () => {
    expect(toNativeMapCoordinate(driver)).toEqual({ latitude: 55.86, longitude: -4.25 });
    expect(toNativeMapCoordinate(customer)).toEqual({ latitude: 55.87, longitude: -4.22 });
  });
  it.each([null, undefined, [], [0, 0], [181, 55], [-4, 91], ['-4', 55], [NaN, 55], [Infinity, 55], [55, -4, 1]])(
    'rejects a missing, zero, malformed, or impossible point %j', (value) => {
      expect(toNativeMapCoordinate(value)).toBeNull();
    },
  );
  it('keeps road geometry authoritative and does not connect either pin to a route', () => {
    const result = nativeRouteSegments(road.slice(1, 3));
    expect(result).toEqual([[{ longitude: -4.24, latitude: 55.863 }, { longitude: -4.23, latitude: 55.866 }]]);
    expect(result.flat()).not.toContainEqual(toNativeMapCoordinate(driver));
    expect(result.flat()).not.toContainEqual(toNativeMapCoordinate(customer));
  });
  it('breaks a corrupt route into independent segments rather than bridging the missing road', () => {
    expect(nativeRouteSegments([driver, road[1], null, road[2], customer])).toEqual([
      [toNativeMapCoordinate(driver), toNativeMapCoordinate(road[1])],
      [toNativeMapCoordinate(road[2]), toNativeMapCoordinate(customer)],
    ]);
  });
  it('drops isolated points and duplicate vertices without modifying the route payload', () => {
    const original = [driver, driver, road[1], null, customer];
    const copy = JSON.stringify(original);
    expect(nativeRouteSegments(original)).toHaveLength(1);
    expect(nativeRouteSegments(original)[0]).toHaveLength(2);
    expect(JSON.stringify(original)).toBe(copy);
    expect(nativeRouteSegments([driver, driver])).toEqual([]);
  });
  it('keeps an unknown OS course unknown and normalises valid course angles', () => {
    expect(nativeMapHeading(-1)).toBeNull();
    expect(nativeMapHeading(NaN)).toBeNull();
    expect(nativeMapHeading(undefined)).toBeNull();
    expect(nativeMapHeading(0)).toBe(0);
    expect(nativeMapHeading(390)).toBe(30);
  });
});

describe('MapKit marker bearings', () => {
  it.each([0, 90, 180, 270])('points to geographic heading %i on a north-up map', (heading) => {
    expect(nativeMapMarkerRotation(heading, 0)).toBe(heading);
  });
  it.each([0, 90, 180, 270, 359])('points forward when heading %i is at the top of the camera', (heading) => {
    expect(nativeMapMarkerRotation(heading, heading)).toBe(0);
  });
  it('compensates manual camera rotation, including crossing north', () => {
    expect(nativeMapMarkerRotation(90, 180)).toBe(270);
    expect(nativeMapMarkerRotation(10, 350)).toBe(20);
    expect(nativeMapMarkerRotation(350, 10)).toBe(340);
    expect(nativeMapMarkerRotation(0, 270)).toBe(90);
  });
  it('leaves an unknown driver direction unknown and normalises native bearings', () => {
    expect(nativeMapMarkerRotation(null, 90)).toBeNull();
    expect(nativeMapMarkerRotation(-1, 90)).toBeNull();
    expect(nativeMapMarkerRotation(Infinity, 90)).toBeNull();
    expect(nativeMapMarkerRotation(450, 390)).toBe(60);
    expect(nativeMapMarkerRotation(90, NaN)).toBe(90);
  });
});

describe('native navigation camera decisions', () => {
  it('uses the same accepted driver position and heading as the marker', () => {
    expect(nativeMapCameraPlan(input)).toMatchObject({
      mode: 'follow', center: { latitude: 55.86, longitude: -4.25 }, heading: 120, pitch: 48,
    });
    expect(nativeMapCameraPlan(input)).toHaveProperty('altitude');
  });
  it('uses MapKit altitude for an intentional recenter and preserves manual zoom on later fixes', () => {
    const reset = nativeMapCameraPlan(input);
    expect(reset).toHaveProperty('altitude');
    const update = nativeMapCameraPlan({ ...input, resetCamera: false });
    expect(update).not.toHaveProperty('altitude');
    expect(update).not.toHaveProperty('zoom');
  });
  it('honours north-up and two-dimensional modes independently', () => {
    expect(nativeMapCameraPlan({ ...input, followMode: 'north_up', depth: '2d' })).toMatchObject({
      heading: 0, pitch: 0,
    });
  });
  it.each(['heading_up', 'north_up', 'overview'] as const)(
    'does not override a driver pan while in %s', (followMode) => {
      expect(nativeMapCameraPlan({ ...input, followMode, following: false })).toEqual({ mode: 'idle' });
    },
  );
  it('stops chasing stale GPS until the driver explicitly recentres', () => {
    expect(nativeMapCameraPlan({ ...input, locationFresh: false, resetCamera: false })).toEqual({ mode: 'idle' });
    expect(nativeMapCameraPlan({ ...input, locationFresh: false, resetCamera: true })).toMatchObject({ mode: 'follow' });
  });
  it('shows only the real customer area while waiting for GPS and never fabricates a driver fix', () => {
    expect(nativeMapCameraPlan({ ...input, driver: null })).toEqual({
      mode: 'destination', center: { latitude: 55.87, longitude: -4.22 },
    });
    expect(nativeMapCameraPlan({ ...input, driver: null, resetCamera: false })).toEqual({ mode: 'idle' });
    expect(nativeMapCameraPlan({ ...input, driver: null, customer: null })).toEqual({ mode: 'idle' });
  });
  it('frames the route and actual destination in overview without changing road line geometry', () => {
    const original = JSON.stringify(road);
    const plan = nativeMapCameraPlan({ ...input, followMode: 'overview' });
    expect(plan.mode).toBe('overview');
    if (plan.mode !== 'overview') throw new Error('Expected overview');
    expect(plan.coordinates).toContainEqual(toNativeMapCoordinate(driver));
    expect(plan.coordinates).toContainEqual(toNativeMapCoordinate(customer));
    expect(JSON.stringify(road)).toBe(original);
  });
  it('uses a conservative area view when only one valid point is available for overview', () => {
    expect(nativeMapCameraPlan({ ...input, driver: null, route: null, followMode: 'overview' })).toEqual({
      mode: 'destination', center: { latitude: 55.87, longitude: -4.22 },
    });
    expect(nativeMapCameraPlan({ ...input, driver: [NaN, 55], customer: [0, 0], route: null, followMode: 'overview' }))
      .toEqual({ mode: 'idle' });
  });
  it('converts zoom into finite bounded MapKit altitude for phone rotation and bad measurements', () => {
    for (const zoom of [14, 17.4, 19, NaN, Infinity]) {
      for (const latitude of [-90, 0, 55.86, 90, NaN]) {
        const altitude = navigationMapAltitude(zoom, latitude, Infinity);
        expect(altitude).toBeGreaterThanOrEqual(120);
        expect(altitude).toBeLessThanOrEqual(5000);
      }
    }
    expect(navigationMapAltitude(18, 55.86, 850)).toBeLessThan(navigationMapAltitude(16, 55.86, 850));
  });
});

describe('external Apple Maps fallback', () => {
  it('uses official driving directions to the exact customer coordinate', () => {
    const url = new URL(buildAppleMapsNavigationUrl(customer, 'Different address')!);
    expect(url.origin).toBe('https://maps.apple.com');
    expect(url.searchParams.get('daddr')).toBe('55.87,-4.22');
    expect(url.searchParams.get('dirflg')).toBe('d');
  });
  it('searches the real address when no valid coordinate exists and never invents one', () => {
    const url = new URL(buildAppleMapsNavigationUrl([0, 0], '  3 Gateside Street, Glasgow  ')!);
    expect(url.searchParams.get('daddr')).toBe('3 Gateside Street, Glasgow');
    expect(buildAppleMapsNavigationUrl(null, '  ')).toBeNull();
  });
});
