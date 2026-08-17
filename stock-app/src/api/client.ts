import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type {
  InventoryItem,
  LoginResponse,
  SaleChannel,
  SessionRole,
  StockCity,
  StockMovement,
  StockSeasonFilter,
  StockSortOption,
  StockShift,
  StockUser,
  StockWorker,
  TyreSeason,
} from '@/types';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

let authToken: string | null = null;
const PRODUCTION_API_BASE_URL = 'https://www.tyrerescue.uk';
const DEV_API_PORT = process.env.EXPO_PUBLIC_API_PORT?.trim() || '3002';

function localHostName(): string | null {
  if (typeof window !== 'undefined' && window.location.hostname) {
    return window.location.hostname;
  }

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  if (!hostUri) return null;
  return hostUri.replace(/^\[/, '').split(':')[0]?.replace(/\]$/, '') || null;
}

function inferBaseUrl(): string {
  const envBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/$/, '');

  if (Platform.OS === 'web' && __DEV__) {
    const host = localHostName();
    if (host) return `http://${host}:${DEV_API_PORT}`;
  }

  return PRODUCTION_API_BASE_URL;
}

export const API_BASE_URL = inferBaseUrl();

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function setApiAuthToken(token: string | null) {
  authToken = token;
}

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

export const stockApi = {
  login: (role: SessionRole, email: string, password: string) =>
    request<LoginResponse>(
      'POST',
      role === 'admin' ? '/api/mobile/admin/auth/login' : '/api/driver/auth/login',
      { email, password },
    ),

  refreshUser: async (role: SessionRole): Promise<StockUser> => {
    if (role === 'admin') {
      const response = await request<{ user: StockUser }>('GET', '/api/mobile/admin/auth/me');
      return response.user;
    }

    const profile = await request<{
      id: string;
      driverId: string;
      name: string;
      email: string;
    }>('GET', '/api/driver/profile');
    return { ...profile, role: 'driver' };
  },

  cities: () => request<{ items: StockCity[] }>('GET', '/api/stock/cities'),

  activeShift: () => request<{ shift: StockShift | null }>('GET', '/api/stock/shifts/active'),

  startShift: (cityId: string) =>
    request<{ shift: StockShift; alreadyStarted: boolean }>('POST', '/api/stock/shifts/start', {
      cityId,
      idempotencyKey: `stock-shift-start:${cityId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    }),

  endShift: (shiftId: string) =>
    request<{ shift: StockShift; alreadyEnded: boolean }>('POST', '/api/stock/shifts/end', {
      shiftId,
    }),

  workers: async (cityId: string) => {
    try {
      return await request<{ items: StockWorker[] }>(
        'GET',
        `/api/stock/workers?cityId=${encodeURIComponent(cityId)}`,
      );
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      const fallback = await request<{
        items: Array<{
          id: string;
          userId: string;
          name: string;
          email: string;
          phone?: string | null;
          isOnline?: boolean | null;
          status?: string | null;
        }>;
      }>('GET', '/api/mobile/admin/drivers?perPage=100&status=all');
      return {
        items: fallback.items.map((driver) => ({
          driverId: driver.id,
          userId: driver.userId,
          name: driver.name,
          email: driver.email,
          phone: driver.phone ?? null,
          isOnline: driver.isOnline ?? false,
          status: driver.status ?? 'offline',
          activeShift: null,
        })),
      };
    }
  },

  startWorkerShift: (cityId: string, workerUserId: string) =>
    request<{ shift: StockShift; alreadyStarted: boolean }>('POST', '/api/stock/workers', {
      action: 'start',
      cityId,
      workerUserId,
      idempotencyKey: `stock-worker-shift-start:${cityId}:${workerUserId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    }),

  endWorkerShift: (shiftId: string) =>
    request<{ shift: StockShift; alreadyEnded: boolean }>('POST', '/api/stock/workers', {
      action: 'end',
      shiftId,
    }),

  inventory: (cityId: string, search: string, season: StockSeasonFilter = 'all', sort: StockSortOption = 'size') =>
    request<{ items: InventoryItem[]; totalCount: number }>(
      'GET',
      `/api/stock/cities/${encodeURIComponent(cityId)}/inventory?perPage=50&search=${encodeURIComponent(search)}&season=${encodeURIComponent(season)}&sort=${encodeURIComponent(sort)}`,
    ),

  movements: (cityId: string) =>
    request<{ items: StockMovement[] }>(
      'GET',
      `/api/stock/cities/${encodeURIComponent(cityId)}/movements?perPage=10`,
    ),

  recordSale: (payload: {
    cityId: string;
    tyreProductId: string;
    shiftId: string;
    quantity: number;
    saleChannel: SaleChannel;
    bookingId?: string | null;
    note?: string | null;
  }) =>
    request<{ movement: StockMovement }>('POST', '/api/stock/movements', {
      cityId: payload.cityId,
      tyreProductId: payload.tyreProductId,
      movementType: 'SALE',
      quantityDelta: -Math.abs(payload.quantity),
      shiftId: payload.shiftId,
      saleChannel: payload.saleChannel,
      bookingId: payload.bookingId || null,
      note: payload.note || null,
      idempotencyKey: `stock-sale:${payload.shiftId}:${payload.tyreProductId}:${payload.saleChannel}:${Date.now()}`,
    }),

  adjustStock: (payload: {
    cityId: string;
    tyreProductId: string;
    direction: 'add' | 'reduce';
    quantity?: number;
    shiftId?: string | null;
    workerUserId?: string | null;
  }) => {
    const quantity = Math.max(1, Math.trunc(payload.quantity ?? 1));
    const isAdd = payload.direction === 'add';

    return request<{ movement: StockMovement }>('POST', '/api/stock/movements', {
      cityId: payload.cityId,
      tyreProductId: payload.tyreProductId,
      movementType: isAdd ? 'RECEIVED' : 'DAMAGED',
      quantityDelta: isAdd ? quantity : -quantity,
      workerUserId: payload.workerUserId || null,
      shiftId: payload.shiftId || null,
      bookingId: null,
      saleChannel: null,
      reason: isAdd ? 'quick_add_stock' : 'quick_reduce_stock',
      note: isAdd ? 'Quick stock add from Stock app' : 'Quick stock reduction from Stock app',
      idempotencyKey: `stock-adjust:${payload.cityId}:${payload.tyreProductId}:${payload.direction}:${Date.now()}`,
    });
  },

  updateSeason: async (cityId: string, tyreProductId: string, season: TyreSeason) => {
    try {
      return await request<{ product: InventoryItem['product'] }>(
        'PATCH',
        `/api/stock/cities/${encodeURIComponent(cityId)}/inventory`,
        { tyreProductId, season },
      );
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
        await request<{ success: boolean }>(
          'PATCH',
          `/api/mobile/admin/stock/${encodeURIComponent(tyreProductId)}`,
          { season },
        );
        return { product: { brand: '', pattern: '', sizeDisplay: '', season, priceNew: null, availableNew: true } };
      }
      throw error;
    }
  },

  recordMissingTyre: (payload: {
    cityId: string;
    size: string;
    shiftId?: string | null;
    saleChannel?: SaleChannel | null;
    bookingId?: string | null;
  }) =>
    request<{ item: unknown }>('POST', '/api/stock/missing-tyres', {
      cityId: payload.cityId,
      size: payload.size,
      shiftId: payload.shiftId || null,
      saleChannel: payload.saleChannel || null,
      bookingId: payload.bookingId || null,
    }),
};
