import { API, requestJson } from './api';
import { deleteSecureItem, getSecureItem, setSecureItem } from './secure-storage';

const DEVICE_KEY = 'customer_push_device_v1';
const CLEANUP_KEY = 'customer_push_cleanup_v1';
let queue: Promise<unknown> = Promise.resolve();
let accountRevision = 0;
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

export function registerCustomerPushDevice(input: {
  token: string; platform: 'ios' | 'android'; authToken?: string | null;
  refNumber?: string | null; bookingAccessToken?: string | null; scope: number;
}) {
  return serialize(async () => {
    await flushPendingCleanup();
    if (input.scope !== accountRevision) return false;
    await setSecureItem(DEVICE_KEY, input.token);
    await deviceRequest({ method: 'POST', headers: {
      ...(input.authToken ? { Authorization: `Bearer ${input.authToken}` } : {}),
      ...(input.bookingAccessToken ? { 'X-Booking-Access': input.bookingAccessToken } : {}),
    }, body: JSON.stringify({ token: input.token, platform: input.platform, refNumber: input.refNumber ?? undefined }) });
    return true;
  });
}

export function detachCustomerPushDevice(authToken: string | null) {
  accountRevision += 1;
  return serialize(async () => {
    const token = await getSecureItem(DEVICE_KEY);
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
  return serialize(async () => {
    await Promise.all([deleteSecureItem(DEVICE_KEY), deleteSecureItem(CLEANUP_KEY)]);
  });
}
