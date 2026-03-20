import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.tyrerescue.uk';

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
