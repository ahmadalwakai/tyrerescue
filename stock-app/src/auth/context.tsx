import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, stockApi, setApiAuthToken } from '@/api/client';
import * as storage from '@/services/secure-storage';
import type { SessionRole, StockUser } from '@/types';

const TOKEN_KEY = 'stock_token_v1';
const USER_KEY = 'stock_user_v1';

interface AuthContextValue {
  user: StockUser | null;
  token: string | null;
  isLoading: boolean;
  connectionError: string | null;
  retrySession: () => Promise<void>;
  login: (role: SessionRole, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function persist(token: string, user: StockUser) {
  await Promise.all([
    storage.setItemAsync(TOKEN_KEY, token),
    storage.setItemAsync(USER_KEY, JSON.stringify(user)),
  ]);
}

async function clear() {
  await Promise.all([
    storage.deleteItemAsync(TOKEN_KEY),
    storage.deleteItemAsync(USER_KEY),
  ]);
}

function isStockUser(value: unknown): value is StockUser {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StockUser>;
  return typeof candidate.id === 'string' && candidate.id.length > 0
    && typeof candidate.email === 'string' && candidate.email.length > 0
    && typeof candidate.name === 'string'
    && (candidate.role === 'admin' || candidate.role === 'driver');
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<StockUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const operation = useRef(0);
  const mounted = useRef(true);
  const session = useRef<{ token: string; user: StockUser } | null>(null);
  const refreshController = useRef<AbortController | null>(null);
  const storageQueue = useRef<Promise<void>>(Promise.resolve());

  // Serialize credential writes so a slow old bootstrap cannot erase a new login.
  const updateStorage = useCallback((revision: number, action: () => Promise<void>) => {
    const next = storageQueue.current.catch(() => {}).then(async () => {
      if (revision === operation.current) await action();
    });
    storageQueue.current = next;
    return next;
  }, []);

  const logout = useCallback(async () => {
    const revision = ++operation.current;
    refreshController.current?.abort();
    session.current = null;
    setToken(null);
    setUser(null);
    setIsLoading(false);
    setConnectionError(null);
    setApiAuthToken(null);
    await updateStorage(revision, clear);
  }, [updateStorage]);

  const retrySession = useCallback(async () => {
    const revision = ++operation.current;
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    const isCurrent = () => mounted.current && revision === operation.current;
    setIsLoading(true);
    setConnectionError(null);

    try {
      let restored = session.current;
      if (!restored) {
        await storageQueue.current.catch(() => {});
        if (!isCurrent()) return;
        const [storedToken, storedUser] = await Promise.all([
          storage.getItemAsync(TOKEN_KEY),
          storage.getItemAsync(USER_KEY),
        ]);
        if (!isCurrent()) return;

        let parsedUser: unknown = null;
        try { parsedUser = storedUser ? JSON.parse(storedUser) : null; } catch { /* Invalid stored identity. */ }
        if (!storedToken?.trim() || !isStockUser(parsedUser)) {
          session.current = null;
          setToken(null);
          setUser(null);
          setApiAuthToken(null);
          await updateStorage(revision, clear);
          return;
        }
        restored = { token: storedToken, user: parsedUser };
        session.current = restored;
        setToken(restored.token);
        setUser(restored.user);
      }

      setApiAuthToken(restored.token);
      const freshUser = await stockApi.refreshUser(restored.user.role, controller.signal);
      if (!isCurrent()) return;
      const nextUser = { ...freshUser, role: restored.user.role };
      if (!isStockUser(nextUser)) throw new ApiError('Unable to verify the session. Please try again.', 502);
      session.current = { token: restored.token, user: nextUser };
      setUser(nextUser);
      await updateStorage(revision, () => persist(restored.token, nextUser));
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        session.current = null;
        setToken(null);
        setUser(null);
        setApiAuthToken(null);
        await updateStorage(revision, clear).catch(() => {});
      } else {
        // Keep cached credentials through an offline launch or server outage.
        setConnectionError(error instanceof Error ? error.message : 'Unable to verify the session. Please try again.');
      }
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [updateStorage]);

  useEffect(() => {
    mounted.current = true;
    void retrySession();
    return () => {
      mounted.current = false;
      operation.current += 1;
      refreshController.current?.abort();
    };
  }, [retrySession]);

  const login = useCallback(async (role: SessionRole, email: string, password: string) => {
    const revision = ++operation.current;
    refreshController.current?.abort();
    try {
      const response = await stockApi.login(role, email, password);
      if (!mounted.current || revision !== operation.current) return;
      const nextUser = { ...response.user, role };
      if (!response.token?.trim() || !isStockUser(nextUser)) throw new ApiError('The server returned an invalid session. Please try again.', 502);
      session.current = { token: response.token, user: nextUser };
      setApiAuthToken(response.token);
      setToken(response.token);
      setUser(nextUser);
      setConnectionError(null);
      await updateStorage(revision, () => persist(response.token, nextUser));
    } finally {
      if (mounted.current && revision === operation.current) setIsLoading(false);
    }
  }, [updateStorage]);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      connectionError,
      retrySession,
      login,
      logout,
    }),
    [user, token, isLoading, connectionError, retrySession, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
