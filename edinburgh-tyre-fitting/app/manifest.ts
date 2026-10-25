import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Edinburgh Tyre Fitting',
    short_name: 'ETF',
    description: 'Mobile tyre fitting and emergency tyre support across Edinburgh.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fffdf7',
    theme_color: '#2c7f7a',
    icons: [
      {
        src: '/edinburgh-tyre-fitting-hero.png',
        sizes: '920x520',
        type: 'image/png',
      },
    ],
  };
}
