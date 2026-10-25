import { describe, expect, it } from 'vitest';
import { readProtectedNavigationResponse } from '../../driver-app/src/lib/navigation/protectedNavigation';

const origin = { lat: 55, lng: -4 }, destination = { lat: 55, lng: -3.998 };
const fixture = () => ({
  bookingRef: 'TEST-ROUTE', source: 'mapbox', customerLocation: destination,
  navigation: { version: 1, routes: [{
    geometry: [[-4, 55], [-3.999, 55], [-3.998, 55]], distanceMeters: 130, durationSeconds: 40,
    steps: [{ instruction: 'Head east', location: [-4, 55] }],
  }] },
});
const read = (value: unknown) => readProtectedNavigationResponse(value, 'TEST-ROUTE', origin, destination);

describe('driver protected navigation response validation', () => {
  it('accepts only the real assigned booking road payload and preserves its geometry', () => {
    const body = fixture();
    expect(read(body)).toEqual({ routes: body.navigation.routes });
  });
  it.each([null, '<html>Sign in</html>', {}, { ...fixture(), bookingRef: 'DIFFERENT-BOOKING' },
    { ...fixture(), source: 'haversine' }, { ...fixture(), navigation: null },
    { ...fixture(), customerLocation: { lat: 56, lng: -3.998 } },
    { ...fixture(), navigation: { ...fixture().navigation, version: 2 } },
  ])('rejects missing, legacy, unrelated, moved, and incompatible guidance %j', (value) => {
    expect(read(value)).toHaveProperty('error.kind', 'no-route');
    expect(read(value)).not.toHaveProperty('routes');
  });
  it('rejects invalid customer and turn coordinates without crashing the navigation screen', () => {
    const body = fixture(); body.navigation.routes[0].steps[0].location = [181, 55];
    expect(read(body)).toHaveProperty('error.kind', 'no-route');
    expect(read({ ...fixture(), customerLocation: { lat: 0, lng: 0 } })).toHaveProperty('error.kind', 'no-route');
  });
  it('does not use a provider line with missing steps or geometry belonging to another location', () => {
    const body = fixture(); body.navigation.routes[0].steps = [];
    expect(read(body)).toHaveProperty('error.kind', 'no-route');
    const wrong = fixture(); wrong.navigation.routes[0].geometry = [[-3, 55], [-2.999, 55], [-2.998, 55]];
    expect(read(wrong)).toHaveProperty('error.kind', 'no-route');
  });
});
