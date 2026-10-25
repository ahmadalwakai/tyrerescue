import { afterEach, describe, expect, it, vi } from 'vitest';
import { customerChatHeaders, customerChatRequest, mergeCustomerChatMessages, newCustomerChatMessageId,
  type CustomerChatMessage } from '../../tyre-rescue/src/customer-chat';
import { parseCustomerChatNotificationOpenRequest } from '../../assisted-chat-app/src/lib/notification-safety';

function message(id: string, createdAt = '2026-10-22T12:00:00Z', body = id): CustomerChatMessage {
  return { id, senderId: null, senderRole: 'customer', body, createdAt, messageType: 'text', attachments: [] };
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('customer support chat client', () => {
  it('merges overlapping pages, retries and server edits without losing history', () => {
    const merged = mergeCustomerChatMessages([message('b'), message('d', '2026-10-22T12:01:00Z')],
      [message('a', '2026-10-22T11:59:00Z'), message('b', undefined, 'Edited'), message('c')]);
    expect(merged.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(merged.find((item) => item.id === 'b')?.body).toBe('Edited');
    expect(mergeCustomerChatMessages(merged, [{ ...merged[1], deleted: true, body: null }])[1]).toMatchObject({ deleted: true, body: null });
  });

  it('uses separate bearer and booking proof headers, never URL credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'reply' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const headers = customerChatHeaders('isolated-account', 'isolated-booking');
    expect(customerChatHeaders(null, null)).toEqual({});
    await customerChatRequest('/api/chat/conversations', headers, { method: 'POST', body: JSON.stringify({ bookingId: 'id' }) });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/chat/conversations'), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer isolated-account', 'X-Booking-Access': 'isolated-booking', 'Content-Type': 'application/json' }),
    }));
    expect(fetchMock.mock.calls[0][0]).not.toMatch(/isolated-account|isolated-booking/);
  });

  it('bounds stalled requests and reports an actionable retry while preserving caller payload', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = customerChatRequest('/api/chat/messages', {}, { method: 'POST', body: '{"clientMessageId":"same"}' });
    const check = expect(pending).rejects.toThrow('Retry to check the same message safely');
    await vi.advanceTimersByTimeAsync(20_000);
    await check;
    expect(fetchMock.mock.calls[0][1].body).toBe('{"clientMessageId":"same"}');
  });

  it('propagates scope cancellation to the HTTP request', async () => {
    const outer = new AbortController();
    let signal: AbortSignal | null = null;
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('Cancelled'))));
    }));
    const pending = customerChatRequest('/api/chat/messages', {}, { signal: outer.signal });
    const check = expect(pending).rejects.toThrow();
    outer.abort();
    await check;
    expect((signal as AbortSignal | null)?.aborted).toBe(true);
  });

  it('shows authorization errors and generates valid distinct retry IDs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Access denied' }), { status: 403 })));
    await expect(customerChatRequest('/api/chat/messages', {})).rejects.toThrow('Access denied');
    const ids = new Set(Array.from({ length: 100 }, () => newCustomerChatMessageId()));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  });

  it('routes admin chat notifications only by a validated conversation ID', () => {
    const conversationId = '10000000-0000-4000-8000-000000000001';
    expect(parseCustomerChatNotificationOpenRequest({ type: 'chat_message', conversationId })).toEqual({ conversationId });
    for (const payload of [null, [], { type: 'chat_message', conversationId: '../admin' }, { type: 'urgent_booking', conversationId }, { type: 'chat_message' }]) {
      expect(parseCustomerChatNotificationOpenRequest(payload)).toBeNull();
    }
  });
});
