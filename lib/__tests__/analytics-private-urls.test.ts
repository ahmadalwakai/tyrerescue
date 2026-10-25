import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyticsPrivacyBootstrap, analyticsUrl } from '../analytics/private-urls';
import { pageview } from '../analytics/gtag';

afterEach(() => vi.unstubAllGlobals());
describe('booking capability privacy in analytics', () => {
  it('redacts both path and query capabilities while preserving public campaign parameters', () => {
    for (const url of ['/tracking/TR-123?accessToken=private-booking', '/track/shared/private-family-jwt', '/track/customer/private-location-token', '/success/TR-123?accessToken=private-booking', '/verify-email/private-email-token']) {
      expect(analyticsUrl(url)).not.toMatch(/private-booking|private-family-jwt|private-location-token|private-email-token|TR-123/);
    }
    expect(analyticsUrl('/book?utm_source=google&accessToken=private&payment_intent_client_secret=secret#private')).toBe('/book?utm_source=google');
    expect(analyticsUrl('https://example.test/book?utm_campaign=tyres&token=private')).toBe('https://example.test/book?utm_campaign=tyres');
  });
  it('protects the initial inline Google/Ads config before external scripts can run', () => {
    const context = { URL, location: { href: 'https://example.test/tracking/TR-123?accessToken=private-booking' },
      document: { referrer: 'https://example.test/track/shared/private-family-jwt' }, dataLayer: [] as unknown[], window: null as unknown };
    context.window = context;
    runInNewContext(analyticsPrivacyBootstrap() + "gtag('config','AW-123');gtag('event','page_view',{page_path:'/tracking/TR-123?accessToken=private-booking'});", context);
    expect(JSON.stringify(context.dataLayer)).not.toMatch(/private-booking|private-family-jwt|TR-123/);
    expect(JSON.stringify(context.dataLayer)).toContain('https://example.test/tracking/private');
  });
  it('redacts subsequent SPA page views and their location/referrer defaults', () => {
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag, location: { href: 'https://example.test/tracking/TR-123?accessToken=private-booking' } });
    vi.stubGlobal('document', { referrer: 'https://example.test/track/shared/private-family-jwt' });
    pageview('/tracking/TR-123?accessToken=private-booking');
    expect(gtag).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/private-booking|private-family-jwt|TR-123/);
    expect(gtag.mock.calls[1][2]).toMatchObject({ page_path: '/tracking/private', page_location: 'https://example.test/tracking/private', page_referrer: 'https://example.test/track/private' });
  });
});
