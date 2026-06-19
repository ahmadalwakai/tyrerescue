import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  API_BASE_URL,
  setAdminToken,
  setOnUnauthorized,
} from '@/lib/api';

const STORAGE_KEY = 'assistedChat.adminToken.v1';

// Mirrors the response shape from
// /app/api/mobile/admin/auth/login/route.ts → returns { token, user }.
interface MobileAdminLoginResponse {
  token: string;
  user: { id: string; name: string; email: string; role: 'admin' };
}

interface StoredSession {
  token: string;
  user: MobileAdminLoginResponse['user'];
}

export type AdminSessionStatus = 'loading' | 'logged-out' | 'logged-in';

export interface AdminSession {
  status: AdminSessionStatus;
  user: MobileAdminLoginResponse['user'] | null;
  loginError: string | null;
  expiredMessage: string | null;
  loggingIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function useAdminSession(): AdminSession {
  const [status, setStatus] = useState<AdminSessionStatus>('loading');
  const [user, setUser] = useState<MobileAdminLoginResponse['user'] | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [expiredMessage, setExpiredMessage] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const cancelled = useRef(false);

  // Hydrate from AsyncStorage on mount + register 401 handler.
  useEffect(() => {
    cancelled.current = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled.current) return;
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<StoredSession>;
          if (parsed.token && parsed.user) {
            setAdminToken(parsed.token);
            setUser(parsed.user);
            setStatus('logged-in');
            return;
          }
        }
      } catch {
        // ignore corrupt session
      }
      // Fall back to env token (dev convenience). Still treated as "logged-in"
      // so the chat opens, but no profile is shown.
      const envToken = process.env.EXPO_PUBLIC_ADMIN_TOKEN?.trim();
      if (envToken) {
        setAdminToken(envToken);
        setStatus('logged-in');
        return;
      }
      setStatus('logged-out');
    })();
    return () => {
      cancelled.current = true;
    };
  }, []);

  // Logout: clear storage + in-memory token + state.
  const logout = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setAdminToken(null);
    setUser(null);
    setStatus('logged-out');
  }, []);

  // Login: call existing /api/mobile/admin/auth/login, persist on success.
  // Endpoint contract (app/api/mobile/admin/auth/login/route.ts):
  //   POST { email, password } → { token, user } | { error } with 400/401/403/500.
  const login = useCallback(async (email: string, password: string) => {
    setLoginError(null);
    setExpiredMessage(null);
    setLoggingIn(true);
    try {
      let res: Response;
      try {
        res = await fetch(`${API_BASE_URL}/api/mobile/admin/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
          }),
        });
      } catch {
        // Network error: server not reachable, DNS, CORS, etc.
        const looksLikeLocalhost = /localhost|127\.0\.0\.1/.test(API_BASE_URL);
        throw new Error(
          looksLikeLocalhost
            ? 'Cannot reach the local API server. Make sure the web API is running.'
            : 'API base URL is not reachable. Check EXPO_PUBLIC_API_BASE_URL.',
        );
      }

      const ct = res.headers.get('content-type') || '';
      const payload: unknown = ct.includes('application/json')
        ? await res.json().catch(() => null)
        : null;

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

      const data = payload as MobileAdminLoginResponse;
      if (!data?.token || !data?.user) {
        throw new Error('Login failed. Please try again.');
      }
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ token: data.token, user: data.user } satisfies StoredSession),
      );
      setAdminToken(data.token);
      setUser(data.user);
      setStatus('logged-in');
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Login failed. Please try again.';
      setLoginError(message);
      throw err;
    } finally {
      setLoggingIn(false);
    }
  }, []);

  // Wire 401 → clear session + show "Session expired".
  useEffect(() => {
    setOnUnauthorized(() => {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
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
    login,
    logout,
  };
}
