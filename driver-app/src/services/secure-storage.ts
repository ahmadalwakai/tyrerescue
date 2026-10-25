import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

const BACKGROUND_READABLE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  requireAuthentication: false,
  // A new service is necessary: Expo's iOS update changes only the value of an
  // existing item, not its accessibility. Changing the get/set options alone
  // leaves older WHEN_UNLOCKED credentials inaccessible after the phone locks.
  ...(Platform.OS === 'ios' ? { keychainService: 'uk.tyrerescue.driver.background.v2' } : {}),
};
const operations = new Map<string, Promise<unknown>>();

function withKeyOperation<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const pending = (operations.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
  operations.set(key, pending);
  void pending.finally(() => {
    if (operations.get(key) === pending) operations.delete(key);
  }).catch(() => {});
  return pending;
}

export function getItemAsync(key: string): Promise<string | null> {
  return withKeyOperation(key, async () => {
    const value = await SecureStore.getItemAsync(key, BACKGROUND_READABLE_OPTIONS);
    // Empty values are deletion tombstones. Never fall back to an older copy.
    if (value != null) return value || null;
    if (Platform.OS !== 'ios') return null;

    // Expo also searches authenticated legacy items when reading. Only the
    // foreground can migrate those; a headless GPS task must never launch Face
    // ID or interpret a temporarily inaccessible legacy item as signed out.
    if (AppState.currentState !== 'active') {
      throw new Error('Legacy secure storage needs foreground migration');
    }
    const legacyValue = await SecureStore.getItemAsync(key);
    if (legacyValue != null) {
      await SecureStore.setItemAsync(key, legacyValue, BACKGROUND_READABLE_OPTIONS);
    }
    return legacyValue || null;
  });
}

export function setItemAsync(key: string, value: string): Promise<void> {
  return withKeyOperation(key, () => SecureStore.setItemAsync(key, value, BACKGROUND_READABLE_OPTIONS));
}

export function deleteItemAsync(key: string): Promise<void> {
  return withKeyOperation(key, async () => {
    if (Platform.OS === 'ios') {
      // Retain the tombstone even if deleting an old locked/authenticated item
      // fails, so a later foreground migration cannot resurrect it.
      await SecureStore.setItemAsync(key, '', BACKGROUND_READABLE_OPTIONS);
      await SecureStore.deleteItemAsync(key).catch(() => {});
    } else {
      await SecureStore.deleteItemAsync(key, BACKGROUND_READABLE_OPTIONS);
    }
  });
}
