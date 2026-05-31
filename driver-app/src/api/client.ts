import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';
const API_URL_KEY = 'api_url';

let cachedToken: string | null = null;
let cachedApiUrl: string | null = null;

export async function getApiUrl(): Promise<string> {
  if (cachedApiUrl) return cachedApiUrl;
  const stored = await SecureStore.getItemAsync(API_URL_KEY);
  cachedApiUrl = stored || 'https://www.tyrerescue.uk';
  return cachedApiUrl;
}

export async function setApiUrl(url: string) {
  cachedApiUrl = url;
  await SecureStore.setItemAsync(API_URL_KEY, url);
}

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return cachedToken;
}

export async function setToken(token: string) {
  cachedToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken() {
  cachedToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export class ApiError extends Error {
  status: number;
  retryAfterSeconds: number | null;
  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
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

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

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
  payment?: PaymentSummary | null;
}

export type PaymentType = 'cash' | 'full' | 'deposit' | null;
export type PaymentStatus = 'unpaid' | 'deposit_paid' | 'paid' | 'unknown';

export interface PaymentSummary {
  type: PaymentType;
  status: PaymentStatus;
  subtotalPence: number | null;
  vatAmountPence: number | null;
  totalAmountPence: number | null;
  depositAmountPence: number | null;
  remainingBalancePence: number | null;
  amountToCollectPence: number;
  stripePiId: string | null;
  depositPaidAt: string | null;
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

  updateLocation: (lat: number, lng: number, bookingRef?: string | null) =>
    api<{ success: boolean; bridgedBookingRef: string | null }>('/api/driver/location', {
      method: 'POST',
      body: bookingRef ? { lat, lng, bookingRef } : { lat, lng },
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

  // Version check
  checkVersion: (version: string, platform: string) =>
    api<{
      currentVersion: string;
      minVersion: string;
      latestVersion: string;
      forceUpdate: boolean;
      downloadUrl: string;
      releaseNotes?: string;
    }>(`/api/driver/version-check?version=${encodeURIComponent(version)}&platform=${encodeURIComponent(platform)}`),

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
  attachments?: {
    id: string;
    url: string;
    mimeType: string;
    fileSize: number;
    fileName: string | null;
  }[];
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
