import type { NextConfig } from 'next';

const canonicalSiteUrl = 'https://www.edinburghtyrefitting.com';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'etf-one-alpha.vercel.app' }],
        destination: `${canonicalSiteUrl}/:path*`,
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'edinburghtyrefitting.com' }],
        destination: `${canonicalSiteUrl}/:path*`,
        permanent: true,
      },
    ];
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
