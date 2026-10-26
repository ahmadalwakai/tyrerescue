import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  publish: vi.fn(),
  webPush: vi.fn(),
  email: vi.fn(),
}));

vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/lib/db', () => ({
  db: { insert: () => ({ values: () => ({ returning: async () => [{ id: 'notification-1', createdAt: new Date('2026-10-26T10:00:00Z') }] }) }) },
}));
vi.mock('@/lib/db/schema', () => ({ adminNotifications: {} }));
vi.mock('../notifications/publish-admin-event', () => ({ publishAdminEvent: mocks.publish }));
vi.mock('../notifications/send-web-push', () => ({ sendWebPushToAll: mocks.webPush }));
vi.mock('../notifications/send-admin-email-alert', () => ({ sendAdminEmailAlert: mocks.email }));

import { createAdminNotification } from '../notifications/create-admin-notification';

const input = {
  type: 'chat.message.received', title: 'New Chat Message', body: 'Driver: private text', entityType: 'chat',
  entityId: 'conversation-1', severity: 'info', createdBy: 'system',
} as Parameters<typeof createAdminNotification>[0];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.publish.mockResolvedValue(undefined);
  mocks.webPush.mockResolvedValue(undefined);
  mocks.email.mockResolvedValue(undefined);
});

describe('admin notification side effects on serverless', () => {
  it('hands every side effect to after() so the function stays alive until they settle', async () => {
    expect(await createAdminNotification(input)).toEqual({ id: 'notification-1' });
    expect(mocks.after).toHaveBeenCalledTimes(3);
    for (const [callback] of mocks.after.mock.calls) await expect(callback()).resolves.toBeUndefined();
    // Chat text never reaches a lock-screen push banner.
    expect(mocks.webPush.mock.calls[0][0].body).toBe('Open Tyre Rescue to read the message.');
  });

  it('still sends everything outside a request scope (cron scripts)', async () => {
    mocks.after.mockImplementation(() => { throw new Error('`after` was called outside a request scope.'); });
    expect(await createAdminNotification(input)).toEqual({ id: 'notification-1' });
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    expect(mocks.webPush).toHaveBeenCalledTimes(1);
    expect(mocks.email).toHaveBeenCalledTimes(1);
  });
});
