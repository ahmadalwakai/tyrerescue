export interface NativeEventSubscription {
  remove: () => void;
}

export function removeNativeEventSubscription(subscription: unknown): void {
  if (subscription == null || typeof subscription !== 'object') return;

  const candidate = subscription as { remove?: unknown };
  if (typeof candidate.remove !== 'function') return;

  candidate.remove();
}
