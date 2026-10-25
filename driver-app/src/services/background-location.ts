import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { ApiError, api, getApiUrl, getToken } from '@/api/client';
import { discardQueuedLocations, enqueue, flushOfflineQueue, getQueueLength } from '@/services/offline-queue';
import * as secureStorage from '@/services/secure-storage';
import { endpointHostname, logDriverTrackingDiagnostic } from '@/services/tracking-diagnostics';
import {
  getOnlineLocationRevision,
  isOnlineLocationEnabled,
  setOnlineLocationEnabled,
} from '@/services/online-location-state';

const BACKGROUND_LOCATION_TASK = 'background-location-task';
export const ACTIVE_BOOKING_REF_KEY = 'active_booking_ref';
const LOCATION_PATH = '/api/driver/location';
const MAX_ACCEPTED_ACCURACY_M = 100;
let nativeOperation: Promise<unknown> = Promise.resolve();
let retryAfterMs = 0;

function withNativeOperation<T>(operation: () => Promise<T>): Promise<T> {
  const pending = nativeOperation.catch(() => {}).then(operation);
  nativeOperation = pending;
  return pending;
}

async function canSendLocation(revision: number): Promise<boolean> {
  if (!(await isOnlineLocationEnabled())) return false;
  const token = await getToken();
  return !!token && revision === getOnlineLocationRevision();
}

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
  return heading === 360 ? 0 : heading;
}

function normaliseSpeed(value: number | null | undefined): number | null {
  const speed = normaliseOptionalNumber(value);
  return speed != null && speed >= 0 ? speed : null;
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
    speed: normaliseSpeed(options.speed),
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
  return accuracy != null && accuracy >= 0 && accuracy <= MAX_ACCEPTED_ACCURACY_M;
}

async function isNewerThanLastAck(bookingRef: string | null, timestamp: string): Promise<boolean> {
  const previous = await secureStorage.getItemAsync(ackKey(bookingRef)).catch(() => null);
  if (!previous) return true;
  const prevMs = Date.parse(previous);
  const nextMs = Date.parse(timestamp);
  if (!Number.isFinite(prevMs) || !Number.isFinite(nextMs)) return true;
  return nextMs > prevMs;
}

async function rememberAck(bookingRef: string | null, timestamp: string | null | undefined) {
  if (!timestamp) return;
  await secureStorage.setItemAsync(ackKey(bookingRef), timestamp).catch(() => {});
}

export async function sendDriverLocationSample(
  location: Location.LocationObject,
  bookingRef: string | null,
  source: 'background' | 'foreground' = 'background',
): Promise<boolean> {
  const revision = getOnlineLocationRevision();
  if (!(await canSendLocation(revision)) || Date.now() < retryAfterMs) return false;
  const permission = source === 'background'
    ? await Location.getBackgroundPermissionsAsync()
    : await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted') return false;
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
    return false;
  }
  if (!(await isNewerThanLastAck(bookingRef, timestamp))) {
    logDriverTrackingDiagnostic('location_sample_rejected', {
      jobId: bookingRef,
      reason: 'older_than_last_ack',
      locationTimestamp: timestamp,
    });
    return false;
  }

  // A 403 may have cleared a stale job while the hook still holds its old ref.
  const storedRef = await secureStorage.getItemAsync(ACTIVE_BOOKING_REF_KEY).catch(() => null);
  return postDriverCoordinates(
    { lat: location.coords.latitude, lng: location.coords.longitude },
    storedRef === bookingRef ? bookingRef : null,
    {
      timestamp,
      accuracy: location.coords.accuracy,
      heading: location.coords.heading,
      speed: location.coords.speed,
      source,
    },
    revision,
  );
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
  revision: number,
): Promise<boolean> {
  if (!(await canSendLocation(revision))) return false;
  if (!isValidLocationPoint(point)) {
    logDriverTrackingDiagnostic('location_sample_rejected', {
      jobId: bookingRef,
      reason: 'invalid_location',
      locationTimestamp: sample.timestamp,
    });
    return false;
  }
  if (!(await isNewerThanLastAck(bookingRef, sample.timestamp))) {
    logDriverTrackingDiagnostic('location_sample_rejected', {
      jobId: bookingRef,
      reason: 'older_than_last_ack',
      locationTimestamp: sample.timestamp,
    });
    return false;
  }
  const body = locationBody(point, bookingRef, sample.timestamp, sample);
  const baseUrl = await getApiUrl().catch(() => null);
  const host = endpointHostname(baseUrl);

  try {
    if (!(await canSendLocation(revision))) return false;
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
    return response.accepted !== false;
  } catch (error) {
    logDriverTrackingDiagnostic('upload_request_failed', {
      jobId: bookingRef,
      requestHostname: host,
      reason: error instanceof ApiError ? error.code : 'unknown',
      httpStatus: error instanceof ApiError ? error.status : null,
      locationTimestamp: sample.timestamp,
    });
    if (!(await canSendLocation(revision))) return false;
    if (error instanceof ApiError && error.status === 403 && bookingRef) {
      // Assignment can change while a driver remains Online. Drop only the
      // rejected job context and retry once as an unassigned driver sample.
      await secureStorage.deleteItemAsync(ACTIVE_BOOKING_REF_KEY).catch(() => {});
      return postDriverCoordinates(point, null, sample, revision);
    }
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      // Gateways and temporary authorization failures must not erase Online
      // consent or stop native GPS. The API still rejects unauthorised samples;
      // retry quietly and let session verification handle confirmed revocation.
      retryAfterMs = Date.now() + 30_000;
      return false;
    }
    if (error instanceof ApiError && error.status === 429) {
      retryAfterMs = Date.now() + (error.retryAfterSeconds ?? 30) * 1000;
      return false;
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
    return false;
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

  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  const locationCount = Array.isArray(locations) ? locations.length : 0;
  logDriverTrackingDiagnostic('background_task_invoked', {
    locationCount,
  });
  if (locationCount === 0 || !locations) return;

  try {
    if (!(await isOnlineLocationEnabled())) {
      await stopBackgroundLocation();
      return;
    }

    const activeRef = await secureStorage.getItemAsync(ACTIVE_BOOKING_REF_KEY).catch(() => null);
    logDriverTrackingDiagnostic('active_job_loaded', {
      jobId: activeRef,
      result: activeRef ? 'found' : 'missing',
      locationCount,
    });

    const ordered = [...locations].sort((a, b) => a.timestamp - b.timestamp);

    const token = await getToken();
    logDriverTrackingDiagnostic('auth_token_loaded', {
      jobId: activeRef,
      result: token ? 'present' : 'missing',
      locationCount,
    });
    if (!token) {
      // Absence/unavailability of a credential is not an explicit Offline action.
      // Sign-out and verified revocation own native shutdown. Never queue samples
      // for a later account, but allow the next task to recover its credentials.
      return;
    }

    for (const location of ordered) {
      await sendDriverLocationSample(location, activeRef);
    }
  } catch (taskError) {
    // iOS may briefly deny Keychain access during lock/unlock or before the
    // first unlock after reboot. Preserve consent and the registered task.
    logDriverTrackingDiagnostic('background_task_invoked', {
      reason: taskError instanceof Error ? taskError.message : 'background_task_unavailable',
    });
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
  return withNativeOperation(startNativeBackgroundLocation);
}

async function startNativeBackgroundLocation(): Promise<boolean> {
  try {
    const revision = getOnlineLocationRevision();
    const activeRef = await secureStorage.getItemAsync(ACTIVE_BOOKING_REF_KEY).catch(() => null);
    logDriverTrackingDiagnostic('tracking_start_requested', {
      jobId: activeRef,
      queueCount: getQueueLength(),
    });
    if (!(await canSendLocation(revision))) {
      logDriverTrackingDiagnostic('tracking_start_failed', {
        reason: 'offline_or_signed_out',
        queueCount: getQueueLength(),
      });
      return false;
    }

    // Automatic restarts must never show permission prompts. Only the driver's
    // Go Online flow requests permissions.
    const [foregroundPermission, backgroundPermission] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
    ]);
    const foreground = foregroundPermission.status === 'granted';
    const background = backgroundPermission.status === 'granted';
    if (!foreground || !background) {
      const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
        .catch(() => false);
      if (running) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      logDriverTrackingDiagnostic('tracking_start_failed', {
        jobId: activeRef,
        reason: 'permission_denied',
        foregroundPermission: foreground,
        backgroundPermission: background,
      });
      return false;
    }

    const isTracking = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
      .catch(() => false);
    if (!(await canSendLocation(revision))) return false;
    if (isTracking) {
      logDriverTrackingDiagnostic('tracking_start_succeeded', {
        jobId: activeRef,
        result: 'already_running',
        queueCount: getQueueLength(),
      });
      return true;
    }

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 20_000,
      distanceInterval: 0,
      deferredUpdatesInterval: 20_000,
      deferredUpdatesDistance: 0,
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
    if (!(await canSendLocation(revision))) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      return false;
    }

    logDriverTrackingDiagnostic('tracking_start_succeeded', {
      jobId: activeRef,
      result: 'started',
      pausesUpdatesAutomatically: false,
      intervalMs: 20_000,
      distanceMeters: 0,
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
  _knownLocation?: NavigationLocationPoint | null,
): Promise<boolean> {
  if (!(await isOnlineLocationEnabled())) return false;
  const revision = getOnlineLocationRevision();
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

  // Navigation coordinates alone have no sample timestamp/accuracy. Obtain a
  // full native sample instead of making cached coordinates appear freshly seen.
  if (started && await canSendLocation(revision)) {
    void Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    })
      .then(async (location) => {
        if (await canSendLocation(revision)) {
          await sendDriverLocationSample(location, storedRef, 'foreground');
        }
      })
      .catch(() => {});
  }

  return started;
}

export async function stopBackgroundLocation(clearActiveRef = true): Promise<void> {
  return withNativeOperation(async () => {
    const isTracking = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
      .catch(() => false);
    if (isTracking) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (clearActiveRef) {
      await secureStorage.deleteItemAsync(ACTIVE_BOOKING_REF_KEY).catch(() => {});
    }
    logDriverTrackingDiagnostic('tracking_stopped', {
      wasRunning: isTracking,
      clearActiveRef,
      queueCount: getQueueLength(),
    });
  });
}

export async function setOnlineLocationTracking(online: boolean): Promise<boolean> {
  try {
    await setOnlineLocationEnabled(online);
  } catch {
    await discardQueuedLocations();
    await stopBackgroundLocation();
    return false;
  }
  if (online) return startBackgroundLocation();
  retryAfterMs = 0;
  await discardQueuedLocations();
  await stopBackgroundLocation();
  return false;
}

/** Ending/rejecting one job must not turn off an Online driver's GPS. */
export async function clearActiveBookingTracking(): Promise<void> {
  await secureStorage.deleteItemAsync(ACTIVE_BOOKING_REF_KEY).catch(() => {});
  if (await isOnlineLocationEnabled()) await startBackgroundLocation();
  else await stopBackgroundLocation();
}

export async function isBackgroundLocationRunning(): Promise<boolean> {
  if (!(await isOnlineLocationEnabled())) return false;
  const [running, foreground, background] = await Promise.all([
    Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false),
    Location.getForegroundPermissionsAsync().catch(() => null),
    Location.getBackgroundPermissionsAsync().catch(() => null),
  ]);
  return running && foreground?.status === 'granted' && background?.status === 'granted';
}

export { BACKGROUND_LOCATION_TASK };

// Static imports run before this module body, so use require after defineTask.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('expo-router/entry');
