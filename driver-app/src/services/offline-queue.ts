import { AppState, type AppStateStatus } from 'react-native';
import * as secureStorage from '@/services/secure-storage';

const QUEUE_KEY = 'offline_request_queue';
const MAX_QUEUE_AGE_MS = 12 * 60 * 60 * 1000;

interface QueuedRequest {
  id: string;
  path: string;
  method: string;
  body: unknown;
  timestamp: number;
}

let queue: QueuedRequest[] = [];
let flushing = false;
let initialized = false;

/**
 * Load any persisted queue from storage on app start.
 * Idempotent — safe to call multiple times.
 */
export async function initOfflineQueue(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    const stored = await secureStorage.getItemAsync(QUEUE_KEY);
    if (stored) {
      queue = JSON.parse(stored);
    }
  } catch {
    queue = [];
  }

  // Flush queue whenever app returns to foreground
  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      flushOfflineQueue();
    }
  });
}

/**
 * Add a request to the offline queue (for critical updates only).
 * The request will be retried when connectivity is restored.
 */
export function enqueue(path: string, method: string, body: unknown): void {
  const entry: QueuedRequest = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    path,
    method,
    body,
    timestamp: Date.now(),
  };

  queue.push(entry);
  persistQueue();
}

/**
 * Keep only the latest request for a resource. This is important for location
 * updates: replaying stale coordinates after a fresh GPS fix would move the
 * admin map backwards.
 */
export function enqueueLatest(path: string, method: string, body: unknown): void {
  const upperMethod = method.toUpperCase();
  queue = queue.filter((req) => !(req.path === path && req.method.toUpperCase() === upperMethod));
  enqueue(path, upperMethod, body);
}

export function dropQueued(path: string, method?: string): void {
  const upperMethod = method?.toUpperCase();
  const next = queue.filter((req) => {
    if (req.path !== path) return true;
    if (upperMethod && req.method.toUpperCase() !== upperMethod) return true;
    return false;
  });
  if (next.length !== queue.length) {
    queue = next;
    persistQueue();
  }
}

/**
 * Attempt to flush all queued requests.
 */
export async function flushOfflineQueue(): Promise<void> {
  if (flushing || queue.length === 0) return;
  flushing = true;

  try {
    // Import dynamically to avoid circular dependency
    const { api } = await import('@/api/client');

    const failed: QueuedRequest[] = [];

    for (const req of queue) {
      if (Date.now() - req.timestamp > MAX_QUEUE_AGE_MS) continue;

      try {
        await api(req.path, { method: req.method, body: req.body });
      } catch {
        failed.push(req);
      }
    }

    queue = failed;
    await persistQueue();
  } finally {
    flushing = false;
  }
}

async function persistQueue(): Promise<void> {
  try {
    await secureStorage.setItemAsync(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage failure is non-fatal
  }
}

export function getQueueLength(): number {
  return queue.length;
}
