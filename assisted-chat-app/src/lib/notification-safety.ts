export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface UrgentBookingNotificationOpenRequest {
  bookingId: string;
  refNumber: string | null;
}

const EXPO_TOKEN_PREFIX = 'ExponentPushToken[';
const VALID_PERMISSION_STATUSES = new Set<NotificationPermissionStatus>([
  'granted',
  'denied',
  'undetermined',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizePermissionStatus(value: unknown): NotificationPermissionStatus | null {
  return typeof value === 'string' && VALID_PERMISSION_STATUSES.has(value as NotificationPermissionStatus)
    ? (value as NotificationPermissionStatus)
    : null;
}

export function normalizePermissionResponse(value: unknown): NotificationPermissionStatus | null {
  if (!isRecord(value)) return null;
  return normalizePermissionStatus(value.status);
}

export function normalizeExpoPushToken(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const token = readNonEmptyString(value.data);
  return token && token.startsWith(EXPO_TOKEN_PREFIX) ? token : null;
}

export function normalizeDevicePushToken(
  value: unknown,
  expectedType: 'android' | 'ios',
): string | null {
  if (!isRecord(value)) return null;
  if (value.type !== expectedType) return null;
  const token = readNonEmptyString(value.data);
  if (!token || token.startsWith(EXPO_TOKEN_PREFIX)) return null;
  return token;
}

export function extractNotificationResponseData(response: unknown): unknown | null {
  if (!isRecord(response)) return null;
  const notification = response.notification;
  if (!isRecord(notification)) return null;
  const request = notification.request;
  if (!isRecord(request)) return null;
  const content = request.content;
  if (!isRecord(content)) return null;
  return isRecord(content.data) ? content.data : null;
}

export function parseUrgentBookingNotificationOpenRequest(
  data: unknown,
): UrgentBookingNotificationOpenRequest | null {
  if (!isRecord(data) || data.type !== 'urgent_booking') return null;
  const bookingId = readNonEmptyString(data.bookingId);
  if (!bookingId) return null;
  const refNumber = readNonEmptyString(data.refNumber) ?? readNonEmptyString(data.jobRef);
  return { bookingId, refNumber };
}

export function isOkResponse(value: unknown): boolean {
  return isRecord(value) && value.ok === true;
}
