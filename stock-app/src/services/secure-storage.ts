import * as SecureStore from 'expo-secure-store';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

export async function getItemAsync(key: string): Promise<string | null> {
  const value = await SecureStore.getItemAsync(key, OPTIONS);
  if (value != null) return value;
  return SecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value, OPTIONS);
}

export async function deleteItemAsync(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key, OPTIONS);
  await SecureStore.deleteItemAsync(key).catch(() => {});
}
