import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tokensQuery: vi.fn(),
  badge: vi.fn(),
  isFcmConfigured: vi.fn(),
  topicFcm: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/lib/db', async () => {
  const schema = await import('../db/schema');
  return {
    db: {
      select: () => ({
        from: (table: unknown) => table === schema.bookings
          ? { where: mocks.badge }
          : { where: mocks.tokensQuery },
      }),
    },
  };
});
vi.mock('@/lib/notifications/fcm', () => ({
  isFcmConfigured: mocks.isFcmConfigured,
  sendFcmTopicNotification: mocks.topicFcm,
}));

import { sendAdminExpoPush, sendAdminExpoPushWithResult } from '@/lib/notifications/expo-admin-push';
import { sendAdminStatusUpdatePush, sendAdminStatusUpdatePushWithResult } from '@/lib/notifications/admin-status-push';

const iosToken = 'ExponentPushToken[isolated-outcome-ios]';
const modernIosToken = 'ExpoPushToken[isolated-outcome-modern-ios]';
const androidToken = 'ExpoPushToken[isolated-outcome-android]';
const payload = { title: 'Isolated title', body: 'Isolated body', badge: 0 };
const statusArgs = {
  bookingId: 'isolated-booking',
  refNumber: 'TR-ISOLATED',
  title: 'Driver journey confirmation',
  body: 'Confirm this isolated journey',
};

function relayResponse(tickets: unknown[]) {
  return { ok: true, json: async () => ({ data: tickets }) };
}

function sentMessages() {
  return JSON.parse(mocks.fetch.mock.calls[0][1].body as string) as Array<Record<string, unknown>>;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.tokensQuery.mockResolvedValue([{ token: iosToken, platform: 'ios' }]);
  mocks.badge.mockResolvedValue([{ value: 0 }]);
  mocks.isFcmConfigured.mockReturnValue(false);
  mocks.topicFcm.mockResolvedValue({ success: true });
  mocks.fetch.mockImplementation(async (_url: string, request: { body: string }) => (
    relayResponse(JSON.parse(request.body).map(() => ({ status: 'ok', id: 'isolated-ticket' })))
  ));
  vi.stubGlobal('fetch', mocks.fetch);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('observable Expo acceptance (isolated database and network)', () => {
  it('counts both Expo token formats and only the requested platform', async () => {
    mocks.tokensQuery.mockResolvedValue([
      { token: iosToken, platform: 'ios' },
      { token: modernIosToken, platform: 'ios' },
      { token: androidToken, platform: 'android' },
      { token: 'isolated-native-token', platform: 'ios' },
    ]);
    await expect(sendAdminExpoPushWithResult({ ...payload, platforms: ['ios'] })).resolves.toEqual({ accepted: 2, failed: 0, unavailable: false });
    expect(sentMessages().map((message) => message.to)).toEqual([iosToken, modernIosToken]);
    expect(sentMessages()[0]).not.toHaveProperty('ttl');
  });

  it('reports unavailable when no devices are registered without contacting the relay', async () => {
    mocks.tokensQuery.mockResolvedValue([]);
    await expect(sendAdminExpoPushWithResult(payload)).resolves.toEqual({ accepted: 0, failed: 0, unavailable: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('reports no iOS recipients even when Android has a registered token', async () => {
    mocks.tokensQuery.mockResolvedValue([{ token: androidToken, platform: 'android' }]);
    await expect(sendAdminExpoPushWithResult({ ...payload, platforms: ['ios'] })).resolves.toEqual({ accepted: 0, failed: 0, unavailable: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('keeps partial acceptance so an outbox does not resend to successful phones', async () => {
    mocks.tokensQuery.mockResolvedValue([{ token: iosToken, platform: 'ios' }, { token: modernIosToken, platform: 'ios' }]);
    mocks.fetch.mockResolvedValue(relayResponse([{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }]));
    await expect(sendAdminExpoPushWithResult(payload)).resolves.toEqual({ accepted: 1, failed: 1, unavailable: false });
  });

  it('distinguishes rejected tickets from an unavailable transport and redacts provider text', async () => {
    mocks.fetch.mockResolvedValue(relayResponse([{ status: 'error', message: `provider echoed ${iosToken}`, details: { error: 'isolated-sensitive-value', secret: 'isolated-private-detail' } }]));
    await expect(sendAdminExpoPushWithResult(payload)).resolves.toEqual({ accepted: 0, failed: 1, unavailable: false });
    expect(console.error).toHaveBeenCalledWith('[expo-admin-push] relay ticket errors', { messages: 1, failed: 1, errorCodes: ['UnknownError'] });
    const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logs).not.toContain(iosToken);
    expect(logs).not.toContain('isolated-sensitive-value');
    expect(logs).not.toContain('isolated-private-detail');
  });

  it('preserves known acceptance in an incomplete ticket response', async () => {
    mocks.tokensQuery.mockResolvedValue([{ token: iosToken, platform: 'ios' }, { token: modernIosToken, platform: 'ios' }]);
    mocks.fetch.mockResolvedValue(relayResponse([{ status: 'ok' }]));
    await expect(sendAdminExpoPushWithResult(payload)).resolves.toEqual({ accepted: 1, failed: 1, unavailable: true });
  });

  it('counts invalid ticket entries as failed without accepting extra unsolicited tickets', async () => {
    mocks.tokensQuery.mockResolvedValue([{ token: iosToken, platform: 'ios' }, { token: modernIosToken, platform: 'ios' }]);
    mocks.fetch.mockResolvedValue(relayResponse([{ status: 'ok' }, null, { status: 'ok' }]));
    await expect(sendAdminExpoPushWithResult(payload)).resolves.toEqual({ accepted: 1, failed: 1, unavailable: true });
  });

  it('treats malformed or unreadable response JSON as unavailable', async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: 'invalid' }) });
    await expect(sendAdminExpoPushWithResult(payload)).resolves.toEqual({ accepted: 0, failed: 1, unavailable: true });
    mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error(`isolated ${iosToken}`); } });
    await expect(sendAdminExpoPushWithResult(payload)).resolves.toEqual({ accepted: 0, failed: 1, unavailable: true });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(iosToken);
  });

  it('reports HTTP failures without reading or logging the provider body', async () => {
    const text = vi.fn(async () => `isolated ${iosToken}`);
    mocks.fetch.mockResolvedValue({ ok: false, status: 503, text });
    await expect(sendAdminExpoPushWithResult(payload)).resolves.toEqual({ accepted: 0, failed: 1, unavailable: true });
    expect(text).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('[expo-admin-push] relay HTTP error', { status: 503, messages: 1 });
  });

  it('never throws or leaks a network error', async () => {
    mocks.fetch.mockRejectedValue(new Error(`isolated ${iosToken}`));
    await expect(sendAdminExpoPushWithResult(payload)).resolves.toEqual({ accepted: 0, failed: 1, unavailable: true });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(iosToken);
  });

  it('never throws when the token query is unavailable', async () => {
    mocks.tokensQuery.mockRejectedValue(new Error('isolated database failure'));
    await expect(sendAdminExpoPushWithResult(payload)).resolves.toEqual({ accepted: 0, failed: 0, unavailable: true });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('aborts the relay after eight seconds and clears the timeout', async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    mocks.fetch.mockImplementation((_url: string, request: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      signal = request.signal;
      signal.addEventListener('abort', () => reject(new DOMException('Isolated aborted request', 'AbortError')), { once: true });
    }));
    let finished = false;
    const result = sendAdminExpoPushWithResult(payload).then((value) => { finished = true; return value; });
    await vi.advanceTimersByTimeAsync(7_999);
    expect(signal.aborted).toBe(false);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ accepted: 0, failed: 1, unavailable: true });
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the relay timeout after a successful response', async () => {
    vi.useFakeTimers();
    await expect(sendAdminExpoPushWithResult(payload)).resolves.toEqual({ accepted: 1, failed: 0, unavailable: false });
    expect(vi.getTimerCount()).toBe(0);
    const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
    await vi.advanceTimersByTimeAsync(8_000);
    expect(signal.aborted).toBe(false);
  });

  it('keeps the original void sender awaitable until relay acceptance is known', async () => {
    let finish!: (response: ReturnType<typeof relayResponse>) => void;
    mocks.fetch.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    let finished = false;
    const task = sendAdminExpoPush(payload).then((value) => { finished = true; return value; });
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    expect(finished).toBe(false);
    finish(relayResponse([{ status: 'ok' }]));
    await expect(task).resolves.toBeUndefined();
    expect(finished).toBe(true);
  });
});

describe('status notification outcome and canonical event payload', () => {
  it('preserves event IDs while canonical fields override custom data and iOS accounting excludes Android', async () => {
    mocks.tokensQuery.mockResolvedValue([{ token: iosToken, platform: 'ios' }, { token: androidToken, platform: 'android' }]);
    mocks.isFcmConfigured.mockReturnValue(true);
    const eventId = 'isolated-event';
    const journeyId = 'isolated-journey';
    const args = {
      ...statusArgs, type: 'driver_journey_confirmation', sourceLabel: 'TyreRescue', platforms: ['ios'] as Array<'ios'>,
      data: { eventId, journeyId, type: 'invalid', bookingId: 'invalid', refNumber: 'invalid', title: 'invalid', body: 'invalid', sourceLabel: 'invalid' },
    };
    await expect(sendAdminStatusUpdatePushWithResult(args)).resolves.toEqual({ accepted: 1, failed: 0, unavailable: false });
    const expectedData = { ...statusArgs, type: 'driver_journey_confirmation', sourceLabel: 'TyreRescue', eventId, journeyId };
    expect(sentMessages()).toEqual([expect.objectContaining({ to: iosToken, sound: 'default', channelId: 'booking_updates', ttl: 600, data: expectedData })]);
    expect(mocks.topicFcm).toHaveBeenCalledExactlyOnceWith('booking_updates', statusArgs.title, statusArgs.body, expectedData, {
      priority: 'NORMAL', ttl: '600s', includeNotification: true, channelId: 'booking_updates',
    });
  });

  it('skips FCM on retry while still returning Expo acceptance', async () => {
    mocks.isFcmConfigured.mockReturnValue(true);
    await expect(sendAdminStatusUpdatePushWithResult({ ...statusArgs, platforms: ['ios'], skipFcm: true })).resolves.toEqual({ accepted: 1, failed: 0, unavailable: false });
    expect(mocks.topicFcm).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it('returns the Expo outcome when FCM fails and redacts its error', async () => {
    mocks.isFcmConfigured.mockReturnValue(true);
    mocks.topicFcm.mockRejectedValue(new Error('isolated-fcm-private-error'));
    await expect(sendAdminStatusUpdatePushWithResult(statusArgs)).resolves.toEqual({ accepted: 1, failed: 0, unavailable: false });
    expect(console.error).toHaveBeenCalledWith('[admin-status-push] FCM topic send failed');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('isolated-fcm-private-error');
  });

  it('starts Expo immediately and bounds an unresponsive FCM helper without losing acceptance', async () => {
    vi.useFakeTimers();
    mocks.isFcmConfigured.mockReturnValue(true);
    mocks.topicFcm.mockReturnValue(new Promise(() => undefined));
    let finished = false;
    const result = sendAdminStatusUpdatePushWithResult(statusArgs).then((value) => { finished = true; return value; });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(result).resolves.toEqual({ accepted: 1, failed: 0, unavailable: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not mistake successful Android FCM for iPhone Expo acceptance', async () => {
    mocks.isFcmConfigured.mockReturnValue(true);
    mocks.fetch.mockRejectedValue(new Error('isolated relay unavailable'));
    await expect(sendAdminStatusUpdatePushWithResult({ ...statusArgs, platforms: ['ios'] })).resolves.toEqual({ accepted: 0, failed: 1, unavailable: true });
    expect(mocks.topicFcm).toHaveBeenCalledOnce();
  });

  it('retains the awaitable void wrapper and default booking_update payload', async () => {
    await expect(sendAdminStatusUpdatePush(statusArgs)).resolves.toBeUndefined();
    expect(sentMessages()[0]).toMatchObject({ data: { ...statusArgs, type: 'booking_update' } });
  });
});
