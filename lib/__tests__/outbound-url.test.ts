import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildBookingConfirmationSmsMessage,
  buildTrackingSmsMessage,
} from '@/lib/quick-book-message-templates';

const ORIGINAL_ENV = { ...process.env };

describe('outbound URL helper — never localhost in customer messages', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.unstubAllEnvs();
  });

  it('getOutboundUrl() returns canonical SITE_URL even when NODE_ENV=development and NEXTAUTH_URL is localhost', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    process.env.APP_URL = 'http://localhost:3000';
    process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000';

    // Re-import after env mutation. The module evaluates SITE_URL as a constant
    // so dynamic import is fine.
    const { getOutboundUrl, SITE_URL } = await import('@/lib/config/site');

    const url = getOutboundUrl();
    expect(url).toBe(SITE_URL);
    expect(url).toBe('https://www.tyrerescue.uk');
    expect(url).not.toContain('localhost');
    expect(url).not.toContain('127.0.0.1');
  });

  it('getOutboundUrl() returns SITE_URL in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { getOutboundUrl, SITE_URL } = await import('@/lib/config/site');
    expect(getOutboundUrl()).toBe(SITE_URL);
  });

  it('getOutboundUrl(sourceApp) returns the Duke Street Tyres production domain', async () => {
    const { getOutboundUrl } = await import('@/lib/config/site');
    expect(getOutboundUrl('duke_street_tyres')).toBe('https://www.dukestreettyres.com');
  });

  it('buildCustomerUrl(sourceApp) keeps Duke tracking links on the Duke domain', async () => {
    const { buildCustomerUrl } = await import('@/lib/config/site');
    expect(buildCustomerUrl('/tracking/TYR-2026-99999', 'duke_street_tyres')).toBe(
      'https://www.dukestreettyres.com/tracking/TYR-2026-99999',
    );
  });

  it('customer brand host helpers canonicalize supported production hosts', async () => {
    const { getCanonicalHostForRequestHost, resolveBrandFromHeaders, resolveBrandFromRequest } = await import('@/lib/config/site');

    expect(getCanonicalHostForRequestHost('tyrerescue.uk')).toBe('www.tyrerescue.uk');
    expect(getCanonicalHostForRequestHost('www.tyrerescue.uk')).toBe('www.tyrerescue.uk');
    expect(getCanonicalHostForRequestHost('dukestreettyres.com')).toBe('www.dukestreettyres.com');
    expect(getCanonicalHostForRequestHost('www.dukestreettyres.com')).toBe('www.dukestreettyres.com');

    const request = new Request('https://www.tyrerescue.uk/book', {
      headers: { host: 'www.dukestreettyres.com' },
    });
    expect(resolveBrandFromRequest(request).sourceApp).toBe('duke_street_tyres');

    const localHeaders = new Headers({
      host: 'localhost:3016',
      'x-forwarded-host': 'www.dukestreettyres.com',
    });
    expect(resolveBrandFromHeaders(localHeaders).sourceApp).toBe('duke_street_tyres');
  });

  it('does not let x-forwarded-host override a known production Host', async () => {
    const { resolveBrandFromRequest } = await import('@/lib/config/site');

    const request = new Request('https://www.tyrerescue.uk/book', {
      headers: {
        host: 'www.tyrerescue.uk',
        'x-forwarded-host': 'www.dukestreettyres.com',
      },
    });
    expect(resolveBrandFromRequest(request).sourceApp).toBe('tyre_rescue');
  });

  it('booking confirmation SMS template never embeds localhost', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    process.env.NEXTAUTH_URL = 'http://localhost:3000';

    const { getOutboundUrl } = await import('@/lib/config/site');
    const trackingUrl = `${getOutboundUrl()}/tracking/TYR-2026-99999`;
    const message = buildBookingConfirmationSmsMessage({
      customerName: 'Alice',
      refNumber: 'TYR-2026-99999',
      trackingUrl,
    });

    expect(message).not.toContain('localhost');
    expect(message).not.toContain('127.0.0.1');
    expect(message).toContain('https://www.tyrerescue.uk/tracking/TYR-2026-99999');
  });

  it('tracking-update SMS template never embeds localhost', async () => {
    const { getOutboundUrl } = await import('@/lib/config/site');
    const trackingUrl = `${getOutboundUrl()}/tracking/TYR-2026-12345`;
    const message = buildTrackingSmsMessage({
      customerName: 'Bob',
      refNumber: 'TYR-2026-12345',
      trackingUrl,
    });
    expect(message).not.toContain('localhost');
    expect(message).toContain('https://www.tyrerescue.uk/tracking/TYR-2026-12345');
  });
});
