import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { API, requestJson } from './api';
import { deleteSecureItem, getSecureItem, setSecureItem } from './secure-storage';

const TOKEN_KEY = 'customer_token';

export interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export interface CustomerBookingSummary {
  refNumber: string;
  status: string;
  bookingType: string;
  serviceType: string;
  addressLine: string;
  totalAmount: number;
  tyreSizeDisplay: string | null;
  vehicleReg: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  scheduledAt: string | null;
  createdAt: string | null;
  invoiceDownloadToken: string | null;
}

interface CustomerAccountPayload {
  token?: string;
  profile: CustomerProfile;
  bookings: CustomerBookingSummary[];
  message?: string;
  created?: boolean;
}

interface ClaimBookingInput {
  refNumber: string;
  name: string;
  email: string;
  phone: string;
  password: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface CustomerAccountContextValue {
  token: string | null;
  profile: CustomerProfile | null;
  bookings: CustomerBookingSummary[];
  loading: boolean;
  createAccountFromBooking: (input: ClaimBookingInput) => Promise<CustomerAccountPayload>;
  forgotPassword: (email: string) => Promise<string>;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const CustomerAccountContext = createContext<CustomerAccountContextValue | null>(null);

export function CustomerAccountProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [bookings, setBookings] = useState<CustomerBookingSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const applyPayload = useCallback(async (payload: CustomerAccountPayload) => {
    if (payload.token) {
      await setSecureItem(TOKEN_KEY, payload.token);
      setToken(payload.token);
    }
    setProfile(payload.profile);
    setBookings(payload.bookings);
  }, []);

  const clearAccount = useCallback(async () => {
    await deleteSecureItem(TOKEN_KEY);
    setToken(null);
    setProfile(null);
    setBookings([]);
  }, []);

  const refreshWithToken = useCallback(async (nextToken: string) => {
    const payload = await requestJson<CustomerAccountPayload>(API.customerMe, {
      headers: { Authorization: `Bearer ${nextToken}` },
    });
    setProfile(payload.profile);
    setBookings(payload.bookings);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const savedToken = await getSecureItem(TOKEN_KEY);
        if (!mounted) return;
        if (!savedToken) {
          setLoading(false);
          return;
        }
        setToken(savedToken);
        await refreshWithToken(savedToken);
      } catch {
        await clearAccount();
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [clearAccount, refreshWithToken]);

  const createAccountFromBooking = useCallback(
    async (input: ClaimBookingInput) => {
      const payload = await requestJson<CustomerAccountPayload>(API.customerClaimBooking, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await applyPayload(payload);
      return payload;
    },
    [applyPayload],
  );

  const login = useCallback(
    async (input: LoginInput) => {
      const payload = await requestJson<CustomerAccountPayload>(API.customerLogin, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await applyPayload(payload);
    },
    [applyPayload],
  );

  const forgotPassword = useCallback(async (email: string) => {
    const payload = await requestJson<{ success: boolean; message: string }>(API.customerForgotPassword, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    return payload.message;
  }, []);

  const refresh = useCallback(async () => {
    const savedToken = token ?? (await getSecureItem(TOKEN_KEY));
    if (!savedToken) return;
    await refreshWithToken(savedToken);
  }, [refreshWithToken, token]);

  const value = useMemo(
    () => ({
      token,
      profile,
      bookings,
      loading,
      createAccountFromBooking,
      forgotPassword,
      login,
      logout: clearAccount,
      refresh,
    }),
    [bookings, clearAccount, createAccountFromBooking, forgotPassword, loading, login, profile, refresh, token],
  );

  return <CustomerAccountContext.Provider value={value}>{children}</CustomerAccountContext.Provider>;
}

export function useCustomerAccount() {
  const value = useContext(CustomerAccountContext);
  if (!value) {
    throw new Error('useCustomerAccount must be used inside CustomerAccountProvider');
  }
  return value;
}

export function humanBookingStatus(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
