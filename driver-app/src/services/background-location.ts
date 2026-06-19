import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { ApiError, api, getToken } from '@/api/client';
import { dropQueued, enqueueLatest, flushOfflineQueue } from '@/services/offline-queue';
import * as secureStorage from '@/services/secure-storage';

const BACKGROUND_LOCATION_TASK = 'background-location-task';
export const ACTIVE_BOOKING_REF_KEY = 'active_booking_ref';
const LOCATION_PATH = '/api/driver/location';

function locationBody(lat: number, lng: number, bookingRef: string | null) {
  return bookingRef ? { lat, lng, bookingRef } : { lat, lng };
}

function shouldQueueLocation(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.code === 'network' || error.status === 0 || error.status >= 500;
  }
  return true;
}

async function postDriverLocation(
  location: Location.LocationObject,
  bookingRef: string | null,
): Promise<void> {
  const body = locationBody(location.coords.latitude, location.coords.longitude, bookingRef);

  try {
    await api(LOCATION_PATH, { method: 'POST', body });
    dropQueued(LOCATION_PATH, 'POST');
    void flushOfflineQueue();
  } catch (error) {
    if (shouldQueueLocation(error)) {
      enqueueLatest(LOCATION_PATH, 'POST', body);
    }
  }
}

// Define the background task BEFORE anything else
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  const token = await getToken();
  if (!token) return;

  const activeRef = await secureStorage.getItemAsync(ACTIVE_BOOKING_REF_KEY).catch(() => null);

  // Send the most recent location. Older batched points are intentionally not
  // replayed because the admin map must represent the driver's current position.
  const latest = locations[locations.length - 1];
  await postDriverLocation(latest, activeRef);
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
    const isTracking = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(
      () => false,
    );
    if (isTracking) return true;

    const { foreground, background } = await requestLocationPermissions();
    if (!foreground || !background) return false;

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

    return true;
  } catch {
    return false;
  }
}

export async function stopBackgroundLocation(): Promise<void> {
  const isTracking = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(
    () => false,
  );
  if (isTracking) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}

export async function isBackgroundLocationRunning(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
}

export { BACKGROUND_LOCATION_TASK };
