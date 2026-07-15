import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { ApiError, api, getApiUrl, getToken } from '@/api/client';
import { enqueue, flushOfflineQueue, getQueueLength } from '@/services/offline-queue';
import * as secureStorage from '@/services/secure-storage';
import { endpointHostname, logDriverTrackingDiagnostic } from '@/services/tracking-diagnostics';

const BACKGROUND_LOCATION_TASK = 'background-location-task';
export const ACTIVE_BOOKING_REF_KEY = 'active_booking_ref';
const LOCATION_PATH = '/api/driver/location';
const LAST_KNOWN_MAX_AGE_MS = 60_000;
const LAST_KNOWN_REQUIRED_ACCURACY_M = 100;
const MAX_ACCEPTED_ACCURACY_M = 100;

type NavigationLocationPoint = {
  lat: number;
  lng: number;
};

type DriverLocationBody = {
  lat: number;
  lng: number;
  bookingRef?: string;
  timestamp: string;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  source: 'background' | 'foreground';
};

type DriverLocationResponse = {
  accepted?: boolean;
  acceptedLocationTimestamp?: string | null;
  reason?: string;
};

function ackKey(bookingRef: string | null): string {
  return `last_acked_location_ts:${bookingRef ?? 'idle'}`;
}

function normaliseOptionalNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normaliseHeading(value: number | null | undefined): number | null {
  const heading = normaliseOptionalNumber(value);
  if (heading == null || heading < 0 || heading > 360) return null;
  return heading;
}

function timestampIsoFromLocation(location: Location.LocationObject): string | null {
  const ts = typeof location.timestamp === 'number' ? location.timestamp : NaN;
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function locationBody(
  point: NavigationLocationPoint,
  bookingRef: string | null,
  timestamp: string,
  options: {
    accuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
    source: 'background' | 'foreground';
  },
): DriverLocationBody {
  return {
    lat: point.lat,
    lng: point.lng,
    ...(bookingRef ? { bookingRef } : {}),
    timestamp,
    accuracy: normaliseOptionalNumber(options.accuracy),
    heading: normaliseHeading(options.heading),
    speed: normaliseOptionalNumber(options.speed),
    source: options.source,
  };
}

function isValidLocationPoint(
  point: NavigationLocationPoint | null | undefined,
): point is NavigationLocationPoint {
  return (
    point != null &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180 &&
    !(point.lat === 0 && point.lng === 0)
  );
}

function shouldQueueLocation(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.code === 'network' || error.status === 0 || error.status >= 500;
  }
  return true;
}

function hasUsableAccuracy(location: Location.LocationObject): boolean {
  const accuracy = normaliseOptionalNumber(location.coords.accuracy);
  return accuracy == null || accuracy <= MAX_ACCEPTED_ACCURACY_M;
}

async function isNewerThanLastAck(bookingRef: string | null, timestamp: string): Promise<boolean> {
  const previous = await secureStorage.getItemAsync(ackKey(bookingRef)).catch(() => null);
  if (!previous) return true;
  const prevMs = Date.parse(previous);
  const nextMs = Date.parse(timestamp);
  if (!Number.isFinite(prevMs) || !Number.isFinite(nextMs)) return true;
  return nextMs >= prevMs;
}

async function rememberAck(bookingRef: string | null, timestamp: string | null | undefined) {
  if (!timestamp) return;
  await secureStorage.setItemAsync(ackKey(bookingRef), timestamp).catch(() => {});
}

async function postDriverLocation(
  location: Location.LocationObject,
  bookingRef: string | null,
): Promise<void> {
  const timestamp = timestampIsoFromLocation(location);
  logDriverTrackingDiagnostic('location_sample_received', {
    jobId: bookingRef,
    accuracy: normaliseOptionalNumber(location.coords.accuracy),
    locationTimestamp: timestamp,
  });
  if (!timestamp || !hasUsableAccuracy(location)) {
    logDriverTrackingDiagnostic('location_sample_rejected', {
      jobId: bookingRef,
      reason: !timestamp ? 'invalid_timestamp' : 'accuracy_too_low',
      accuracy: normaliseOptionalNumber(location.coords.accuracy),
      locationTimestamp: timestamp,
    });
    return;
  }
  if (!(await isNewerThanLastAck(bookingRef, timestamp))) {
    logDriverTrackingDiagnostic('location_sample_rejected', {
      jobId: bookingRef,
      reason: 'older_than_last_ack',
      locationTimestamp: timestamp,
    });
    return;
  }

  await postDriverCoordinates(
    { lat: location.coords.latitude, lng: location.coords.longitude },
    bookingRef,
    {
      timestamp,
      accuracy: location.coords.accuracy,
      heading: location.coords.heading,
      speed: location.coords.speed,
      source: 'background',
    },
  );
}

async function queueBackgroundLocation(
  location: Location.LocationObject,
  bookingRef: string | null,
  reason: string,
): Promise<void> {
  const timestamp = timestampIsoFromLocation(location);
  if (!timestamp || !hasUsableAccuracy(location)) {
    logDriverTrackingDiagnostic('location_sample_rejected', {
      jobId: bookingRef,
      reason: !timestamp ? 'invalid_timestamp' : 'accuracy_too_low',
      accuracy: normaliseOptionalNumber(location.coords.accuracy),
      locationTimestamp: timestamp,
    });
    return;
  }
  const body = locationBody(
    { lat: location.coords.latitude, lng: location.coords.longitude },
    bookingRef,
    timestamp,
    {
      accuracy: location.coords.accuracy,
      heading: location.coords.heading,
      speed: location.coords.speed,
      source: 'background',
    },
  );
  enqueue(LOCATION_PATH, 'POST', body);
  logDriverTrackingDiagnostic('offline_queue_enqueued', {
    jobId: bookingRef,
    reason,
    queueCount: getQueueLength(),
    locationTimestamp: timestamp,
  });
}

async function postDriverCoordinates(
  point: NavigationLocationPoint,
  bookingRef: string | null,
  sample: {
    timestamp: string;
    accuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
    source: 'background' | 'foreground';
  },
): Promise<void> {
  if (!isValidLocationPoint(point)) {
    logDriverTrackingDiagnostic('location_sample_rejected', {
      jobId: bookingRef,
      reason: 'invalid_location',
      locationTimestamp: sample.timestamp,
    });
    return;
  }
  if (!(await isNewerThanLastAck(bookingRef, sample.timestamp))) {
    logDriverTrackingDiagnostic('location_sample_rejected', {
      jobId: bookingRef,
      reason: 'older_than_last_ack',
      locationTimestamp: sample.timestamp,
    });
    return;
  }
  const body = locationBody(point, bookingRef, sample.timestamp, sample);
  const baseUrl = await getApiUrl().catch(() => null);
  const host = endpointHostname(baseUrl);

  try {
    logDriverTrackingDiagnostic('upload_request_started', {
      jobId: bookingRef,
      requestHostname: host,
      accuracy: normaliseOptionalNumber(sample.accuracy),
      locationTimestamp: sample.timestamp,
      queueCount: getQueueLength(),
    });
    const response = await api<DriverLocationResponse>(LOCATION_PATH, { method: 'POST', body });
    logDriverTrackingDiagnostic(
      response.accepted === false ? 'upload_response_rejected' : 'upload_request_succeeded',
      {
        jobId: bookingRef,
        requestHostname: host,
        reason: response.reason ?? null,
        httpStatus: 200,
        acceptedLocationTimestamp: response.acceptedLocationTimestamp ?? sample.timestamp,
        queueCount: getQueueLength(),
      },
    );
    if (response.accepted !== false) {
      await rememberAck(bookingRef, response.acceptedLocationTimestamp ?? sample.timestamp);
    }
    void flushOfflineQueue();
  } catch (error) {
    logDriverTrackingDiagnostic('upload_request_failed', {
      jobId: bookingRef,
      requestHostname: host,
      reason: error instanceof ApiError ? error.code : 'unknown',
      httpStatus: error instanceof ApiError ? error.status : null,
      locationTimestamp: sample.timestamp,
    });
    if (error instanceof ApiError && error.status === 403) {
      await stopBackgroundLocation();
      return;
    }
    if (shouldQueueLocation(error)) {
      enqueue(LOCATION_PATH, 'POST', body);
      logDriverTrackingDiagnostic('offline_queue_enqueued', {
        jobId: bookingRef,
        requestHostname: host,
        queueCount: getQueueLength(),
        locationTimestamp: sample.timestamp,
      });
    }
  }
}

// Define the background task BEFORE anything else
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    logDriverTrackingDiagnostic('background_task_invoked', {
      reason: error.message || 'task_error',
    });
    return;
  }

  const { locations } = data as { locations: Location.LocationObject[] };
  const locationCount = Array.isArray(locations) ? locations.length : 0;
  logDriverTrackingDiagnostic('background_task_invoked', {
    locationCount,
  });
  if (locationCount === 0) return;

  const activeRef = await secureStorage.getItemAsync(ACTIVE_BOOKING_REF_KEY).catch(() => null);
  logDriverTrackingDiagnostic('active_job_loaded', {
    jobId: activeRef,
    result: activeRef ? 'found' : 'missing',
    locationCount,
  });

  if (!activeRef) {
    return;
  }

  const ordered = [...locations].sort((a, b) => a.timestamp - b.timestamp);

  const token = await getToken();
  logDriverTrackingDiagnostic('auth_token_loaded', {
    jobId: activeRef,
    result: token ? 'present' : 'missing',
    locationCount,
  });
  if (!token) {
    for (const location of ordered) {
      await queueBackgroundLocation(location, activeRef, 'missing_token');
    }
    return;
  }

  for (const location of ordered) {
    await postDriverLocation(location, activeRef);
  }
});

logDriverTrackingDiagnostic('background_task_registered', {
  result: TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK) ? 'defined' : 'missing',
});

export async function requestLocationPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') {
    return { foreground: false, background: false };
  }

  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  return { foreground: true, background: bgStatus === 'granted' };
}

export async function startBackgroundLocation(): Promise<boolean> {
  try {
    const activeRef = await secureStorage.getItemAsync(ACTIVE_BOOKING_REF_KEY).catch(() => null);
    logDriverTrackingDiagnostic('tracking_start_requested', {
      jobId: activeRef,
      queueCount: getQueueLength(),
    });
    if (!activeRef) {
      logDriverTrackingDiagnostic('tracking_start_failed', {
        reason: 'missing_active_job',
        queueCount: getQueueLength(),
      });
      return false;
    }

    const isTracking = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(
      () => false,
    );
    if (isTracking) {
      logDriverTrackingDiagnostic('tracking_start_succeeded', {
        jobId: activeRef,
        result: 'already_running',
        queueCount: getQueueLength(),
      });
      return true;
    }

    const { foreground, background } = await requestLocationPermissions();
    if (!foreground || !background) {
      logDriverTrackingDiagnostic('tracking_start_failed', {
        jobId: activeRef,
        reason: 'permission_denied',
        foregroundPermission: foreground,
        backgroundPermission: background,
      });
      return false;
    }

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 10_000,
      distanceInterval: 10,
      deferredUpdatesInterval: 10_000,
      deferredUpdatesDistance: 10,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Tyre Rescue Driver',
        notificationBody: 'Live tracking is active for dispatch',
        notificationColor: '#F97316',
        killServiceOnDestroy: false,
      },
    });

    logDriverTrackingDiagnostic('tracking_start_succeeded', {
      jobId: activeRef,
      result: 'started',
      pausesUpdatesAutomatically: false,
      intervalMs: 10_000,
      distanceMeters: 10,
      queueCount: getQueueLength(),
    });
    return true;
  } catch (error) {
    logDriverTrackingDiagnostic('tracking_start_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
      queueCount: getQueueLength(),
    });
    return false;
  }
}

export async function armBackgroundLocationForJob(
  bookingRef?: string | null,
  knownLocation?: NavigationLocationPoint | null,
): Promise<boolean> {
  const activeRef = bookingRef?.trim() || null;
  if (activeRef) {
    await secureStorage.setItemAsync(ACTIVE_BOOKING_REF_KEY, activeRef).catch(() => {});
  }

  const started = await startBackgroundLocation();
  const storedRef =
    activeRef ?? (await secureStorage.getItemAsync(ACTIVE_BOOKING_REF_KEY).catch(() => null));
  logDriverTrackingDiagnostic(started ? 'tracking_start_succeeded' : 'tracking_start_failed', {
    jobId: storedRef,
    result: started ? 'background_running' : undefined,
    reason: started ? undefined : 'background_not_running',
    queueCount: getQueueLength(),
  });

  let immediatePoint = isValidLocationPoint(knownLocation) ? knownLocation : null;
  if (!immediatePoint) {
    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
      requiredAccuracy: LAST_KNOWN_REQUIRED_ACCURACY_M,
    }).catch(() => null);
    if (lastKnown) {
      immediatePoint = {
        lat: lastKnown.coords.latitude,
        lng: lastKnown.coords.longitude,
      };
      if (lastKnown.coords.accuracy != null && lastKnown.coords.accuracy > MAX_ACCEPTED_ACCURACY_M) {
        immediatePoint = null;
      }
    }
  }

  const timestamp = new Date().toISOString();
  if (immediatePoint) {
    void postDriverCoordinates(immediatePoint, storedRef, {
      timestamp,
      accuracy: null,
      heading: null,
      speed: null,
      source: 'foreground',
    });
  } else {
    void Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    })
      .then((location) => postDriverLocation(location, storedRef))
      .catch(() => {});
  }

  return started;
}

export async function stopBackgroundLocation(clearActiveRef = true): Promise<void> {
  const isTracking = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(
    () => false,
  );
  if (isTracking) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
  if (clearActiveRef) {
    await secureStorage.deleteItemAsync(ACTIVE_BOOKING_REF_KEY).catch(() => {});
  }
  logDriverTrackingDiagnostic('tracking_stopped', {
    wasRunning: isTracking,
    clearActiveRef,
    queueCount: getQueueLength(),
  });
}

export async function isBackgroundLocationRunning(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
}

export { BACKGROUND_LOCATION_TASK };

// Static imports run before this module body, so use require after defineTask.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('expo-router/entry');
