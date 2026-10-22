export type BrowserNetworkEventType = 'online' | 'offline';
export type BrowserNetworkCleanup = () => void;

export interface BrowserNetworkEventTarget {
  addEventListener: (type: BrowserNetworkEventType, listener: () => void) => void;
  removeEventListener: (type: BrowserNetworkEventType, listener: () => void) => void;
}

function defaultBrowserNetworkTarget(): unknown {
  return typeof window === 'undefined' ? undefined : window;
}

export function resolveBrowserNetworkEventTarget(
  platformOS: string,
  target: unknown = defaultBrowserNetworkTarget(),
): BrowserNetworkEventTarget | null {
  if (platformOS !== 'web') return null;
  if (target == null || typeof target !== 'object') return null;

  const candidate = target as {
    addEventListener?: unknown;
    removeEventListener?: unknown;
  };

  if (typeof candidate.addEventListener !== 'function') return null;
  if (typeof candidate.removeEventListener !== 'function') return null;

  return candidate as BrowserNetworkEventTarget;
}

export function subscribeBrowserNetworkEvents(
  platformOS: string,
  listener: () => void,
  target: unknown = defaultBrowserNetworkTarget(),
): BrowserNetworkCleanup | null {
  const eventTarget = resolveBrowserNetworkEventTarget(platformOS, target);
  if (!eventTarget) return null;

  let onlineAttached = false;
  let offlineAttached = false;

  try {
    eventTarget.addEventListener('online', listener);
    onlineAttached = true;
    eventTarget.addEventListener('offline', listener);
    offlineAttached = true;
  } catch (error) {
    if (onlineAttached) eventTarget.removeEventListener('online', listener);
    if (offlineAttached) eventTarget.removeEventListener('offline', listener);
    throw error;
  }

  return () => {
    eventTarget.removeEventListener('online', listener);
    eventTarget.removeEventListener('offline', listener);
  };
}
