import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getApiBaseUrl } from './api';
import { getProjectById, isValidProjectId, type ProjectId } from './project-config';
import { logStartupModuleFailed } from './startup-logging';

/** Legacy key retained only for safe migration of existing installations. */
export const ADMIN_SESSION_STORAGE_KEY = 'assistedChat.adminToken.v1';
const PROJECT_STORAGE_KEY = 'assistedChat.activeProject.v1';
const MAX_ENVELOPE_BYTES = 1_900;

export interface StoredAdminSession {
  token: string;
  user: { id: string; name: string; email: string; role: 'admin' };
  /** Required for new writes; optional only for legacy migration input. */
  apiBaseUrl?: string;
}

type SessionStorageEvent = { kind: 'write' | 'clear-intent' | 'clear'; apiBaseUrl: string; revision: number };
const listeners = new Set<(event: SessionStorageEvent) => void>();
let revision = 0;
let clearGeneration = 0;
let operations: Promise<unknown> = Promise.resolve();

export function getAdminSessionStorageRevision(): number {
  return revision;
}

export function subscribeAdminSessionStorage(listener: (event: SessionStorageEvent) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notify(kind: SessionStorageEvent['kind'], apiBaseUrl: string): void {
  for (const listener of listeners) {
    try { listener({ kind, apiBaseUrl, revision }); } catch { /* A UI listener cannot undo persistence. */ }
  }
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = operations.then(operation, operation);
  operations = next.catch(() => undefined);
  return next;
}

export function normalizeAdminSessionApiBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid session backend.');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function keys(apiBaseUrl: string) {
  // SecureStore keys support only letters, numbers, dots, underscores and dashes.
  const suffix = Array.from(apiBaseUrl).map((character) => character.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  const credential = `${ADMIN_SESSION_STORAGE_KEY}.backend.${suffix}`;
  return { credential, logout: `${credential}.loggedOut` };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength ? value.trim() : null;
}

function validateSession(value: unknown): StoredAdminSession | null {
  if (!record(value) || !record(value.user)) return null;
  const token = boundedString(value.token, 4_096);
  const id = boundedString(value.user.id, 128);
  const name = boundedString(value.user.name, 255);
  const email = boundedString(value.user.email, 255);
  if (!token || !/^[A-Za-z0-9._~-]+$/.test(token) || !id || !name || !email || value.user.role !== 'admin') return null;
  if (value.apiBaseUrl !== undefined && typeof value.apiBaseUrl !== 'string') return null;
  let apiBaseUrl: string | undefined;
  try { apiBaseUrl = value.apiBaseUrl === undefined ? undefined : normalizeAdminSessionApiBaseUrl(value.apiBaseUrl as string); } catch { return null; }
  return { token, user: { id, name, email, role: 'admin' }, ...(apiBaseUrl ? { apiBaseUrl } : {}) };
}

function parseSession(raw: string): StoredAdminSession | null {
  try { return validateSession(JSON.parse(raw)); } catch { return null; }
}

function safeFailure(stage: string): Error {
  const error = new Error('Unable to access saved sign-in. Please retry.');
  logStartupModuleFailed(stage, error);
  return error;
}

export async function readStoredAdminProjectId(): Promise<ProjectId | null> {
  try {
    const projectId = await AsyncStorage.getItem(PROJECT_STORAGE_KEY);
    return isValidProjectId(projectId) ? projectId : null;
  } catch { throw safeFailure('session.storage.project-read.failed'); }
}

async function secureStore() {
  // Keep native module loading inside a guarded async operation, never startup
  // module evaluation. Native builds must contain expo-secure-store.
  const secure = await import('expo-secure-store');
  if (!await secure.isAvailableAsync()) throw new Error('Secure storage unavailable.');
  return secure;
}

async function getCredential(key: string): Promise<string | null> {
  return Platform.OS === 'web' ? AsyncStorage.getItem(key) : (await secureStore()).getItemAsync(key);
}

async function setCredential(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') return AsyncStorage.setItem(key, value);
  const secure = await secureStore();
  await secure.setItemAsync(key, value, { keychainAccessible: secure.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
}

async function deleteCredential(key: string): Promise<void> {
  if (Platform.OS === 'web') return AsyncStorage.removeItem(key);
  await (await secureStore()).deleteItemAsync(key);
}

async function legacyBackend(session: StoredAdminSession): Promise<string | null> {
  if (session.apiBaseUrl) return session.apiBaseUrl;
  // The old envelope had no backend. Accept it only alongside an explicitly
  // saved known project whose URL matches the active backend.
  const projectId = await readStoredAdminProjectId();
  return projectId !== null ? normalizeAdminSessionApiBaseUrl(getProjectById(projectId).apiBaseUrl) : null;
}

function encodeSession(session: StoredAdminSession): string {
  const value = JSON.stringify(session);
  // Use UTF-8 bytes, rather than JS character count, for iOS's small values.
  const bytes = encodeURIComponent(value).replace(/%[A-F\d]{2}/gi, '_').length;
  if (bytes > MAX_ENVELOPE_BYTES) throw new Error('Saved sign-in is too large.');
  return value;
}

async function persist(session: StoredAdminSession & { apiBaseUrl: string }): Promise<void> {
  const scope = keys(session.apiBaseUrl);
  const value = encodeSession(session);
  const previous = await getCredential(scope.credential);
  const previousLogout = await AsyncStorage.getItem(scope.logout);
  await setCredential(scope.credential, value);
  // Commit credentials first. A crash before this step remains safely logged
  // out; a failed write must never remove an existing logout barrier.
  if (previousLogout) {
    try {
      await AsyncStorage.removeItem(scope.logout);
    } catch {
      try {
        if (previous !== null) await setCredential(scope.credential, previous);
        else await deleteCredential(scope.credential);
      } catch { safeFailure('session.storage.write-rollback.failed'); }
      try { await AsyncStorage.setItem(scope.logout, previousLogout); } catch { safeFailure('session.storage.logout-rollback.failed'); }
      throw new Error('Saved sign-in could not be committed.');
    }
  }
}

async function removeMatchingLegacy(apiBaseUrl: string): Promise<void> {
  const raw = await AsyncStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
  if (!raw) return;
  const session = parseSession(raw);
  if (!session || await legacyBackend(session) === apiBaseUrl) {
    await AsyncStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
  }
}

async function blockRestoreAndRemove(apiBaseUrl: string): Promise<boolean> {
  const scope = keys(apiBaseUrl);
  try {
    // This nonsecret durable barrier blocks both secure and legacy restoration.
    await AsyncStorage.setItem(scope.logout, '1');
  } catch {
    safeFailure('session.storage.clear.failed');
    return false;
  }
  notify('clear', apiBaseUrl);
  try { await deleteCredential(scope.credential); } catch { safeFailure('session.storage.secure-cleanup.failed'); }
  try { await removeMatchingLegacy(apiBaseUrl); } catch { safeFailure('session.storage.legacy-cleanup.failed'); }
  return true;
}

/** I/O or malformed-data failures reject without clearing any credentials. */
export function readStoredAdminSession(): Promise<StoredAdminSession | null> {
  const apiBaseUrl = normalizeAdminSessionApiBaseUrl(getApiBaseUrl());
  return serialized(async () => {
    try {
      const scope = keys(apiBaseUrl);
      if (await AsyncStorage.getItem(scope.logout)) return null;
      const raw = await getCredential(scope.credential);
      if (raw) {
        const session = parseSession(raw);
        if (session?.apiBaseUrl === apiBaseUrl) return session;
        // A different backend inside this backend's secure key is inconsistent
        // data. Preserve it for recovery; never silently present a fresh login.
        throw new Error('Saved sign-in needs recovery.');
      }

      const legacy = await AsyncStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
      if (!legacy) return null;
      const session = parseSession(legacy);
      if (!session) throw new Error('Saved sign-in needs recovery.');
      const boundBackend = await legacyBackend(session);
      if (!boundBackend) throw new Error('Saved sign-in backend needs recovery.');
      if (boundBackend !== apiBaseUrl) return null;
      const migrated = { ...session, apiBaseUrl };
      await persist(migrated);
      // Secure persistence succeeds before the old plaintext copy is removed.
      try { await AsyncStorage.removeItem(ADMIN_SESSION_STORAGE_KEY); } catch { safeFailure('session.storage.legacy-cleanup.failed'); }
      return migrated;
    } catch {
      throw safeFailure('session.storage.read.failed');
    }
  });
}

export function writeStoredAdminSession(session: StoredAdminSession): Promise<void> {
  const validated = validateSession(session);
  if (!validated?.apiBaseUrl) return Promise.reject(new Error('A saved sign-in requires its backend.'));
  const scoped = { ...validated, apiBaseUrl: validated.apiBaseUrl };
  const capturedGeneration = clearGeneration;
  revision += 1;
  return serialized(async () => {
    if (capturedGeneration !== clearGeneration) throw safeFailure('session.storage.write-cancelled');
    try { await persist(scoped); } catch { throw safeFailure('session.storage.write.failed'); }
    try { await removeMatchingLegacy(scoped.apiBaseUrl); } catch { safeFailure('session.storage.legacy-cleanup.failed'); }
    notify('write', scoped.apiBaseUrl);
  });
}

/** Only explicit logout/project changes or known malformed-data repair may clear. */
export function clearInvalidAdminSessionStorage(reason: string): Promise<boolean> {
  const manualReasons = ['manual_logout', 'manual-logout', 'logout', 'project-switch', 'project_switch', 'clear-project', 'clear_project', 'diagnostics-recovery-action', 'admin-remote-revoke'];
  if (!manualReasons.includes(reason) && !['malformed-session', 'malformed-storage'].includes(reason)) return Promise.resolve(false);
  const apiBaseUrl = normalizeAdminSessionApiBaseUrl(getApiBaseUrl());
  revision += 1;
  clearGeneration += 1;
  // Cancel pending login/upgrade work in every mounted hook before any await.
  // The later clear event confirms that restoration is durably blocked.
  notify('clear-intent', apiBaseUrl);
  return serialized(() => blockRestoreAndRemove(apiBaseUrl));
}
