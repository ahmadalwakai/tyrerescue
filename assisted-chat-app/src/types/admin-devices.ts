export interface AdminDeviceSession {
  id: string;
  deviceName: string | null;
  modelName: string | null;
  platform: string | null;
  osVersion: string | null;
  appVersion: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  lastActiveAt: string | null;
  firstIp: string | null;
  lastIp: string | null;
  revokedAt: string | null;
  isCurrent: boolean;
}

export interface AdminDevicesFeed {
  currentSessionId: string | null;
  items: AdminDeviceSession[];
}

const isId = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const metadataKeys = ['deviceName', 'modelName', 'platform', 'osVersion', 'appVersion', 'firstIp', 'lastIp'] as const;
const dateKeys = ['lastLoginAt', 'lastSeenAt', 'lastActiveAt', 'revokedAt'] as const;

export function parseAdminDevicesFeed(value: unknown): AdminDevicesFeed {
  const unavailable = () => new Error('Could not verify the devices list. Please refresh.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw unavailable();
  const feed = value as Record<string, unknown>;
  if (feed.ok !== true || !(feed.currentSessionId === null || isId(feed.currentSessionId))
    || !Array.isArray(feed.items) || feed.items.length > 100) throw unavailable();
  const currentSessionId = feed.currentSessionId as string | null;
  const ids = new Set<string>();
  const items = feed.items.map((raw): AdminDeviceSession => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw unavailable();
    const item = raw as Record<string, unknown>;
    if (!isId(item.id) || ids.has(item.id) || !isDate(item.createdAt)
      || typeof item.isCurrent !== 'boolean' || item.isCurrent !== (item.id === currentSessionId)
      || !metadataKeys.every((key) => item[key] === null || (typeof item[key] === 'string' && item[key].length <= 512))
      || !dateKeys.every((key) => item[key] === null || isDate(item[key]))) throw unavailable();
    ids.add(item.id);
    return {
      id: item.id, createdAt: item.createdAt, isCurrent: item.isCurrent,
      ...Object.fromEntries(metadataKeys.map((key) => [key, typeof item[key] === 'string' ? item[key].trim() || null : null])),
      ...Object.fromEntries(dateKeys.map((key) => [key, item[key]])),
    } as AdminDeviceSession;
  });
  return { currentSessionId, items };
}

export function adminDeviceTitle(item: AdminDeviceSession): string {
  const name = item.deviceName && !/^unknown$/i.test(item.deviceName) ? item.deviceName : null;
  const model = item.modelName && !/^unknown$/i.test(item.modelName) ? item.modelName : null;
  // iOS may expose only a generic device name without an additional entitlement.
  // Prefer the available model so two iPhones are easier to distinguish.
  if (model && (!name || /^(?:iphone|ipad|ipod)$/i.test(name))) return model;
  return name || model || (item.platform === 'ios' ? 'iOS device'
    : item.platform === 'android' ? 'Android device' : item.platform === 'web' ? 'Web session' : 'Unknown device');
}

export function adminDeviceActivity(item: AdminDeviceSession, now = Date.now()): string {
  if (item.revokedAt) return 'Removed';
  if (!item.lastActiveAt) return 'Activity not recorded';
  const age = now - Date.parse(item.lastActiveAt);
  return age >= 0 && age <= 120_000 ? 'Active recently' : 'No recent app activity';
}

export function formatAdminDeviceTimestamp(value: string | null, now = Date.now()): string {
  if (!value || !isDate(value)) return 'Not recorded';
  const difference = now - Date.parse(value);
  const minutes = Math.floor(difference / 60_000);
  const relative = difference < -60_000 ? 'ahead of this device’s clock' : minutes < 1 ? 'just now'
    : minutes < 60 ? `${minutes} min ago` : minutes < 1_440 ? `${Math.floor(minutes / 60)} hr ago`
      : `${Math.floor(minutes / 1_440)} days ago`;
  const absolute = new Date(value).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/London', timeZoneName: 'short',
  });
  return `${absolute} · ${relative}`;
}

interface DevicesApi {
  get<T>(path: string, options?: { signal?: AbortSignal }): Promise<T>;
  del<T>(path: string, options?: { signal?: AbortSignal }): Promise<T>;
}

export async function fetchAdminDevices(client: DevicesApi, signal?: AbortSignal): Promise<AdminDevicesFeed> {
  return parseAdminDevicesFeed(await client.get<unknown>('/api/mobile/admin/auth/devices', { signal }));
}

export class AdminDevicesContextChangedError extends Error {
  constructor() { super('Session changed. Reopen Devices & sessions to continue.'); this.name = 'AdminDevicesContextChangedError'; }
}

/** Confirm canonical data, recheck after the prompt, and never clear a newer login. */
export async function removeAdminDeviceWithConfirmation(
  client: DevicesApi,
  sessionId: string,
  isCurrentContext: () => boolean,
  confirm: (item: AdminDeviceSession) => Promise<boolean>,
  onCurrentDeviceRemoved: () => Promise<void> | void,
  signal?: AbortSignal,
): Promise<{ removed: boolean; removedCurrent: boolean }> {
  const checkContext = () => { if (!isCurrentContext() || signal?.aborted) throw new AdminDevicesContextChangedError(); };
  const activeTarget = (feed: AdminDevicesFeed) => {
    const item = feed.items.find((candidate) => candidate.id === sessionId);
    if (!item || item.revokedAt) throw new Error('This session has already been removed. Refresh the list.');
    return item;
  };
  checkContext();
  if (!isId(sessionId)) throw new Error('Invalid session. Refresh the devices list.');
  const first = await fetchAdminDevices(client, signal);
  checkContext();
  const target = activeTarget(first);
  if (!await confirm(target)) return { removed: false, removedCurrent: false };
  checkContext();
  const fresh = await fetchAdminDevices(client, signal);
  checkContext();
  if (activeTarget(fresh).isCurrent !== target.isCurrent) throw new Error('Session details changed. Review this device again before removing it.');
  const result = await client.del<{ ok?: boolean; removedCurrent?: boolean }>(
    `/api/mobile/admin/auth/devices/${encodeURIComponent(sessionId)}`, { signal },
  );
  checkContext();
  if (result?.ok !== true || typeof result.removedCurrent !== 'boolean' || result.removedCurrent !== target.isCurrent) {
    throw new Error('Could not verify removal. Refresh the devices list.');
  }
  if (result.removedCurrent) await onCurrentDeviceRemoved();
  return { removed: true, removedCurrent: result.removedCurrent };
}
