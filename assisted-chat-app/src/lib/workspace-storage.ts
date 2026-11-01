import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl, getWorkspaceSourceApp } from './api';

const LEGACY_OWNER_KEY = 'assistedChat.localDataWorkspace.v1';
let operations: Promise<unknown> = Promise.resolve();

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const pending = operations.then(operation, operation);
  operations = pending.catch(() => undefined);
  return pending;
}

function normalize(baseUrl: string): string { return baseUrl.replace(/\/+$/, ''); }

async function legacyOwner(baseUrl: string): Promise<string> {
  const owner = await AsyncStorage.getItem(LEGACY_OWNER_KEY);
  if (owner) return owner;
  await AsyncStorage.setItem(LEGACY_OWNER_KEY, baseUrl);
  return baseUrl;
}

/** Bind pre-workspace local data to its source before switching endpoints. */
export function prepareWorkspaceStorage(apiBaseUrl: string): Promise<void> {
  return serialized(async () => { await legacyOwner(normalize(apiBaseUrl)); });
}

/** Capture both scopes once so delayed writes cannot follow a workspace switch. */
export function createWorkspaceStorage(apiBaseUrl = getApiBaseUrl(), sourceApp = getWorkspaceSourceApp()) {
  const baseUrl = normalize(apiBaseUrl);
  const sourceSuffix = sourceApp ? `.source.${encodeURIComponent(sourceApp)}` : '';
  const scopedKey = (key: string) => `${key}.workspace.${encodeURIComponent(baseUrl)}${sourceSuffix}`;
  return {
    getItem(key: string): Promise<string | null> {
      return serialized(async () => {
        const owner = await legacyOwner(baseUrl);
        const stored = await AsyncStorage.getItem(scopedKey(key));
        if (stored !== null || owner !== baseUrl || sourceApp !== null) return stored;
        const legacy = await AsyncStorage.getItem(key);
        if (legacy !== null) {
          // Copy durably before removing the old key. Other workspaces never
          // read the old record, even if cleanup cannot complete.
          await AsyncStorage.setItem(scopedKey(key), legacy);
          await AsyncStorage.removeItem(key).catch(() => undefined);
        }
        return legacy;
      });
    },
    setItem(key: string, value: string): Promise<void> {
      return serialized(async () => {
        await legacyOwner(baseUrl);
        await AsyncStorage.setItem(scopedKey(key), value);
      });
    },
    removeItem(key: string): Promise<void> {
      return serialized(async () => {
        const owner = await legacyOwner(baseUrl);
        // Clear the legacy copy first so it cannot reappear after clearing.
        if (owner === baseUrl && sourceApp === null) await AsyncStorage.removeItem(key);
        await AsyncStorage.removeItem(scopedKey(key));
      });
    },
  };
}
