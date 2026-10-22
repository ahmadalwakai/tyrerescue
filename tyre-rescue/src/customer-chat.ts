import { endpoint } from './api';

export interface CustomerChatConversation {
  id: string;
  bookingId: string | null;
  bookingRef: string;
  channel: string;
  status: string;
  locked: boolean;
  lastMessageBody?: string | null;
  unreadCount?: number;
}

export interface CustomerChatMessage {
  id: string;
  senderId: string | null;
  senderRole: 'customer' | 'admin' | 'driver';
  body: string | null;
  messageType: string;
  deleted?: boolean;
  createdAt: string;
  attachments: { id: string; url: string; mimeType: string; deleted?: boolean }[];
}

export interface CustomerChatPage { messages: CustomerChatMessage[]; nextCursor: string | null }

export function mergeCustomerChatMessages(previous: CustomerChatMessage[], incoming: CustomerChatMessage[]) {
  const messages = new Map(previous.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

/** An identifier is only for retry deduplication; it is never an access credential. */
export function newCustomerChatMessageId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 3) | 8).toString(16);
  });
}

export function customerChatHeaders(accountToken: string | null, bookingAccessToken: string | null) {
  return { ...(accountToken ? { Authorization: `Bearer ${accountToken}` } : {}),
    ...(bookingAccessToken ? { 'X-Booking-Access': bookingAccessToken } : {}) };
}

export async function customerChatRequest<T>(path: string, headers: Record<string, string>, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  else init.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 20_000);
  try {
    const response = await fetch(endpoint(path), { ...init, signal: controller.signal,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...headers } });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to load chat. Please try again.');
    return data as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The chat request timed out. Retry to check the same message safely.');
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}
