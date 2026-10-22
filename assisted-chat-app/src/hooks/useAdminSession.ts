import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  clearInvalidAdminSessionStorage,
  readStoredAdminProjectId,
  readStoredAdminSession,
  subscribeAdminSessionStorage,
  writeStoredAdminSession,
  type StoredAdminSession,
} from '@/lib/admin-session-storage';
import { getAdminToken, getApiBaseUrl, setAdminToken, setApiBaseUrl } from '@/lib/api';
import {
  clearStoredProjectId,
  getProjectById,
  isStoredProjectPickerSelected,
  setStoredProjectId,
  type ProjectConfig,
  type ProjectId,
} from '@/lib/project-config';
import {
  logStartupCheckpoint,
  logStartupModuleCompleted,
  logStartupModuleFailed,
  logStartupModuleStarted,
} from '@/lib/startup-logging';
import { isSessionRestoreDisabled } from '@/lib/session-startup-config';
import { readAdminDeviceMetadata } from '@/lib/admin-device-metadata';
import { retainAdminDeviceHeartbeat, setAdminDeviceHeartbeatContext } from '@/lib/admin-device-heartbeat';

const GENERIC_LOGIN_ERROR = 'Login failed. Please try again.';
const STORAGE_RECOVERY_ERROR = 'Your saved sign-in could not be read. Retry to restore it; it has not been deleted.';
const LOGOUT_RECOVERY_ERROR = 'Sign-out could not be saved on this device. Retry to finish signing out before reopening the app.';
const PROJECT_RECOVERY_ERROR = 'The workspace selection could not be saved. Retry; your saved sign-ins have not been deleted.';
const FRIENDLY_LOGIN_ERRORS = new Set([
  'Email or password is incorrect, or this account is not an admin.',
  'This account is not allowed to sign in here.',
  'Email and password are required.',
  'Cannot reach the local API server. Make sure the web API is running.',
  'API base URL is not reachable. Check EXPO_PUBLIC_API_BASE_URL.',
  GENERIC_LOGIN_ERROR,
]);

type MobileAdminUser = { id: string; name: string; email: string; role: 'admin' };
interface MobileAdminLoginResponse { token: string; user: MobileAdminUser }
export type AdminSessionStatus = 'loading' | 'logged-out' | 'logged-in' | 'recovery';

interface SessionSnapshot {
  status: AdminSessionStatus;
  session: StoredAdminSession | null;
  activeProject: ProjectConfig | null;
  recoveryError: string | null;
  notice?: string | null;
}

// Index and Tax & Payroll mount separate hook instances. Their credentials,
// explicit sign-out and in-flight guards must belong to one runtime session.
let snapshot: SessionSnapshot | null = null;
let sessionRevision = 0;
let restorePromise: Promise<void> | null = null;
let loginOperation: object | null = null;
let issuingCoordinatedClear = false;
let observingStorage = false;
let mountedHooks = 0;
let legacyRetryTimer: ReturnType<typeof setInterval> | null = null;
let legacyAppStateListener: { remove: () => void } | null = null;
let legacyUpgradePromise: Promise<void> | null = null;
let legacyUpgradeController: AbortController | null = null;
let pendingLogout: {
  apiBaseUrl: string; token: string | null; project: ProjectConfig | null;
  reason?: string; notice?: string;
} | null = null;
type ProjectAction = { kind: 'select'; project: ProjectConfig } | { kind: 'clear' };
let pendingProjectAction: ProjectAction | null = null;
let projectOperations: Promise<unknown> = Promise.resolve();
const listeners = new Set<(value: SessionSnapshot) => void>();

/** Guards explicit logout cleanup against a later sign-in/project transition. */
export function getAdminSessionRevision(): number { return sessionRevision; }

function normaliseBaseUrl(url: string): string { return url.replace(/\/+$/, ''); }
function currentOperation(revision: number, apiBaseUrl: string): boolean {
  return revision === sessionRevision && normaliseBaseUrl(getApiBaseUrl()) === apiBaseUrl;
}

function publish(next: SessionSnapshot): void {
  snapshot = next;
  setAdminToken(next.status === 'logged-in' ? next.session?.token ?? null : null);
  const session = next.status === 'logged-in' ? next.session : null;
  const revision = sessionRevision;
  const apiBaseUrl = normaliseBaseUrl(session?.apiBaseUrl ?? getApiBaseUrl());
  setAdminDeviceHeartbeatContext(session?.token.startsWith('acs_v1.') ? {
    token: session.token,
    apiBaseUrl,
    revision,
    isCurrent: () => currentOperation(revision, apiBaseUrl) && snapshot?.session?.token === session.token,
    onRevoked: () => finishRemoteDeviceSignOut(revision, apiBaseUrl, session.token),
  } : null);
  for (const listener of listeners) listener(next);
  reconcileLegacyRetries();
}

function reconcileLegacyRetries(): void {
  const session = snapshot?.status === 'logged-in' ? snapshot.session : null;
  if (mountedHooks > 0 && session && !session.token.startsWith('acs_v1.')) {
    const retry = () => {
      const current = snapshot?.status === 'logged-in' ? snapshot.session : null;
      if (!current || current.token.startsWith('acs_v1.')) return;
      void upgradeLegacySession(current, sessionRevision, normaliseBaseUrl(getApiBaseUrl()));
    };
    // Renewal retries preserve a legacy sign-in after a temporary outage;
    // neither timer expiry nor an unsuccessful request signs the user out.
    if (!legacyRetryTimer) legacyRetryTimer = setInterval(retry, 5 * 60_000);
    if (!legacyAppStateListener) {
      legacyAppStateListener = AppState.addEventListener('change', (state) => {
        if (state === 'active') retry();
      });
    }
    return;
  }
  if (legacyRetryTimer) clearInterval(legacyRetryTimer);
  legacyRetryTimer = null;
  legacyAppStateListener?.remove();
  legacyAppStateListener = null;
  legacyUpgradeController?.abort();
  legacyUpgradeController = null;
  legacyUpgradePromise = null;
}

function signedOut(project: ProjectConfig | null, notice: string | null = null): SessionSnapshot {
  return { status: 'logged-out', session: null, activeProject: project, recoveryError: null, notice };
}

function recovery(project: ProjectConfig | null, message: string): void {
  publish({ status: 'recovery', session: null, activeProject: project, recoveryError: message });
}

function safeFailure(label: string): void {
  // Native/network errors can contain request values. Keep diagnostics useful
  // without ever putting credentials, tokens or storage contents in logs.
  logStartupModuleFailed(label, new Error('Saved sign-in operation unavailable.'));
}

function validateLoginResponse(payload: unknown): MobileAdminLoginResponse | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>;
  if (typeof value.token !== 'string' || !value.token.trim() ||
      !value.user || typeof value.user !== 'object' || Array.isArray(value.user)) return null;
  const user = value.user as Record<string, unknown>;
  if (user.role !== 'admin' || typeof user.id !== 'string' || !user.id.trim() ||
      typeof user.name !== 'string' || !user.name.trim() ||
      typeof user.email !== 'string' || !user.email.trim()) return null;
  return {
    token: value.token.trim(),
    user: { id: user.id.trim(), name: user.name.trim(), email: user.email.trim(), role: 'admin' },
  };
}

function clearStoredSession(reason: string): Promise<boolean> {
  // Suppress only this call's synchronous intent, never another action arriving
  // while native persistence is awaiting completion.
  issuingCoordinatedClear = true;
  try { return clearInvalidAdminSessionStorage(reason); }
  finally { issuingCoordinatedClear = false; }
}

function observeStorage(): void {
  if (observingStorage) return;
  observingStorage = true;
  subscribeAdminSessionStorage((event) => {
    if (event.kind !== 'clear-intent' || issuingCoordinatedClear ||
        normaliseBaseUrl(event.apiBaseUrl) !== normaliseBaseUrl(getApiBaseUrl())) return;
    // Explicit diagnostic recovery is another user-directed local sign-out.
    sessionRevision += 1;
    restorePromise = null;
    loginOperation = null;
    pendingLogout = null;
    pendingProjectAction = null;
    publish(signedOut(snapshot?.activeProject ?? null));
  });
}

async function revokeCapturedSession(apiBaseUrl: string, token: string | null): Promise<void> {
  if (!token?.startsWith('acs_v1.')) return;
  try {
    await fetch(`${apiBaseUrl}/api/mobile/admin/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  } catch {
    logStartupCheckpoint('session.logout.remote.unavailable');
  }
}

function upgradeLegacySession(session: StoredAdminSession, revision: number, apiBaseUrl: string): Promise<void> {
  if (session.token.startsWith('acs_v1.') || !currentOperation(revision, apiBaseUrl) ||
      snapshot?.session?.token !== session.token) return Promise.resolve();
  if (legacyUpgradePromise) return legacyUpgradePromise;
  const pending = attemptLegacyUpgrade(session, revision, apiBaseUrl);
  legacyUpgradePromise = pending;
  void pending.finally(() => {
    if (legacyUpgradePromise === pending) legacyUpgradePromise = null;
  });
  return pending;
}

async function attemptLegacyUpgrade(session: StoredAdminSession, revision: number, apiBaseUrl: string): Promise<void> {
  const controller = new AbortController();
  legacyUpgradeController = controller;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const payload = await Promise.race([
      (async () => {
        const response = await fetch(`${apiBaseUrl}/api/mobile/admin/auth/session`, {
          method: 'POST',
          signal: controller.signal,
          headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ device: readAdminDeviceMetadata() }),
        });
        return response.ok ? response.json() : null;
      })(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error('Legacy sign-in renewal request timed out.'));
        }, 8_000);
      }),
    ]);
    if (timeout) clearTimeout(timeout);
    timeout = null;
    if (controller.signal.aborted || !currentOperation(revision, apiBaseUrl)) return;
    const upgraded = validateLoginResponse(payload);
    if (!upgraded || !upgraded.token.startsWith('acs_v1.') ||
        !currentOperation(revision, apiBaseUrl)) return;
    const storedSession: StoredAdminSession = { ...upgraded, apiBaseUrl };
    await writeStoredAdminSession(storedSession);
    if (!currentOperation(revision, apiBaseUrl) || snapshot?.session?.token !== session.token) return;
    publish({ ...snapshot, session: storedSession });
    logStartupCheckpoint('session.legacy.upgrade.completed');
  } catch {
    // Expired legacy JWT, older servers, offline use and storage failures all
    // leave the cached sign-in intact. The API still authorizes every request.
    logStartupCheckpoint('session.legacy.upgrade.unavailable');
  } finally {
    if (timeout) clearTimeout(timeout);
    if (legacyUpgradeController === controller) legacyUpgradeController = null;
  }
}

async function restoreSession(projectOverride?: ProjectConfig | null): Promise<void> {
  if (restorePromise) return restorePromise;
  const revision = sessionRevision;
  restorePromise = (async () => {
    let project = projectOverride ?? snapshot?.activeProject ?? null;
    logStartupModuleStarted('Session hydration');
    logStartupCheckpoint('Session hydration started');
    try {
      if (projectOverride === undefined) {
        const projectId = await readStoredAdminProjectId();
        if (revision !== sessionRevision) return;
        project = projectId ? getProjectById(projectId) : null;
      }
      if (revision !== sessionRevision) return;
      if (project) setApiBaseUrl(project.apiBaseUrl);
      const apiBaseUrl = normaliseBaseUrl(getApiBaseUrl());
      if (isSessionRestoreDisabled()) {
        recovery(project, 'This build has saved sign-in restore paused. Your saved sign-in has not been deleted.');
        logStartupCheckpoint('Session restore skipped', { reason: 'startup-disabled' });
        return;
      }
      if (!project && await isStoredProjectPickerSelected()) {
        if (currentOperation(revision, apiBaseUrl)) publish(signedOut(null));
        return;
      }
      const stored = await readStoredAdminSession();
      if (!currentOperation(revision, apiBaseUrl)) return;
      const validated = validateLoginResponse(stored);
      if (stored && (!validated || (stored.apiBaseUrl &&
          normaliseBaseUrl(stored.apiBaseUrl) !== apiBaseUrl))) {
        recovery(project, STORAGE_RECOVERY_ERROR);
        return;
      }
      if (stored && validated) {
        const session: StoredAdminSession = { ...validated, apiBaseUrl };
        publish({ status: 'logged-in', session, activeProject: project, recoveryError: null });
        logStartupCheckpoint('Session hydration completed', { status: 'logged-in', source: 'storage' });
        // The protected app can reopen offline before this optional request.
        void upgradeLegacySession(session, revision, apiBaseUrl);
      } else {
        publish(signedOut(project));
        logStartupCheckpoint('Session hydration completed', { status: 'logged-out', source: 'none' });
      }
      logStartupModuleCompleted('Session hydration');
    } catch {
      if (revision !== sessionRevision) return;
      safeFailure('session.hydration.storage.unavailable');
      recovery(project, STORAGE_RECOVERY_ERROR);
    }
  })();
  const pending = restorePromise;
  try { await pending; }
  finally { if (restorePromise === pending) restorePromise = null; }
}

async function finishLogout(revision: number): Promise<void> {
  const operation = pendingLogout;
  if (!operation) return;
  // Persist the logout tombstone without waiting for connectivity. A failed
  // server request must never allow a local credential to reappear on restart.
  const clearing = clearStoredSession(operation.reason ?? 'manual_logout');
  void revokeCapturedSession(operation.apiBaseUrl, operation.token);
  const cleared = await clearing;
  if (!currentOperation(revision, operation.apiBaseUrl)) return;
  if (!cleared) {
    recovery(operation.project, LOGOUT_RECOVERY_ERROR);
    return;
  }
  pendingLogout = null;
  publish(signedOut(operation.project, operation.notice));
}

function finishRemoteDeviceSignOut(capturedRevision: number, apiBaseUrl: string, token: string): void {
  if (!currentOperation(capturedRevision, apiBaseUrl) || getAdminToken() !== token ||
      snapshot?.session?.token !== token) return;
  const revision = ++sessionRevision;
  const notice = 'This device was signed out by an administrator.';
  pendingLogout = {
    apiBaseUrl, token: null, project: snapshot.activeProject,
    reason: 'admin-remote-revoke', notice,
  };
  restorePromise = null;
  loginOperation = null;
  pendingProjectAction = null;
  publish(signedOut(pendingLogout.project, notice));
  // The server already revoked this device. Do not wait on notification
  // cleanup or send authenticated requests using its revoked credential.
  void finishLogout(revision).catch(() => {
    if (currentOperation(revision, apiBaseUrl)) recovery(snapshot?.activeProject ?? null, LOGOUT_RECOVERY_ERROR);
  });
}

async function performProjectAction(action: ProjectAction, revision: number): Promise<void> {
  const previousProject = snapshot?.activeProject ?? null;
  const oldBaseUrl = normaliseBaseUrl(getApiBaseUrl());
  const operation = projectOperations.catch(() => {}).then(async () => {
    if (!currentOperation(revision, oldBaseUrl)) return false;
    if (action.kind === 'select') await setStoredProjectId(action.project.id);
    else await clearStoredProjectId();
    if (!currentOperation(revision, oldBaseUrl)) {
      // An explicit newer action won while AsyncStorage was completing. Keep
      // its current selection instead of leaving this old write on disk.
      const currentProject = snapshot?.activeProject;
      if (currentProject) await setStoredProjectId(currentProject.id);
      else await clearStoredProjectId();
      return false;
    }
    return true;
  });
  projectOperations = operation;
  try {
    if (!await operation || !currentOperation(revision, oldBaseUrl)) return;
    pendingProjectAction = null;
    if (action.kind === 'clear') {
      publish(signedOut(null));
      return;
    }
    // Retain A's secure envelope. Only after B's selection is durable may any
    // B-scoped cached credential be restored or its API receive requests.
    setApiBaseUrl(action.project.apiBaseUrl);
    await restoreSession(action.project);
  } catch {
    if (currentOperation(revision, oldBaseUrl)) {
      safeFailure('session.project-selection.persist.failed');
      recovery(previousProject, PROJECT_RECOVERY_ERROR);
    }
  }
}

export interface AdminSession {
  status: AdminSessionStatus;
  user: MobileAdminUser | null;
  loginError: string | null;
  expiredMessage: string | null;
  recoveryError: string | null;
  loggingIn: boolean;
  activeProject: ProjectConfig | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retryRestore: () => Promise<void>;
  selectProject: (id: ProjectId) => Promise<void>;
  clearProject: () => Promise<void>;
}

export function useAdminSession(): AdminSession {
  const [state, setState] = useState<SessionSnapshot>(() => snapshot ?? {
    status: 'loading', session: null, activeProject: null, recoveryError: null,
  });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    mountedHooks += 1;
    const releaseHeartbeat = retainAdminDeviceHeartbeat();
    listeners.add(setState);
    observeStorage();
    if (snapshot) setState(snapshot);
    else void restoreSession();
    reconcileLegacyRetries();
    return () => {
      listeners.delete(setState);
      mountedHooks -= 1;
      releaseHeartbeat();
      reconcileLegacyRetries();
    };
  }, []);

  const logout = useCallback(async () => {
    const revision = ++sessionRevision;
    const apiBaseUrl = normaliseBaseUrl(getApiBaseUrl());
    pendingLogout = {
      apiBaseUrl,
      token: getAdminToken() ?? (pendingLogout?.apiBaseUrl === apiBaseUrl ? pendingLogout.token : null),
      project: snapshot?.activeProject ?? null,
    };
    restorePromise = null;
    pendingProjectAction = null;
    loginOperation = null;
    setLoggingIn(false);
    setLoginError(null);
    publish(signedOut(pendingLogout.project));
    await finishLogout(revision);
  }, []);

  const retryRestore = useCallback(async () => {
    const revision = ++sessionRevision;
    restorePromise = null;
    if (pendingLogout) {
      await finishLogout(revision);
      return;
    }
    if (pendingProjectAction) {
      await performProjectAction(pendingProjectAction, revision);
      return;
    }
    publish({ status: 'loading', session: null, activeProject: snapshot?.activeProject ?? null, recoveryError: null });
    await restoreSession();
  }, []);

  const selectProject = useCallback(async (id: ProjectId) => {
    let project: ProjectConfig;
    try { project = getProjectById(id); } catch { return; }
    const revision = ++sessionRevision;
    restorePromise = null;
    loginOperation = null;
    pendingLogout = null;
    setLoggingIn(false);
    setLoginError(null);
    const oldProject = snapshot?.activeProject ?? null;
    publish({ status: 'loading', session: null, activeProject: oldProject, recoveryError: null });
    pendingProjectAction = { kind: 'select', project };
    await performProjectAction(pendingProjectAction, revision);
  }, []);

  const clearProject = useCallback(async () => {
    const revision = ++sessionRevision;
    const project = snapshot?.activeProject ?? null;
    restorePromise = null;
    loginOperation = null;
    pendingLogout = null;
    setLoggingIn(false);
    setLoginError(null);
    publish(signedOut(project));
    pendingProjectAction = { kind: 'clear' };
    await performProjectAction(pendingProjectAction, revision);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (loginOperation) {
      logStartupCheckpoint('auth.submit.duplicate', { ignored: true });
      return;
    }
    const operation = {};
    loginOperation = operation;
    const revision = ++sessionRevision;
    const apiBaseUrl = normaliseBaseUrl(getApiBaseUrl());
    restorePromise = null;
    pendingLogout = null;
    pendingProjectAction = null;
    setLoginError(null);
    setLoggingIn(true);
    logStartupModuleStarted('auth.submit');
    logStartupCheckpoint('auth.submit.started', { hasEmail: Boolean(email.trim()), hasPassword: Boolean(password) });
    try {
      let response: Response;
      try {
        response = await fetch(`${apiBaseUrl}/api/mobile/admin/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password, persistentSession: true, device: readAdminDeviceMetadata() }),
        });
      } catch {
        throw new Error(/localhost|127\.0\.0\.1/.test(apiBaseUrl)
          ? 'Cannot reach the local API server. Make sure the web API is running.'
          : 'API base URL is not reachable. Check EXPO_PUBLIC_API_BASE_URL.');
      }
      if (!currentOperation(revision, apiBaseUrl)) return;
      let payload: unknown = null;
      if ((response.headers.get('content-type') ?? '').includes('application/json')) {
        payload = await response.json().catch(() => null);
      }
      if (!currentOperation(revision, apiBaseUrl)) return;
      logStartupCheckpoint('auth.response.received', { status: response.status, ok: response.ok });
      if (!response.ok) {
        throw new Error(response.status === 401
          ? 'Email or password is incorrect, or this account is not an admin.'
          : response.status === 403 ? 'This account is not allowed to sign in here.'
          : response.status === 400 ? 'Email and password are required.' : GENERIC_LOGIN_ERROR);
      }
      const data = validateLoginResponse(payload);
      if (!data) throw new Error(GENERIC_LOGIN_ERROR);
      logStartupCheckpoint('auth.response.validated', { hasToken: true, hasUser: true, role: data.user.role });
      const storedSession: StoredAdminSession = { ...data, apiBaseUrl };
      logStartupModuleStarted('auth.session.persist');
      logStartupCheckpoint('auth.session.persist.started');
      await writeStoredAdminSession(storedSession);
      logStartupCheckpoint('auth.session.persist.completed');
      logStartupModuleCompleted('auth.session.persist');
      if (!currentOperation(revision, apiBaseUrl)) return;
      logStartupCheckpoint('auth.state.commit.started');
      publish({ status: 'logged-in', session: storedSession, activeProject: snapshot?.activeProject ?? null, recoveryError: null });
      logStartupCheckpoint('auth.state.commit.completed', { status: 'logged-in' });
      logStartupModuleCompleted('auth.submit');
    } catch (error) {
      if (!currentOperation(revision, apiBaseUrl)) return;
      safeFailure('auth.submit.failed');
      const message = error instanceof Error ? error.message : '';
      setLoginError(FRIENDLY_LOGIN_ERRORS.has(message) ? message : GENERIC_LOGIN_ERROR);
      throw new Error(FRIENDLY_LOGIN_ERRORS.has(message) ? message : GENERIC_LOGIN_ERROR);
    } finally {
      if (loginOperation === operation) {
        loginOperation = null;
        setLoggingIn(false);
      }
    }
  }, []);

  // API failures never change this cached session. Only explicit logout,
  // project changes or user-directed recovery can remove local credentials.
  return {
    status: state.status,
    user: state.session?.user ?? null,
    loginError,
    expiredMessage: state.notice ?? null,
    recoveryError: state.recoveryError,
    loggingIn,
    activeProject: state.activeProject,
    login,
    logout,
    retryRestore,
    selectProject,
    clearProject,
  };
}
