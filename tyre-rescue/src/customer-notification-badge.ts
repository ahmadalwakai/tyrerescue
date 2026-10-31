type BadgeSession = { token: string | null; revision: number };
type BookingProof = { refNumber: string; bookingAccessToken: string };
type BadgeDependencies = {
  requestCount: (headers: Record<string, string>, refNumber?: string) => Promise<number>;
  listBookingAccess: () => Promise<BookingProof[]>;
  setBadgeCountAsync: (count: number) => Promise<unknown>;
};

const refreshListeners = new Set<() => void>();
export function subscribeCustomerNotificationBadgeRefresh(listener: () => void) {
  refreshListeners.add(listener);
  return () => { refreshListeners.delete(listener); };
}

/** Call only after a successful read acknowledgement or a received message. */
export function requestCustomerNotificationBadgeRefresh() {
  for (const listener of refreshListeners) listener();
}

/** Serialise native writes and invalidate both prior sessions and older fetches. */
export function createCustomerNotificationBadge(deps: BadgeDependencies) {
  let session: BadgeSession | null = null;
  let scope = 0;
  let refreshVersion = 0;
  let resetPending = false;
  let writes: Promise<unknown> = Promise.resolve();

  function write(count: number, expectedScope: number, expectedRefresh?: number) {
    const perform = async () => {
      if (expectedScope !== scope || (expectedRefresh !== undefined && expectedRefresh !== refreshVersion)) return false;
      await deps.setBadgeCountAsync(count);
      return true;
    };
    const result = writes.then(perform, perform);
    writes = result.catch(() => undefined);
    return result;
  }

  return {
    setSession(next: BadgeSession) {
      if (session?.token === next.token && session.revision === next.revision) return Promise.resolve(false);
      const previous = session;
      session = { ...next }; scope += 1; refreshVersion += 1;
      // First mount has no evidence that an existing same-account badge is old.
      // A real session switch must clear before a newer session count is written.
      const needsReset = previous !== null || resetPending;
      resetPending = false;
      return needsReset ? write(0, scope).catch(() => false) : Promise.resolve(false);
    },
    async refresh() {
      if (!session) return false;
      const captured = { ...session };
      const expectedScope = scope;
      const expectedRefresh = ++refreshVersion;
      const current = () => expectedScope === scope && expectedRefresh === refreshVersion;
      try {
        let counts: number[];
        if (captured.token) {
          counts = [await deps.requestCount({ Authorization: `Bearer ${captured.token}` })];
        } else {
          const proofs = await deps.listBookingAccess();
          if (!current()) return false;
          const distinct = new Map<string, string>();
          for (const proof of proofs) {
            const ref = proof.refNumber.trim().toUpperCase();
            if (ref && proof.bookingAccessToken) distinct.set(ref, proof.bookingAccessToken);
          }
          // Any failed proof refresh leaves the existing total intact. A partial
          // sum would falsely hide unread messages from the unavailable booking.
          counts = await Promise.all([...distinct].map(([ref, proof]) => deps.requestCount({ 'X-Booking-Access': proof }, ref)));
        }
        if (!current() || counts.some(count => !Number.isSafeInteger(count) || count < 0)) return false;
        const total = counts.reduce((sum, count) => sum + count, 0);
        if (!Number.isSafeInteger(total)) return false;
        return await write(Math.min(total, 2_147_483_647), expectedScope, expectedRefresh);
      } catch {
        // Offline or unknown unread is not zero; keep the last same-scope badge.
        return false;
      }
    },
    clear() {
      scope += 1; refreshVersion += 1; session = null; resetPending = true;
      return write(0, scope).catch(() => false);
    },
  };
}
