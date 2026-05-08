import { describe, it, expect } from 'vitest';
import { services, serviceCities, getAreasForCity } from '@/lib/areas';

// Provide a dummy DATABASE_URL so importing the sitemap module (which pulls in
// lib/db) doesn't fail at neon() init. The 'tyres' branch is wrapped in
// try/catch and just returns [] when the DB is unreachable.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
}

const sitemapModule = await import('@/app/sitemap');
const sitemap = sitemapModule.default;
const generateSitemaps = sitemapModule.generateSitemaps;

const SECTIONS = ['main', 'cities', 'areas', 'blog', 'tyres'] as const;

async function loadSection(id: (typeof SECTIONS)[number]) {
  return await sitemap({ id: Promise.resolve(id) });
}

describe('sitemap split via generateSitemaps()', () => {
  it('declares the expected section ids', () => {
    const ids = generateSitemaps().map((s) => s.id);
    for (const s of SECTIONS) expect(ids).toContain(s);
  });

  it('main section contains homepage and excludes private routes', async () => {
    const entries = await loadSection('main');
    const urls = entries.map((e) => e.url);
    expect(urls).toContain('https://www.tyrerescue.uk');
    for (const u of urls) {
      expect(u).not.toContain('localhost');
      expect(u).not.toMatch(/\/admin|\/api|\/auth|\/login|\/dashboard|\/tracking|\/checkout/);
      expect(u.startsWith('https://www.tyrerescue.uk')).toBe(true);
    }
  });

  it('cities section contains every service × city combination', async () => {
    const entries = await loadSection('cities');
    const urls = new Set(entries.map((e) => e.url));
    for (const service of services) {
      for (const city of serviceCities) {
        expect(urls.has(`https://www.tyrerescue.uk/${service.slug}/${city}`)).toBe(true);
      }
    }
  });

  it('areas section preserves every service × city × area URL', async () => {
    const entries = await loadSection('areas');
    let expected = 0;
    for (const _service of services) {
      for (const city of serviceCities) {
        expected += getAreasForCity(city).length;
      }
    }
    expect(entries.length).toBe(expected);
    for (const e of entries) {
      expect(e.url.startsWith('https://www.tyrerescue.uk/')).toBe(true);
    }
  });

  it('no section emits localhost URLs', async () => {
    for (const s of SECTIONS) {
      const entries = await loadSection(s);
      for (const e of entries) {
        expect(e.url).not.toContain('localhost');
        expect(e.url).not.toContain('127.0.0.1');
      }
    }
  });
});
