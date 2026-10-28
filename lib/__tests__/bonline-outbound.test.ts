import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOutboundConfiguration, type OutboundConfig } from '@/lib/bonline/outbound-config';
import { originateOutboundCall } from '@/lib/bonline/outbound-provider';
import { parseOutboundRequest } from '@/lib/bonline/outbound';

const uuid = 'd757192a-f826-453a-b929-86b59035163b';
const environment = (): Record<string, string | undefined> => ({
  BONLINE_OUTBOUND_ENABLED: 'true', BONLINE_OUTBOUND_PROVIDER: 'wazo', BONLINE_OUTBOUND_PROVIDER_VERIFIED: 'true',
  BONLINE_OUTBOUND_API_BASE_URL: 'https://pbx.example.com/api/calld/1.0',
  BONLINE_OUTBOUND_API_TOKEN: 'test-only-provider-token', BONLINE_OUTBOUND_TENANT_UUID: uuid,
  BONLINE_OUTBOUND_ADMIN_ORIGINS: JSON.stringify({ 'admin-one': { userUuid: uuid, lineId: 7, context: 'outbound-customers' } }),
});
const configuration = () => getOutboundConfiguration('admin-one', environment()).config as OutboundConfig;
const input = (override = {}) => ({ phone: '+447700900123', idempotencyKey: uuid, confirmed: true, ...override });
afterEach(() => vi.unstubAllGlobals());

describe('outbound capability and request boundaries', () => {
  it('stays disabled by default and never treats a webhook secret as origination credentials', () => {
    expect(getOutboundConfiguration('admin-one', {}).capability.enabled).toBe(false);
    expect(getOutboundConfiguration('admin-one', { BONLINE_WEBHOOK_SECRET: 'secret'.repeat(10) }).config).toBeNull();
    const env = environment(); delete env.BONLINE_OUTBOUND_PROVIDER_VERIFIED;
    expect(getOutboundConfiguration('admin-one', env).capability.reason).toBe('provider_not_verified');
  });
  it('binds an assigned origin to the authenticated admin and never publishes credentials in capability', () => {
    const result = getOutboundConfiguration('admin-one', environment());
    expect(result.config?.origin).toEqual({ userUuid: uuid, lineId: 7, context: 'outbound-customers' });
    expect(result.capability.enabled).toBe(true);
    expect(JSON.stringify(result.capability)).not.toMatch(/test-only-provider-token|pbx\.example|outbound-customers|d757192a/);
    expect(getOutboundConfiguration('unassigned-admin', environment()).capability.reason).toBe('origin_not_assigned');
    expect(getOutboundConfiguration('__proto__', environment()).config).toBeNull();
  });
  it.each([
    'http://pbx.example.com/1.0', 'https://user:pass@pbx.example.com/1.0', 'https://127.0.0.1/1.0',
    'https://[::1]/1.0', 'https://localhost/1.0', 'https://pbx.internal/1.0',
    'https://pbx.example.com:8080/1.0', 'https://pbx.example.com/other',
    'https://pbx.example.com/1.0?redirect=elsewhere', 'https://pbx.example.com/1.0#fragment',
  ])('rejects an unsafe or undocumented configured endpoint: %s', (url) => {
    expect(getOutboundConfiguration('admin-one', { ...environment(), BONLINE_OUTBOUND_API_BASE_URL: url }).config).toBeNull();
  });
  it.each([
    { lineId: 0 }, { lineId: 1.1 }, { userUuid: 'unknown' }, { context: '../context' },
  ])('fails closed for malformed assigned origin %j', (override) => {
    const env = environment();
    env.BONLINE_OUTBOUND_ADMIN_ORIGINS = JSON.stringify({ 'admin-one': { userUuid: uuid, lineId: 7, context: 'outbound', ...override } });
    expect(getOutboundConfiguration('admin-one', env).config).toBeNull();
  });
  it('normalizes the explicit customer number and UUID without admitting extra command fields', () => {
    expect(parseOutboundRequest(input({ phone: '07700 900123', idempotencyKey: uuid.toUpperCase() })))
      .toEqual({ phone: '+447700900123', idempotencyKey: uuid, confirmed: true, bookingId: null, sourceCallId: null });
    expect(parseOutboundRequest(input({ host: 'https://elsewhere.example' }))).toBeNull();
    expect(parseOutboundRequest(input({ source: { user: 'another-user' } }))).toBeNull();
    expect(parseOutboundRequest(input({ confirmed: false }))).toBeNull();
    expect(parseOutboundRequest(input({ idempotencyKey: 'reused-label' }))).toBeNull();
  });
  it.each(['999', '112', '100', '+441932509613', '01932 509613', '+449001234567', '+447012345678', '+447612345678',
    '+12025550123', '07700900123;123', 'sip:07700900123@host', '*2107700900123', 'abc07700900123'])('rejects non-customer dial strings %s', (phone) => {
    expect(parseOutboundRequest(input({ phone }))).toBeNull();
  });
});

describe('documented Wazo originate adapter without network calls', () => {
  it('sends one documented request using only the server-assigned source and fixed endpoint', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ call_id: 'provider-call-1' }, { status: 201 }));
    const result = await originateOutboundCall(configuration(), '+447700900123', fetcher);
    expect(result).toEqual({ status: 'accepted', providerCallId: 'provider-call-1', failureCode: null });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://pbx.example.com/api/calld/1.0/calls');
    expect(options).toMatchObject({ method: 'POST', redirect: 'error', cache: 'no-store' });
    expect(options.headers).toMatchObject({ 'X-Auth-Token': 'test-only-provider-token', 'Wazo-Tenant': uuid });
    expect(JSON.parse(options.body)).toEqual({
      source: { user: uuid, line_id: 7, auto_answer: false },
      destination: { extension: '+447700900123', context: 'outbound-customers', priority: 1 },
    });
  });
  it.each([400, 401, 403, 404, 422, 429])('records a definite provider %s rejection without exposing its body', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ message: 'provider-secret' }, { status }));
    const result = await originateOutboundCall(configuration(), '+447700900123', fetcher);
    expect(result).toMatchObject({ status: 'failed', failureCode: `provider_${status}` });
    expect(JSON.stringify(result)).not.toContain('provider-secret');
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each([500, 503, 302, 200])('treats ambiguous provider %s responses as unknown, with no retry', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status }));
    expect(await originateOutboundCall(configuration(), '+447700900123', fetcher)).toMatchObject({ status: 'unknown' });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('never retries a network error or malformed success that might already have started the call', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network with secret'));
    expect(await originateOutboundCall(configuration(), '+447700900123', fetcher)).toMatchObject({ status: 'unknown' });
    expect(fetcher).toHaveBeenCalledOnce();
    const malformed = vi.fn().mockResolvedValue(Response.json({}, { status: 201 }));
    expect(await originateOutboundCall(configuration(), '+447700900123', malformed)).toMatchObject({ status: 'unknown' });
    expect(malformed).toHaveBeenCalledOnce();
  });
});
