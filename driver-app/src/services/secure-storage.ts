import * as SecureStore from 'expo-secure-store';

const BACKGROUND_READABLE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

export async function getItemAsync(key: string): Promise<string | null> {
  const backgroundReadableValue = await SecureStore.getItemAsync(
    key,
    BACKGROUND_READABLE_OPTIONS,
  );
  if (backgroundReadableValue != null) return backgroundReadableValue;

  const legacyValue = await SecureStore.getItemAsync(key);
  if (legacyValue != null) {
    await SecureStore.setItemAsync(key, legacyValue, BACKGROUND_READABLE_OPTIONS).catch(() => {});
  }
  return legacyValue;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value, BACKGROUND_READABLE_OPTIONS);
}

export async function deleteItemAsync(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key, BACKGROUND_READABLE_OPTIONS);
  await SecureStore.deleteItemAsync(key).catch(() => {});
}
