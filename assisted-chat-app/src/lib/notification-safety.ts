export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface UrgentBookingNotificationOpenRequest {
  bookingId: string;
  refNumber: string | null;
}

const EXPO_TOKEN_PATTERN = /^(?:ExponentPushToken|ExpoPushToken)\[[^\]\s]+\]$/;
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
  return token && EXPO_TOKEN_PATTERN.test(token) ? token : null;
}

export function normalizeDevicePushToken(
  value: unknown,
  expectedType: 'android' | 'ios',
): string | null {
  if (!isRecord(value)) return null;
  if (value.type !== expectedType) return null;
  const token = readNonEmptyString(value.data);
  if (!token || /^(?:ExponentPushToken|ExpoPushToken)\[/.test(token)) return null;
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

/** A push only selects an event; the modal fetches its authenticated state. */
export function parseDriverJourneyNotificationOpenRequest(data: unknown): { eventId: string } | null {
  if (!isRecord(data) || !['driver_journey_confirmation', 'driver_journey_near', 'driver_journey_stopped'].includes(String(data.type))) return null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const eventId = readNonEmptyString(data.eventId);
  const journeyId = readNonEmptyString(data.journeyId);
  const bookingId = readNonEmptyString(data.bookingId);
  if (!eventId || !journeyId || !bookingId || ![eventId, journeyId, bookingId].every((id) => uuid.test(id))) return null;
  return { eventId };
}

export function isOkResponse(value: unknown): boolean {
  return isRecord(value) && value.ok === true;
}

/** Notification content selects a thread; its contents always come from authenticated APIs. */
export function parseCustomerChatNotificationOpenRequest(data: unknown): { conversationId: string } | null {
  if (!isRecord(data) || data.type !== 'chat_message') return null;
  const conversationId = readNonEmptyString(data.conversationId);
  return conversationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)
    ? { conversationId } : null;
}

export type ChatNotificationChannel = 'customer_admin' | 'admin_driver';

/**
 * Each notification type may open only its own kind of thread: a customer
 * message notification never opens a private driver thread and vice versa.
 */
export function parseChatNotificationOpenRequest(data: unknown): { conversationId: string; channel: ChatNotificationChannel } | null {
  if (!isRecord(data)) return null;
  const channel: ChatNotificationChannel | null = data.type === 'chat_message' ? 'customer_admin'
    : data.type === 'driver_chat_message' ? 'admin_driver' : null;
  const conversationId = readNonEmptyString(data.conversationId);
  return channel && conversationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId)
    ? { conversationId, channel } : null;
}

export function parseCallbackNotificationOpenRequest(data: unknown): { callbackId: string } | null {
  if (!isRecord(data) || data.type !== 'callback_request') return null;
  const callbackId = readNonEmptyString(data.callbackId);
  return callbackId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(callbackId)
    ? { callbackId } : null;
}

export interface PendingCallbackNotification {
  callbackId: string;
  apiRevision: number;
  sessionRevision: number;
}

/** A notification cannot bypass sign-in, a changed workspace, or UIKit dismissal. */
export function callbackNotificationDisposition(pending: PendingCallbackNotification, current: {
  authenticated: boolean; apiRevision: number; sessionRevision: number; ready: boolean; busy: boolean;
}): 'discard' | 'wait' | 'open' {
  if (!current.authenticated || pending.apiRevision !== current.apiRevision || pending.sessionRevision !== current.sessionRevision) return 'discard';
  return current.ready && !current.busy ? 'open' : 'wait';
}
