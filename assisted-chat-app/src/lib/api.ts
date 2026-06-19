import Constants from 'expo-constants';
import { Platform } from 'react-native';

const PRODUCTION_API_URL = 'https://www.tyrerescue.uk';

function buildDevHttpUrl(host: string, port: string): string {
  return ['http://', host, ':', port].join('');
}

// Resolves the base URL for the Next.js API:
// 1. EXPO_PUBLIC_API_BASE_URL if set (recommended for device on LAN).
// 2. Production falls back to the live API so release builds never ship
//    pointing at Android emulator localhost.
// 3. Development web uses the browser host, while native development derives
//    the Metro host and falls back to the Android emulator host.
function inferBaseUrl(): string {
  const envBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/$/, '');

  if (process.env.NODE_ENV === 'production') {
    return PRODUCTION_API_URL;
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const host = window.location?.hostname || ['local', 'host'].join('');
    return buildDevHttpUrl(host, '3000');
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host) return buildDevHttpUrl(host, '3000');
  }
  return buildDevHttpUrl('10.0.2.2', '3000');
}

export const API_BASE_URL = inferBaseUrl();

// Dev-only diagnostic so engineers can see exactly which Next.js host the
// app will hit. Never logs tokens, credentials, or env values besides the
// resolved base URL. Production/EAS builds skip this entirely.
if (__DEV__) {
  console.log('[api] resolved base URL:', API_BASE_URL);
}

// Admin Bearer token holder.
//
// The server accepts a Bearer mobile JWT signed with the existing
// NEXTAUTH_SECRET (see `signMobileToken` / `requireAdminMobile` in
// lib/auth.ts on the web). Tokens are minted via the existing endpoint
//   POST /api/mobile/admin/auth/login
// and stored locally by `useAdminSession` after the login screen.
//
// EXPO_PUBLIC_ADMIN_TOKEN remains as an optional dev-only fallback so the
// app still works when no one has logged in yet.
let currentToken: string | null =
  process.env.EXPO_PUBLIC_ADMIN_TOKEN?.trim() || null;
let onUnauthorized: (() => void) | null = null;

export function setAdminToken(token: string | null): void {
  currentToken = token && token.trim() ? token.trim() : null;
}

export function getAdminToken(): string | null {
  return currentToken;
}

export function setOnUnauthorized(cb: (() => void) | null): void {
  onUnauthorized = cb;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const ct = res.headers.get('content-type') || '';
  const payload: unknown = ct.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    if (res.status === 401) {
      // Notify the session hook so it can clear local state and show login.
      message = 'Session expired. Please log in again.';
      if (onUnauthorized) {
        try {
          onUnauthorized();
        } catch {
          // ignore notifier errors
        }
      }
    } else if (payload && typeof payload === 'object') {
      const r = payload as Record<string, unknown>;
      if (typeof r.error === 'string' && r.error.trim()) message = r.error;
      else if (typeof r.message === 'string' && r.message.trim()) message = r.message;
    }
    throw new ApiError(message, res.status, payload);
  }

  return payload as T;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b),
  del: <T>(p: string) => request<T>('DELETE', p),
  baseUrl: API_BASE_URL,
  get hasAdminToken() {
    return currentToken !== null;
  },
};
