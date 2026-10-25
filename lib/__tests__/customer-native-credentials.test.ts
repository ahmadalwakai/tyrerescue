import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';
import { API, fetchApi, requestJson } from '../../tyre-rescue/src/api';
import { customerChatHeaders, customerChatRequest } from '../../tyre-rescue/src/customer-chat';

const originalPlatform = Platform.OS;

afterEach(() => {
  Object.assign(Platform, { OS: originalPlatform });
  vi.unstubAllGlobals();
});

function captureFetch() {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('customer native API cookie isolation', () => {
  it.each(['ios', 'android'])('forces cookie omission on %s, including caller overrides', async (platform) => {
    Object.assign(Platform, { OS: platform });
    const fetchMock = captureFetch();
    for (const credentials of [undefined, 'same-origin', 'include'] as const) {
      await requestJson(API.customerMe, { credentials });
    }
    for (const call of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      expect(call[1].credentials).toBe('omit');
    }
  });

  it('retains explicit account and booking proof headers, method, body and cancellation', async () => {
    const fetchMock = captureFetch();
    const controller = new AbortController();
    const body = JSON.stringify({ refNumber: 'PRIVATE-BOOKING', paymentIntentId: 'pi_test_fixture' });
    await requestJson(API.confirmBooking, {
      credentials: 'include', method: 'POST', body, signal: controller.signal,
      headers: customerChatHeaders('account-proof', 'booking-proof'),
    });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(API.confirmBooking), expect.objectContaining({
      credentials: 'omit', method: 'POST', body, signal: expect.any(AbortSignal),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer account-proof', 'X-Booking-Access': 'booking-proof' },
    }));
    expect(fetchMock.mock.calls[0][0]).not.toMatch(/account-proof|booking-proof/);

    // A later request without explicit session proof cannot fall back to a native cookie jar.
    await requestJson(API.customerMe);
    const later = (fetchMock.mock.calls as unknown as [string, RequestInit][])[1][1];
    expect(later.credentials).toBe('omit');
    expect(later.headers).not.toHaveProperty('Authorization');
    expect(later.headers).not.toHaveProperty('X-Booking-Access');
  });

  it('applies the same forced omission to protected chat without losing explicit proofs', async () => {
    const fetchMock = captureFetch();
    await customerChatRequest('/api/chat/conversations', customerChatHeaders('chat-account', 'chat-booking'), {
      credentials: 'include', method: 'POST', body: JSON.stringify({ bookingId: 'booking-id' }),
    });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/chat/conversations'), expect.objectContaining({
      credentials: 'omit',
      headers: expect.objectContaining({ Authorization: 'Bearer chat-account', 'X-Booking-Access': 'chat-booking' }),
    }));
  });

  it('sends multipart uploads without cookies or a forced JSON content type', async () => {
    const fetchMock = captureFetch();
    const form = new FormData();
    form.append('file', new Blob(['isolated image'], { type: 'image/jpeg' }), 'tyre.jpg');
    await fetchApi(API.uploadTyrePhoto, { credentials: 'include', method: 'POST', body: form, headers: { Accept: 'application/json' } });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(API.uploadTyrePhoto), expect.objectContaining({
      credentials: 'omit', method: 'POST', body: form, headers: { Accept: 'application/json' },
    }));
  });

  it('preserves browser cookie behavior for the existing web application', async () => {
    Object.assign(Platform, { OS: 'web' });
    const fetchMock = captureFetch();
    await requestJson(API.customerMe);
    await requestJson(API.customerMe, { credentials: 'include' });
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][1]).not.toHaveProperty('credentials');
    expect(calls[1][1].credentials).toBe('include');
  });
});
