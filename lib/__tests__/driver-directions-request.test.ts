import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDirections } from '../../driver-app/src/services/directions';

const origin = { lat: 55.86, lng: -4.25 };
const destination = { lat: 55.87, lng: -4.23 };

function response(routeOverrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      code: 'Ok',
      waypoints: [{ location: [-4.25, 55.86] }, { location: [-4.23, 55.87] }],
      routes: [
        {
          distance: 240,
          duration: 80,
          duration_typical: 70,
          geometry: {
            coordinates: [
              [-4.25, 55.86],
              [-4.24, 55.865],
              [-4.23, 55.87],
            ],
          },
          legs: [
            {
              annotation: {
                congestion: ['low', 'heavy'],
                congestion_numeric: [10, 88],
                distance: [120, 120],
                duration: [35, 45],
                speed: [3.4, 2.7],
                maxspeed: [
                  { speed: 30, unit: 'mph' },
                  { speed: 50, unit: 'km/h' },
                ],
              },
              steps: [
                {
                  distance: 20,
                  duration: 5,
                  name: 'Gateside Street',
                  driving_side: 'left',
                  maneuver: {
                    instruction: 'Head north on Gateside Street',
                    type: 'depart',
                    modifier: 'straight',
                    location: [-4.25, 55.86],
                  },
                  intersections: [
                    {
                      location: [-4.25, 55.86],
                      geometry_index: 0,
                      is_urban: true,
                      mapbox_streets_v8: { class: 'street' },
                    },
                  ],
                },
                {
                  distance: 220,
                  duration: 75,
                  name: 'M8',
                  driving_side: 'left',
                  maneuver: {
                    instruction: 'At the roundabout, take the 3rd exit onto M8',
                    type: 'roundabout',
                    modifier: 'right',
                    exit: 3,
                    location: [-4.24, 55.865],
                  },
                  intersections: [
                    {
                      location: [-4.24, 55.865],
                      geometry_index: 1,
                      in: 0,
                      out: 2,
                      bearings: [180, 270, 30],
                      entry: [true, false, true],
                      classes: ['motorway'],
                      mapbox_streets_v8: { class: 'motorway' },
                      lanes: [
                        { valid: true, active: true, valid_indication: 'right', indications: ['right'] },
                        { valid: false, active: false, indications: ['straight'] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          ...routeOverrides,
        },
      ],
    }),
  };
}

describe('driver Mapbox Directions request', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  });

  it('serializes the exact supported navigation query parameters', async () => {
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN = 'pk.test-token';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response() as Response);

    const result = await fetchDirections(origin, destination, undefined, 'ar', {
      avoid: { motorways: true, tolls: true, ferries: false },
    });

    expect('routes' in result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe(
      'https://api.mapbox.com/directions/v5/mapbox/driving-traffic/-4.25,55.86;-4.23,55.87',
    );
    expect(url.searchParams.get('geometries')).toBe('geojson');
    expect(url.searchParams.get('steps')).toBe('true');
    expect(url.searchParams.get('overview')).toBe('full');
    expect(url.searchParams.get('roundabout_exits')).toBe('true');
    expect(url.searchParams.get('voice_instructions')).toBe('true');
    expect(url.searchParams.get('banner_instructions')).toBe('true');
    expect(url.searchParams.get('alternatives')).toBe('true');
    expect(url.searchParams.get('annotations')).toBe(
      'congestion,congestion_numeric,distance,duration,speed,maxspeed',
    );
    expect(url.searchParams.get('language')).toBe('ar');
    expect(url.searchParams.get('access_token')).toBe('pk.test-token');
    expect(url.searchParams.get('exclude')).toBe('motorway,toll');
    expect(url.searchParams.has('continue_straight')).toBe(false);
    expect(url.searchParams.has('waypoints')).toBe(false);
    expect(url.searchParams.has('bearings')).toBe(false);
    expect(url.searchParams.has('approaches')).toBe(false);
  });

  it('parses maxspeed, lanes, road class, and roundabout exit from Mapbox fields', async () => {
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN = 'pk.test-token';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response() as Response);

    const result = await fetchDirections(origin, destination);
    expect('routes' in result).toBe(true);
    if (!('routes' in result)) return;

    const route = result.routes[0];
    expect(route.maxspeeds).toEqual([
      { speed: 30, unit: 'mph', unknown: false, none: false, source: 'mapbox-maxspeed' },
      { speed: 50, unit: 'km/h', unknown: false, none: false, source: 'mapbox-maxspeed' },
    ]);
    expect(route.congestion).toEqual(['low', 'heavy']);
    expect(route.steps[1].exit).toBe(3);
    expect(route.steps[1].roadClass).toBe('motorway');
    expect(route.steps[1].intersections[0].inIndex).toBe(0);
    expect(route.steps[1].intersections[0].outIndex).toBe(2);
    expect(route.steps[1].intersections[0].bearings).toEqual([180, 270, 30]);
    expect(route.steps[1].intersections[0].entry).toEqual([true, false, true]);
    expect(route.steps[1].lanes).toEqual([
      { valid: true, active: true, validIndication: 'right', indications: ['right'] },
      { valid: false, active: false, validIndication: null, indications: ['straight'] },
    ]);
  });

  it('uses the maneuver intersection for lanes instead of the first lane-bearing intersection', async () => {
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN = 'pk.test-token';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        legs: [
          {
            annotation: {
              maxspeed: [{ speed: 30, unit: 'mph' }, { speed: 30, unit: 'mph' }],
            },
            steps: [
              {
                distance: 220,
                duration: 75,
                name: 'M8',
                driving_side: 'left',
                maneuver: {
                  instruction: 'Turn right onto M8',
                  type: 'turn',
                  modifier: 'right',
                  location: [-4.24, 55.865],
                },
                intersections: [
                  {
                    location: [-4.245, 55.862],
                    geometry_index: 0,
                    in: 0,
                    out: 1,
                    lanes: [
                      { valid: true, active: true, valid_indication: 'left', indications: ['left'] },
                    ],
                  },
                  {
                    location: [-4.24, 55.865],
                    geometry_index: 1,
                    in: 1,
                    out: 2,
                    lanes: [
                      { valid: false, active: false, indications: ['left'] },
                      { valid: true, active: true, valid_indication: 'right', indications: ['right'] },
                      { valid: true, active: false, valid_indication: 'right', indications: ['straight', 'right'] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }) as Response,
    );

    const result = await fetchDirections(origin, destination);
    expect('routes' in result).toBe(true);
    if (!('routes' in result)) return;

    expect(result.routes[0].steps[0].intersections[1].inIndex).toBe(1);
    expect(result.routes[0].steps[0].intersections[1].outIndex).toBe(2);
    expect(result.routes[0].steps[0].lanes.map((lane) => lane.indications)).toEqual([
      ['left'],
      ['right'],
      ['straight', 'right'],
    ]);
    expect(result.routes[0].steps[0].lanes[1].active).toBe(true);
  });

  it('does not show lanes when the selected maneuver intersection has none', async () => {
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN = 'pk.test-token';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        legs: [
          {
            annotation: {
              maxspeed: [{ speed: 30, unit: 'mph' }, { speed: 30, unit: 'mph' }],
            },
            steps: [
              {
                distance: 220,
                duration: 75,
                name: 'M8',
                driving_side: 'left',
                maneuver: {
                  instruction: 'Turn right onto M8',
                  type: 'turn',
                  modifier: 'right',
                  location: [-4.24, 55.865],
                },
                intersections: [
                  {
                    location: [-4.245, 55.862],
                    geometry_index: 0,
                    lanes: [
                      { valid: true, active: true, valid_indication: 'left', indications: ['left'] },
                    ],
                  },
                  {
                    location: [-4.24, 55.865],
                    geometry_index: 1,
                    in: 1,
                    out: 2,
                  },
                ],
              },
            ],
          },
        ],
      }) as Response,
    );

    const result = await fetchDirections(origin, destination);
    expect('routes' in result).toBe(true);
    if (!('routes' in result)) return;
    expect(result.routes[0].steps[0].lanes).toEqual([]);
  });

  it('combines steps and annotations across multiple Mapbox legs', async () => {
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN = 'pk.test-token';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        geometry: {
          coordinates: [
            [-4.25, 55.86],
            [-4.245, 55.862],
            [-4.24, 55.865],
            [-4.23, 55.87],
          ],
        },
        legs: [
          {
            annotation: {
              congestion: ['low'],
              maxspeed: [{ speed: 30, unit: 'mph' }],
            },
            steps: [
              {
                distance: 100,
                duration: 30,
                name: 'Gateside Street',
                maneuver: {
                  instruction: 'Head north',
                  type: 'depart',
                  modifier: 'straight',
                  location: [-4.25, 55.86],
                },
              },
            ],
          },
          {
            annotation: {
              congestion: ['moderate', 'heavy'],
              maxspeed: [
                { speed: 40, unit: 'mph' },
                { unknown: true },
              ],
            },
            steps: [
              {
                distance: 140,
                duration: 50,
                name: 'M8',
                maneuver: {
                  instruction: 'Merge onto M8',
                  type: 'merge',
                  modifier: 'right',
                  location: [-4.24, 55.865],
                },
              },
            ],
          },
        ],
      }) as Response,
    );

    const result = await fetchDirections(origin, destination);
    expect('routes' in result).toBe(true);
    if (!('routes' in result)) return;
    expect(result.routes[0].steps.map((step) => step.instruction)).toEqual([
      'Head north',
      'Merge onto M8',
    ]);
    expect(result.routes[0].congestion).toEqual(['low', 'moderate', 'heavy']);
    expect(result.routes[0].maxspeeds).toEqual([
      { speed: 30, unit: 'mph', unknown: false, none: false, source: 'mapbox-maxspeed' },
      { speed: 40, unit: 'mph', unknown: false, none: false, source: 'mapbox-maxspeed' },
      { speed: null, unit: null, unknown: true, none: false, source: 'mapbox-maxspeed' },
    ]);
  });

  it('keeps unknown, none, and malformed maxspeed values unavailable', async () => {
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN = 'pk.test-token';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        legs: [
          {
            annotation: {
              maxspeed: [
                { unknown: true },
                { none: true },
                { speed: 40, unit: 'yards-per-hour' },
              ],
            },
            steps: [
              {
                distance: 1,
                duration: 1,
                maneuver: {
                  instruction: 'Head north',
                  type: 'depart',
                  location: [-4.25, 55.86],
                },
              },
            ],
          },
        ],
      }) as Response,
    );

    const result = await fetchDirections(origin, destination);
    expect('routes' in result).toBe(true);
    if (!('routes' in result)) return;
    expect(result.routes[0].maxspeeds).toEqual([
      { speed: null, unit: null, unknown: true, none: false, source: 'mapbox-maxspeed' },
      { speed: null, unit: null, unknown: false, none: true, source: 'mapbox-maxspeed' },
      { speed: null, unit: null, unknown: true, none: false, source: 'mapbox-maxspeed' },
    ]);
  });
});
