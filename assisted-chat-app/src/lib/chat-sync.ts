/**
 * Client-side reconciliation for chat messages and conversation lists.
 *
 * The server is authoritative: a server copy of a message always replaces the
 * local one with the same ID. Local messages exist only while a send is in
 * flight ('sending') or after it failed ('failed'); their ID is also the
 * clientMessageId the server uses to make retries idempotent.
 */

export type LocalSendState = 'sending' | 'failed';

export interface SyncMessage {
  id: string;
  createdAt: string;
  localState?: LocalSendState;
}

export interface SyncConversation {
  id: string;
  lastActivityAt?: string;
  lastMessageAt: string | null;
  createdAt: string;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** RFC 4122 v4 UUID; uses the platform generator when one exists. */
export function createClientMessageId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === 'function') cryptoApi.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = hex(bytes);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function time(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Server order: oldest first, ties broken by ID (matches the API's cursor order). */
export function compareServerMessages(a: SyncMessage, b: SyncMessage): number {
  return time(a.createdAt) - time(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Union of what is shown and what the server returned. Server copies win;
 * messages missing from a partial page are kept (older pages stay loaded);
 * local sends stay after every server message until the server confirms them.
 */
export function mergeMessages<T extends SyncMessage>(current: readonly T[], incoming: readonly T[]): T[] {
  const server = new Map<string, T>();
  const local: T[] = [];
  for (const message of current) {
    if (message.localState) local.push(message);
    else server.set(message.id, message);
  }
  for (const message of incoming) server.set(message.id, message);
  const pending = local.filter((message) => !server.has(message.id));
  return [...[...server.values()].sort(compareServerMessages), ...pending];
}

export function replaceMessage<T extends SyncMessage>(messages: readonly T[], id: string, next: T): T[] {
  return mergeMessages(messages.filter((message) => message.id !== id), [next]);
}

export function setLocalState<T extends SyncMessage>(messages: readonly T[], id: string, localState: LocalSendState): T[] {
  return messages.map((message) => (message.id === id && message.localState ? { ...message, localState } : message));
}

/** Newest message the server has confirmed; the read marker never points at a local send. */
export function newestServerMessageId(messages: readonly SyncMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (!messages[index].localState) return messages[index].id;
  }
  return null;
}

function activity(conversation: SyncConversation): number {
  return time(conversation.lastActivityAt ?? conversation.lastMessageAt ?? conversation.createdAt);
}

/**
 * Refreshing the first inbox page must not drop older pages the operator has
 * already loaded: keep previously loaded conversations that sort after the
 * refreshed page and were not part of it. The fresh page's order wins.
 */
export function mergeConversationPages<T extends SyncConversation>(previous: readonly T[], firstPage: readonly T[], firstPageComplete: boolean): T[] {
  if (firstPageComplete || firstPage.length === 0) return [...firstPage];
  const fresh = new Set(firstPage.map((item) => item.id));
  const boundary = firstPage[firstPage.length - 1];
  const boundaryTime = activity(boundary);
  const older = previous.filter((item) => !fresh.has(item.id) && (
    activity(item) < boundaryTime || (activity(item) === boundaryTime && item.id < boundary.id)
  ));
  return [...firstPage, ...older];
}

/** Append an older page, ignoring anything already shown. */
export function appendConversationPage<T extends { id: string }>(current: readonly T[], page: readonly T[]): T[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...page.filter((item) => !seen.has(item.id))];
}
