export type DriverLocationUpdate = {
  lat: number;
  lng: number;
  heading: number;
  accuracyMeters: number;
  recordedAt: string;
  source: 'dev-simulator';
  speedMph: number;
  routeProgress: number;
  distanceAlongMeters: number;
  totalDistanceMeters: number;
  weakGps: boolean;
  gpsLost: boolean;
  offRoute: boolean;
};

export type DriverGpsSimulatorOptions = {
  routeCoordinates: [number, number][];
  speedMph?: number;
  tickMs?: number;
  accuracyMeters?: number;
  weakAccuracyMeters?: number;
  onUpdate: (update: DriverLocationUpdate) => void | Promise<void>;
  onError?: (error: unknown) => void;
  onComplete?: () => void;
};

export type DriverGpsSimulator = ReturnType<typeof createDriverGpsSimulator>;

type RouteModel = {
  coordinates: [number, number][];
  segmentMeters: number[];
  cumulativeMeters: number[];
  totalMeters: number;
};

const DEFAULT_SPEED_MPH = 20;
const DEFAULT_TICK_MS = 2_000;
const DEFAULT_ACCURACY_METERS = 8;
const DEFAULT_WEAK_ACCURACY_METERS = 90;
const METERS_PER_MPH = 0.44704;
const OFF_ROUTE_METERS = 300;
const MIN_SPEED_MPH = 1;

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function isLngLat(value: [number, number]): boolean {
  const [lng, lat] = value;
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

function distanceMeters(a: [number, number], b: [number, number]): number {
  const radiusMeters = 6_371_000;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radiusMeters * Math.asin(Math.sqrt(h));
}

function headingDegrees(a: [number, number], b: [number, number]): number {
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLng = toRad(b[0] - a[0]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function buildRouteModel(routeCoordinates: [number, number][]): RouteModel {
  const coordinates = routeCoordinates.filter(isLngLat);
  const segmentMeters: number[] = [];
  const cumulativeMeters: number[] = [0];
  let totalMeters = 0;

  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const meters = distanceMeters(coordinates[i], coordinates[i + 1]);
    segmentMeters.push(meters);
    totalMeters += meters;
    cumulativeMeters.push(totalMeters);
  }

  return { coordinates, segmentMeters, cumulativeMeters, totalMeters };
}

function interpolate(model: RouteModel, distanceAlongMeters: number) {
  const { coordinates, segmentMeters, cumulativeMeters, totalMeters } = model;
  if (coordinates.length < 2 || totalMeters <= 0) {
    const only = coordinates[0] ?? [0, 0];
    return { lng: only[0], lat: only[1], heading: 0 };
  }

  const clamped = Math.max(0, Math.min(distanceAlongMeters, totalMeters));
  let index = segmentMeters.length - 1;
  for (let i = 0; i < segmentMeters.length; i += 1) {
    if (clamped <= cumulativeMeters[i + 1]) {
      index = i;
      break;
    }
  }

  const start = coordinates[index];
  const end = coordinates[index + 1];
  const segment = segmentMeters[index] || 1;
  const localMeters = clamped - cumulativeMeters[index];
  const ratio = Math.max(0, Math.min(localMeters / segment, 1));
  return {
    lng: start[0] + (end[0] - start[0]) * ratio,
    lat: start[1] + (end[1] - start[1]) * ratio,
    heading: headingDegrees(start, end),
  };
}

function offsetOffRoute(point: { lat: number; lng: number; heading: number }) {
  const perpendicular = toRad(point.heading + 90);
  const latOffset = (Math.cos(perpendicular) * OFF_ROUTE_METERS) / 111_320;
  const lngOffset =
    (Math.sin(perpendicular) * OFF_ROUTE_METERS) /
    (111_320 * Math.max(Math.cos(toRad(point.lat)), 0.2));
  return {
    lat: point.lat + latOffset,
    lng: point.lng + lngOffset,
    heading: point.heading,
  };
}

function makeError(message: string): Error {
  return new Error(`[driverGpsSimulator] ${message}`);
}

export function createDriverGpsSimulator(options: DriverGpsSimulatorOptions) {
  let model = buildRouteModel(options.routeCoordinates);
  let speedMph = Math.max(options.speedMph ?? DEFAULT_SPEED_MPH, MIN_SPEED_MPH);
  let distanceAlongMeters = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lostTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTickAt = 0;
  let weakGps = false;
  let gpsLost = false;
  let offRouteNext = false;
  let offRouteUntil = 0;
  let stopped = false;

  const tickMs = Math.max(options.tickMs ?? DEFAULT_TICK_MS, 250);
  const accuracyMeters = Math.max(options.accuracyMeters ?? DEFAULT_ACCURACY_METERS, 1);
  const weakAccuracyMeters = Math.max(
    options.weakAccuracyMeters ?? DEFAULT_WEAK_ACCURACY_METERS,
    accuracyMeters,
  );

  function clearLostTimer() {
    if (lostTimer) {
      clearTimeout(lostTimer);
      lostTimer = null;
    }
  }

  function clearTickTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function canRun(): boolean {
    if (isProduction()) {
      options.onError?.(makeError('Simulator is disabled in production.'));
      return false;
    }
    if (model.coordinates.length < 2 || model.totalMeters <= 0) {
      options.onError?.(makeError('Route not ready. Refresh route first.'));
      return false;
    }
    return true;
  }

  function emitUpdate(forceOffRoute = false) {
    if (gpsLost || !canRun()) return;
    const point = interpolate(model, distanceAlongMeters);
    const shouldRenderOffRoute = forceOffRoute || Date.now() < offRouteUntil;
    const renderedPoint = shouldRenderOffRoute ? offsetOffRoute(point) : point;
    const update: DriverLocationUpdate = {
      lat: renderedPoint.lat,
      lng: renderedPoint.lng,
      heading: renderedPoint.heading,
      accuracyMeters: weakGps ? weakAccuracyMeters : accuracyMeters,
      recordedAt: new Date().toISOString(),
      source: 'dev-simulator',
      speedMph,
      routeProgress: model.totalMeters > 0 ? distanceAlongMeters / model.totalMeters : 0,
      distanceAlongMeters,
      totalDistanceMeters: model.totalMeters,
      weakGps,
      gpsLost,
      offRoute: shouldRenderOffRoute,
    };

    Promise.resolve(options.onUpdate(update)).catch((error) => {
      options.onError?.(error);
    });
  }

  function tick() {
    if (!canRun()) {
      clearTickTimer();
      return;
    }

    const now = Date.now();
    if (gpsLost) {
      lastTickAt = now;
      return;
    }

    const elapsedMs = lastTickAt > 0 ? Math.max(now - lastTickAt, 0) : 0;
    lastTickAt = now;
    distanceAlongMeters = Math.min(
      model.totalMeters,
      distanceAlongMeters + speedMph * METERS_PER_MPH * (elapsedMs / 1000),
    );

    const shouldSendOffRoute = offRouteNext || now < offRouteUntil;
    offRouteNext = false;
    emitUpdate(shouldSendOffRoute);

    if (distanceAlongMeters >= model.totalMeters) {
      clearTickTimer();
      options.onComplete?.();
    }
  }

  return {
    start() {
      stopped = false;
      if (!canRun()) return;
      if (timer) return;
      lastTickAt = Date.now();
      emitUpdate(false);
      timer = setInterval(tick, tickMs);
    },
    pause() {
      clearTickTimer();
      lastTickAt = 0;
    },
    reset(resetOptions: { emit?: boolean } = {}) {
      distanceAlongMeters = 0;
      lastTickAt = timer ? Date.now() : 0;
      gpsLost = false;
      offRouteNext = false;
      offRouteUntil = 0;
      clearLostTimer();
      if (resetOptions.emit !== false) emitUpdate(false);
    },
    stop() {
      stopped = true;
      clearTickTimer();
      clearLostTimer();
      lastTickAt = 0;
      gpsLost = false;
      offRouteNext = false;
      offRouteUntil = 0;
    },
    setSpeedMph(nextSpeedMph: number) {
      speedMph = Math.max(nextSpeedMph, MIN_SPEED_MPH);
    },
    setWeakGps(enabled: boolean) {
      weakGps = enabled;
    },
    simulateGpsLost(durationMs = 30_000) {
      if (!canRun()) return;
      gpsLost = true;
      clearLostTimer();
      lostTimer = setTimeout(() => {
        gpsLost = false;
        lastTickAt = Date.now();
        if (timer && !stopped) emitUpdate(false);
      }, Math.max(durationMs, 0));
    },
    simulateOffRoute(durationMs = 12_000) {
      if (!canRun()) return;
      offRouteUntil = Date.now() + Math.max(durationMs, 0);
      if (timer && !gpsLost) {
        emitUpdate(true);
        return;
      }
      emitUpdate(true);
    },
    setRouteCoordinates(routeCoordinates: [number, number][]) {
      model = buildRouteModel(routeCoordinates);
      distanceAlongMeters = Math.min(distanceAlongMeters, model.totalMeters);
    },
    isRunning() {
      return timer != null;
    },
    isGpsLost() {
      return gpsLost;
    },
  };
}
