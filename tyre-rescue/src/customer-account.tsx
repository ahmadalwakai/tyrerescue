import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { API, CustomerApiError, isCustomerConnectionError, requestJson } from './api';
import { clearBookingAccess } from './customer-booking-access';
import { detachCustomerPushDevice, forgetCustomerPushDevice } from './customer-push-device';
import { clearBookingDraft, invalidateBookingDraftSession } from './booking-draft-storage';
import { clearCustomerAssistedHelp } from './customer-assisted-help';
import { clearStoredCustomerAccount, customerAccountStorageScope, loadCustomerAccountSnapshot, loadCustomerAccountToken, storeCustomerAccountSnapshot } from './customer-account-cache';

export interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  emailVerified?: boolean;
}

export interface CustomerBookingSummary {
  bookingId: string;
  refNumber: string;
  status: string;
  bookingType: string;
  serviceType: string;
  addressLine: string;
  totalAmount: number;
  tyreSizeDisplay: string | null;
  tyreQuantity?: number | null;
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
  bookingAccessToken?: string;
}

interface RegisterInput {
  name: string;
  email: string;
  phone?: string | null;
  password: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface CustomerAccountContextValue {
  sessionRevision: number;
  token: string | null;
  profile: CustomerProfile | null;
  bookings: CustomerBookingSummary[];
  loading: boolean;
  refreshing: boolean;
  offline: boolean;
  lastSyncedAt: number | null;
  connectionError: string | null;
  createAccountFromBooking: (input: ClaimBookingInput) => Promise<CustomerAccountPayload>;
  forgotPassword: (email: string) => Promise<string>;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<CustomerAccountPayload>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (input: { name: string; phone: string | null }) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

const CustomerAccountContext = createContext<CustomerAccountContextValue | null>(null);

export function CustomerAccountProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [bookings, setBookings] = useState<CustomerBookingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sessionRevision, setSessionRevision] = useState(0);
  const scope = useRef(0);
  const activeToken = useRef<string | null>(null);
  const activeCustomerId = useRef<string | null>(null);

  const applyPayload = useCallback(async (payload: CustomerAccountPayload) => {
    const revision = ++scope.current;
    if (activeToken.current && payload.token && activeCustomerId.current !== payload.profile.id) {
      invalidateBookingDraftSession();
      setLoading(true);
      setSessionRevision((value) => value + 1);
      void detachCustomerPushDevice(activeToken.current).catch(() => undefined);
      await Promise.all([clearStoredCustomerAccount(), clearBookingDraft(), clearBookingAccess(), clearCustomerAssistedHelp()]);
    }
    if (revision !== scope.current) return;
    if (payload.token) {
      await storeCustomerAccountSnapshot(payload.token, payload.profile, payload.bookings, customerAccountStorageScope(), true);
      if (revision !== scope.current) return;
      activeToken.current = payload.token;
      setToken(payload.token);
    }
    setProfile(payload.profile);
    activeCustomerId.current = payload.profile.id;
    setBookings(payload.bookings);
    setLastSyncedAt(Date.now());
    setOffline(false);
    setConnectionError(null);
    setLoading(false);
  }, []);

  const clearAccount = useCallback(async (deleted = false) => {
    const revision = ++scope.current;
    invalidateBookingDraftSession();
    setLoading(true);
    setSessionRevision((value) => value + 1);
    const previousToken = activeToken.current;
    activeToken.current = null;
    activeCustomerId.current = null;
    const pushCleanup = deleted ? forgetCustomerPushDevice() : null;
    if (!deleted) void detachCustomerPushDevice(previousToken).catch(() => undefined);
    setToken(null);
    setProfile(null);
    setBookings([]);
    setLastSyncedAt(null);
    setOffline(false);
    setConnectionError(null);
    setRefreshing(false);
    try {
      await Promise.all([clearStoredCustomerAccount(), clearBookingDraft(), clearBookingAccess(), clearCustomerAssistedHelp(), ...(pushCleanup ? [pushCleanup] : [])]);
    } finally {
      if (revision === scope.current) setLoading(false);
    }
  }, []);

  const refreshWithToken = useCallback(async (nextToken: string) => {
    const requestScope = ++scope.current;
    setRefreshing(true);
    try {
      const payload = await requestJson<CustomerAccountPayload>(API.customerMe, {
        headers: { Authorization: `Bearer ${nextToken}` },
      });
      if (scope.current !== requestScope || activeToken.current !== nextToken) return;
      setProfile(payload.profile);
      activeCustomerId.current = payload.profile.id;
      setBookings(payload.bookings);
      setLastSyncedAt(Date.now());
      setOffline(false);
      setConnectionError(null);
      void storeCustomerAccountSnapshot(nextToken, payload.profile, payload.bookings, customerAccountStorageScope()).catch(() => undefined);
    } catch (error) {
      if (scope.current !== requestScope || activeToken.current !== nextToken) return;
      if (error instanceof CustomerApiError && (error.status === 401 || error.status === 403)) {
        await clearAccount();
      } else {
        setOffline(isCustomerConnectionError(error));
        setConnectionError(error instanceof Error ? error.message : 'Unable to refresh your account. Please try again.');
      }
    } finally {
      if (scope.current === requestScope) setRefreshing(false);
    }
  }, [clearAccount]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const savedToken = await loadCustomerAccountToken();
        if (!mounted) return;
        if (!savedToken) {
          setLoading(false);
          return;
        }
        setToken(savedToken);
        activeToken.current = savedToken;
        const snapshot = await loadCustomerAccountSnapshot(savedToken);
        if (!mounted || activeToken.current !== savedToken) return;
        if (snapshot) {
          setProfile(snapshot.profile);
          activeCustomerId.current = snapshot.profile.id;
          setBookings(snapshot.bookings);
          setLastSyncedAt(snapshot.savedAt);
          setOffline(true);
          setLoading(false);
        }
        await refreshWithToken(savedToken);
      } catch (error) {
        if (mounted) setConnectionError(error instanceof Error ? error.message : 'Unable to open your saved account. Please try again.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
      scope.current += 1;
    };
  }, [clearAccount, refreshWithToken]);

  const createAccountFromBooking = useCallback(
    async (input: ClaimBookingInput) => {
      const requestScope = ++scope.current;
      const payload = await requestJson<CustomerAccountPayload>(API.customerClaimBooking, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      if (requestScope !== scope.current) throw new Error('Your account session changed. Please try again.');
      await applyPayload(payload);
      return payload;
    },
    [applyPayload],
  );

  const login = useCallback(
    async (input: LoginInput) => {
      const requestScope = ++scope.current;
      const payload = await requestJson<CustomerAccountPayload>(API.customerLogin, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      if (requestScope !== scope.current) throw new Error('Your account session changed. Please try again.');
      await applyPayload(payload);
    },
    [applyPayload],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const requestScope = ++scope.current;
      const payload = await requestJson<CustomerAccountPayload>(API.customerRegister, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      if (requestScope !== scope.current) throw new Error('Your account session changed. Please try again.');
      await applyPayload(payload);
      return payload;
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
    const savedToken = activeToken.current;
    if (!savedToken) return;
    await refreshWithToken(savedToken);
  }, [refreshWithToken]);

  const updateProfile = useCallback(async (input: { name: string; phone: string | null }) => {
    const currentToken = activeToken.current;
    const requestScope = ++scope.current;
    setRefreshing(false);
    if (!currentToken) throw new Error('Sign in to update your account.');
    const payload = await requestJson<CustomerAccountPayload>(API.customerProfile, {
      method: 'PATCH', headers: { Authorization: `Bearer ${currentToken}` }, body: JSON.stringify(input),
    });
    if (scope.current !== requestScope || activeToken.current !== currentToken) return;
    setProfile(payload.profile);
    setBookings(payload.bookings);
    setLastSyncedAt(Date.now());
    setOffline(false);
    setConnectionError(null);
    await storeCustomerAccountSnapshot(currentToken, payload.profile, payload.bookings, customerAccountStorageScope()).catch(() => undefined);
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    const currentToken = activeToken.current;
    if (!currentToken) throw new Error('Sign in to delete your account.');
    await requestJson(API.customerDeleteAccount, {
      method: 'DELETE', headers: { Authorization: `Bearer ${currentToken}` }, body: JSON.stringify({ password, confirmation: 'DELETE' }),
    });
    if (activeToken.current !== currentToken) return;
    await clearAccount(true);
  }, [clearAccount]);

  const logout = useCallback(() => clearAccount(), [clearAccount]);

  const value = useMemo(
    () => ({
      sessionRevision,
      token,
      profile,
      bookings,
      loading,
      refreshing,
      offline,
      lastSyncedAt,
      connectionError,
      createAccountFromBooking,
      forgotPassword,
      login,
      register,
      logout,
      refresh,
      updateProfile,
      deleteAccount,
    }),
    [bookings, connectionError, createAccountFromBooking, deleteAccount, forgotPassword, lastSyncedAt, loading, login, logout, offline, profile, refresh, refreshing, register, sessionRevision, token, updateProfile],
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
