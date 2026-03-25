import { AppState, type AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const QUEUE_KEY = 'offline_request_queue';

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
    const stored = await SecureStore.getItemAsync(QUEUE_KEY);
    if (stored) {
      queue = JSON.parse(stored);
    }
  } catch {
    queue = [];
  }

  // Flush queue whenever app returns to foreground
  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      flushQueue();
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
 * Attempt to flush all queued requests.
 */
async function flushQueue(): Promise<void> {
  if (flushing || queue.length === 0) return;
  flushing = true;

  // Import dynamically to avoid circular dependency
  const { api } = await import('@/api/client');

  const failed: QueuedRequest[] = [];

  for (const req of queue) {
    // Skip requests older than 1 hour
    if (Date.now() - req.timestamp > 60 * 60 * 1000) continue;

    try {
      await api(req.path, { method: req.method, body: req.body });
    } catch {
      failed.push(req);
    }
  }

  queue = failed;
  await persistQueue();
  flushing = false;
}

async function persistQueue(): Promise<void> {
  try {
    await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage failure is non-fatal
  }
}

export function getQueueLength(): number {
  return queue.length;
}
