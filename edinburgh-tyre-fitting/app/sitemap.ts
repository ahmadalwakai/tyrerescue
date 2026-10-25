import type { MetadataRoute } from 'next';
import { serviceOptions } from '@/lib/pricing';
import { serviceAreas, siteConfig } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: siteConfig.url,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    ...serviceAreas.map((area) => ({
      url: `${siteConfig.url}/areas/${area.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.82,
    })),
    ...serviceOptions.map((service) => ({
      url: `${siteConfig.url}/services/${service.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.86,
    })),
  ];
}
