import type { Metadata } from 'next';
import { Inter, Bebas_Neue } from 'next/font/google';
import { Providers } from '@/components/providers';
import { CookieBanner } from '@/components/ui/CookieBanner';
import { AnalyticsProvider } from '@/components/ui/AnalyticsProvider';
import { CallMeBack } from '@/components/ui/CallMeBack';
import { BookingReminder } from '@/components/ui/BookingReminder';
import { FloatingContactBar } from '@/components/ui/FloatingContactBar';
import { VisitorTracker } from '@/components/VisitorTracker';
import { PageviewTracker } from '@/components/analytics/PageviewTracker';
import { JsonLd } from '@/components/seo/JsonLd';
import { getLocalBusinessSchema, getWebSiteSchema, getOrganizationSchema } from '@/lib/seo/schemas';
import { getSiteUrl } from '@/lib/config/site';
import { GA_MEASUREMENT_ID } from '@/lib/analytics/gtag';
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
    default: 'Mobile Tyre Fitting Across Scotland | 24/7 | Tyre Rescue',
    template: '%s | Tyre Rescue',
  },
  description:
    '24/7 mobile tyre fitting, emergency tyre replacement, puncture repair, battery replacement, and roadside assistance across Scotland. Fast coverage in Glasgow and Edinburgh. Call 0141 266 0690.',
  alternates: {
    canonical: 'https://www.tyrerescue.uk',
  },
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
  metadataBase: new URL(getSiteUrl()),
  openGraph: {
    title: 'Tyre Rescue — 24/7 Mobile Tyre Fitting Across Scotland',
    description:
      '24/7 mobile tyre fitting across Scotland. Emergency tyre replacement, puncture repair, roadside assistance. Fast coverage in Glasgow and Edinburgh.',
    url: getSiteUrl(),
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
    title: 'Tyre Rescue — 24/7 Mobile Tyre Fitting Across Scotland',
    description:
      '24/7 mobile tyre fitting across Scotland. Emergency tyre replacement, puncture repair, roadside assistance. Fast coverage in Glasgow and Edinburgh.',
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
        <JsonLd data={getOrganizationSchema()} />
        <Script id="gtag-consent-default" strategy="beforeInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',functionality_storage:'denied',personalization_storage:'denied',security_storage:'granted'});
gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}',{send_page_view:false});gtag('config','AW-16460953081');`}
        </Script>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="beforeInteractive"
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <Script
          src="https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js"
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
          <PageviewTracker />
          <CallMeBack />
          <BookingReminder />
          <FloatingContactBar />
          <VisitorTracker />
        </Providers>
      </body>
    </html>
  );
}
