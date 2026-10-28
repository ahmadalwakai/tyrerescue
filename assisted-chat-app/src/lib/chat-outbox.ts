import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Unsent text messages survive the app being closed. Only messages whose send
 * failed are kept; they keep their client ID, so a retry after relaunch is
 * still idempotent on the server. Nothing is sent automatically: the operator
 * taps a failed message to retry it or holds it to remove it.
 */

const STORAGE_KEY = 'assistedChat.outbox.v1';
const MAX_PER_CONVERSATION = 20;

export interface OutboxMessage {
  id: string;
  body: string;
  createdAt: string;
}

type OutboxStore = Record<string, OutboxMessage[]>;

function isOutboxMessage(value: unknown): value is OutboxMessage {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.body === 'string' && typeof item.createdAt === 'string';
}

async function readStore(): Promise<OutboxStore> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const store: OutboxStore = {};
    for (const [conversationId, items] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(items)) store[conversationId] = items.filter(isOutboxMessage).slice(-MAX_PER_CONVERSATION);
    }
    return store;
  } catch {
    return {};
  }
}

async function writeStore(store: OutboxStore): Promise<void> {
  try {
    const compact = Object.fromEntries(Object.entries(store).filter(([, items]) => items.length > 0));
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
  } catch {
    // Storage is best effort; the in-memory failed message stays on screen.
  }
}

// Serialise read-modify-write cycles so quick successive saves never lose one.
let queue: Promise<unknown> = Promise.resolve();
function update(change: (store: OutboxStore) => OutboxStore): Promise<void> {
  const run = queue.then(async () => writeStore(change(await readStore())));
  queue = run.catch(() => undefined);
  return run;
}

export async function loadOutbox(conversationId: string): Promise<OutboxMessage[]> {
  await queue;
  return (await readStore())[conversationId] ?? [];
}

export function saveToOutbox(conversationId: string, message: OutboxMessage): Promise<void> {
  return update((store) => {
    const items = (store[conversationId] ?? []).filter((item) => item.id !== message.id);
    return { ...store, [conversationId]: [...items, message].slice(-MAX_PER_CONVERSATION) };
  });
}

export function removeFromOutbox(conversationId: string, messageId: string): Promise<void> {
  return update((store) => ({ ...store, [conversationId]: (store[conversationId] ?? []).filter((item) => item.id !== messageId) }));
}
