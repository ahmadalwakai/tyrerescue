import { describe, it, expect } from 'vitest';
import { services, serviceCities, getAreasForCity } from '@/lib/areas';
import { EMERGENCY_LANDING_PAGES } from '@/lib/ads/emergencyCampaign';
import { priceCitySlugs } from '@/lib/seo/cities';

// Provide a dummy DATABASE_URL so importing the sitemap module (which pulls in
// lib/db) doesn't fail at neon() init. The 'tyres' branch is wrapped in
// try/catch and just returns [] when the DB is unreachable.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
}

const sitemapModule = await import('@/app/sitemap');
const sitemap = sitemapModule.default;
const PRIVATE_PATH_PATTERN = /^\/(?:admin|api|auth|login|dashboard|tracking|checkout)(?:\/|$)/;

describe('sitemap.xml', () => {
  it('contains homepage and excludes private routes', async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain('https://www.tyrerescue.uk');
    for (const u of urls) {
      expect(u).not.toContain('localhost');
      expect(PRIVATE_PATH_PATTERN.test(new URL(u).pathname)).toBe(false);
      expect(u === 'https://www.tyrerescue.uk' || u.startsWith('https://www.tyrerescue.uk/')).toBe(true);
    }
  });

  it('contains every service × city combination', async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((e) => e.url));
    for (const service of services) {
      for (const city of serviceCities) {
        expect(urls.has(`https://www.tyrerescue.uk/${service.slug}/${city}`)).toBe(true);
      }
    }
  });

  it('contains every service × city × area URL', async () => {
    const entries = await sitemap();
    const expectedUrls = new Set<string>();

    for (const service of services) {
      for (const city of serviceCities) {
        for (const area of getAreasForCity(city)) {
          expectedUrls.add(`https://www.tyrerescue.uk/${service.slug}/${city}/${area.slug}`);
        }
      }
    }

    for (const page of EMERGENCY_LANDING_PAGES) {
      if (PRIVATE_PATH_PATTERN.test(page.path)) continue;
      expectedUrls.add(`https://www.tyrerescue.uk${page.path}`);
    }

    const urls = new Set(entries.map((e) => e.url));
    for (const url of expectedUrls) {
      expect(urls.has(url)).toBe(true);
    }

    for (const e of entries) {
      expect(e.url === 'https://www.tyrerescue.uk' || e.url.startsWith('https://www.tyrerescue.uk/')).toBe(true);
    }
  });

  it('contains the canonical city price URLs served by rewrite', async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((e) => e.url));

    for (const slug of priceCitySlugs) {
      expect(urls.has(`https://www.tyrerescue.uk/mobile-tyre-fitting-${slug}-price`)).toBe(true);
    }
  });

  it('emits unique public production URLs only', async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    expect(new Set(urls).size).toBe(urls.length);

    for (const url of urls) {
      expect(url).not.toContain('localhost');
      expect(url).not.toContain('127.0.0.1');
      expect(PRIVATE_PATH_PATTERN.test(new URL(url).pathname)).toBe(false);
      expect(url === 'https://www.tyrerescue.uk' || url.startsWith('https://www.tyrerescue.uk/')).toBe(true);
    }
  });
});
