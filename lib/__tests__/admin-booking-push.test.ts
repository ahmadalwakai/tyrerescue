import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';

const mocks = vi.hoisted(() => ({
  tokens: [] as Array<{ token: string; platform: string }>,
  badge: vi.fn(),
  androidTokens: vi.fn(),
  isFcmConfigured: vi.fn(),
  directFcm: vi.fn(),
  topicFcm: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/lib/db', async () => {
  const schema = await import('../db/schema');
  const { PgDialect } = await import('drizzle-orm/pg-core');
  const dialect = new PgDialect();
  return {
    db: {
      select: () => ({
        from: (table: unknown) => table === schema.bookings
          ? { where: mocks.badge }
          : { where: (condition: SQL) => {
            return dialect.sqlToQuery(condition).params.includes('android')
              ? mocks.androidTokens() : Promise.resolve(mocks.tokens);
          } },
      }),
    },
  };
});
vi.mock('@/lib/notifications/fcm', () => ({
  isFcmConfigured: mocks.isFcmConfigured,
  sendFcmDataMessageToToken: mocks.directFcm,
  sendFcmTopicNotification: mocks.topicFcm,
}));

import { sendAdminExpoPush } from '@/lib/notifications/expo-admin-push';
import { sendUrgentBookingTopicPush } from '@/lib/notifications/urgent-booking-push';

const iosToken = 'ExponentPushToken[isolated-ios]';
const modernIosToken = 'ExpoPushToken[isolated-modern-ios]';
const androidToken = 'ExponentPushToken[isolated-android]';
const booking = { bookingId: 'isolated-booking', refNumber: 'TR-ISOLATED', title: 'Emergency booking received', body: 'Isolated fixture — awaiting payment' };

function relayResponse(tickets: unknown[]) {
  return { ok: true, json: async () => ({ data: tickets }) };
}

function sentMessages() {
  return JSON.parse(mocks.fetch.mock.calls[0][1].body as string) as Array<Record<string, unknown>>;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.tokens = [{ token: iosToken, platform: 'ios' }];
  mocks.badge.mockResolvedValue([{ value: 2 }]);
  mocks.androidTokens.mockResolvedValue([]);
  mocks.isFcmConfigured.mockReturnValue(false);
  mocks.directFcm.mockResolvedValue({ success: true });
  mocks.topicFcm.mockResolvedValue({ success: true });
  mocks.fetch.mockImplementation(async (_url: string, request: { body: string }) => relayResponse(JSON.parse(request.body).map(() => ({ status: 'ok', id: 'isolated-ticket' }))));
  vi.stubGlobal('fetch', mocks.fetch);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('admin booking push relay (no real network or device)', () => {
  it('accepts both Expo token formats and sends despite an unavailable cosmetic badge count', async () => {
    mocks.tokens = [{ token: iosToken, platform: 'ios' }, { token: modernIosToken, platform: 'ios' }, { token: androidToken, platform: 'android' }];
    mocks.badge.mockRejectedValue(new Error('isolated badge database error'));
    await sendAdminExpoPush({ title: 'Fixture', body: 'Fixture', platforms: ['ios'] });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(sentMessages().map((message) => message.to)).toEqual([iosToken, modernIosToken]);
    expect(sentMessages()).toEqual(expect.arrayContaining([expect.objectContaining({ badge: 0, sound: 'default', priority: 'high' })]));
  });

  it('awaits the complete Expo send when FCM is not configured', async () => {
    let finishFetch!: (response: ReturnType<typeof relayResponse>) => void;
    mocks.fetch.mockReturnValue(new Promise((resolve) => { finishFetch = resolve; }));
    let finished = false;
    const task = sendUrgentBookingTopicPush({ ...booking, bookingType: 'emergency' }).then(() => { finished = true; });
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    expect(finished).toBe(false);
    finishFetch(relayResponse([{ status: 'ok', id: 'isolated-ticket' }]));
    await task;
    expect(finished).toBe(true);
    expect(sentMessages()[0]).toMatchObject({ data: expect.objectContaining({ type: 'urgent_booking', bookingId: booking.bookingId, refNumber: booking.refNumber, bookingType: 'emergency' }) });
  });

  it('relays to iOS even when the urgent Android FCM path succeeds', async () => {
    mocks.isFcmConfigured.mockReturnValue(true);
    mocks.androidTokens.mockResolvedValue([{ token: 'isolated-native-fcm', platform: 'android' }, { token: 'ExpoPushToken[isolated-android-modern]', platform: 'android' }]);
    await sendUrgentBookingTopicPush({ ...booking, bookingType: 'emergency', urgent: true });
    expect(mocks.directFcm).toHaveBeenCalledExactlyOnceWith('isolated-native-fcm', expect.anything(), expect.anything());
    expect(mocks.topicFcm).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(sentMessages()[0]).toMatchObject({ to: iosToken, sound: 'urgent_booking.mp3' });
  });

  it('sends scheduled bookings as ordinary notifications without an emergency FCM/full-screen alert', async () => {
    mocks.isFcmConfigured.mockReturnValue(true);
    const scheduled = { ...booking, title: 'Scheduled booking received', bookingType: 'scheduled' as const, scheduledAt: '2027-01-20T12:00:00.000Z', urgent: false };
    await sendUrgentBookingTopicPush(scheduled);
    expect(mocks.directFcm).not.toHaveBeenCalled();
    expect(mocks.topicFcm).not.toHaveBeenCalled();
    expect(sentMessages()[0]).toMatchObject({
      title: 'Scheduled booking received', sound: 'default', channelId: 'admin_bookings',
      data: expect.objectContaining({ type: 'urgent_booking', bookingType: 'scheduled', scheduledAt: scheduled.scheduledAt, urgency: 'normal' }),
    });
  });

  it('logs safe ticket error codes without printing tokens, provider messages or details', async () => {
    mocks.fetch.mockResolvedValue(relayResponse([{ status: 'error', message: `provider echoed ${iosToken}`, details: { error: 'InvalidCredentials', sensitive: 'isolated-secret-marker' } }]));
    await sendAdminExpoPush({ title: 'Fixture', body: 'Fixture', badge: 1 });
    expect(console.error).toHaveBeenCalledWith('[expo-admin-push] relay ticket errors', expect.objectContaining({ failed: 1, errorCodes: ['InvalidCredentials'] }));
    const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logs).not.toContain(iosToken);
    expect(logs).not.toContain('isolated-secret-marker');
    expect(mocks.badge).not.toHaveBeenCalled();
  });

  it('does not log the raw body of a failed relay HTTP request', async () => {
    const readBody = vi.fn(async () => `provider echoed ${iosToken}`);
    mocks.fetch.mockResolvedValue({ ok: false, status: 401, text: readBody });
    await sendAdminExpoPush({ title: 'Fixture', body: 'Fixture', badge: 0 });
    expect(console.error).toHaveBeenCalledWith('[expo-admin-push] relay HTTP error', { status: 401, messages: 1 });
    expect(readBody).not.toHaveBeenCalled();
  });
});
