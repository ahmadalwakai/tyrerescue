import type { MetadataRoute } from 'next';
import { GLASGOW_AREAS, SERVICES } from '@/lib/seo-data';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.247moglasgow.uk';
  const now = new Date();
  const out: MetadataRoute.Sitemap = [];

  out.push({ url: base, lastModified: now, changeFrequency: 'daily', priority: 1 });
  out.push({ url: `${base}/emergency`, lastModified: now, changeFrequency: 'weekly', priority: 0.95 });
  out.push({ url: `${base}/book`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 });
  out.push({ url: `${base}/areas`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 });

  for (const service of SERVICES) {
    out.push({ url: `${base}/${service.slug}`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 });
    for (const area of GLASGOW_AREAS) {
      out.push({
        url: `${base}/${service.slug}/${area.slug}`,
        lastModified: now,
        changeFrequency: 'monthly',
        priority: 0.75,
      });
    }
  }

  return out;
}
