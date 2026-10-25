import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import { reverseGeocode } from './mapbox';

export type CustomerLocationPlace = {
  lat: number;
  lng: number;
  address: string;
  accuracy: number | null;
  capturedAt: number;
};

export type CustomerLocationSnapshot = {
  status: 'idle' | 'loading' | 'ready' | 'denied' | 'error';
  place: CustomerLocationPlace | null;
  message: string | null;
  settingsNeeded: boolean;
};

const MAX_AGE_MS = 2 * 60 * 1000;
const listeners = new Set<() => void>();
let snapshot: CustomerLocationSnapshot = {
  status: 'idle', place: null, message: null, settingsNeeded: false,
};
let pending: Promise<CustomerLocationSnapshot> | null = null;
let permissionRequested = false;

export function getCustomerLocationSnapshot(): CustomerLocationSnapshot {
  return snapshot;
}

export function subscribeCustomerLocation(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useCustomerLocation(): CustomerLocationSnapshot {
  return useSyncExternalStore(subscribeCustomerLocation, getCustomerLocationSnapshot, getCustomerLocationSnapshot);
}

function publish(next: CustomerLocationSnapshot): CustomerLocationSnapshot {
  snapshot = next;
  listeners.forEach(listener => listener());
  return next;
}

async function bounded<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function isForeground(): boolean {
  return Platform.OS === 'web' || AppState.currentState === 'active';
}

/** Foreground, in-memory location only. Automatic callers must leave requestPermission false. */
export function prepareCustomerLocation(options: { requestPermission?: boolean; force?: boolean } = {}): Promise<CustomerLocationSnapshot> {
  if (pending) {
    if (options.requestPermission) permissionRequested = true;
    return pending;
  }
  if (!isForeground()) return Promise.resolve(snapshot);
  const age = snapshot.place ? Date.now() - snapshot.place.capturedAt : Infinity;
  if (!options.force && snapshot.status === 'ready' && age >= 0 && age < MAX_AGE_MS) {
    return Promise.resolve(snapshot);
  }
  // Do not automatically request a browser permission, or repeat an iOS denial prompt.
  if (Platform.OS === 'web' && !options.requestPermission) return Promise.resolve(snapshot);
  permissionRequested = Boolean(options.requestPermission);
  publish({ status: 'loading', place: null, message: null, settingsNeeded: false });
  pending = (async () => {
    try {
      let permission = await bounded(Location.getForegroundPermissionsAsync(), 10000, 'Unable to check location access. Please try again.');
      if (permission.status !== 'granted' && permissionRequested && permission.canAskAgain) {
        permission = await bounded(Location.requestForegroundPermissionsAsync(), 60000, 'Location permission was not confirmed. You can try again or enter your address.');
      }
      if (permission.status !== 'granted') {
        return publish({
          status: 'denied', place: null, settingsNeeded: !permission.canAskAgain,
          message: 'Location access is off. You can enter your address manually or enable location in Settings.',
        });
      }
      if (!isForeground()) {
        return publish({ status: 'idle', place: null, message: null, settingsNeeded: false });
      }
      const position = await bounded(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        20000,
        'GPS is taking too long. Try again or enter your address manually.',
      );
      const capturedAt = Date.now();
      const { latitude: lat, longitude: lng, accuracy } = position.coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        throw new Error('Unable to find your current location. Please try again or enter your address.');
      }
      const address = await bounded(reverseGeocode(lat, lng), 15000, 'Unable to find your address. Please enter it manually.');
      if (!address.trim()) throw new Error('Unable to find your address. Please enter it manually.');
      return publish({
        status: 'ready',
        place: { lat, lng, address, accuracy: typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null, capturedAt },
        message: null, settingsNeeded: false,
      });
    } catch (error) {
      return publish({ status: 'error', place: null, message: error instanceof Error ? error.message : 'Unable to get your location. Please try again or enter your address.', settingsNeeded: false });
    } finally {
      pending = null;
      permissionRequested = false;
    }
  })();
  return pending;
}
