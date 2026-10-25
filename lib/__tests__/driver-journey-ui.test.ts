import { describe, expect, it, vi } from 'vitest';
import { parseDriverJourneyNotificationOpenRequest, parseUrgentBookingNotificationOpenRequest } from '../../assisted-chat-app/src/lib/notification-safety';
import { canDecideDriverJourney, fetchDriverJourneyItems, mergeDriverJourneyFeed, parseDriverJourneyFeed, postDriverJourneyDecision, submitFreshDriverJourneyDecision, type DriverJourneyItem } from '../../assisted-chat-app/src/types/driver-journeys';

const eventId = '10000000-0000-0000-0000-000000000001';
const journeyId = '20000000-0000-0000-0000-000000000001';
const bookingId = '30000000-0000-0000-0000-000000000001';
const item: DriverJourneyItem = {
  id: journeyId, eventId, bookingId, driverId: '40000000-0000-0000-0000-000000000001',
  driverName: 'Driver A', refNumber: 'TR-123', customerName: 'Customer B', locationLabel: 'Glasgow',
  kind: 'confirmation', status: 'pending', createdAt: '2026-10-21T10:00:00Z', expiresAt: '2099-01-01T00:00:00Z',
  lastLocationAt: '2026-10-21T10:00:00Z', etaSeconds: 300, distanceMeters: 800, isRead: false,
};
function mockClient(items: DriverJourneyItem[] = [item]) {
  const get = vi.fn(); const post = vi.fn();
  return { getSpy: get, postSpy: post,
    async get<T>(path: string): Promise<T> { get(path); return { ok: true, items } as T; },
    async post<T>(path: string, body?: unknown): Promise<T> {
      post(path, body); return { ok: true, status: (body as { decision?: string })?.decision === 'no' ? 'rejected' : 'confirmed' } as T;
    },
  };
}

describe('driver journey notification routing', () => {
  it.each(['driver_journey_confirmation', 'driver_journey_near', 'driver_journey_stopped'])('routes %s only by event ID', (type) => {
    const payload = { type, eventId, journeyId, bookingId, driverName: 'Untrusted name', refNumber: 'Untrusted ref' };
    expect(parseDriverJourneyNotificationOpenRequest(payload)).toEqual({ eventId });
    expect(parseUrgentBookingNotificationOpenRequest(payload)).toBeNull();
  });

  it.each([null, {}, { type: 'driver_journey_unknown', eventId, journeyId, bookingId },
    { type: 'driver_journey_near', eventId: '../../other', journeyId, bookingId },
    { type: 'driver_journey_confirmation', eventId, journeyId: null, bookingId }])('ignores malformed or unsupported payload %j', (value) => {
    expect(parseDriverJourneyNotificationOpenRequest(value)).toBeNull();
  });
});

describe('canonical driver journey API contract', () => {
  it('merges an exact-event response without dropping other unread feed events', () => {
    const other = { ...item, eventId: '10000000-0000-0000-0000-000000000002' };
    const updated = { ...item, isRead: true };
    expect(mergeDriverJourneyFeed([item, other], [updated], eventId)).toEqual([updated, other]);
    expect(mergeDriverJourneyFeed([item, other], [], eventId)).toEqual([other]);
    expect(mergeDriverJourneyFeed([item], [other])).toEqual([other]);
  });

  it('fetches the exact event through authenticated client rather than push display fields', async () => {
    const client = mockClient();
    expect(await fetchDriverJourneyItems(client, eventId)).toEqual([item]);
    expect(client.getSpy).toHaveBeenCalledWith(`/api/mobile/admin/driver-journeys?eventId=${eventId}`);
    expect(client.postSpy).not.toHaveBeenCalled();
  });

  it('fails closed on invalid server data and never invents a candidate', () => {
    expect(() => parseDriverJourneyFeed({ ok: true, items: [{ ...item, driverId: 'unknown' }] })).toThrow();
    expect(() => parseDriverJourneyFeed({ ok: true, items: [{ ...item, etaSeconds: -1 }] })).toThrow();
    expect(() => parseDriverJourneyFeed({ ok: false, items: [item] })).toThrow();
    expect(parseDriverJourneyFeed({ ok: true, items: [] })).toEqual([]);
  });

  it('rejects invalid event IDs without even making a GET', async () => {
    const client = mockClient();
    await expect(fetchDriverJourneyItems(client, 'bad/id')).rejects.toThrow();
    expect(client.getSpy).not.toHaveBeenCalled();
  });

  it.each(['yes', 'no'] as const)('sends only an explicit %s decision using the canonical journey ID', async (decision) => {
    const client = mockClient();
    await submitFreshDriverJourneyDecision(client, eventId, decision, () => true);
    expect(client.getSpy).toHaveBeenCalledOnce();
    expect(client.postSpy).toHaveBeenCalledExactlyOnceWith(`/api/mobile/admin/driver-journeys/${journeyId}/decision`, { decision });
  });

  it('does not submit a confirmation after it expires or has already been answered', async () => {
    const client = mockClient();
    for (const candidate of [{ ...item, expiresAt: '2000-01-01T00:00:00Z' }, { ...item, status: 'confirmed' as const }, { ...item, kind: 'near' as const }]) {
      expect(canDecideDriverJourney(candidate)).toBe(false);
      await expect(postDriverJourneyDecision(client, candidate, 'yes')).rejects.toThrow();
    }
    expect(client.postSpy).not.toHaveBeenCalled();
  });

  it('cancels a decision if the session changes while canonical data is loading', async () => {
    const client = mockClient(); let current = true;
    client.get = async <T>() => { current = false; return { ok: true, items: [item] } as T; };
    await expect(submitFreshDriverJourneyDecision(client, eventId, 'yes', () => current)).rejects.toThrow('Session changed');
    expect(client.postSpy).not.toHaveBeenCalled();
  });

  it('does not mutate a missing event, an already changed session, or an aborted request', async () => {
    const client = mockClient([]);
    await expect(submitFreshDriverJourneyDecision(client, eventId, 'yes', () => true)).rejects.toThrow('no longer available');
    const controller = new AbortController(); controller.abort();
    await expect(submitFreshDriverJourneyDecision(client, eventId, 'yes', () => true, controller.signal)).rejects.toThrow('Session changed');
    await expect(submitFreshDriverJourneyDecision(client, eventId, 'no', () => false)).rejects.toThrow('Session changed');
    expect(client.postSpy).not.toHaveBeenCalled();
  });

  it('surfaces a stale-decision conflict without claiming confirmation succeeded', async () => {
    const client = mockClient();
    client.post = async () => { throw Object.assign(new Error('Journey expired'), { status: 409 }); };
    await expect(submitFreshDriverJourneyDecision(client, eventId, 'yes', () => true)).rejects.toMatchObject({ status: 409 });
  });
});
