import { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://tyrerescue.uk';

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

  // TODO: Add dynamic tyre product pages from database
  // const tyres = await db.select({ slug: tyreProducts.slug }).from(tyreProducts);
  // const tyreRoutes = tyres.map((tyre) => ({
  //   url: `${baseUrl}/tyres/${tyre.slug}`,
  //   lastModified: new Date(),
  //   changeFrequency: 'weekly' as const,
  //   priority: 0.6,
  // }));

  return [
    ...staticRoutes,
    // ...tyreRoutes,
  ];
}
