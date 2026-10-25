import type { CustomerBookingSummary, CustomerProfile } from './customer-account';
import { deleteSecureItem, getSecureItem, setSecureItem } from './secure-storage';

const TOKEN_KEY = 'customer_token';
const SNAPSHOT_KEY = 'customer_account_snapshot_v1';
const BINDING_KEY = 'customer_account_snapshot_binding_v1';
const MAX_BYTES = 1800;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FINISHED = new Set(['completed', 'cancelled', 'cancelled_refund_pending', 'refunded', 'refunded_partial', 'draft']);
let revision = 0;
let writes: Promise<unknown> = Promise.resolve();

export interface CustomerAccountSnapshot {
  version: 1;
  savedAt: number;
  profile: CustomerProfile;
  bookings: CustomerBookingSummary[];
}

export const customerAccountStorageScope = () => revision;
export const loadCustomerAccountToken = () => getSecureItem(TOKEN_KEY);
const byteLength = (value: string) => encodeURIComponent(value).replace(/%[A-F\d]{2}/gi, 'x').length;

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const pending = writes.then(work, work);
  writes = pending.catch(() => undefined);
  return pending;
}

/** One small active-booking summary, never invoice credentials or full history. */
export function buildCustomerAccountSnapshot(profile: CustomerProfile, bookings: CustomerBookingSummary[], now = Date.now()): CustomerAccountSnapshot {
  const active = bookings.find((booking) => !FINISHED.has(booking.status));
  const snapshot: CustomerAccountSnapshot = {
    version: 1, savedAt: now,
    profile: { id: profile.id, name: profile.name.slice(0, 80), email: profile.email.slice(0, 255), phone: profile.phone?.slice(0, 20) ?? null, emailVerified: profile.emailVerified },
    bookings: active ? [{
      bookingId: active.bookingId, refNumber: active.refNumber, status: active.status,
      bookingType: active.bookingType, serviceType: active.serviceType, addressLine: active.addressLine.slice(0, 120),
      totalAmount: active.totalAmount, tyreSizeDisplay: active.tyreSizeDisplay?.slice(0, 30) ?? null,
      vehicleReg: active.vehicleReg?.slice(0, 10) ?? null, vehicleMake: null, vehicleModel: null,
      scheduledAt: active.scheduledAt, createdAt: active.createdAt, invoiceDownloadToken: null,
    }] : [],
  };
  if (byteLength(JSON.stringify(snapshot)) > MAX_BYTES) snapshot.bookings = [];
  return snapshot;
}

export async function loadCustomerAccountSnapshot(token: string): Promise<CustomerAccountSnapshot | null> {
  await writes;
  const requestRevision = revision;
  const [binding, raw] = await Promise.all([getSecureItem(BINDING_KEY), getSecureItem(SNAPSHOT_KEY)]);
  if (requestRevision !== revision || !binding || !raw) return null;
  try {
    const owner = JSON.parse(binding) as { token?: string; userId?: string };
    const snapshot = JSON.parse(raw) as CustomerAccountSnapshot;
    if (owner.token !== token || snapshot.version !== 1 || owner.userId !== snapshot.profile?.id ||
      typeof snapshot.profile.id !== 'string' || typeof snapshot.profile.name !== 'string' || typeof snapshot.profile.email !== 'string' ||
      !(snapshot.profile.phone === null || typeof snapshot.profile.phone === 'string') ||
      !Number.isFinite(snapshot.savedAt) || snapshot.savedAt > Date.now() + 300_000 || Date.now() - snapshot.savedAt > MAX_AGE_MS ||
      !Array.isArray(snapshot.bookings) || snapshot.bookings.length > 1 || byteLength(raw) > MAX_BYTES ||
      !snapshot.bookings.every((booking) => booking &&
        ['bookingId', 'refNumber', 'status', 'bookingType', 'serviceType', 'addressLine'].every((key) => typeof booking[key as keyof CustomerBookingSummary] === 'string') &&
        Number.isFinite(booking.totalAmount) && booking.totalAmount >= 0 && booking.invoiceDownloadToken === null &&
        ['tyreSizeDisplay', 'vehicleReg', 'vehicleMake', 'vehicleModel', 'scheduledAt', 'createdAt'].every((key) => booking[key as keyof CustomerBookingSummary] === null || typeof booking[key as keyof CustomerBookingSummary] === 'string'))) return null;
    return snapshot;
  } catch { return null; }
}

export function storeCustomerAccountSnapshot(token: string, profile: CustomerProfile, bookings: CustomerBookingSummary[], scope = revision, persistToken = false) {
  const snapshot = buildCustomerAccountSnapshot(profile, bookings);
  return serialize(async () => {
    if (scope !== revision) return;
    // Remove the binding first so an interrupted write can never mix accounts.
    await deleteSecureItem(BINDING_KEY);
    if (scope !== revision) return;
    if (persistToken) await setSecureItem(TOKEN_KEY, token);
    if (scope !== revision) return;
    const raw = JSON.stringify(snapshot);
    if (byteLength(raw) > MAX_BYTES) return;
    await setSecureItem(SNAPSHOT_KEY, raw);
    if (scope !== revision) return;
    await setSecureItem(BINDING_KEY, JSON.stringify({ token, userId: profile.id }));
  });
}

export function clearStoredCustomerAccount() {
  revision += 1;
  return serialize(async () => {
    await Promise.all([deleteSecureItem(TOKEN_KEY), deleteSecureItem(BINDING_KEY), deleteSecureItem(SNAPSHOT_KEY)]);
  });
}
