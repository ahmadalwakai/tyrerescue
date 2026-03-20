import { MetadataRoute } from 'next';
import { cities } from '@/lib/cities';
import { db } from '@/lib/db';
import { tyreProducts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { services, serviceCities, getAreasForCity } from '@/lib/areas';
import { articles } from '@/lib/blog/articles';

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

  // City service pages (legacy)
  const cityRoutes: MetadataRoute.Sitemap = cities.map((city) => ({
    url: `${baseUrl}/services/${city.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  // SEO — service × city pages (e.g. /mobile-tyre-fitting/glasgow)
  const serviceCityRoutes: MetadataRoute.Sitemap = services.flatMap((service) =>
    serviceCities.map((citySlug) => ({
      url: `${baseUrl}/${service.slug}/${citySlug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
  );

  // SEO — service × city × area pages (e.g. /mobile-tyre-fitting/glasgow/govan)
  const serviceAreaRoutes: MetadataRoute.Sitemap = services.flatMap((service) =>
    serviceCities.flatMap((citySlug) =>
      getAreasForCity(citySlug).map((area) => ({
        url: `${baseUrl}/${service.slug}/${citySlug}/${area.slug}`,
        lastModified: new Date(),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      })),
    ),
  );

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

  // Blog routes
  const blogRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...articles.map((article) => ({
      url: `${baseUrl}/blog/${article.slug}`,
      lastModified: new Date(article.lastModified),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];

  return [...staticRoutes, ...cityRoutes, ...serviceCityRoutes, ...serviceAreaRoutes, ...tyreRoutes, ...blogRoutes];
}
