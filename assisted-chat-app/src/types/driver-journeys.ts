export interface DriverJourneyItem {
  id: string; eventId: string; driverId: string; driverName: string;
  bookingId: string; refNumber: string; customerName: string | null; locationLabel: string | null;
  status: 'pending' | 'confirmed' | 'rejected' | 'ended' | 'expired';
  kind: 'confirmation' | 'near' | 'stopped';
  createdAt: string; expiresAt: string; etaSeconds: number | null; distanceMeters: number | null;
  lastLocationAt: string | null; isRead: boolean;
}

export const isJourneyId = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const optionalNumber = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);

export function parseDriverJourneyFeed(value: unknown): DriverJourneyItem[] {
  if (!value || typeof value !== 'object') throw new Error('Journey feed unavailable. Try refreshing.');
  const feed = value as { ok?: unknown; items?: unknown };
  if (feed.ok !== true || !Array.isArray(feed.items)) throw new Error('Journey feed unavailable. Try refreshing.');
  return feed.items.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid journey information. Refresh before confirming.');
    const item = raw as Record<string, unknown>;
    if (!['id', 'eventId', 'driverId', 'bookingId'].every((key) => isJourneyId(item[key]))
      || !['driverName', 'refNumber'].every((key) => typeof item[key] === 'string' && Boolean((item[key] as string).trim()))
      || !['customerName', 'locationLabel'].every((key) => item[key] === null || typeof item[key] === 'string')
      || !['pending', 'confirmed', 'rejected', 'ended', 'expired'].includes(String(item.status))
      || !['confirmation', 'near', 'stopped'].includes(String(item.kind))
      || !isDate(item.createdAt) || !isDate(item.expiresAt)
      || !(item.lastLocationAt === null || isDate(item.lastLocationAt))
      || !optionalNumber(item.etaSeconds) || !optionalNumber(item.distanceMeters) || typeof item.isRead !== 'boolean') {
      throw new Error('Invalid journey information. Refresh before confirming.');
    }
    return item as unknown as DriverJourneyItem;
  });
}

export function canDecideDriverJourney(item: DriverJourneyItem, now = Date.now()): boolean {
  return item.kind === 'confirmation' && item.status === 'pending' && Date.parse(item.expiresAt) > now;
}

export function driverJourneyTitle(item: DriverJourneyItem): string {
  if (item.kind === 'confirmation') return 'Confirm driver journey';
  return item.kind === 'near' ? 'Driver arriving soon' : 'Driver stopped on the way';
}

export function mergeDriverJourneyFeed(previous: DriverJourneyItem[], incoming: DriverJourneyItem[], eventId?: string): DriverJourneyItem[] {
  if (!eventId) return incoming;
  return [...incoming, ...previous.filter((item) => item.eventId !== eventId)]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

interface JourneyApi {
  get<T>(path: string, options?: { signal?: AbortSignal }): Promise<T>;
  post<T>(path: string, body?: unknown, options?: { signal?: AbortSignal }): Promise<T>;
}

export async function fetchDriverJourneyItems(client: JourneyApi, eventId?: string, signal?: AbortSignal) {
  if (eventId && !isJourneyId(eventId)) throw new Error('Invalid journey notification.');
  return parseDriverJourneyFeed(await client.get<unknown>(
    `/api/mobile/admin/driver-journeys${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''}`, { signal },
  ));
}

export async function postDriverJourneyDecision(client: JourneyApi, item: DriverJourneyItem, decision: 'yes' | 'no', signal?: AbortSignal) {
  if (!isJourneyId(item.id) || !canDecideDriverJourney(item) || !['yes', 'no'].includes(decision)) {
    throw new Error('This confirmation has expired or already been answered. Refresh to continue.');
  }
  const result = await client.post<{ ok?: boolean; status?: string }>(
    `/api/mobile/admin/driver-journeys/${encodeURIComponent(item.id)}/decision`, { decision }, { signal },
  );
  if (result?.ok !== true || result.status !== (decision === 'yes' ? 'confirmed' : 'rejected')) {
    throw new Error('Confirmation was not saved. Refresh to check its status.');
  }
}

/** Revalidate the session after the asynchronous canonical read, before POST. */
export async function submitFreshDriverJourneyDecision(
  client: JourneyApi, eventId: string, decision: 'yes' | 'no', isCurrent: () => boolean, signal?: AbortSignal,
) {
  if (!isCurrent() || signal?.aborted) throw new Error('Session changed. Reopen the journey to continue.');
  const items = await fetchDriverJourneyItems(client, eventId, signal);
  if (!isCurrent() || signal?.aborted) throw new Error('Session changed. Reopen the journey to continue.');
  const item = items.find((candidate) => candidate.eventId === eventId);
  if (!item) throw new Error('This confirmation is no longer available. Refresh to check its status.');
  await postDriverJourneyDecision(client, item, decision, signal);
}
