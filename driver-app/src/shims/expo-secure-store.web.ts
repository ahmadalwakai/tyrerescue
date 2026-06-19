type SecureStoreOptions = Record<string, unknown>;

const WEB_KEY_PREFIX = 'tyrerescue-driver:';
const memoryStore = new Map<string, string>();

export const AFTER_FIRST_UNLOCK = 0;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 0;
export const ALWAYS = 0;
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = 0;
export const ALWAYS_THIS_DEVICE_ONLY = 0;
export const WHEN_UNLOCKED = 0;
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 0;

function webKey(key: string): string {
  return `${WEB_KEY_PREFIX}${key}`;
}

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function isAvailableAsync(): Promise<boolean> {
  return true;
}

export async function getItemAsync(
  key: string,
  _options: SecureStoreOptions = {},
): Promise<string | null> {
  return getItem(key);
}

export async function setItemAsync(
  key: string,
  value: string,
  _options: SecureStoreOptions = {},
): Promise<void> {
  setItem(key, value);
}

export async function deleteItemAsync(
  key: string,
  _options: SecureStoreOptions = {},
): Promise<void> {
  const localStorage = getLocalStorage();
  if (localStorage) {
    localStorage.removeItem(webKey(key));
    return;
  }
  memoryStore.delete(key);
}

export function getItem(key: string, _options: SecureStoreOptions = {}): string | null {
  const localStorage = getLocalStorage();
  if (localStorage) {
    return localStorage.getItem(webKey(key));
  }
  return memoryStore.get(key) ?? null;
}

export function setItem(
  key: string,
  value: string,
  _options: SecureStoreOptions = {},
): void {
  const localStorage = getLocalStorage();
  if (localStorage) {
    localStorage.setItem(webKey(key), value);
    return;
  }
  memoryStore.set(key, value);
}

export function canUseBiometricAuthentication(): boolean {
  return false;
}

export default {
  AFTER_FIRST_UNLOCK,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  ALWAYS,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  ALWAYS_THIS_DEVICE_ONLY,
  WHEN_UNLOCKED,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  isAvailableAsync,
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
  getItem,
  setItem,
  canUseBiometricAuthentication,
};
