import { MetadataRoute } from 'next';
import { cities } from '@/lib/cities';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.tyrerescue.uk';

  // Static pages
  const staticPages = [
    '',
    '/emergency',
    '/book',
    '/tyres',
    '/faq',
    '/contact',
    '/privacy-policy',
    '/terms-of-service',
    '/refund-policy',
    '/cookie-policy',
  ];

  const staticRoutes: MetadataRoute.Sitemap = staticPages.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: route === '' ? 1 : 0.8,
  }));

  // City service pages
  const cityRoutes: MetadataRoute.Sitemap = cities.map((city) => ({
    url: `${baseUrl}/services/${city.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  // Tyre product pages
  let tyreRoutes: MetadataRoute.Sitemap = [];
  try {
    const tyres = await db
      .select({ slug: tyreProducts.slug })
      .from(tyreProducts)
      .where(eq(tyreProducts.availableNew, true));
    tyreRoutes = tyres.map((tyre) => ({
      url: `${baseUrl}/tyres/${tyre.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));
  } catch {
    // DB unavailable at build time — skip tyre pages
  }

  return [...staticRoutes, ...cityRoutes, ...tyreRoutes];
}
