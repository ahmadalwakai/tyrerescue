import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { driverApi, type LoginResponse } from '@/api/client';
import * as secureStorage from '@/services/secure-storage';

const USER_KEY = 'driver_session_user_v1';
const PENDING_LOGOUT_KEY = 'driver_pending_logout_v1';
let revocationWrite: Promise<void> = Promise.resolve();
let revocationFlush: Promise<void> | null = null;
export type DriverUser = LoginResponse['user'];

export function driverDeviceDetails(): Record<string, unknown> {
  return { deviceName: Device.deviceName ?? undefined, modelName: Device.modelName ?? undefined,
    platform: Platform.OS, osVersion: Device.osVersion ?? undefined, appVersion: Application.nativeApplicationVersion ?? undefined };
}
function isDriverUser(value: unknown): value is DriverUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Record<string, unknown>;
  return user.role === 'driver' && ['id', 'driverId', 'name', 'email'].every((field) =>
    typeof user[field] === 'string' && (user[field] as string).length > 0);
}
/** Cached identity is display-only. All API authorization stays on the server. */
export async function getSavedDriverUser(): Promise<DriverUser | null> {
  try {
    const raw = await secureStorage.getItemAsync(USER_KEY);
    const user: unknown = raw ? JSON.parse(raw) : null;
    return isDriverUser(user) ? user : null;
  } catch { return null; }
}
export async function saveDriverUser(user: DriverUser): Promise<void> {
  if (!isDriverUser(user)) throw new Error('Invalid driver profile');
  await secureStorage.setItemAsync(USER_KEY, JSON.stringify(user));
}
export async function clearSavedDriverUser(): Promise<void> {
  await secureStorage.deleteItemAsync(USER_KEY);
}
/** Offline explicit sign-out retains only a protected revocation credential. */
async function pendingRevocations(): Promise<string[]> {
  const raw = await secureStorage.getItemAsync(PENDING_LOGOUT_KEY);
  if (!raw) return [];
  if (raw.startsWith('dcs_v1.')) return [raw];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((token): token is string => typeof token === 'string' && token.startsWith('dcs_v1.')) : [];
  } catch { return []; }
}
function updateRevocations(update: (tokens: string[]) => string[]): Promise<void> {
  const pending = revocationWrite.catch(() => {}).then(async () => {
    const tokens = update(await pendingRevocations());
    if (tokens.length) await secureStorage.setItemAsync(PENDING_LOGOUT_KEY, JSON.stringify(tokens));
    else await secureStorage.deleteItemAsync(PENDING_LOGOUT_KEY);
  });
  revocationWrite = pending;
  return pending;
}
export async function queueDriverSessionRevocation(token: string): Promise<void> {
  if (token.startsWith('dcs_v1.')) await updateRevocations((tokens) => [...new Set([...tokens, token])]);
}
export async function flushDriverSessionRevocation(): Promise<void> {
  if (revocationFlush) return revocationFlush;
  revocationFlush = (async () => {
    try {
      await revocationWrite.catch(() => {});
      for (const pending of await pendingRevocations()) {
        await driverApi.logoutSession(pending);
        // A newer logout can enqueue during this HTTP request; preserve it.
        await updateRevocations((tokens) => tokens.filter((token) => token !== pending));
      }
    } catch { /* Retry on next session restore/login without restoring sign-in. */ }
  })().finally(() => { revocationFlush = null; });
  return revocationFlush;
}
