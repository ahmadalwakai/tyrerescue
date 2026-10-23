/** Shared, platform-free validation for the native navigation map. */
export interface NativeMapCoordinate {
  latitude: number;
  longitude: number;
}

export type NavigationMapMode = 'north_up' | 'heading_up' | 'overview';

/** GeoJSON is longitude first; MapKit coordinates are named latitude first. */
export function toNativeMapCoordinate(value: unknown): NativeMapCoordinate | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [longitude, latitude] = value;
  if (
    typeof latitude !== 'number' || typeof longitude !== 'number' ||
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180 ||
    (latitude === 0 && longitude === 0)
  ) return null;
  return { latitude, longitude };
}

/** Break at malformed points instead of drawing a fabricated bridge over a gap. */
export function nativeRouteSegments(points: unknown): NativeMapCoordinate[][] {
  if (!Array.isArray(points)) return [];
  const segments: NativeMapCoordinate[][] = [];
  let segment: NativeMapCoordinate[] = [];
  for (const point of points) {
    const coordinate = toNativeMapCoordinate(point);
    if (!coordinate) {
      if (segment.length >= 2) segments.push(segment);
      segment = [];
      continue;
    }
    const previous = segment[segment.length - 1];
    if (previous?.latitude === coordinate.latitude && previous.longitude === coordinate.longitude) continue;
    segment.push(coordinate);
  }
  if (segment.length >= 2) segments.push(segment);
  return segments;
}

export function nativeMapHeading(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value % 360
    : null;
}

/** MapKit custom annotations face the screen; compensate for the actual camera. */
export function nativeMapMarkerRotation(
  driverHeading: number | null | undefined,
  cameraHeading: number | null | undefined,
): number | null {
  const heading = nativeMapHeading(driverHeading);
  if (heading == null) return null;
  return ((heading - (nativeMapHeading(cameraHeading) ?? 0)) % 360 + 360) % 360;
}

/** MapKit uses altitude (metres), whereas Google Maps uses camera zoom. */
export function navigationMapAltitude(zoom: number, latitude: number, viewportHeight: number): number {
  const safeZoom = Number.isFinite(zoom) ? Math.min(19, Math.max(14, zoom)) : 17.25;
  const safeLatitude = Number.isFinite(latitude) ? Math.min(80, Math.max(-80, latitude)) : 55;
  const safeHeight = Number.isFinite(viewportHeight) ? Math.min(2000, Math.max(320, viewportHeight)) : 800;
  const metresPerPixel = (156543.03392 * Math.cos(safeLatitude * Math.PI / 180)) / 2 ** safeZoom;
  return Math.min(5000, Math.max(120, metresPerPixel * safeHeight * 0.75));
}

export type NativeMapCameraPlan =
  | { mode: 'idle' }
  | { mode: 'overview'; coordinates: NativeMapCoordinate[] }
  | { mode: 'destination'; center: NativeMapCoordinate }
  | {
      mode: 'follow'; center: NativeMapCoordinate; heading: number; pitch: number;
      altitude?: number; zoom?: number;
    };

export function nativeMapCameraPlan(input: {
  driver: unknown;
  customer: unknown;
  route: unknown;
  followMode: NavigationMapMode;
  following: boolean;
  heading: number | null;
  depth: '2d' | '3d';
  zoom: number;
  viewportHeight: number;
  resetCamera: boolean;
  locationFresh: boolean;
}): NativeMapCameraPlan {
  const driver = toNativeMapCoordinate(input.driver);
  const customer = toNativeMapCoordinate(input.customer);
  // An explicit pan always wins over live GPS, overview, and route refreshes.
  if (!input.following) return { mode: 'idle' };
  if (input.followMode === 'overview') {
    const coordinates = nativeRouteSegments(input.route).flat();
    if (driver) coordinates.unshift(driver);
    if (customer) coordinates.push(customer);
    if (coordinates.length > 1) return { mode: 'overview', coordinates };
    const center = driver ?? customer;
    return center ? { mode: 'destination', center } : { mode: 'idle' };
  }
  // Panning freezes the camera, including during GPS updates and route refreshes.
  if (!driver) return customer && input.resetCamera
    ? { mode: 'destination', center: customer }
    : { mode: 'idle' };
  // A stale puck remains visible but must not look like live following.
  if (!input.locationFresh && !input.resetCamera) return { mode: 'idle' };
  return {
    mode: 'follow', center: driver,
    heading: input.followMode === 'north_up' ? 0 : nativeMapHeading(input.heading) ?? 0,
    pitch: input.depth === '3d' ? 48 : 0,
    ...(input.resetCamera ? {
      altitude: navigationMapAltitude(input.zoom, driver.latitude, input.viewportHeight),
      zoom: Math.min(19, Math.max(14, Number.isFinite(input.zoom) ? input.zoom : 17.25)),
    } : {}),
  };
}
