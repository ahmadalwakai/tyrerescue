import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  logStartupModuleCompleted,
  logStartupModuleFailed,
  logStartupModuleStarted,
} from './startup-logging';

const PRODUCTION_API_URL = 'https://www.tyrerescue.uk';
const DEV_API_PORT = process.env.EXPO_PUBLIC_API_PORT?.trim() || '3002';

logStartupModuleStarted('API config module');

function buildDevHttpUrl(host: string, port: string): string {
  return ['http://', host, ':', port].join('');
}

function isPrivateLanHost(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [first, second] = parts;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isLocalDevHost(hostname: string): boolean {
  return isLoopbackHost(hostname) || isPrivateLanHost(hostname);
}

function getDevWebPageHostname(): string | null {
  if (!__DEV__ || Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const hostname = window.location?.hostname?.trim();
  return hostname && isLocalDevHost(hostname) ? hostname : null;
}

function buildUrlLikeCurrentWithHost(current: URL, hostname: string): string {
  return buildDevHttpUrl(hostname, current.port || DEV_API_PORT);
}

function normalizeDevWebApiBaseUrl(): void {
  if (!__DEV__ || Platform.OS !== 'web') return;
  try {
    const current = new URL(resolvedApiBaseUrl);
    if (current.protocol !== 'http:' || !isLocalDevHost(current.hostname)) return;

    const pageHostname = getDevWebPageHostname();
    if (!pageHostname || current.hostname === pageHostname) return;

    const nextBaseUrl = buildUrlLikeCurrentWithHost(current, pageHostname);
    if (__DEV__) {
      console.log(`[api] normalized dev web base URL: ${resolvedApiBaseUrl} → ${nextBaseUrl}`);
    }
    resolvedApiBaseUrl = nextBaseUrl;
  } catch {
    // Keep the original URL if parsing fails; request handling will surface it.
  }
}

function getDevWebFallbackBaseUrls(): string[] {
  if (!__DEV__ || Platform.OS !== 'web') return [];
  try {
    const current = new URL(resolvedApiBaseUrl);
    if (current.protocol !== 'http:' || !isLocalDevHost(current.hostname)) return [];

    const candidates = [
      getDevWebPageHostname(),
      'localhost',
      '127.0.0.1',
    ].filter((hostname): hostname is string => Boolean(hostname));

    return Array.from(new Set(candidates))
      .map((hostname) => buildUrlLikeCurrentWithHost(current, hostname))
      .filter((url) => url !== resolvedApiBaseUrl);
  } catch {
    return [];
  }
}

// Resolves the base URL for the Next.js API:
// 1. EXPO_PUBLIC_API_BASE_URL if set (recommended for device on LAN).
// 2. Production falls back to the live API so release builds never ship
//    pointing at Android emulator localhost.
// 3. Development web uses the browser host, while native development derives
//    the Metro host and falls back to the Android emulator host on DEV_API_PORT.
function inferBaseUrl(): string {
  const envBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/$/, '');

  if ((process.env.NODE_ENV ?? 'development') === 'production') {
    return PRODUCTION_API_URL;
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const host = window.location?.hostname || ['local', 'host'].join('');
    return buildDevHttpUrl(host, DEV_API_PORT);
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host) return buildDevHttpUrl(host, DEV_API_PORT);
  }
  return buildDevHttpUrl('10.0.2.2', DEV_API_PORT);
}

let resolvedApiBaseUrl: string;
try {
  resolvedApiBaseUrl = inferBaseUrl();
  logStartupModuleCompleted('API config module', {
    platform: Platform.OS,
    nodeEnv: process.env.NODE_ENV,
    hasExplicitBaseUrl: Boolean(process.env.EXPO_PUBLIC_API_BASE_URL?.trim()),
  });
} catch (error) {
  logStartupModuleFailed('API config module', error, {
    platform: Platform.OS,
    nodeEnv: process.env.NODE_ENV,
  });
  throw error;
}

// Kept for backward compat — reflects the initial resolved URL only.
// Prefer getApiBaseUrl() for runtime reads so project switching is respected.
export const API_BASE_URL = resolvedApiBaseUrl;

export function getApiBaseUrl(): string {
  return resolvedApiBaseUrl;
}

// EXPO_PUBLIC_API_BASE_URL always wins (dev LAN override).
// In production, calling setApiBaseUrl switches the active project backend.
export function setApiBaseUrl(url: string): void {
  if (process.env.EXPO_PUBLIC_API_BASE_URL?.trim()) return;
  resolvedApiBaseUrl = url.replace(/\/$/, '');
}

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

interface RequestOptions {
  signal?: AbortSignal;
}

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options.signal,
  };

  normalizeDevWebApiBaseUrl();

  let res: Response | null = null;
  const baseUrls = [resolvedApiBaseUrl, ...getDevWebFallbackBaseUrls()];
  let lastNetworkError: unknown = null;

  for (let index = 0; index < baseUrls.length; index += 1) {
    const baseUrl = baseUrls[index];
    try {
      res = await fetch(`${baseUrl}${path}`, requestInit);
      resolvedApiBaseUrl = baseUrl;
      break;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      lastNetworkError = error;
      const nextBaseUrl = baseUrls[index + 1];
      if (__DEV__ && nextBaseUrl) {
        console.warn(
          `[api] ${method} ${baseUrl}${path} failed; retrying ${nextBaseUrl}${path}`,
          error,
        );
      }
    }
  }

  if (!res) {
    throw lastNetworkError ?? new TypeError('Failed to fetch');
  }

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
    } else if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const r = payload as Record<string, unknown>;
      if (typeof r.error === 'string' && r.error.trim()) message = r.error;
      else if (typeof r.message === 'string' && r.message.trim()) message = r.message;
    }
    if (__DEV__) {
      console.warn(`[api] ${method} ${resolvedApiBaseUrl}${path} → ${res.status}`, payload);
    }
    throw new ApiError(message, res.status, payload);
  }

  return payload as T;
}

export const api = {
  get: <T>(p: string, options?: RequestOptions) => request<T>('GET', p, undefined, options),
  post: <T>(p: string, b?: unknown, options?: RequestOptions) => request<T>('POST', p, b, options),
  patch: <T>(p: string, b?: unknown, options?: RequestOptions) => request<T>('PATCH', p, b, options),
  put: <T>(p: string, b?: unknown, options?: RequestOptions) => request<T>('PUT', p, b, options),
  del: <T>(p: string, options?: RequestOptions) => request<T>('DELETE', p, undefined, options),
  get baseUrl() { return resolvedApiBaseUrl; },
  get hasAdminToken() {
    return currentToken !== null;
  },
};
