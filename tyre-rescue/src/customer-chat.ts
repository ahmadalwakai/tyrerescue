import { fetchApi } from './api';

export type CustomerChatChannel = 'customer_admin' | 'customer_driver';

export function isCustomerChatChannel(channel: string): channel is CustomerChatChannel {
  return channel === 'customer_admin' || channel === 'customer_driver';
}

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

/** Keep new pages private until they connect to the history already displayed. */
export function createCustomerChatHistory() {
  let messages: CustomerChatMessage[] = [];
  let nextCursor: string | null = null;
  const syncedIds = new Set<string>();
  let initialized = false;
  let pending: { messages: CustomerChatMessage[]; cursor: string; anchors: Set<string>; newestId: string } | null = null;
  const snapshot = (readMessageId: string | null = null) => ({ messages, nextCursor, catchingUp: pending !== null, readMessageId });
  const commit = (incoming: CustomerChatMessage[]) => {
    messages = mergeCustomerChatMessages(messages, incoming);
    for (const message of incoming) syncedIds.add(message.id);
  };
  return {
    addSent(message: CustomerChatMessage) {
      // A local send is not proof that messages preceding it have been fetched.
      messages = mergeCustomerChatMessages(messages, [message]);
      return messages;
    },
    async older(cursor: string, fetchPage: (cursor?: string) => Promise<CustomerChatPage>) {
      const page = await fetchPage(cursor);
      commit(page.messages);
      nextCursor = page.nextCursor;
      return snapshot();
    },
    async refresh(fetchPage: (cursor?: string) => Promise<CustomerChatPage>) {
      // At most four pages per pass. A failed/large catch-up resumes at its cursor.
      for (let count = 0; count < 4; count += 1) {
        const cursor: string | undefined = pending?.cursor;
        const page = await fetchPage(cursor);
        const newestId: string | null = pending?.newestId ?? page.messages.at(-1)?.id ?? null;
        if (!initialized || syncedIds.size === 0) {
          initialized = true;
          nextCursor = page.nextCursor;
          commit(page.messages);
          return snapshot(newestId);
        }
        const anchors: Set<string> = pending?.anchors ?? new Set(syncedIds);
        const incoming = mergeCustomerChatMessages(pending?.messages ?? [], page.messages);
        if (page.messages.some(message => anchors.has(message.id)) || !page.nextCursor) {
          commit(incoming);
          pending = null;
          return snapshot(newestId);
        }
        if (page.nextCursor === cursor || !newestId) throw new Error('Chat history could not catch up. Please retry.');
        pending = { messages: incoming, cursor: page.nextCursor, anchors, newestId };
      }
      return snapshot();
    },
  };
}

export function createCustomerChatDrafts() {
  const entries = new Map<string, { text: string; pending: { id: string; body: string } | null }>();
  return {
    read: (key: string) => entries.get(key),
    write(key: string, text: string) {
      const previous = entries.get(key);
      entries.set(key, { text, pending: previous?.pending?.body === text.trim() ? previous.pending : null });
    },
    prepare(key: string, body: string) {
      const entry = entries.get(key);
      const pending = entry?.pending?.body === body ? entry.pending : { id: newCustomerChatMessageId(), body };
      entries.set(key, { text: entry?.text ?? body, pending });
      return pending;
    },
    confirm(key: string, id: string) {
      if (entries.get(key)?.pending?.id === id) entries.delete(key);
    },
  };
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
    const response = await fetchApi(path, { ...init, signal: controller.signal,
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
