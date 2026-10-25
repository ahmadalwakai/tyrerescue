import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(), values: vi.fn(), returning: vi.fn(), notification: vi.fn(), push: vi.fn(), rateLimit: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: { insert: mocks.insert } }));
vi.mock('@/lib/notifications', () => ({ createAdminNotification: mocks.notification }));
vi.mock('@/lib/notifications/expo-admin-push', () => ({ sendAdminExpoPush: mocks.push }));
vi.mock('@/lib/security', () => ({
  checkRateLimit: mocks.rateLimit, getClientIp: () => '127.0.0.1', HONEYPOT_FIELD: 'website',
  isHoneypotFilled: (body: Record<string, unknown>) => Boolean(body?.website), logSecurityRejection: vi.fn(), RATE_LIMITS: { callback: {} },
  rateLimitedResponse: () => Response.json({ error: 'Too many requests' }, { status: 429 }),
  suspiciousSubmissionResponse: () => Response.json({ error: 'Invalid request' }, { status: 400 }),
  validationErrorResponse: () => Response.json({ error: 'Invalid request' }, { status: 400 }),
}));

import { POST } from '../../app/api/call-back/route';
import { callbackNotificationDisposition, parseCallbackNotificationOpenRequest } from '../../assisted-chat-app/src/lib/notification-safety';

const callbackId = '10000000-0000-4000-8000-000000000001';
const input = { name: 'Isolated Customer', phone: '07700900123', notes: 'Synthetic private roadside details' };
const request = (body: unknown = input) => new Request('https://isolated.invalid/api/call-back', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ id: callbackId }]);
  mocks.rateLimit.mockResolvedValue({ ok: true });
  mocks.notification.mockResolvedValue({ id: 'notification-fixture' });
  mocks.push.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('customer callback native administrator notification', () => {
  it('stores the callback and awaits an iPhone relay with no private preview', async () => {
    let finish!: () => void;
    mocks.push.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    let completed = false;
    const operation = POST(request()).then((response) => { completed = true; return response; });
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(completed).toBe(false);
    const payload = mocks.push.mock.calls[0][0];
    expect(payload).toMatchObject({ platforms: ['ios'], data: { type: 'callback_request', callbackId }, ttl: 600 });
    expect(JSON.stringify(payload)).not.toMatch(/07700900123|Isolated Customer|Synthetic private|https?:/);
    expect(mocks.values).toHaveBeenCalledExactlyOnceWith(input);
    expect(mocks.notification).toHaveBeenCalledWith(expect.objectContaining({ type: 'callback.created', entityId: callbackId, link: '/admin/callbacks' }));
    finish();
    expect((await operation).status).toBe(201);
  });

  it('keeps a stored callback successful if either alert transport fails', async () => {
    mocks.push.mockRejectedValue(new Error('Isolated relay unavailable'));
    mocks.notification.mockRejectedValue(new Error('Isolated internal notification unavailable'));
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it('bounds a stalled relay or token lookup without asking the customer to submit twice', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.push.mockReturnValue(new Promise(() => {}));
    const operation = POST(request());
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await operation).status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it('never sends an alert before persistence or for rejected public submissions', async () => {
    mocks.returning.mockResolvedValue([]);
    expect((await POST(request())).status).toBe(500);
    expect(mocks.push).not.toHaveBeenCalled();
    expect((await POST(request({ ...input, phone: '' }))).status).toBe(400);
    expect((await POST(request({ ...input, website: 'bot' }))).status).toBe(400);
    mocks.rateLimit.mockResolvedValue({ ok: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('validates callback notification type and UUID without accepting a web route', () => {
    expect(parseCallbackNotificationOpenRequest({ type: 'callback_request', callbackId, url: 'https://unexpected.invalid' })).toEqual({ callbackId });
    for (const value of [null, [], {}, { type: 'chat_message', callbackId }, { type: 'callback_request', callbackId: '../callbacks' }, { type: 'callback_request', callbackId: 3 }]) {
      expect(parseCallbackNotificationOpenRequest(value)).toBeNull();
    }
  });

  it('queues presentation through dismissal and rejects a changed account or workspace', () => {
    const pending = { callbackId, apiRevision: 5, sessionRevision: 7 };
    const current = { authenticated: true, apiRevision: 5, sessionRevision: 7, ready: true, busy: false };
    expect(callbackNotificationDisposition(pending, current)).toBe('open');
    expect(callbackNotificationDisposition(pending, { ...current, busy: true })).toBe('wait');
    expect(callbackNotificationDisposition(pending, { ...current, ready: false })).toBe('wait');
    expect(callbackNotificationDisposition(pending, { ...current, authenticated: false })).toBe('discard');
    expect(callbackNotificationDisposition(pending, { ...current, apiRevision: 6 })).toBe('discard');
    expect(callbackNotificationDisposition(pending, { ...current, sessionRevision: 8 })).toBe('discard');
  });
});
