import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ADMIN_SESSION_STORAGE_KEY,
  clearInvalidAdminSessionStorage,
} from '@/lib/admin-session-storage';
import {
  getApiBaseUrl,
  setAdminToken,
  setApiBaseUrl,
  setOnUnauthorized,
} from '@/lib/api';
import {
  clearStoredProjectId,
  getProjectById,
  getStoredProjectId,
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

const STORAGE_KEY = ADMIN_SESSION_STORAGE_KEY;
const GENERIC_LOGIN_ERROR = 'Login failed. Please try again.';
const FRIENDLY_LOGIN_ERRORS = new Set([
  'Email or password is incorrect, or this account is not an admin.',
  'This account is not allowed to sign in here.',
  'Email and password are required.',
  'Cannot reach the local API server. Make sure the web API is running.',
  'API base URL is not reachable. Check EXPO_PUBLIC_API_BASE_URL.',
  GENERIC_LOGIN_ERROR,
]);

// Mirrors the response shape from
// /app/api/mobile/admin/auth/login/route.ts → returns { token, user }.
type MobileAdminUser = { id: string; name: string; email: string; role: 'admin' };

interface MobileAdminLoginResponse {
  token: string;
  user: MobileAdminUser;
}

interface StoredSession {
  token: string;
  user: MobileAdminLoginResponse['user'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function validateAdminUser(value: unknown): MobileAdminUser | null {
  if (!isRecord(value)) return null;
  const id = readNonEmptyString(value.id);
  const name = readNonEmptyString(value.name);
  const email = readNonEmptyString(value.email);
  if (!id || !name || !email || value.role !== 'admin') return null;
  return { id, name, email, role: 'admin' };
}

function validateLoginResponse(payload: unknown): MobileAdminLoginResponse | null {
  if (!isRecord(payload)) return null;
  const token = readNonEmptyString(payload.token);
  const user = validateAdminUser(payload.user);
  return token && user ? { token, user } : null;
}

function validateStoredSession(payload: unknown): StoredSession | null {
  const session = validateLoginResponse(payload);
  return session ? { token: session.token, user: session.user } : null;
}

function userFacingLoginError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return FRIENDLY_LOGIN_ERRORS.has(message) ? message : GENERIC_LOGIN_ERROR;
}

async function clearStoredSession(reason: string): Promise<void> {
  await clearInvalidAdminSessionStorage(reason);
}

export type AdminSessionStatus = 'loading' | 'logged-out' | 'logged-in';

export interface AdminSession {
  status: AdminSessionStatus;
  user: MobileAdminLoginResponse['user'] | null;
  loginError: string | null;
  expiredMessage: string | null;
  loggingIn: boolean;
  activeProject: ProjectConfig | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  selectProject: (id: ProjectId) => Promise<void>;
  clearProject: () => Promise<void>;
}

export function useAdminSession(): AdminSession {
  const [status, setStatus] = useState<AdminSessionStatus>('loading');
  const [user, setUser] = useState<MobileAdminLoginResponse['user'] | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [expiredMessage, setExpiredMessage] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [activeProject, setActiveProject] = useState<ProjectConfig | null>(null);
  const cancelled = useRef(false);
  const loginInFlight = useRef(false);

  // Hydrate project + session from AsyncStorage on mount + register 401 handler.
  useEffect(() => {
    cancelled.current = false;
    logStartupModuleStarted('Session hydration');
    logStartupCheckpoint('Session hydration started');
    (async () => {
      // Step 1: Restore active project and apply its API URL.
      const storedProjectId = await getStoredProjectId();
      let restoredProject: ProjectConfig | null = null;
      if (storedProjectId) {
        try {
          restoredProject = getProjectById(storedProjectId);
          setApiBaseUrl(restoredProject.apiBaseUrl);
          setActiveProject(restoredProject);
        } catch {
          await clearStoredProjectId();
        }
      }
      if (cancelled.current) return;

      const restoreDisabled = isSessionRestoreDisabled();
      let storageSource: 'none' | 'storage' | 'malformed-storage' | 'restore-disabled' =
        restoreDisabled ? 'restore-disabled' : 'none';
      try {
        if (restoreDisabled) {
          logStartupCheckpoint('Session restore skipped', { reason: 'startup-disabled' });
        } else {
          const raw = await AsyncStorage.getItem(STORAGE_KEY);
          if (cancelled.current) return;
          if (raw) {
            const parsed = JSON.parse(raw) as unknown;
            const storedSession = validateStoredSession(parsed);
            if (storedSession) {
              setAdminToken(storedSession.token);
              setUser(storedSession.user);
              setStatus('logged-in');
              logStartupCheckpoint('Session hydration completed', { status: 'logged-in', source: 'storage' });
              logStartupModuleCompleted('Session hydration');
              return;
            }
            storageSource = 'malformed-storage';
            await clearStoredSession('malformed-session');
          }
        }
      } catch (error) {
        storageSource = 'malformed-storage';
        logStartupModuleFailed('session.hydration.failed', error, { source: 'storage' });
        await clearStoredSession('hydrate-failed');
      }
      // Fall back to env token (dev convenience). Still treated as "logged-in"
      // so the chat opens, but no profile is shown.
      const envToken = process.env.EXPO_PUBLIC_ADMIN_TOKEN?.trim();
      if (envToken) {
        setAdminToken(envToken);
        setStatus('logged-in');
        logStartupCheckpoint('Session hydration completed', { status: 'logged-in', source: 'env' });
        logStartupModuleCompleted('Session hydration');
        return;
      }
      setStatus('logged-out');
      logStartupCheckpoint('Session hydration completed', { status: 'logged-out', source: storageSource });
      logStartupModuleCompleted('Session hydration');
    })();
    return () => {
      cancelled.current = true;
    };
  }, []);

  // Select a project: switches the active backend, clears any existing session.
  const selectProject = useCallback(async (id: ProjectId) => {
    let project: ProjectConfig;
    try {
      project = getProjectById(id);
    } catch {
      return;
    }
    // Clear existing session — it belongs to the previous backend.
    // Clear token in-memory first so any in-flight request with the old token
    // does not race against the new backend even if storage removal fails.
    setAdminToken(null);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      logStartupModuleFailed('session.project-switch.storage.clear.failed', error, { toProject: id });
    }
    setApiBaseUrl(project.apiBaseUrl);
    setActiveProject(project);
    await setStoredProjectId(id);
    setStatus('logged-out');
  }, []);

  // Clear project selection and session — returns to workspace picker.
  const clearProject = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // best effort
    }
    await clearStoredProjectId();
    setAdminToken(null);
    setUser(null);
    setActiveProject(null);
    setStatus('logged-out');
  }, []);

  // Logout: clear storage + in-memory token + state. Keeps project selection.
  const logout = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      logStartupModuleFailed('session.logout.storage.failed', error);
    }
    setAdminToken(null);
    setUser(null);
    setStatus('logged-out');
  }, []);

  // Login: call existing /api/mobile/admin/auth/login, persist on success.
  // Endpoint contract (app/api/mobile/admin/auth/login/route.ts):
  //   POST { email, password } → { token, user } | { error } with 400/401/403/500.
  const login = useCallback(async (email: string, password: string) => {
    if (loginInFlight.current) {
      logStartupCheckpoint('auth.submit.duplicate', { ignored: true });
      return;
    }
    loginInFlight.current = true;
    let stage = 'auth.submit.started';
    setLoginError(null);
    setExpiredMessage(null);
    setLoggingIn(true);
    logStartupModuleStarted('auth.submit');
    logStartupCheckpoint('auth.submit.started', {
      hasEmail: Boolean(email.trim()),
      hasPassword: Boolean(password),
    });
    try {
      let res: Response;
      try {
        res = await fetch(`${getApiBaseUrl()}/api/mobile/admin/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
          }),
        });
      } catch (error) {
        logStartupModuleFailed('auth.request.failed', error, { stage });
        // Network error: server not reachable, DNS, CORS, etc.
        const looksLikeLocalhost = /localhost|127\.0\.0\.1/.test(getApiBaseUrl());
        throw new Error(
          looksLikeLocalhost
            ? 'Cannot reach the local API server. Make sure the web API is running.'
            : 'API base URL is not reachable. Check EXPO_PUBLIC_API_BASE_URL.',
        );
      }

      const ct = res.headers.get('content-type') || '';
      let payload: unknown = null;
      if (ct.includes('application/json')) {
        try {
          payload = await res.json();
        } catch (error) {
          logStartupModuleFailed('auth.response.decode.failed', error, { status: res.status });
        }
      }
      stage = 'auth.response.received';
      logStartupCheckpoint('auth.response.received', {
        status: res.status,
        ok: res.ok,
        json: ct.includes('application/json'),
      });

      if (!res.ok) {
        // Map server response → friendly user-facing message. Never surface
        // raw JSON or stack traces.
        let message: string;
        if (res.status === 401) {
          message =
            'Email or password is incorrect, or this account is not an admin.';
        } else if (res.status === 403) {
          // 403 is also used by the route for non-admin / unverified email.
          // Prefer the server's message when present, otherwise generic.
          const serverMsg =
            payload && typeof payload === 'object'
              ? (payload as Record<string, unknown>).error
              : null;
          message =
            typeof serverMsg === 'string' && serverMsg.trim()
              ? serverMsg
              : 'This account is not allowed to sign in here.';
        } else if (res.status === 400) {
          message = 'Email and password are required.';
        } else {
          message = 'Login failed. Please try again.';
        }
        throw new Error(message);
      }

      const data = validateLoginResponse(payload);
      if (!data) {
        throw new Error(GENERIC_LOGIN_ERROR);
      }
      stage = 'auth.response.validated';
      logStartupCheckpoint('auth.response.validated', {
        hasToken: true,
        hasUser: true,
        role: data.user.role,
      });

      const storedSession: StoredSession = { token: data.token, user: data.user };
      const serializedSession = JSON.stringify(storedSession);
      stage = 'auth.session.persist.started';
      logStartupModuleStarted('auth.session.persist');
      logStartupCheckpoint('auth.session.persist.started');
      try {
        await AsyncStorage.setItem(STORAGE_KEY, serializedSession);
      } catch (error) {
        logStartupModuleFailed('auth.session.persist.failed', error);
        throw error;
      }
      stage = 'auth.session.persist.completed';
      logStartupCheckpoint('auth.session.persist.completed');
      logStartupModuleCompleted('auth.session.persist');

      if (cancelled.current) return;
      stage = 'auth.state.commit.started';
      logStartupCheckpoint('auth.state.commit.started');
      setAdminToken(data.token);
      setUser(data.user);
      setStatus('logged-in');
      stage = 'auth.state.commit.completed';
      logStartupCheckpoint('auth.state.commit.completed', { status: 'logged-in' });
      logStartupModuleCompleted('auth.submit');
    } catch (err) {
      logStartupModuleFailed('auth.submit.failed', err, { stage });
      if (!cancelled.current) setLoginError(userFacingLoginError(err));
      throw err;
    } finally {
      loginInFlight.current = false;
      if (!cancelled.current) setLoggingIn(false);
    }
  }, []);

  // Wire 401 → clear session + show "Session expired".
  useEffect(() => {
    setOnUnauthorized(() => {
      clearStoredSession('unauthorized').catch((error) => {
        logStartupModuleFailed('session.unauthorized.clear.failed', error);
      });
      setAdminToken(null);
      setUser(null);
      setExpiredMessage('Session expired. Please log in again.');
      setStatus('logged-out');
    });
    return () => {
      setOnUnauthorized(null);
    };
  }, []);

  return {
    status,
    user,
    loginError,
    expiredMessage,
    loggingIn,
    activeProject,
    login,
    logout,
    selectProject,
    clearProject,
  };
}
