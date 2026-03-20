import type { Metadata } from 'next';
import { Inter, Bebas_Neue } from 'next/font/google';
import { Providers } from '@/components/providers';
import { CookieBanner } from '@/components/ui/CookieBanner';
import { AnalyticsProvider } from '@/components/ui/AnalyticsProvider';
import { CallMeBack } from '@/components/ui/CallMeBack';
import { BookingReminder } from '@/components/ui/BookingReminder';
import { FloatingContactBar } from '@/components/ui/FloatingContactBar';
import { JsonLd } from '@/components/seo/JsonLd';
import { getLocalBusinessSchema, getWebSiteSchema } from '@/lib/seo/schemas';
import Script from 'next/script';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});

const bebasNeue = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: {
    default: 'Mobile Tyre Fitting Glasgow & Edinburgh | 24/7 | Tyre Rescue',
    template: '%s | Tyre Rescue',
  },
  description:
    'Flat tyre? Call 0141 266 0690 now. 24/7 emergency mobile tyre fitting Glasgow & Edinburgh. 45 min avg response. From £49. We come to you.',
  keywords: [
    'mobile tyre fitting glasgow',
    'mobile tyre fitting near me',
    'emergency tyre fitting glasgow',
    'tyre repair near me',
    'tyres near me',
    'tyre shop near me',
    'mobile tyre fitting near me',
    'tyres glasgow',
    'mobile tyres near me',
    'mobile tyre repair near me',
    'mobile tyre fitters glasgow',
    'tyre repair glasgow',
    'puncture repair near me',
    'mobile tyre fitter glasgow',
    'mobile tyres glasgow',
    'mobile tyre repair',
    'glasgow mobile tyres',
    'tyre fitting near me',
    'tyre shop glasgow',
    'duke street tyres',
    '24 hour tyre fitting glasgow',
    'emergency tyre fitting edinburgh',
    'roadside tyre fitting scotland',
  ].join(', '),
  authors: [{ name: 'Tyre Rescue' }],
  creator: 'Tyre Rescue',
  publisher: 'Tyre Rescue',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'https://www.tyrerescue.uk'
  ),
  openGraph: {
    title: 'Tyre Rescue — 24/7 Mobile Tyre Fitting Glasgow & Edinburgh',
    description:
      'Flat tyre? Call 0141 266 0690. 24/7 emergency mobile tyre fitting Glasgow & Edinburgh. 45 min response.',
    url: 'https://www.tyrerescue.uk',
    siteName: 'Tyre Rescue',
    locale: 'en_GB',
    type: 'website',
    images: [
      {
        url: '/images/home/slide-1.png',
        width: 1200,
        height: 630,
        alt: 'Tyre Rescue mobile tyre fitting service van',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tyre Rescue — 24/7 Mobile Tyre Fitting',
    description:
      'Flat tyre? Call 0141 266 0690. 24/7 emergency mobile tyre fitting Glasgow & Edinburgh. 45 min response.',
    images: ['/images/home/slide-1.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/manifest.webmanifest',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${bebasNeue.variable}`} suppressHydrationWarning>
      <head>
        <JsonLd data={getLocalBusinessSchema()} />
        <JsonLd data={getWebSiteSchema()} />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <Script
          src="//widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js"
          strategy="afterInteractive"
        />
        <a
          href="#main-content"
          className="skip-nav"
        >
          Skip to main content
        </a>
        <Providers>
          {children}
          <CookieBanner />
          <AnalyticsProvider />
          <CallMeBack />
          <BookingReminder />
          <FloatingContactBar />
        </Providers>
      </body>
    </html>
  );
}
