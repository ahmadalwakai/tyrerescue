import { AppState, type AppStateStatus } from 'react-native';
import * as secureStorage from '@/services/secure-storage';
import { logDriverTrackingDiagnostic } from '@/services/tracking-diagnostics';
import { getOnlineLocationRevision, isOnlineLocationEnabled } from '@/services/online-location-state';

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
let initialization: Promise<void> | null = null;
let initialized = false;
let discardStoredLocations = false;
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
export function initOfflineQueue(): Promise<void> {
  if (initialized) return Promise.resolve();
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void flushOfflineQueue();
    });
  }
  if (!initialization) {
    initialization = loadOfflineQueue().then((loaded) => {
      initialized = loaded;
    }).finally(() => { initialization = null; });
  }
  return initialization;
}

async function loadOfflineQueue(): Promise<boolean> {
  let stored: string | null;
  try {
    stored = await secureStorage.getItemAsync(QUEUE_KEY);
  } catch {
    // Locked/migrating Keychain is temporary. Keep pending requests in memory
    // and retry before any write, so a headless enqueue cannot replace an
    // unread persisted queue with a new empty queue.
    return false;
  }
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const saved = (parsed as QueuedRequest[]).filter((request) =>
          !discardStoredLocations || request.path !== '/api/driver/location');
        queue = trimQueue([...saved, ...queue]);
      }
    } catch {
      // Malformed persisted JSON must not erase newer in-memory actions.
    }
  }
  return true;
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
  logDriverTrackingDiagnostic('offline_queue_enqueued', {
    jobId: queuedJobId(body),
    locationTimestamp: queuedSampleTimestamp(body),
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

/** Also load persisted samples so logout cannot leave GPS for the next session. */
export async function discardQueuedLocations(): Promise<void> {
  discardStoredLocations = true;
  dropQueued('/api/driver/location', 'POST');
  await initOfflineQueue();
  dropQueued('/api/driver/location', 'POST');
  await persistQueue();
}

/**
 * Attempt to flush all queued requests.
 */
export async function flushOfflineQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;

  try {
    await initOfflineQueue();
    if (!initialized || queue.length === 0) return;
    logDriverTrackingDiagnostic('offline_queue_flush_started', {
      queueCount: queue.length,
    });
    // Import dynamically to avoid circular dependency
    const { api, ApiError, getToken } = await import('@/api/client');

    const failed: QueuedRequest[] = [];
    const now = Date.now();

    let attemptedCount = 0;
    let droppedCount = 0;

    const snapshot = sortQueueChronologically(queue);
    const snapshotIds = new Set(snapshot.map((request) => request.id));
    const locationRevision = getOnlineLocationRevision();
    for (const req of snapshot) {
      const isLocation = req.path === '/api/driver/location';
      if (isLocation && (!(await isOnlineLocationEnabled()) || !(await getToken()) ||
          locationRevision !== getOnlineLocationRevision())) {
        droppedCount += 1;
        continue;
      }
      if (now - req.timestamp > MAX_QUEUE_AGE_MS) continue;
      if (req.retryAt && req.retryAt > now) {
        failed.push(req);
        continue;
      }

      try {
        attemptedCount += 1;
        await api(req.path, { method: req.method, body: req.body });
      } catch (err) {
        if (isLocation && (!(await isOnlineLocationEnabled()) ||
            locationRevision !== getOnlineLocationRevision())) continue;
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

    const stillOnline = await isOnlineLocationEnabled();
    queue = trimQueue([...failed, ...queue.filter((request) => !snapshotIds.has(request.id))])
      .filter((request) => request.path !== '/api/driver/location' || stillOnline);
    await persistQueue();
    logDriverTrackingDiagnostic(
      queue.length === 0 ? 'offline_queue_flush_succeeded' : 'offline_queue_flush_failed',
      {
        reason: queue.length === 0 ? null : 'remaining_retryable_items',
        queueCount: queue.length,
        attemptedCount,
        droppedCount,
      },
    );
  } catch (error) {
    logDriverTrackingDiagnostic('offline_queue_flush_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
      queueCount: queue.length,
    });
  } finally {
    flushing = false;
  }
}

async function persistQueue(): Promise<void> {
  try {
    await initOfflineQueue();
    if (!initialized) return;
    await secureStorage.setItemAsync(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage failure is non-fatal
  }
}

export function getQueueLength(): number {
  return queue.length;
}
