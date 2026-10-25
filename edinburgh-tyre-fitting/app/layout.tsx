import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import { VisitorTracker } from '@/components/VisitorTracker';
import { siteConfig } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: 'Edinburgh Tyre Fitting | Mobile Tyre Fitting in Edinburgh',
    template: '%s | Edinburgh Tyre Fitting',
  },
  description:
    'Book mobile tyre fitting, puncture repair and emergency roadside tyre help across Edinburgh and the surrounding countryside within 50 miles.',
  applicationName: siteConfig.name,
  alternates: {
    canonical: siteConfig.url,
  },
  openGraph: {
    title: 'Edinburgh Tyre Fitting',
    description: 'Mobile tyre fitting and emergency tyre help across Edinburgh and nearby countryside.',
    url: siteConfig.url,
    siteName: siteConfig.name,
    locale: 'en_GB',
    type: 'website',
    images: [
      {
        url: '/edinburgh-tyre-fitting-hero.png',
        width: 920,
        height: 520,
        alt: 'Mobile tyre fitting in Edinburgh',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Edinburgh Tyre Fitting',
    description: 'Book mobile tyre fitting across Edinburgh and 50 miles around it.',
    images: ['/edinburgh-tyre-fitting-hero.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body>
        <Providers>
          {children}
          <VisitorTracker />
        </Providers>
      </body>
    </html>
  );
}
