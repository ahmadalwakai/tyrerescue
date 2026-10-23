export type NavigationPoint = {
  lat: number;
  lng: number;
};

export type LngLat = [number, number];

export type RouteSnapResult = {
  point: NavigationPoint;
  distanceMeters: number;
  segmentIndex: number;
};

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function isPoint(value: NavigationPoint | null | undefined): value is NavigationPoint {
  return (
    value != null &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    value.lng >= -180 &&
    value.lng <= 180
  );
}

function lngLatToPoint(coord: LngLat | null | undefined): NavigationPoint | null {
  if (
    !coord ||
    coord.length < 2 ||
    !Number.isFinite(coord[0]) ||
    !Number.isFinite(coord[1])
  ) {
    return null;
  }
  const point = { lng: coord[0], lat: coord[1] };
  return isPoint(point) ? point : null;
}

export function haversineDistanceMeters(a: NavigationPoint, b: NavigationPoint): number {
  if (!isPoint(a) || !isPoint(b)) return Number.POSITIVE_INFINITY;

  const radiusMeters = 6_371_000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * radiusMeters * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDegrees(a: NavigationPoint, b: NavigationPoint): number {
  if (!isPoint(a) || !isPoint(b)) return 0;

  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLng = toRadians(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function nearestPointOnSegment(
  point: NavigationPoint,
  start: NavigationPoint,
  end: NavigationPoint,
): RouteSnapResult | null {
  if (!isPoint(point) || !isPoint(start) || !isPoint(end)) return null;

  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng =
    111_320 * Math.max(Math.cos(toRadians(point.lat)), 0.2);
  const px = point.lng * metersPerDegreeLng;
  const py = point.lat * metersPerDegreeLat;
  const ax = start.lng * metersPerDegreeLng;
  const ay = start.lat * metersPerDegreeLat;
  const bx = end.lng * metersPerDegreeLng;
  const by = end.lat * metersPerDegreeLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  return {
    point: {
      lng: start.lng + t * (end.lng - start.lng),
      lat: start.lat + t * (end.lat - start.lat),
    },
    distanceMeters: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)),
    segmentIndex: -1,
  };
}

export function snapPointToRoute(
  point: NavigationPoint,
  routeCoordinates: LngLat[],
): RouteSnapResult | null {
  if (!isPoint(point) || !routeCoordinates || routeCoordinates.length < 2) return null;

  let best: RouteSnapResult | null = null;
  for (let i = 0; i < routeCoordinates.length - 1; i += 1) {
    const start = lngLatToPoint(routeCoordinates[i]);
    const end = lngLatToPoint(routeCoordinates[i + 1]);
    if (!start || !end) continue;

    const snap = nearestPointOnSegment(point, start, end);
    if (!snap) continue;
    if (!best || snap.distanceMeters < best.distanceMeters) {
      best = { ...snap, segmentIndex: i };
    }
  }

  return best;
}

export function distanceToRouteMeters(
  point: NavigationPoint,
  routeCoordinates: LngLat[],
): number {
  const snap = snapPointToRoute(point, routeCoordinates);
  if (snap) return snap.distanceMeters;

  const first = lngLatToPoint(routeCoordinates?.[0]);
  return first ? haversineDistanceMeters(point, first) : Number.POSITIVE_INFINITY;
}

export function isPointOffRoute(
  point: NavigationPoint,
  routeCoordinates: LngLat[],
  thresholdMeters: number,
): boolean {
  return distanceToRouteMeters(point, routeCoordinates) > thresholdMeters;
}
