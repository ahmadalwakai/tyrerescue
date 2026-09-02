import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { services, serviceCities, getAreasForCity } from '@/lib/areas';
import { articles } from '@/lib/blog/articles';
import { competitors } from '@/lib/data/competitors';
import { getSiteUrl } from '@/lib/config/site';
import { priceCitySlugs } from '@/lib/seo/cities';
import { EMERGENCY_LANDING_PAGES } from '@/lib/ads/emergencyCampaign';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const now = new Date();
  const out: MetadataRoute.Sitemap = [];
  const emittedUrls = new Set<string>();
  const excludedPathPattern = /^\/(?:admin|api|auth|login|dashboard|tracking|checkout)(?:\/|$)/;

  function addUrl(path: string, priority: number, freq: 'daily' | 'weekly' | 'monthly') {
    if (excludedPathPattern.test(path)) return;
    const url = `${baseUrl}${path}`;
    if (emittedUrls.has(url)) return;
    emittedUrls.add(url);
    out.push({
      url: `${baseUrl}${path}`,
      lastModified: now,
      changeFrequency: freq,
      priority,
    });
  }

  const staticPages: { path: string; priority: number; freq: 'daily' | 'weekly' | 'monthly' }[] = [
    { path: '', priority: 1, freq: 'daily' },
    { path: '/emergency', priority: 0.9, freq: 'weekly' },
    { path: '/emergency-tyre-fitting-near-me', priority: 0.9, freq: 'weekly' },
    { path: '/book', priority: 0.9, freq: 'weekly' },
    { path: '/tyres', priority: 0.8, freq: 'weekly' },
    { path: '/pricing-faq', priority: 0.7, freq: 'monthly' },
    { path: '/help', priority: 0.7, freq: 'monthly' },
    { path: '/faq', priority: 0.7, freq: 'monthly' },
    { path: '/contact', priority: 0.7, freq: 'monthly' },
    { path: '/privacy-policy', priority: 0.3, freq: 'monthly' },
    { path: '/terms-of-service', priority: 0.3, freq: 'monthly' },
    { path: '/refund-policy', priority: 0.3, freq: 'monthly' },
    { path: '/cookie-policy', priority: 0.3, freq: 'monthly' },
    { path: '/service-areas', priority: 0.9, freq: 'weekly' },
    { path: '/mobile-tyre-fitting', priority: 0.95, freq: 'weekly' },
    { path: '/24-hour-tyre-fitting', priority: 0.9, freq: 'weekly' },
    { path: '/puncture-repair', priority: 0.85, freq: 'weekly' },
  ];

  for (const page of staticPages) {
    addUrl(page.path, page.priority, page.freq);
  }

  // /[service]/[city] — 5 services × 19 cities = 95 URLs
  for (const service of services) {
    for (const citySlug of serviceCities) {
      addUrl(`/${service.slug}/${citySlug}`, 0.85, 'weekly');
    }
  }

  // /mobile-tyre-fitting-[city]-price, served by a rewrite to a valid internal route.
  for (const slug of priceCitySlugs) {
    addUrl(`/mobile-tyre-fitting-${slug}-price`, 0.8, 'weekly');
  }

  for (const service of services) {
    for (const citySlug of serviceCities) {
      for (const area of getAreasForCity(citySlug)) {
        addUrl(`/${service.slug}/${citySlug}/${area.slug}`, 0.5, 'monthly');
      }
    }
  }

  for (const page of EMERGENCY_LANDING_PAGES) {
    addUrl(page.path, 0.8, 'weekly');
  }

  addUrl('/blog', 0.8, 'weekly');
  for (const article of articles) {
    const url = `${baseUrl}/blog/${article.slug}`;
    if (emittedUrls.has(url)) continue;
    emittedUrls.add(url);
    out.push({
      url,
      lastModified: new Date(article.lastModified),
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  addUrl('/compare', 0.7, 'monthly');
  for (const comp of competitors) {
    const url = `${baseUrl}/compare/${comp.slug}`;
    if (emittedUrls.has(url)) continue;
    emittedUrls.add(url);
    out.push({
      url,
      lastModified: new Date(comp.lastModified),
      changeFrequency: 'monthly',
      priority: 0.7,
    });
  }

  try {
    const tyres = await db
      .select({ slug: tyreProducts.slug })
      .from(tyreProducts)
      .where(eq(tyreProducts.availableNew, true));
    for (const tyre of tyres) {
      const url = `${baseUrl}/tyres/${tyre.slug}`;
      if (emittedUrls.has(url)) continue;
      emittedUrls.add(url);
      out.push({
        url: `${baseUrl}/tyres/${tyre.slug}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      });
    }
  } catch {
    // DB unavailable at build time: still emit the core crawlable pages.
  }

  return out;
}
