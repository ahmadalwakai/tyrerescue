import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { stockApi, setApiAuthToken } from '@/api/client';
import * as storage from '@/services/secure-storage';
import type { SessionRole, StockUser } from '@/types';

const TOKEN_KEY = 'stock_token_v1';
const USER_KEY = 'stock_user_v1';

interface AuthContextValue {
  user: StockUser | null;
  token: string | null;
  isLoading: boolean;
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

export function AuthProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<StockUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
    setApiAuthToken(null);
    await clear();
  }, []);

  useEffect(() => {
    setApiAuthToken(token);
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const [storedToken, storedUser] = await Promise.all([
          storage.getItemAsync(TOKEN_KEY),
          storage.getItemAsync(USER_KEY),
        ]);

        if (!storedToken || !storedUser) {
          await clear();
          return;
        }

        const parsedUser = JSON.parse(storedUser) as StockUser;
        setApiAuthToken(storedToken);
        const freshUser = await stockApi.refreshUser(parsedUser.role);

        if (!cancelled) {
          setToken(storedToken);
          setUser({ ...freshUser, role: parsedUser.role });
        }
      } catch {
        await logout();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [logout]);

  const login = useCallback(async (role: SessionRole, email: string, password: string) => {
    const response = await stockApi.login(role, email, password);
    const nextUser = { ...response.user, role };
    setApiAuthToken(response.token);
    setToken(response.token);
    setUser(nextUser);
    await persist(response.token, nextUser);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      login,
      logout,
    }),
    [user, token, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
