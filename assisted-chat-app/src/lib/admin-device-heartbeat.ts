import { AppState, type AppStateStatus } from 'react-native';
import { getAdminToken, getApiBaseUrl } from './api';
import { readAdminDeviceMetadata } from './admin-device-metadata';

export interface AdminDeviceHeartbeatContext {
  token: string;
  apiBaseUrl: string;
  revision: number;
  isCurrent: () => boolean;
  onRevoked: () => void;
}

interface HeartbeatOperation {
  context: AdminDeviceHeartbeatContext;
  controller: AbortController;
  cancelled: boolean;
  timeout: ReturnType<typeof setTimeout> | null;
  cancel: (() => void) | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let context: AdminDeviceHeartbeatContext | null = null;
let references = 0;
let appState: AppStateStatus = AppState.currentState;
let appStateListener: { remove: () => void } | null = null;
let interval: ReturnType<typeof setInterval> | null = null;
let inFlight: HeartbeatOperation | null = null;

function sameContext(a: AdminDeviceHeartbeatContext | null, b: AdminDeviceHeartbeatContext | null): boolean {
  return a?.token === b?.token && a?.apiBaseUrl === b?.apiBaseUrl && a?.revision === b?.revision;
}

function isCurrent(captured: AdminDeviceHeartbeatContext): boolean {
  return references > 0 && appState === 'active' && AppState.currentState === 'active' && sameContext(context, captured) &&
    getAdminToken() === captured.token &&
    getApiBaseUrl().replace(/\/+$/, '') === captured.apiBaseUrl && captured.isCurrent();
}

function stopRequest(): void {
  const operation = inFlight;
  inFlight = null;
  if (!operation) return;
  operation.cancelled = true;
  operation.controller.abort();
  if (operation.timeout) clearTimeout(operation.timeout);
  operation.timeout = null;
  operation.cancel?.();
}

function stopInterval(): void {
  if (interval) clearInterval(interval);
  interval = null;
}

function matchedRevocation(payload: unknown, token: string): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const value = payload as Record<string, unknown>;
  const parts = token.split('.');
  return parts.length === 3 && parts[0] === 'acs_v1' && UUID_PATTERN.test(parts[1]) &&
    value.code === 'DEVICE_SESSION_REVOKED' && typeof value.sessionId === 'string' &&
    UUID_PATTERN.test(value.sessionId) && value.sessionId.toLowerCase() === parts[1].toLowerCase();
}

async function heartbeat(): Promise<void> {
  const captured = context;
  if (!captured?.token.startsWith('acs_v1.') || !isCurrent(captured) || inFlight) return;
  const operation: HeartbeatOperation = {
    context: captured, controller: new AbortController(), cancelled: false, timeout: null, cancel: null,
  };
  inFlight = operation;
  try {
    const revoked = await Promise.race([
      (async () => {
        const response = await fetch(`${captured.apiBaseUrl}/api/mobile/admin/auth/devices/heartbeat`, {
          method: 'POST',
          signal: operation.controller.signal,
          headers: { Authorization: `Bearer ${captured.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ device: readAdminDeviceMetadata(), state: 'active' }),
        });
        if (response.status !== 401) return false;
        return matchedRevocation(await response.json(), captured.token);
      })(),
      new Promise<boolean>((resolve) => {
        operation.cancel = () => resolve(false);
        operation.timeout = setTimeout(() => {
          operation.cancelled = true;
          operation.controller.abort();
          resolve(false);
        }, 8_000);
      }),
    ]);
    // Only an explicit administrator removal, echoed for this exact current
    // credential, authorizes sign-out. Ordinary API/auth failures never do.
    if (revoked && !operation.cancelled && isCurrent(captured)) captured.onRevoked();
  } catch {
    // Heartbeat is display/presence bookkeeping, never a condition of login.
  } finally {
    if (operation.timeout) clearTimeout(operation.timeout);
    operation.timeout = null;
    operation.cancel = null;
    if (inFlight === operation) inFlight = null;
  }
}

function reconcile(immediate: boolean): void {
  if (!context?.token.startsWith('acs_v1.') || references === 0) {
    stopInterval();
    stopRequest();
    appStateListener?.remove();
    appStateListener = null;
    return;
  }
  if (!appStateListener) {
    appState = AppState.currentState;
    appStateListener = AppState.addEventListener('change', (nextState) => {
      const wasActive = appState === 'active';
      appState = nextState;
      reconcile(!wasActive && nextState === 'active');
    });
  }
  if (appState !== 'active') {
    stopInterval();
    stopRequest();
    return;
  }
  if (!interval) interval = setInterval(() => { void heartbeat(); }, 60_000);
  if (immediate) void heartbeat();
}

export function setAdminDeviceHeartbeatContext(next: AdminDeviceHeartbeatContext | null): void {
  const changed = !sameContext(context, next);
  context = next;
  if (changed) stopRequest();
  reconcile(changed);
}

/** One foreground heartbeat lifecycle shared by every mounted session hook. */
export function retainAdminDeviceHeartbeat(): () => void {
  references += 1;
  reconcile(references === 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    references = Math.max(0, references - 1);
    reconcile(false);
  };
}
