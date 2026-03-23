import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  getToken,
  setToken as storeToken,
  clearToken,
  LoginResponse,
  driverApi,
} from '@/api/client';
import { unregisterPushToken } from '@/services/notifications';
import { stopBackgroundLocation } from '@/services/background-location';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  driverId: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await getToken();
        if (stored) {
          setTokenState(stored);
          // Validate token by fetching profile
          const profile = await driverApi.getProfile();
          setUser({
            id: profile.id,
            email: profile.email,
            name: profile.name,
            role: 'driver',
            driverId: profile.driverId,
          });
        }
      } catch {
        // Token invalid or expired — clear it
        await clearToken();
        setTokenState(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res: LoginResponse = await driverApi.login(email, password);
    await storeToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await unregisterPushToken();
    await stopBackgroundLocation();
    await clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
