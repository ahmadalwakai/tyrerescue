import { describe, expect, it, vi } from 'vitest';
import {
  adminDeviceActivity, adminDeviceTitle, fetchAdminDevices, formatAdminDeviceTimestamp,
  parseAdminDevicesFeed, removeAdminDeviceWithConfirmation,
  type AdminDeviceSession,
} from '../../assisted-chat-app/src/types/admin-devices';

const currentId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const now = Date.parse('2026-10-21T12:00:00.000Z');
const item: AdminDeviceSession = {
  id: currentId, deviceName: 'Fixture iPhone', modelName: 'iPhone fixture', platform: 'ios', osVersion: '26', appVersion: '1.0.12',
  createdAt: '2026-10-20T12:00:00.000Z', lastLoginAt: '2026-10-20T12:00:00.000Z',
  lastSeenAt: '2026-10-21T12:00:00.000Z', lastActiveAt: '2026-10-21T11:59:00.000Z',
  firstIp: '192.0.2.1', lastIp: '192.0.2.2', revokedAt: null, isCurrent: true,
};
const feed = (items: AdminDeviceSession[] = [item]) => ({ ok: true, currentSessionId: currentId, items });

function fixtures(target: AdminDeviceSession = item) {
  let current = true;
  const client = {
    get: vi.fn(async () => feed([target])),
    del: vi.fn(async () => ({ ok: true, removedCurrent: target.isCurrent })),
  };
  const confirm = vi.fn(async () => true);
  const currentRemoved = vi.fn(async () => undefined);
  return { client, confirm, currentRemoved, isCurrent: () => current, setCurrent: (value: boolean) => { current = value; } };
}

describe('Devices & sessions canonical feed and activity display', () => {
  it('accepts current, other and recently removed sessions while preserving recorded metadata', () => {
    const other = { ...item, id: otherId, isCurrent: false, revokedAt: '2026-10-21T11:00:00.000Z' };
    expect(parseAdminDevicesFeed(feed([item, other]))).toEqual({ currentSessionId: currentId, items: [item, other] });
  });

  it('makes missing historical details explicit without inventing activity or a login date', () => {
    const legacy = { ...item, deviceName: null, modelName: null, platform: null, osVersion: null, appVersion: null, lastLoginAt: null, lastActiveAt: null, firstIp: null, lastIp: null };
    const parsed = parseAdminDevicesFeed(feed([legacy])).items[0];
    expect(adminDeviceTitle(parsed)).toBe('Unknown device');
    expect(adminDeviceActivity(parsed, now)).toBe('Activity not recorded');
    expect(formatAdminDeviceTimestamp(parsed.lastLoginAt, now)).toBe('Not recorded');
    expect(parsed.lastSeenAt).toBe(item.lastSeenAt);
  });

  it('uses recent app activity rather than a background server contact to describe activity', () => {
    expect(adminDeviceActivity(item, now)).toBe('Active recently');
    expect(adminDeviceActivity({ ...item, lastActiveAt: '2026-10-21T11:57:59.000Z' }, now)).toBe('No recent app activity');
    expect(adminDeviceActivity({ ...item, lastActiveAt: null, lastSeenAt: new Date(now).toISOString() }, now)).toBe('Activity not recorded');
    expect(adminDeviceActivity({ ...item, lastActiveAt: new Date(now + 1).toISOString() }, now)).toBe('No recent app activity');
    expect(adminDeviceActivity({ ...item, revokedAt: new Date(now).toISOString() }, now)).toBe('Removed');
  });

  it('uses available model details when iOS supplies only a generic or unknown name', () => {
    expect(adminDeviceTitle({ ...item, deviceName: 'iPhone', modelName: 'iPhone 16 Pro' })).toBe('iPhone 16 Pro');
    expect(adminDeviceTitle({ ...item, deviceName: 'Unknown', modelName: 'Unknown' })).toBe('iOS device');
    expect(adminDeviceTitle({ ...item, deviceName: 'Office phone', modelName: 'iPhone 16 Pro' })).toBe('Office phone');
  });

  it('shows UK absolute time, the applicable timezone and relative age', () => {
    const summer = formatAdminDeviceTimestamp('2026-10-21T11:58:00.000Z', now);
    expect(summer).toContain('12:58'); expect(summer).toContain('BST'); expect(summer).toContain('2 min ago');
    const winter = formatAdminDeviceTimestamp('2026-01-21T12:00:00.000Z', Date.parse('2026-01-21T12:02:00.000Z'));
    expect(winter).toContain('12:00'); expect(winter).toContain('GMT');
  });

  it.each([
    {}, { ok: false, currentSessionId: currentId, items: [item] },
    { ...feed(), currentSessionId: 'invalid' }, feed([{ ...item, id: 'invalid' }]),
    feed([{ ...item, isCurrent: false }]), feed([item, item]),
    feed([{ ...item, lastActiveAt: 'invalid' }]), feed([{ ...item, firstIp: { unexpected: true } } as unknown as AdminDeviceSession]),
  ])('rejects inconsistent, malformed or ambiguous canonical data', (value) => {
    expect(() => parseAdminDevicesFeed(value)).toThrow('Could not verify the devices list');
  });

  it('fetches only the protected current-account devices endpoint and forwards cancellation', async () => {
    const h = fixtures(); const controller = new AbortController();
    await fetchAdminDevices(h.client, controller.signal);
    expect(h.client.get).toHaveBeenCalledExactlyOnceWith('/api/mobile/admin/auth/devices', { signal: controller.signal });
  });
});

describe('manual session removal through fake API only', () => {
  it('requires confirmation before DELETE and revalidates canonical data after confirmation', async () => {
    const other = { ...item, id: otherId, isCurrent: false };
    const h = fixtures(other);
    h.confirm.mockImplementation(async (target) => {
      expect(target).toEqual(other);
      expect(h.client.del).not.toHaveBeenCalled();
      return true;
    });
    await expect(removeAdminDeviceWithConfirmation(h.client, otherId, h.isCurrent, h.confirm, h.currentRemoved)).resolves.toEqual({ removed: true, removedCurrent: false });
    expect(h.client.get).toHaveBeenCalledTimes(2);
    expect(h.client.del).toHaveBeenCalledExactlyOnceWith(`/api/mobile/admin/auth/devices/${otherId}`, { signal: undefined });
    expect(h.currentRemoved).not.toHaveBeenCalled();
  });

  it('never deletes a session when the admin cancels the prompt', async () => {
    const h = fixtures(); h.confirm.mockResolvedValue(false);
    await expect(removeAdminDeviceWithConfirmation(h.client, currentId, h.isCurrent, h.confirm, h.currentRemoved)).resolves.toEqual({ removed: false, removedCurrent: false });
    expect(h.client.get).toHaveBeenCalledOnce(); expect(h.client.del).not.toHaveBeenCalled(); expect(h.currentRemoved).not.toHaveBeenCalled();
  });

  it('clears this app only after a successful current-session response', async () => {
    const h = fixtures();
    h.currentRemoved.mockImplementation(async () => { expect(h.client.del).toHaveBeenCalledOnce(); });
    await expect(removeAdminDeviceWithConfirmation(h.client, currentId, h.isCurrent, h.confirm, h.currentRemoved)).resolves.toEqual({ removed: true, removedCurrent: true });
    expect(h.currentRemoved).toHaveBeenCalledOnce();
  });

  it('does not clear local sign-in after a failed or contradictory removal response', async () => {
    const h = fixtures(); h.client.del.mockResolvedValue({ ok: true, removedCurrent: false });
    await expect(removeAdminDeviceWithConfirmation(h.client, currentId, h.isCurrent, h.confirm, h.currentRemoved)).rejects.toThrow('Could not verify removal');
    expect(h.currentRemoved).not.toHaveBeenCalled();
    h.client.del.mockRejectedValue(new Error('Isolated server unavailable'));
    await expect(removeAdminDeviceWithConfirmation(h.client, currentId, h.isCurrent, h.confirm, h.currentRemoved)).rejects.toThrow('Isolated server unavailable');
    expect(h.currentRemoved).not.toHaveBeenCalled();
  });

  it('does not act on a session owned by another account or no longer present in the canonical feed', async () => {
    const h = fixtures(); h.client.get.mockResolvedValue(feed([]));
    await expect(removeAdminDeviceWithConfirmation(h.client, currentId, h.isCurrent, h.confirm, h.currentRemoved)).rejects.toThrow('already been removed');
    expect(h.confirm).not.toHaveBeenCalled(); expect(h.client.del).not.toHaveBeenCalled();
  });

  it('does not remove an already revoked target, including a change while confirmation is open', async () => {
    const h = fixtures();
    h.client.get.mockResolvedValueOnce(feed()).mockResolvedValueOnce(feed([{ ...item, revokedAt: new Date(now).toISOString() }]));
    await expect(removeAdminDeviceWithConfirmation(h.client, currentId, h.isCurrent, h.confirm, h.currentRemoved)).rejects.toThrow('already been removed');
    expect(h.client.del).not.toHaveBeenCalled(); expect(h.currentRemoved).not.toHaveBeenCalled();
  });

  it('asks for a new review if canonical current-device ownership changes while confirmation is open', async () => {
    const h = fixtures();
    h.client.get.mockResolvedValueOnce(feed()).mockResolvedValueOnce({ ok: true, currentSessionId: otherId, items: [{ ...item, isCurrent: false }] });
    await expect(removeAdminDeviceWithConfirmation(h.client, currentId, h.isCurrent, h.confirm, h.currentRemoved)).rejects.toThrow('Session details changed');
    expect(h.client.del).not.toHaveBeenCalled(); expect(h.currentRemoved).not.toHaveBeenCalled();
  });

  it('keeps cached sign-in on generic 401 errors instead of treating them as device removal', async () => {
    const h = fixtures();
    h.client.del.mockRejectedValue(Object.assign(new Error('Unable to verify this session. Please retry.'), { status: 401, name: 'ApiError' }));
    await expect(removeAdminDeviceWithConfirmation(h.client, currentId, h.isCurrent, h.confirm, h.currentRemoved)).rejects.toThrow('Unable to verify this session');
    expect(h.currentRemoved).not.toHaveBeenCalled();
  });

  it('refuses a stale backend/token/revision context before requests or after confirmation', async () => {
    const h = fixtures(); h.setCurrent(false);
    await expect(removeAdminDeviceWithConfirmation(h.client, currentId, h.isCurrent, h.confirm, h.currentRemoved)).rejects.toThrow('Session changed');
    expect(h.client.get).not.toHaveBeenCalled();
    h.setCurrent(true);
    h.confirm.mockImplementation(async () => { h.setCurrent(false); return true; });
    await expect(removeAdminDeviceWithConfirmation(h.client, currentId, h.isCurrent, h.confirm, h.currentRemoved)).rejects.toThrow('Session changed');
    expect(h.client.del).not.toHaveBeenCalled();
  });

  it('does not DELETE when context changes during the final canonical refresh', async () => {
    const h = fixtures();
    h.client.get.mockResolvedValueOnce(feed()).mockImplementationOnce(async () => { h.setCurrent(false); return feed(); });
    await expect(removeAdminDeviceWithConfirmation(h.client, currentId, h.isCurrent, h.confirm, h.currentRemoved)).rejects.toThrow('Session changed');
    expect(h.client.del).not.toHaveBeenCalled();
  });

  it('never logs out a newer login when an old current-session DELETE response arrives late', async () => {
    const h = fixtures();
    h.client.del.mockImplementation(async () => { h.setCurrent(false); return { ok: true, removedCurrent: true }; });
    await expect(removeAdminDeviceWithConfirmation(h.client, currentId, h.isCurrent, h.confirm, h.currentRemoved)).rejects.toThrow('Session changed');
    expect(h.currentRemoved).not.toHaveBeenCalled();
  });

  it('honours cancellation and rejects invalid IDs without a request', async () => {
    const h = fixtures(); const controller = new AbortController(); controller.abort();
    await expect(removeAdminDeviceWithConfirmation(h.client, currentId, h.isCurrent, h.confirm, h.currentRemoved, controller.signal)).rejects.toThrow('Session changed');
    await expect(removeAdminDeviceWithConfirmation(h.client, '../other', h.isCurrent, h.confirm, h.currentRemoved)).rejects.toThrow('Invalid session');
    expect(h.client.get).not.toHaveBeenCalled(); expect(h.client.del).not.toHaveBeenCalled();
  });
});
