export interface BrowserNetworkEventTarget {
  addEventListener: (type: 'online' | 'offline', listener: () => void) => void;
  removeEventListener: (type: 'online' | 'offline', listener: () => void) => void;
}

export function resolveBrowserNetworkEventTarget(
  platformOS: string,
  target: unknown = typeof window === 'undefined' ? undefined : window,
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
