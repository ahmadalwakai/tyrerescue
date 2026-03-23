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
          '/dashboard/',
          '/api/',
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password/',
          '/verify-email/',
          '/tracking/',
        ],
      },
      {
        userAgent: '*',
        allow: '/api/quote',
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
