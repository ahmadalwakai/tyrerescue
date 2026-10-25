import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDriverNavigationDirections } from '../driver-navigation-directions';
import { parseMapboxDirectionsPayload } from '../../driver-app/src/services/directions';

const origin = { lat: 55, lng: -4 };
const destination = { lat: 55, lng: -3.998 };
const credential = 'sk.synthetic_navigation_test_only';
const payload = () => ({
  code: 'Ok',
  waypoints: [{ location: [-4, 55] }, { location: [-3.998, 55] }],
  routes: [{
    distance: 130, duration: 40, duration_typical: 35,
    geometry: { coordinates: [[-4, 55], [-3.999, 55], [-3.998, 55]] },
    legs: [{ steps: [
      { distance: 130, duration: 40, name: 'Customer road', driving_side: 'left', maneuver: { type: 'depart', instruction: 'Head east', location: [-4, 55] } },
      { distance: 0, duration: 0, name: 'Customer road', driving_side: 'left', maneuver: { type: 'arrive', instruction: 'You have arrived', location: [-3.998, 55] } },
    ] }],
  }],
});

describe('server-owned driver road guidance', () => {
  beforeEach(() => {
    vi.stubEnv('MAPBOX_SECRET_TOKEN', credential);
    vi.stubEnv('NEXT_PUBLIC_MAPBOX_TOKEN', '');
    vi.stubEnv('EXPO_PUBLIC_MAPBOX_TOKEN', '');
    vi.stubEnv('MAPBOX_TOKEN', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('requests real road steps, alternatives, lane/speed annotations, and driver language with a server-only credential', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload()), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const result = await getDriverNavigationDirections(origin, destination, { language: 'ar', avoid: { motorways: true, tolls: true } });
    expect(result).toHaveProperty('routes');
    if (!('routes' in result)) throw new Error('Expected usable road routes');
    expect(result.routes[0].steps[0].instruction).toBe('Head east');
    expect(result.routes[0].steps[0].drivingSide).toBe('left');
    expect(result.routes[0].geometry).toEqual(payload().routes[0].geometry.coordinates);
    expect(JSON.stringify(result)).not.toContain(credential);
    const request = new URL(fetch.mock.calls[0][0]);
    expect(request.origin).toBe('https://api.mapbox.com');
    expect(request.pathname).toContain('/driving-traffic/-4,55;-3.998,55');
    expect(request.searchParams.get('steps')).toBe('true');
    expect(request.searchParams.get('language')).toBe('ar');
    expect(request.searchParams.get('exclude')).toBe('motorway,toll');
    expect(request.searchParams.get('annotations')).toContain('maxspeed');
    expect(fetch.mock.calls[0][1].cache).toBe('no-store');
  });
  it('rejects invalid coordinates before contacting the provider', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect(await getDriverNavigationDirections({ lat: 91, lng: -4 }, destination)).toHaveProperty('error.kind', 'invalid-coords');
    expect(await getDriverNavigationDirections(origin, { lat: 0, lng: 0 })).toHaveProperty('error.kind', 'invalid-coords');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('fails clearly when no configured provider credential exists, without fabricating a line or maneuver', async () => {
    vi.stubEnv('MAPBOX_SECRET_TOKEN', '');
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const result = await getDriverNavigationDirections(origin, destination);
    expect(result).toHaveProperty('error.kind', 'api');
    expect(result).not.toHaveProperty('routes');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])('does not expose provider failure bodies or credentials for HTTP %i', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`Sensitive upstream URL ${credential}`, { status })));
    const result = await getDriverNavigationDirections(origin, destination);
    expect(result).toHaveProperty('error.kind', 'api');
    expect(JSON.stringify(result)).not.toContain(credential);
    expect(result).not.toHaveProperty('routes');
  });
  it('rejects corrupt or unrelated geometry rather than extending it to the customer or driver', async () => {
    const wrong = payload(); wrong.routes[0].geometry.coordinates = [[-3, 55], [-2.999, 55], [-2.998, 55]];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(wrong))));
    expect(await getDriverNavigationDirections(origin, destination)).toHaveProperty('error.kind', 'no-route');
    const corrupt = payload(); corrupt.routes[0].geometry.coordinates[1] = [181, 55];
    expect(parseMapboxDirectionsPayload(corrupt)).toHaveProperty('error.kind', 'no-route');
  });
  it('requires provider-supplied maneuvers instead of inventing turn-by-turn instructions from a line', () => {
    const noSteps = payload(); noSteps.routes[0].legs[0].steps = [];
    expect(parseMapboxDirectionsPayload(noSteps)).toHaveProperty('error.kind', 'no-route');
    expect(parseMapboxDirectionsPayload({ code: 'NoRoute', message: credential })).not.toHaveProperty('routes');
  });
  it('aborts a stalled provider after eight seconds and returns an honest unavailable state', async () => {
    vi.useFakeTimers();
    let aborted = false;
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => { aborted = true; reject(new Error('Aborted')); });
    })));
    const pending = getDriverNavigationDirections(origin, destination);
    await vi.advanceTimersByTimeAsync(8_001);
    expect(await pending).toHaveProperty('error.kind', 'network');
    expect(aborted).toBe(true);
  });
});
