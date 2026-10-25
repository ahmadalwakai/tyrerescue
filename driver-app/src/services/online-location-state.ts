import * as secureStorage from '@/services/secure-storage';

// Background tasks run without React mounted. Fail closed until Online has
// explicitly been persisted; a retained booking reference never grants consent.
export const ONLINE_LOCATION_ENABLED_KEY = 'online_location_enabled';
let enabled: boolean | null = null;
let revision = 0;
let writePending: Promise<void> = Promise.resolve();
const listeners = new Set<(online: boolean) => void>();

export function getOnlineLocationRevision(): number {
  return revision;
}

export async function isOnlineLocationEnabled(): Promise<boolean> {
  if (enabled != null) return enabled;
  const readingRevision = revision;
  // A locked Keychain/read error is not an Offline choice. Let the caller skip
  // this attempt and retry; caching false here permanently disables the native
  // task after a single transient failure in a headless launch.
  const stored = await secureStorage.getItemAsync(ONLINE_LOCATION_ENABLED_KEY);
  if (readingRevision === revision && enabled == null) enabled = stored === 'true';
  return enabled === true;
}

export function subscribeOnlineLocationState(listener: (online: boolean) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function setOnlineLocationEnabled(online: boolean): Promise<void> {
  // Every explicit stop also invalidates pending Online/status requests, even
  // if GPS was already disabled when logout began.
  if (enabled !== online || !online) revision += 1;
  enabled = online; // Stop in-flight work immediately, before storage/native awaits.
  for (const listener of listeners) listener(online);
  const write = writePending.catch(() => {}).then(() =>
    secureStorage.setItemAsync(ONLINE_LOCATION_ENABLED_KEY, online ? 'true' : 'false'),
  );
  writePending = write;
  try {
    await write;
  } catch (error) {
    if (online && enabled) {
      enabled = false;
      revision += 1;
      for (const listener of listeners) listener(false);
    }
    throw error;
  }
}
