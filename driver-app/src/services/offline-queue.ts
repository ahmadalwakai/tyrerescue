import { AppState, type AppStateStatus } from 'react-native';
import * as secureStorage from '@/services/secure-storage';
import { logDriverTrackingDiagnostic } from '@/services/tracking-diagnostics';

const QUEUE_KEY = 'offline_request_queue';
const MAX_QUEUE_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_QUEUE_ITEMS = 120;
const BASE_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60_000;

interface QueuedRequest {
  id: string;
  path: string;
  method: string;
  body: unknown;
  timestamp: number;
  attempts?: number;
  retryAt?: number;
}

let queue: QueuedRequest[] = [];
let flushing = false;
let initialized = false;
let appStateSubscription: { remove: () => void } | null = null;

function stableBodyKey(body: unknown): string {
  if (body == null || typeof body !== 'object') return String(body);
  try {
    const entries = Object.entries(body as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return JSON.stringify(Object.fromEntries(entries));
  } catch {
    return JSON.stringify(body);
  }
}

function requestKey(path: string, method: string, body: unknown): string {
  const b = body as Record<string, unknown> | null;
  const bookingRef = typeof b?.bookingRef === 'string' ? b.bookingRef : '';
  const sampleTimestamp = typeof b?.timestamp === 'string' ? b.timestamp : '';
  return `${method.toUpperCase()} ${path} ${bookingRef} ${sampleTimestamp} ${stableBodyKey(body)}`;
}

function queuedJobId(body: unknown): string | null {
  const b = body as Record<string, unknown> | null;
  return typeof b?.bookingRef === 'string' ? b.bookingRef : null;
}

function queuedSampleTimestamp(body: unknown): string | null {
  const b = body as Record<string, unknown> | null;
  return typeof b?.timestamp === 'string' ? b.timestamp : null;
}

function nextRetryAt(attempts: number): number {
  const delay = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** Math.max(0, attempts - 1));
  return Date.now() + delay;
}

function shouldRetryQueuedError(error: unknown, ApiError: typeof import('@/api/client').ApiError): boolean {
  if (error instanceof ApiError) {
    return error.code === 'network' || error.status === 0 || error.status === 429 || error.status >= 500;
  }
  return true;
}

function sortQueueChronologically(items: QueuedRequest[]): QueuedRequest[] {
  return [...items].sort((a, b) => {
    const aBody = a.body as Record<string, unknown> | null;
    const bBody = b.body as Record<string, unknown> | null;
    const aSample = Date.parse(typeof aBody?.timestamp === 'string' ? aBody.timestamp : '');
    const bSample = Date.parse(typeof bBody?.timestamp === 'string' ? bBody.timestamp : '');
    const aTime = Number.isFinite(aSample) ? aSample : a.timestamp;
    const bTime = Number.isFinite(bSample) ? bSample : b.timestamp;
    return aTime - bTime;
  });
}

function trimQueue(items: QueuedRequest[]): QueuedRequest[] {
  const now = Date.now();
  const fresh = items.filter((req) => now - req.timestamp <= MAX_QUEUE_AGE_MS);
  const deduped = new Map<string, QueuedRequest>();
  for (const req of fresh) {
    deduped.set(requestKey(req.path, req.method, req.body), req);
  }
  return sortQueueChronologically([...deduped.values()]).slice(-MAX_QUEUE_ITEMS);
}

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
      queue = trimQueue(JSON.parse(stored));
    }
  } catch {
    queue = [];
  }

  // Flush queue whenever app returns to foreground
  appStateSubscription?.remove();
  appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      void flushOfflineQueue();
    }
  });
}

/**
 * Add a request to the offline queue (for critical updates only).
 * The request will be retried when connectivity is restored.
 */
export function enqueue(path: string, method: string, body: unknown): void {
  const upperMethod = method.toUpperCase();
  const key = requestKey(path, upperMethod, body);
  queue = queue.filter((req) => requestKey(req.path, req.method, req.body) !== key);

  const entry: QueuedRequest = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    path,
    method: upperMethod,
    body,
    timestamp: Date.now(),
    attempts: 0,
  };

  queue = trimQueue([...queue, entry]);
  persistQueue();
  logDriverTrackingDiagnostic('queued_location_count', {
    jobId: queuedJobId(body),
    sampleTimestamp: queuedSampleTimestamp(body),
    queueCount: queue.length,
  });
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
  const startingCount = queue.length;
  logDriverTrackingDiagnostic('queue_flush_started', {
    queueCount: startingCount,
  });

  try {
    // Import dynamically to avoid circular dependency
    const { api, ApiError } = await import('@/api/client');

    const failed: QueuedRequest[] = [];
    const now = Date.now();

    let attemptedCount = 0;
    let droppedCount = 0;

    for (const req of sortQueueChronologically(queue)) {
      if (now - req.timestamp > MAX_QUEUE_AGE_MS) continue;
      if (req.retryAt && req.retryAt > now) {
        failed.push(req);
        continue;
      }

      try {
        attemptedCount += 1;
        await api(req.path, { method: req.method, body: req.body });
      } catch (err) {
        if (!shouldRetryQueuedError(err, ApiError)) {
          droppedCount += 1;
          continue;
        }
        const nextAttempts = (req.attempts ?? 0) + 1;
        failed.push({
          ...req,
          attempts: nextAttempts,
          retryAt: nextRetryAt(nextAttempts),
        });
      }
    }

    queue = trimQueue(failed);
    await persistQueue();
    logDriverTrackingDiagnostic('queue_flush_completed', {
      result: queue.length === 0 ? 'empty' : 'remaining',
      queueCount: queue.length,
      attemptedCount,
      droppedCount,
    });
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
