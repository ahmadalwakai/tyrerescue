import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Prefer AVIF then WebP — both ~30-50% smaller than the JPEG/PNG fallback.
    formats: ['image/avif', 'image/webp'],
    // Cache optimized images for 30 days at the CDN edge (default is 60s).
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // Next.js 16 restricts qualities to [75] by default. Allow the values we
    // actually use across the app (HomeImageShowcase uses 60).
    qualities: [60, 75],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.mapbox.com',
      },
      {
        protocol: 'https',
        hostname: '*.blob.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: 'tile.openstreetmap.org',
      },
    ],
  },
  async headers() {
    return [
      {
        // Long-cache hero / static images that rarely change.
        source: '/images/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://api.mapbox.com https://www.googletagmanager.com https://www.google-analytics.com https://www.googleadservices.com https://www.clarity.ms https://connect.facebook.net https://widget.trustpilot.com",
              "style-src 'self' 'unsafe-inline' https://api.mapbox.com https://fonts.googleapis.com",
              "img-src 'self' data: blob: https://api.mapbox.com https://*.blob.vercel-storage.com https://tile.openstreetmap.org https://www.google-analytics.com https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://www.facebook.com https://pagead2.googlesyndication.com",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://api.mapbox.com https://*.mapbox.com https://api.stripe.com https://events.mapbox.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://www.clarity.ms https://www.facebook.com https://pagead2.googlesyndication.com https://widget.trustpilot.com",
              "frame-src https://js.stripe.com https://hooks.stripe.com https://widget.trustpilot.com",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: '/home', destination: '/', permanent: true },
      { source: '/emergency-tyre-fitting', destination: '/emergency', permanent: true },
      { source: '/book-tyre-fitting', destination: '/book', permanent: true },
      { source: '/services/:city', destination: '/mobile-tyre-fitting/:city', permanent: true },
    ];
  },
};

export default nextConfig;
