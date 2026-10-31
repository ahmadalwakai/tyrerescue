import { API, requestJson } from './api';
import { deleteSecureItem, getSecureItem, setSecureItem } from './secure-storage';
import { CUSTOMER_NOTIFICATION_VERSION } from './customer-notification-contract';
import { listBookingAccess } from './customer-booking-access';

const DEVICE_KEY = 'customer_push_device_v1';
const CLEANUP_KEY = 'customer_push_cleanup_v1';
const ROTATION_KEY = 'customer_push_guest_rotation_v1';
type GuestRotation = { token: string; previousByRef: Record<string, string> };
let queue: Promise<unknown> = Promise.resolve();
let accountRevision = 0;
let lastRegistration: { token: string; authToken?: string | null; refNumber?: string | null; scope: number; at: number } | null = null;
export const customerPushScope = () => accountRevision;

async function deviceRequest(init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try { return await requestJson(API.customerPushToken, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const pending = queue.then(work, work);
  queue = pending.catch(() => undefined);
  return pending;
}

async function flushPendingCleanup() {
  const raw = await getSecureItem(CLEANUP_KEY);
  if (!raw) return;
  const pending = JSON.parse(raw) as { token: string; authToken: string };
  try {
    await deviceRequest({ method: 'DELETE', headers: { Authorization: `Bearer ${pending.authToken}` }, body: JSON.stringify({ token: pending.token }) });
  } catch (error) {
    // Once the old credential expires, a new authenticated/capability-checked
    // POST replaces the account binding. Account subscriptions are ignored when
    // the device is no longer bound to their owner.
    if (!(error instanceof Error) || !/^Unauthorized$/i.test(error.message)) throw error;
  }
  await deleteSecureItem(CLEANUP_KEY);
}

async function guestRotation(token: string, previousToken: string | null): Promise<GuestRotation | null> {
  const raw = await getSecureItem(ROTATION_KEY);
  let previous: GuestRotation | null = null;
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed.token === 'string' && parsed.previousByRef && typeof parsed.previousByRef === 'object') previous = parsed;
  } catch { /* A malformed optional rotation record cannot block registration. */ }
  const proofs = await listBookingAccess();
  const previousByRef: Record<string, string> = {};
  for (const proof of proofs) {
    const ref = proof.refNumber.trim().toUpperCase();
    const prior = previous?.previousByRef[ref];
    const value = typeof prior === 'string' ? prior : previousToken;
    if (value && value !== token) previousByRef[ref] = value;
  }
  if (!Object.keys(previousByRef).length) { await deleteSecureItem(ROTATION_KEY); return null; }
  const next = { token, previousByRef };
  // Persist the entire guest batch before its first request. Later receipts must
  // still retire their old subscription after the device token itself changes.
  await setSecureItem(ROTATION_KEY, JSON.stringify(next));
  return next;
}

export function registerCustomerPushDevice(input: {
  token: string; platform: 'ios' | 'android'; authToken?: string | null;
  refNumber?: string | null; bookingAccessToken?: string | null; scope: number;
}) {
  return serialize(async () => {
    await flushPendingCleanup();
    if (input.scope !== accountRevision) return false;
    if (lastRegistration && lastRegistration.token === input.token && lastRegistration.authToken === input.authToken &&
      lastRegistration.refNumber === input.refNumber && lastRegistration.scope === input.scope && Date.now() - lastRegistration.at < 60_000) return true;
    const storedToken = await getSecureItem(DEVICE_KEY);
    const rotation = !input.authToken && input.refNumber ? await guestRotation(input.token, storedToken) : null;
    const ref = input.refNumber?.trim().toUpperCase();
    const previousToken = (ref ? rotation?.previousByRef[ref] : null) ?? storedToken;
    if (input.scope !== accountRevision) return false;
    await deviceRequest({ method: 'POST', headers: {
      ...(input.authToken ? { Authorization: `Bearer ${input.authToken}` } : {}),
      ...(input.bookingAccessToken ? { 'X-Booking-Access': input.bookingAccessToken } : {}),
    }, body: JSON.stringify({ token: input.token, platform: input.platform, refNumber: input.refNumber ?? undefined,
      notificationVersion: CUSTOMER_NOTIFICATION_VERSION,
      ...(previousToken && previousToken !== input.token ? { previousToken } : {}),
    }) });
    // Preserve the previous token on failure; queued logout must see a late successful token.
    await setSecureItem(DEVICE_KEY, input.token);
    if (rotation && ref) {
      delete rotation.previousByRef[ref];
      if (Object.keys(rotation.previousByRef).length) await setSecureItem(ROTATION_KEY, JSON.stringify(rotation));
      else await deleteSecureItem(ROTATION_KEY);
    }
    lastRegistration = { token: input.token, authToken: input.authToken, refNumber: input.refNumber, scope: input.scope, at: Date.now() };
    return input.scope === accountRevision;
  });
}

export function detachCustomerPushDevice(authToken: string | null) {
  accountRevision += 1;
  lastRegistration = null;
  return serialize(async () => {
    const token = await getSecureItem(DEVICE_KEY);
    await deleteSecureItem(ROTATION_KEY);
    if (!authToken || !token) return;
    // Store before the network call so a failed/offline logout is retried before
    // any later account is allowed to register this device.
    await setSecureItem(CLEANUP_KEY, JSON.stringify({ token, authToken }));
    try { await flushPendingCleanup(); } catch { /* Retry at the next registration. */ }
  });
}

/** A deleted account has already been revoked server-side; retain no credential. */
export function forgetCustomerPushDevice() {
  accountRevision += 1;
  lastRegistration = null;
  return serialize(async () => {
    await Promise.all([deleteSecureItem(DEVICE_KEY), deleteSecureItem(CLEANUP_KEY), deleteSecureItem(ROTATION_KEY)]);
  });
}
