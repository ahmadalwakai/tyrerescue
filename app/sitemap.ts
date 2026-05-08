import type { MetadataRoute } from 'next';
import { cities } from '@/lib/cities';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { services, serviceCities, getAreasForCity } from '@/lib/areas';
import { articles } from '@/lib/blog/articles';
import { competitors } from '@/lib/data/competitors';
import { getSiteUrl } from '@/lib/config/site';
import { priceCitySlugs } from '@/lib/seo/cities';

/**
 * Sitemap is split via `generateSitemaps()` so no single file exceeds
 * Google's 50,000-URL limit and so route groups can be regenerated
 * independently. Next.js automatically exposes:
 *   - /sitemap.xml          — the auto-generated sitemap index
 *   - /sitemap/[id].xml     — each individual group below
 */

type SitemapId = 'main' | 'cities' | 'areas' | 'blog' | 'tyres';

export function generateSitemaps(): { id: SitemapId }[] {
  return [
    { id: 'main' },
    { id: 'cities' },
    { id: 'areas' },
    { id: 'blog' },
    { id: 'tyres' },
  ];
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const sectionId = (await id) as SitemapId;
  const baseUrl = getSiteUrl();
  const now = new Date();

  if (sectionId === 'main') {
    const staticPages: { path: string; priority: number; freq: 'daily' | 'weekly' | 'monthly' }[] = [
      { path: '', priority: 1, freq: 'daily' },
      { path: '/emergency', priority: 0.9, freq: 'weekly' },
      { path: '/book', priority: 0.9, freq: 'weekly' },
      { path: '/tyres', priority: 0.8, freq: 'weekly' },
      { path: '/pricing', priority: 0.9, freq: 'weekly' },
      { path: '/pricing-faq', priority: 0.7, freq: 'monthly' },
      { path: '/faq', priority: 0.7, freq: 'monthly' },
      { path: '/contact', priority: 0.7, freq: 'monthly' },
      { path: '/privacy-policy', priority: 0.3, freq: 'monthly' },
      { path: '/terms-of-service', priority: 0.3, freq: 'monthly' },
      { path: '/refund-policy', priority: 0.3, freq: 'monthly' },
      { path: '/cookie-policy', priority: 0.3, freq: 'monthly' },
    ];
    return staticPages.map(({ path, priority, freq }) => ({
      url: `${baseUrl}${path}`,
      lastModified: now,
      changeFrequency: freq,
      priority,
    }));
  }

  if (sectionId === 'cities') {
    const out: MetadataRoute.Sitemap = [];

    // /[service]/[city] — 5 services × 19 cities = 95 URLs
    for (const service of services) {
      for (const citySlug of serviceCities) {
        out.push({
          url: `${baseUrl}/${service.slug}/${citySlug}`,
          lastModified: now,
          changeFrequency: 'weekly',
          priority: 0.85,
        });
      }
    }

    // Legacy /services/[city] (canonical points to /mobile-tyre-fitting/[city])
    for (const city of cities) {
      out.push({
        url: `${baseUrl}/services/${city.slug}`,
        lastModified: now,
        changeFrequency: 'monthly',
        priority: 0.6,
      });
    }

    // /mobile-tyre-fitting-[city]-price
    for (const slug of priceCitySlugs) {
      out.push({
        url: `${baseUrl}/mobile-tyre-fitting-${slug}-price`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }

    return out;
  }

  if (sectionId === 'areas') {
    const out: MetadataRoute.Sitemap = [];
    for (const service of services) {
      for (const citySlug of serviceCities) {
        for (const area of getAreasForCity(citySlug)) {
          out.push({
            url: `${baseUrl}/${service.slug}/${citySlug}/${area.slug}`,
            lastModified: now,
            changeFrequency: 'monthly',
            priority: 0.5,
          });
        }
      }
    }
    return out;
  }

  if (sectionId === 'blog') {
    return [
      {
        url: `${baseUrl}/blog`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.8,
      },
      ...articles.map((article) => ({
        url: `${baseUrl}/blog/${article.slug}`,
        lastModified: new Date(article.lastModified),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      })),
      {
        url: `${baseUrl}/compare`,
        lastModified: now,
        changeFrequency: 'monthly',
        priority: 0.7,
      },
      ...competitors.map((comp) => ({
        url: `${baseUrl}/compare/${comp.slug}`,
        lastModified: new Date(comp.lastModified),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      })),
    ];
  }

  if (sectionId === 'tyres') {
    try {
      const tyres = await db
        .select({ slug: tyreProducts.slug })
        .from(tyreProducts)
        .where(eq(tyreProducts.availableNew, true));
      return tyres.map((tyre) => ({
        url: `${baseUrl}/tyres/${tyre.slug}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }));
    } catch {
      // DB unavailable at build time — emit empty sitemap rather than failing build.
      return [];
    }
  }

  return [];
}
