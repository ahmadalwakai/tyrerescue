import { deleteSecureItem, getSecureItem, setSecureItem } from './secure-storage';

const RECEIPTS_KEY = 'customer_booking_access_v1';
export type SavedBookingAccess = { refNumber: string; bookingAccessToken: string; savedAt: string };
let storageQueue: Promise<unknown> = Promise.resolve();
let accessRevision = 0;
export const bookingAccessScope = () => accessRevision;

export async function listBookingAccess(): Promise<SavedBookingAccess[]> {
  const raw = await getSecureItem(RECEIPTS_KEY);
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedBookingAccess => item && typeof item.refNumber === 'string' &&
      typeof item.bookingAccessToken === 'string' && typeof item.savedAt === 'string' &&
      Date.now() - Date.parse(item.savedAt) < 7 * 24 * 60 * 60 * 1000).slice(-20);
  } catch { return []; }
}

export function saveBookingAccess(refNumber: string, bookingAccessToken: string, scope = accessRevision) {
  const save = async () => {
    const normalized = refNumber.trim().toUpperCase();
    if (!normalized || !bookingAccessToken || scope !== accessRevision) return;
    const existing = await listBookingAccess();
    if (scope !== accessRevision) return;
    const next = existing.filter((item) => item.refNumber !== normalized);
    next.push({ refNumber: normalized, bookingAccessToken, savedAt: new Date().toISOString() });
    await setSecureItem(RECEIPTS_KEY, JSON.stringify(next.slice(-20)));
  };
  storageQueue = storageQueue.then(save, save);
  return storageQueue as Promise<void>;
}

export async function loadBookingAccess(refNumber: string) {
  const normalized = refNumber.trim().toUpperCase();
  return (await listBookingAccess()).find((item) => item.refNumber === normalized)?.bookingAccessToken ?? null;
}

export function clearBookingAccess() {
  accessRevision += 1;
  const clear = () => deleteSecureItem(RECEIPTS_KEY);
  storageQueue = storageQueue.then(clear, clear);
  return storageQueue as Promise<void>;
}
