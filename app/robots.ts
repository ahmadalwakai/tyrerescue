import { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/config/site';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/driver/',
          '/api/',
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password/',
          '/verify-email/',
          '/dashboard/',
          '/tracking/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
