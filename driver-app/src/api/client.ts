import * as secureStorage from '@/services/secure-storage';
import { Platform } from 'react-native';

const TOKEN_KEY = 'auth_token';
const API_URL_KEY = 'api_url';
const PRODUCTION_API_URL = 'https://www.tyrerescue.uk';
const API_TIMEOUT_MS = 15_000;

function devWebApiUrl(): string {
  return ['http://', ['local', 'host'].join(''), ':3000'].join('');
}

function legacyDevWebApiUrl(): string {
  return ['http://', ['local', 'host'].join(''), ':3002'].join('');
}

function defaultApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl) return envUrl;
  if (isDevelopmentBuild() && Platform.OS === 'web') return devWebApiUrl();
  return PRODUCTION_API_URL;
}

function shouldReplaceStoredApiUrl(stored: string | null): boolean {
  if (!stored || !isDevelopmentBuild() || Platform.OS !== 'web') return false;
  if (process.env.EXPO_PUBLIC_API_URL?.trim()) return false;
  const normalized = normalizeApiUrl(stored);
  return normalized === PRODUCTION_API_URL || normalized === legacyDevWebApiUrl();
}

let cachedToken: string | null = null;
let cachedApiUrl: string | null = null;

function isDevelopmentBuild(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function normalizeApiUrl(url: string | null): string {
  const raw = (url ?? '').trim();
  if (!raw) return defaultApiUrl();
  try {
    const parsed = new URL(raw);
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return defaultApiUrl();
  }
}

function isUnsafeProductionApiUrl(url: string): boolean {
  if (isDevelopmentBuild()) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const isPrivate172 = /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
    const isPrivateHost =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '10.0.2.2' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      isPrivate172 ||
      host.endsWith('.local');
    return parsed.protocol !== 'https:' || isPrivateHost;
  } catch {
    return true;
  }
}

async function persistApiUrl(url: string): Promise<void> {
  try {
    await secureStorage.setItemAsync(API_URL_KEY, url);
  } catch {
    // SecureStore failures should not prevent falling back to production.
  }
}

export async function getApiUrl(): Promise<string> {
  if (cachedApiUrl && !isUnsafeProductionApiUrl(cachedApiUrl)) return cachedApiUrl;
  const stored = await secureStorage.getItemAsync(API_URL_KEY);
  const normalized = normalizeApiUrl(shouldReplaceStoredApiUrl(stored) ? null : stored);
  cachedApiUrl = isUnsafeProductionApiUrl(normalized) ? PRODUCTION_API_URL : normalized;
  if (stored !== cachedApiUrl) {
    void persistApiUrl(cachedApiUrl);
  }
  return cachedApiUrl;
}

export async function setApiUrl(url: string) {
  const normalized = normalizeApiUrl(url);
  cachedApiUrl = isUnsafeProductionApiUrl(normalized) ? PRODUCTION_API_URL : normalized;
  await secureStorage.setItemAsync(API_URL_KEY, cachedApiUrl);
}

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  cachedToken = await secureStorage.getItemAsync(TOKEN_KEY);
  return cachedToken;
}

export async function setToken(token: string) {
  cachedToken = token;
  try {
    await secureStorage.setItemAsync(TOKEN_KEY, token);
  } catch {
    // Persistence is best-effort; keep the in-memory token for this session.
  }
}

export async function clearToken() {
  cachedToken = null;
  try {
    await secureStorage.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Storage cleanup must not crash auth recovery/logout.
  }
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export class ApiError extends Error {
  status: number;
  retryAfterSeconds: number | null;
  code: 'network' | 'http' | 'parse';
  constructor(
    message: string,
    status: number,
    retryAfterSeconds: number | null = null,
    code: 'network' | 'http' | 'parse' = 'http',
  ) {
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.code = code;
    this.name = 'ApiError';
  }
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const baseUrl = await getApiUrl();
  const token = await getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), API_TIMEOUT_MS)
    : null;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller?.signal,
    });
  } catch {
    throw new ApiError('Network error. Check your connection and try again.', 0, null, 'network');
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  if (res.status === 401) {
    await clearToken();
    throw new ApiError('Session expired. Please log in again.', 401);
  }

  if (res.status === 429) {
    const headerVal = res.headers.get('Retry-After');
    const parsed = headerVal ? parseInt(headerVal, 10) : NaN;
    const retryAfterSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    // Drain body silently — never throw raw HTML/JSON parse errors at the caller.
    await res.json().catch(() => null);
    throw new ApiError('Too many requests', 429, retryAfterSeconds);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(
      res.ok ? 'Invalid server response' : `Request failed (${res.status})`,
      res.status,
      null,
      'parse',
    );
  }

  if (!res.ok) {
    const errBody = data as Record<string, string> | null;
    throw new ApiError(errBody?.error || `Request failed (${res.status})`, res.status);
  }

  return data as T;
}

async function appendMultipartFile(
  formData: FormData,
  uri: string,
  fileName: string,
  mimeType: string,
  webFile?: File,
): Promise<void> {
  if (Platform.OS === 'web') {
    if (webFile) {
      formData.append('file', webFile, fileName);
      return;
    }
    const response = await fetch(uri);
    const sourceBlob = await response.blob();
    const blob = sourceBlob.type ? sourceBlob : new Blob([await sourceBlob.arrayBuffer()], { type: mimeType });
    formData.append('file', blob, fileName);
    return;
  }

  formData.append('file', { uri, name: fileName, type: mimeType } as unknown as Blob);
}

async function multipartApi<T = unknown>(path: string, formData: FormData): Promise<T> {
  const baseUrl = await getApiUrl();
  const token = await getToken();
  const headers: Record<string, string> = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), API_TIMEOUT_MS)
    : null;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller?.signal,
    });
  } catch {
    throw new ApiError('Network error. Check your connection and try again.', 0, null, 'network');
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  if (res.status === 401) {
    await clearToken();
    throw new ApiError('Session expired. Please log in again.', 401);
  }

  const contentType = res.headers.get('content-type') || '';
  let data: unknown;
  try {
    data = contentType.includes('application/json') ? await res.json() : await res.text();
  } catch {
    throw new ApiError(
      res.ok ? 'Invalid server response' : `Request failed (${res.status})`,
      res.status,
      null,
      'parse',
    );
  }

  if (!res.ok) {
    const errBody = data as Record<string, string> | null;
    throw new ApiError(errBody?.error || `Request failed (${res.status})`, res.status);
  }

  return data as T;
}

// ── Typed API methods ──

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    driverId: string;
  };
}

export interface DriverStatus {
  isOnline: boolean;
  status: string;
}

export interface DriverLocationSample {
  timestamp?: string;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  source?: 'foreground' | 'background';
}

export interface DriverProfile {
  id: string;
  driverId: string;
  name: string;
  email: string;
  phone: string | null;
  isOnline: boolean;
  status: string;
  createdAt: string | null;
}

export interface JobTyre {
  quantity: number;
  brand: string | null;
  pattern: string | null;
  width?: number | null;
  aspect?: number | null;
  rim?: number | null;
  unitPrice?: string | null;
  service?: string | null;
}

export interface JobSummary {
  id: string;
  refNumber: string;
  status: string;
  bookingType: string;
  serviceType: string;
  addressLine: string;
  lat?: string | null;
  lng?: string | null;
  tyreSizeDisplay: string | null;
  quantity: string | null;
  customerName: string;
  customerPhone?: string | null;
  scheduledAt: string | null;
  acceptedAt?: string | null;
  completedAt?: string | null;
  totalAmount?: string | null;
  createdAt: string | null;
  tyres?: JobTyre[];
  paymentSummary?: PaymentSummary | null;
  payment?: PaymentSummary | null;
}

export type PaymentMethod = 'cash' | 'card_link' | 'deposit_link' | 'manual' | 'unknown';
export type PaymentLinkStatus =
  | 'not_sent'
  | 'created'
  | 'sent'
  | 'opened'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'unknown';
export type PaymentState =
  | 'paid'
  | 'deposit_paid'
  | 'balance_due'
  | 'cash_to_collect'
  | 'pending'
  | 'needs_checking'
  | 'failed'
  | 'unknown';

export interface PaymentSummary {
  state: PaymentState;
  label: string;
  instruction: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  method: PaymentMethod;
  methodLabel: string;
  linkStatus: PaymentLinkStatus;
  paidVia: 'cash' | 'payment_link' | 'manual' | null;
  totalPence: number | null;
  paidPence: number | null;
  depositAmountPence: number | null;
  depositPaidPence: number | null;
  remainingBalancePence: number | null;
  amountToCollectPence: number | null;
  paymentUpdatedAt: string | null;
  depositPaidAt: string | null;
  linkSentAt: string | null;
  linkOpenedAt: string | null;
  linkExpiresAt: string | null;
  reason: string;
}

export interface JobDetail extends JobSummary {
  customerEmail: string | null;
  vehicleReg: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  lockingNutStatus: string | null;
  tyrePhotoUrl: string | null;
  notes: string | null;
  assignedAt: string | null;
  enRouteAt: string | null;
  arrivedAt: string | null;
  inProgressAt: string | null;
  acceptanceDeadline: string | null;
  subtotal: string | null;
  vatAmount: string | null;
  paymentSummary?: PaymentSummary | null;
  payment?: PaymentSummary | null;
  tyres: (JobTyre & { id: string })[];
  statusHistory: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    actorRole: string | null;
    createdAt: string | null;
  }[];
}

export interface JobsResponse {
  active: JobSummary[];
  upcoming: JobSummary[];
  completed: JobSummary[];
}

export const driverApi = {
  login: (email: string, password: string) =>
    api<LoginResponse>('/api/driver/auth/login', {
      method: 'POST',
      body: { email, password },
    }),

  forgotPassword: (email: string) =>
    api<{ success: boolean; message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: { email },
    }),

  resetPassword: (token: string, password: string) =>
    api<{ success: boolean; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: { token, password },
    }),

  getStatus: () => api<DriverStatus>('/api/driver/status'),

  setOnline: (isOnline: boolean) =>
    api<{ success: boolean; isOnline: boolean }>('/api/driver/status', {
      method: 'POST',
      body: { is_online: isOnline },
    }),

  updateLocation: (
    lat: number,
    lng: number,
    bookingRef?: string | null,
    sample?: DriverLocationSample,
  ) =>
    api<{
      accepted: boolean;
      success: boolean;
      bridgedBookingRef: string | null;
      serverTimestamp: string;
      acceptedLocationTimestamp: string | null;
      reason?: string;
    }>('/api/driver/location', {
      method: 'POST',
      body: {
        lat,
        lng,
        ...(bookingRef ? { bookingRef } : {}),
        timestamp: sample?.timestamp ?? new Date().toISOString(),
        accuracy: sample?.accuracy ?? null,
        heading: sample?.heading ?? null,
        speed: sample?.speed ?? null,
        source: sample?.source ?? 'foreground',
      },
    }),

  getProfile: () => api<DriverProfile>('/api/driver/profile'),

  changePassword: (currentPassword: string, newPassword: string) =>
    api<{ success: boolean }>('/api/driver/profile/password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    }),

  getJobs: () => api<JobsResponse>('/api/driver/jobs'),

  getJob: (ref: string) => api<JobDetail>(`/api/driver/jobs/${encodeURIComponent(ref)}`),

  acceptJob: (ref: string) =>
    api<{ success: boolean }>(`/api/driver/jobs/${encodeURIComponent(ref)}/accept`, {
      method: 'PATCH',
      body: { action: 'accept' },
    }),

  rejectJob: (ref: string) =>
    api<{ success: boolean }>(`/api/driver/jobs/${encodeURIComponent(ref)}/accept`, {
      method: 'PATCH',
      body: { action: 'reject' },
    }),

  updateJobStatus: (ref: string, status: string) =>
    api<{ success: boolean; previousStatus: string; newStatus: string }>(
      `/api/driver/jobs/${encodeURIComponent(ref)}/status`,
      { method: 'PATCH', body: { status } },
    ),

  // Push token management
  registerPushToken: (pushToken: string, platform: string) =>
    api<{ success: boolean }>('/api/driver/push-token', {
      method: 'POST',
      body: { pushToken, platform },
    }),

  unregisterPushToken: () =>
    api<{ success: boolean }>('/api/driver/push-token', { method: 'DELETE' }),

  // Tracking data (public endpoint — returns real Mapbox ETA)
  getTrackingData: (ref: string) =>
    api<{
      status: string;
      driverLat: number | null;
      driverLng: number | null;
      customerLat: number;
      customerLng: number;
      etaMinutes: number | null;
    }>(`/api/tracking/${encodeURIComponent(ref)}`),

  // Driver-owned in-app route (Mapbox directions). The driver's current
  // GPS is sent in the query string so the server can build a fresh
  // route without forcing another /api/driver/location round-trip first.
  getJobRoute: (
    ref: string,
    driverLat: number | null,
    driverLng: number | null,
  ) => {
    const params = new URLSearchParams();
    if (driverLat != null) params.set('lat', driverLat.toFixed(6));
    if (driverLng != null) params.set('lng', driverLng.toFixed(6));
    const qs = params.toString();
    const path = `/api/driver/jobs/${encodeURIComponent(ref)}/route${qs ? `?${qs}` : ''}`;
    return api<{
      bookingRef: string;
      status: string;
      customerLocation: { lat: number; lng: number; address: string | null } | null;
      driverLocation: { lat: number; lng: number } | null;
      distanceMiles: number | null;
      durationMinutes: number | null;
      geometry: { type: 'LineString'; coordinates: [number, number][] } | null;
      source: 'mapbox' | 'haversine' | 'none';
      lastUpdatedAt: string;
    }>(path);
  },

  // Sound config (admin-controlled)
  getSoundConfig: () =>
    api<Record<string, { soundFile: string; enabled: boolean; volume: number; vibrationEnabled: boolean }>>(
      '/api/driver/sound-config',
    ),
};

// ── Chat types ──

export interface ChatConversation {
  id: string;
  bookingId: string;
  bookingRef: string;
  channel: string;
  status: string;
  locked: boolean;
  muted: boolean;
  lastMessageAt: string | null;
  lastMessageBody: string | null;
  unreadCount: number;
  customerName: string | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: string;
  senderName: string;
  body: string | null;
  messageType: string;
  readAt: string | null;
  createdAt: string;
  deleted?: boolean;
  attachments?: {
    id: string;
    url: string;
    mimeType: string;
    fileSize: number;
    fileName: string | null;
    deleted?: boolean;
  }[];
}

export interface ChatAttachmentUpload {
  url: string;
  mimeType: string;
  fileSize: number;
  fileName?: string;
}

export interface MessagesResponse {
  messages: ChatMessage[];
  nextCursor: string | null;
}

export const chatApi = {
  getConversations: (bookingRef?: string) =>
    api<{ conversations: ChatConversation[] }>(
      `/api/chat/conversations${bookingRef ? `?bookingRef=${encodeURIComponent(bookingRef)}` : ''}`,
    ),

  createConversation: (bookingId: string, channel: 'customer_admin' | 'customer_driver' | 'admin_driver') =>
    api<{ conversationId: string }>('/api/chat/conversations', {
      method: 'POST',
      body: { bookingId, channel },
    }),

  getMessages: (conversationId: string, cursor?: string) =>
    api<MessagesResponse>(
      `/api/chat/conversations/${conversationId}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),

  sendMessage: (conversationId: string, body: string) =>
    api<ChatMessage>(`/api/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { body, messageType: 'text' },
    }),

  uploadAttachment: async (uri: string, mimeType: string, fileName: string, webFile?: File) => {
    const formData = new FormData();
    await appendMultipartFile(formData, uri, fileName, mimeType, webFile);
    return multipartApi<ChatAttachmentUpload>('/api/chat/upload', formData);
  },

  sendVoiceMessage: (conversationId: string, attachment: ChatAttachmentUpload) =>
    api<ChatMessage>(`/api/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { body: null, messageType: 'audio', attachment },
    }),

  sendImageMessage: (conversationId: string, attachment: ChatAttachmentUpload) =>
    api<ChatMessage>(`/api/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { body: null, messageType: 'image', attachment },
    }),

  updateMessage: (conversationId: string, messageId: string, body: string) =>
    api<ChatMessage>(`/api/chat/conversations/${conversationId}/messages/${messageId}`, {
      method: 'PATCH',
      body: { action: 'edit', body },
    }),

  deleteMessage: (conversationId: string, messageId: string) =>
    api<ChatMessage>(`/api/chat/conversations/${conversationId}/messages/${messageId}`, {
      method: 'PATCH',
      body: { action: 'delete' },
    }),

  markRead: (conversationId: string) =>
    api<{ success: boolean }>(`/api/chat/conversations/${conversationId}/read`, {
      method: 'POST',
    }),

  getUnreadCount: () => api<{ unread: number }>('/api/chat/unread'),
};

// ── Notification types ──

export interface DriverNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  bookingRef: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export const notificationApi = {
  getNotifications: () =>
    api<{ notifications: DriverNotification[] }>('/api/driver/notifications'),

  markRead: (id?: string) =>
    api<{ ok: boolean }>('/api/driver/notifications', {
      method: 'PATCH',
      body: id ? { id } : {},
    }),
};
