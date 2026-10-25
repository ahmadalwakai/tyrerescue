import { describe, expect, it } from 'vitest';
import {
  getRedirectUrl,
  getRewrittenUrl,
  isRewrite,
  unstable_getResponseFromNextConfig,
} from 'next/experimental/testing/server';
import nextConfig from '@/next.config';
import { priceCitySlugs } from '@/lib/seo/cities';

const origin = 'https://www.tyrerescue.uk';

describe('canonical city price routing', () => {
  it('serves every sitemap price URL through the existing city page', async () => {
    for (const city of priceCitySlugs) {
      const response = await unstable_getResponseFromNextConfig({
        url: `${origin}/mobile-tyre-fitting-${city}-price`,
        nextConfig,
      });
      expect(isRewrite(response), city).toBe(true);
      expect(getRedirectUrl(response), city).toBeNull();
      expect(getRewrittenUrl(response), city).toBe(`${origin}/mobile-tyre-fitting-price/${city}`);
    }
  });

  it('permanently redirects internal price URLs and preserves booking attribution', async () => {
    for (const city of ['glasgow', 'east-kilbride', 'isle-of-skye']) {
      const response = await unstable_getResponseFromNextConfig({
        url: `${origin}/mobile-tyre-fitting-price/${city}?utm_source=seo`,
        nextConfig,
      });
      expect(response.status).toBe(308);
      expect(getRedirectUrl(response)).toBe(`${origin}/mobile-tyre-fitting-${city}-price?utm_source=seo`);
    }
  });

  it('does not rewrite service, booking, payment or unrelated nested URLs', async () => {
    for (const route of ['/mobile-tyre-fitting/glasgow', '/book', '/api/stripe/webhook',
      '/mobile-tyre-fitting-glasgow-price/nested', '/mobile-tyre-fitting-price/glasgow/nested']) {
      const response = await unstable_getResponseFromNextConfig({url: `${origin}${route}`, nextConfig});
      expect(isRewrite(response), route).toBe(false);
      expect(getRedirectUrl(response), route).toBeNull();
    }
  });
});
