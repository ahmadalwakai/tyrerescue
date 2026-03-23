import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api, getToken } from '@/api/client';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

// Define the background task BEFORE anything else
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  const token = await getToken();
  if (!token) return;

  // Send the most recent location
  const latest = locations[locations.length - 1];
  try {
    await api('/api/driver/location', {
      method: 'POST',
      body: {
        lat: latest.coords.latitude,
        lng: latest.coords.longitude,
      },
    });
  } catch {
    // Silently ignore — network errors are expected when backgrounded
  }
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
  const isTracking = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(
    () => false,
  );
  if (isTracking) return true;

  const { foreground, background } = await requestLocationPermissions();
  if (!foreground || !background) return false;

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 30_000, // 30 seconds
    distanceInterval: 50, // 50 meters minimum movement
    deferredUpdatesInterval: 30_000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Tyre Rescue Driver',
      notificationBody: 'Sharing your location with dispatch',
      notificationColor: '#F97316',
    },
  });

  return true;
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
