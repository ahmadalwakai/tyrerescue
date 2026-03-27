import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { apiClient, ApiError, setApiAuthToken } from '@/api/client';
import { ADMIN_APP_TOKEN_KEY, ADMIN_APP_USER_KEY } from '@/auth/storage';
import type { AdminUser, LoginResponse } from '@/types/auth';

interface AuthContextValue {
  user: AdminUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function persistSession(token: string, user: AdminUser) {
  await Promise.all([
    SecureStore.setItemAsync(ADMIN_APP_TOKEN_KEY, token),
    SecureStore.setItemAsync(ADMIN_APP_USER_KEY, JSON.stringify(user)),
  ]);
}

async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(ADMIN_APP_TOKEN_KEY),
    SecureStore.deleteItemAsync(ADMIN_APP_USER_KEY),
  ]);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
    setApiAuthToken(null);
    await clearSession();
  }, []);

  const refreshUser = useCallback(async () => {
    const response = await apiClient.get<{ user: AdminUser }>('/api/mobile/admin/auth/me');
    setUser(response.user);
    await SecureStore.setItemAsync(ADMIN_APP_USER_KEY, JSON.stringify(response.user));
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          SecureStore.getItemAsync(ADMIN_APP_TOKEN_KEY),
          SecureStore.getItemAsync(ADMIN_APP_USER_KEY),
        ]);

        if (!storedToken || !storedUser) {
          await clearSession();
          setIsLoading(false);
          return;
        }

        const parsedUser = JSON.parse(storedUser) as AdminUser;
        setToken(storedToken);
        setUser(parsedUser);
        setApiAuthToken(storedToken);

        try {
          await refreshUser();
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            await logout();
          }
        }
      } catch {
        await logout();
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap();
  }, [logout, refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiClient.post<LoginResponse>('/api/mobile/admin/auth/login', {
      email,
      password,
    });

    setToken(response.token);
    setUser(response.user);
    setApiAuthToken(response.token);
    await persistSession(response.token, response.user);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isLoading,
      login,
      logout,
      refreshUser,
    }),
    [token, user, isLoading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
