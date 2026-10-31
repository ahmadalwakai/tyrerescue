import nativeActivity, { type CustomerLiveActivityState as LiveActivityState, type CustomerLiveActivity as LiveActivityInfo } from '../modules/customer-live-activity';
import { requestJson } from './api';
import { deleteSecureItem, getSecureItem, setSecureItem } from './secure-storage';

const ENDPOINT = '/api/mobile/customer/live-activity';
const CLEANUP_KEY = 'customer_live_activity_cleanup_v1';
type Auth = { token: string | null; access: string | null };
let resolveAuth: ((refNumber: string) => Promise<Auth>) | null = null;
let generation = 0;
let queue: Promise<unknown> = Promise.resolve();
const registered = new Set<string>();
const known = new Map<string, LiveActivityInfo>();
const wanted = new Set<string>();
const intents = new Map<string, number>();
const listeners = new Set<() => void>();
const fingerprint = (item: { activityId: string; pushToken: string | null }) => `${item.activityId}:${item.pushToken}`;
const revision = (ref: string) => intents.get(ref) ?? 0;
const notify = () => { for (const listener of listeners) listener(); };
const serialize = <T,>(work: () => Promise<T>): Promise<T> => {
  const pending = queue.then(work, work).finally(notify);
  queue = pending.catch(() => undefined);
  return pending;
};
const isCurrent = (ref: string, epoch: number, intent: number) => epoch === generation && intent === revision(ref) && wanted.has(ref);
const permanentFailure = (error: unknown) => error && typeof error === 'object' && 'status' in error && [401, 403, 409].includes(Number(error.status));

export function setLiveActivityAuthResolver(resolver: typeof resolveAuth) { resolveAuth = resolver; }
export function listenForCustomerLiveActivityChanges(listener: () => void) {
  listeners.add(listener);
  return { remove: () => listeners.delete(listener) };
}

async function pendingCleanup(): Promise<{ activityId: string; pushToken: string }[]> {
  try {
    const raw = JSON.parse(await getSecureItem(CLEANUP_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter(item => typeof item?.activityId === 'string' && typeof item?.pushToken === 'string').slice(-30) : [];
  } catch { return []; }
}

async function revoke(items: { activityId: string; pushToken: string }[]) {
  const all = new Map((await pendingCleanup()).map(item => [fingerprint(item), item]));
  for (const item of items) all.set(fingerprint(item), item);
  const pending = [...all.values()];
  // Persist before network work; a later launch retries offline sign-out cleanup.
  // A storage failure must not prevent an online device revoking its tokens.
  if (pending.length) await setSecureItem(CLEANUP_KEY, JSON.stringify(pending)).catch(() => undefined);
  const failed: typeof pending = [];
  for (const item of pending) {
    try { await requestJson(ENDPOINT, { method: 'DELETE', body: JSON.stringify(item) }, 6000); }
    catch { failed.push(item); }
  }
  if (failed.length) await setSecureItem(CLEANUP_KEY, JSON.stringify(failed));
  else await deleteSecureItem(CLEANUP_KEY);
}

async function end(refNumber: string | null, state?: LiveActivityState) {
  const activities = await nativeActivity.getActivities();
  const items = [...known.values(), ...activities].filter(item => refNumber === null || item.refNumber === refNumber);
  if (refNumber === null) await nativeActivity.endAll();
  else await nativeActivity.end(refNumber, state);
  for (const [key, item] of known) {
    if (refNumber === null || item.refNumber === refNumber) { known.delete(key); registered.delete(key); }
  }
  await revoke(items.filter((item): item is LiveActivityInfo & { pushToken: string } => Boolean(item.pushToken))
    .map(item => ({ activityId: item.activityId, pushToken: item.pushToken })));
}

async function register(item: LiveActivityInfo, epoch: number, intent: number) {
  if (!item.pushToken || !resolveAuth || !isCurrent(item.refNumber, epoch, intent)) return;
  const key = fingerprint(item);
  if (registered.has(key)) return;
  // An event can arrive after stop, a restart or another token rotation.
  const current = (await nativeActivity.getActivities()).find(activity => activity.activityId === item.activityId);
  if (!current || current.pushToken !== item.pushToken || !isCurrent(item.refNumber, epoch, intent)) return;
  known.set(key, item);
  const auth = await resolveAuth(item.refNumber);
  if (!isCurrent(item.refNumber, epoch, intent)) return;
  if (!auth.token && !auth.access) { wanted.delete(item.refNumber); await end(item.refNumber); return; }
  await requestJson(ENDPOINT, { method: 'POST', headers: {
    ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}), ...(auth.access ? { 'X-Booking-Access': auth.access } : {}),
  }, body: JSON.stringify({ refNumber: item.refNumber, activityId: item.activityId, pushToken: item.pushToken, environment: item.environment }) }, 10_000);
  if (!isCurrent(item.refNumber, epoch, intent)) { await end(item.refNumber); return; }
  registered.add(key);
}

export async function customerLiveActivityAvailable() {
  if (!await nativeActivity.isSupported()) return false;
  const result = await requestJson<{ available: boolean }>(ENDPOINT, undefined, 6000);
  return result.available === true;
}

export async function customerLiveActivityActive(refNumber: string) {
  return await customerLiveActivityStatus(refNumber) !== 'inactive';
}

export async function customerLiveActivityStatus(refNumber: string): Promise<'inactive' | 'pending' | 'active'> {
  const activities = (await nativeActivity.getActivities()).filter(item => item.refNumber === refNumber);
  if (!activities.length) return 'inactive';
  return activities.some(item => item.pushToken && registered.has(fingerprint(item))) ? 'active' : 'pending';
}

export function startCustomerLiveActivity(refNumber: string, state: LiveActivityState) {
  const epoch = generation;
  if (state.status !== 'en_route') return Promise.reject(new Error('Lock Screen tracking can start when your fitter is on the way.'));
  const intent = revision(refNumber) + 1;
  intents.set(refNumber, intent); wanted.add(refNumber);
  return serialize(async () => {
    if (!isCurrent(refNumber, epoch, intent)) return;
    try {
      if (!await nativeActivity.isSupported()) throw new Error('Enable Live Activities for Tyre Rescue in iPhone Settings, then try again.');
      if (!isCurrent(refNumber, epoch, intent)) return;
      await nativeActivity.startOrUpdate(refNumber, state);
      if (!isCurrent(refNumber, epoch, intent)) { await end(refNumber); return; }
      const activities = await nativeActivity.getActivities();
      if (!activities.some(item => item.refNumber === refNumber)) throw new Error('Enable Live Activities for Tyre Rescue in iPhone Settings, then try again.');
      for (const item of activities.filter(item => item.refNumber === refNumber)) await register(item, epoch, intent);
    } catch (error) {
      // POST may have committed even if its response timed out; revoke before forgetting it.
      if (isCurrent(refNumber, epoch, intent)) wanted.delete(refNumber);
      await end(refNumber);
      throw error;
    }
  });
}

export function updateCustomerLiveActivity(refNumber: string, state: LiveActivityState) {
  if (['completed', 'cancelled', 'cancelled_refund_pending', 'refunded', 'refunded_partial'].includes(state.status)) return stop(refNumber, state);
  const epoch = generation; const intent = revision(refNumber);
  return serialize(async () => {
    if (!isCurrent(refNumber, epoch, intent)) return;
    const activities = (await nativeActivity.getActivities()).filter(item => item.refNumber === refNumber);
    if (!activities.length || !isCurrent(refNumber, epoch, intent)) return;
    await nativeActivity.startOrUpdate(refNumber, state);
    try { for (const item of activities) await register(item, epoch, intent); }
    catch (error) {
      if (permanentFailure(error)) {
        if (isCurrent(refNumber, epoch, intent)) wanted.delete(refNumber);
        await end(refNumber);
      }
      throw error;
    }
  });
}

function stop(refNumber: string, state?: LiveActivityState) {
  wanted.delete(refNumber); intents.set(refNumber, revision(refNumber) + 1);
  return serialize(() => end(refNumber, state));
}
export function stopCustomerLiveActivity(refNumber: string) { return stop(refNumber); }

export function clearCustomerLiveActivities() {
  generation += 1;
  wanted.clear(); intents.clear();
  return serialize(() => end(null));
}

export function resumeCustomerLiveActivities() {
  const epoch = generation; const previousIntents = new Map(intents);
  return serialize(async () => {
    await revoke([]);
    for (const activity of await nativeActivity.getActivities()) {
      if (epoch !== generation) return;
      const intent = previousIntents.get(activity.refNumber) ?? 0;
      if (intent !== revision(activity.refNumber)) continue;
      wanted.add(activity.refNumber);
      try { await register(activity, epoch, intent); }
      catch (error) {
        if (permanentFailure(error)) {
          if (isCurrent(activity.refNumber, epoch, intent)) wanted.delete(activity.refNumber);
          await end(activity.refNumber);
        }
      }
    }
  });
}

export function listenForCustomerLiveActivityTokens() {
  return nativeActivity.addPushTokenListener(item => {
    const epoch = generation; const intent = revision(item.refNumber);
    void serialize(async () => {
      try { await register(item, epoch, intent); }
      catch (error) {
        if (permanentFailure(error)) {
          if (isCurrent(item.refNumber, epoch, intent)) wanted.delete(item.refNumber);
          await end(item.refNumber);
        }
      }
    }).catch(() => undefined);
  });
}
