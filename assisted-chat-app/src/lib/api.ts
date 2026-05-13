import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Resolves the base URL for the local Next.js API:
// 1. EXPO_PUBLIC_API_BASE_URL if set (recommended for device on LAN).
// 2. On web, use the browser's own hostname on :3000 (so localhost:8081 in
//    the browser hits localhost:3000 for the API). 10.0.2.2 is unreachable
//    from a desktop browser.
// 3. Native production falls back to the live API so EAS builds never ship
//    pointing at Android emulator localhost.
// 4. Otherwise, derive host from Expo's hostUri (Metro bundler) and use
//    :3000. On Android emulator in development, fall back to 10.0.2.2:3000.
function inferBaseUrl(): string {
  const envBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/$/, '');

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const host = window.location?.hostname || 'localhost';
    return `http://${host}:3000`;
  }

  if (process.env.NODE_ENV === 'production') {
    return 'https://www.tyrerescue.uk';
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host) return `http://${host}:3000`;
  }
  return 'http://10.0.2.2:3000';
}

export const API_BASE_URL = inferBaseUrl();

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
  baseUrl: API_BASE_URL,
  get hasAdminToken() {
    return currentToken !== null;
  },
};
