import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { ApiError, getToken, setToken as storeToken, clearToken, getApiUrl, driverApi } from '@/api/client';
import { clearSavedDriverUser, driverDeviceDetails, flushDriverSessionRevocation, getSavedDriverUser,
  queueDriverSessionRevocation, saveDriverUser, type DriverUser } from '@/auth/session';
import { unregisterPushToken } from '@/services/notifications';
import { setOnlineLocationTracking } from '@/services/background-location';
import { clearAlertedRefs } from '@/services/job-alert';
import { stopAlertSound } from '@/services/sound';
import { DriverAlertWatcher } from '@/services/driver-watcher';

type SessionIssue = 'verification_required' | 'removed' | null;
interface AuthContextType {
  user: DriverUser | null;
  token: string | null;
  isLoading: boolean;
  sessionIssue: SessionIssue;
  login: (email: string, password: string) => Promise<void>;
  retrySession: () => Promise<void>;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType>({ user: null, token: null, isLoading: true, sessionIssue: null,
  login: async () => {}, retrySession: async () => {}, logout: async () => {} });

async function armWatcher(token: string) {
  try { await DriverAlertWatcher.startWatcher(await getApiUrl(), token); } catch { /* Best effort native watcher. */ }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DriverUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionIssue, setSessionIssue] = useState<SessionIssue>(null);
  const generation = useRef(0);
  const restoring = useRef(false);
  const logoutInFlight = useRef<Promise<void> | null>(null);
  const credentialWrite = useRef<Promise<void>>(Promise.resolve());

  const persistSession = useCallback(async (version: number, nextToken: string, nextUser: DriverUser) => {
    let committed = false;
    const pending = credentialWrite.current.catch(() => {}).then(async () => {
      if (version !== generation.current || logoutInFlight.current) return;
      await storeToken(nextToken);
      if (version !== generation.current || logoutInFlight.current) return;
      await saveDriverUser(nextUser);
      committed = version === generation.current && !logoutInFlight.current;
    });
    credentialWrite.current = pending;
    await pending;
    return committed;
  }, []);

  const retrySession = useCallback(async () => {
    if (restoring.current || logoutInFlight.current) return;
    restoring.current = true;
    const version = generation.current;
    try {
      const stored = await getToken();
      if (version !== generation.current) return;
      if (!stored) {
        await setOnlineLocationTracking(false);
        return;
      }
      setTokenState(stored);
      const cachedUser = await getSavedDriverUser();
      if (version !== generation.current) return;
      if (cachedUser) {
        setUser(cachedUser);
        setIsLoading(false);
      }
      const restored = await driverApi.restoreSession(driverDeviceDetails());
      if (version !== generation.current) return;
      if (!await persistSession(version, restored.token, restored.user)) return;
      if (version !== generation.current) return;
      setTokenState(restored.token);
      setUser(restored.user);
      setSessionIssue(null);
      void armWatcher(restored.token);
    } catch (error) {
      if (version !== generation.current) return;
      // Wi-Fi loss, cold launch and rejected requests never erase Keychain or
      // turn an Online driver Offline. Server authorization is still mandatory.
      if (error instanceof ApiError && error.status === 401) {
        const removed = error.serverCode === 'SESSION_REVOKED';
        setSessionIssue(removed ? 'removed' : 'verification_required');
        if (removed) await setOnlineLocationTracking(false);
      }
    } finally {
      restoring.current = false;
      if (version === generation.current) setIsLoading(false);
    }
  }, [persistSession]);

  useEffect(() => {
    void flushDriverSessionRevocation();
    void retrySession();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void flushDriverSessionRevocation();
        void retrySession();
      }
    });
    return () => { generation.current += 1; subscription.remove(); };
  }, [retrySession]);

  const login = useCallback(async (email: string, password: string) => {
    // A login screen can appear before native sign-out cleanup has finished.
    // Do not let that cleanup delete the next driver's saved credentials.
    while (logoutInFlight.current) await logoutInFlight.current;
    const version = ++generation.current;
    const previousUser = await getSavedDriverUser();
    if (version !== generation.current) return;
    const res = await driverApi.login(email, password, driverDeviceDetails());
    if (version !== generation.current) return;
    // Online consent belongs to the signed-in driver, never the next account.
    if (!previousUser || previousUser.id !== res.user.id) await setOnlineLocationTracking(false);
    if (!await persistSession(version, res.token, res.user)) return;
    if (version !== generation.current) return;
    setTokenState(res.token);
    setUser(res.user);
    setSessionIssue(null);
    void flushDriverSessionRevocation();
    void armWatcher(res.token);
  }, [persistSession]);

  const logout = useCallback(async () => {
    if (logoutInFlight.current) return logoutInFlight.current;
    generation.current += 1;
    const cleanup = (async () => {
      // A restore/login may already be inside an asynchronous Keychain write.
      // Finish it before capturing and clearing this account's credentials.
      await credentialWrite.current.catch(() => {});
      const current = await getToken().catch(() => null);
      setUser(null);
      setTokenState(null);
      setSessionIssue(null);
      setIsLoading(false);
      await setOnlineLocationTracking(false);
      // Persist retry before deleting the active credential if the driver signs
      // out while offline. This credential can only be used for device revocation.
      if (current) await queueDriverSessionRevocation(current).catch(() => {});
      await stopAlertSound();
      try { await DriverAlertWatcher.stopWatcher(); } catch { /* Best effort native cleanup. */ }
      await unregisterPushToken(current).catch(() => {});
      clearAlertedRefs();
      await clearToken();
      await clearSavedDriverUser().catch(() => {});
      void flushDriverSessionRevocation();
    })();
    logoutInFlight.current = cleanup;
    try { await cleanup; }
    finally { if (logoutInFlight.current === cleanup) logoutInFlight.current = null; }
  }, []);

  return <AuthContext.Provider value={{ user, token, isLoading, sessionIssue, login, retrySession, logout }}>
    {children}
  </AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
