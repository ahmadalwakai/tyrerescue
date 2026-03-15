import type { Metadata } from 'next';
import { Inter, Bebas_Neue } from 'next/font/google';
import { Providers } from '@/components/providers';
import { CookieBanner } from '@/components/ui/CookieBanner';
import { AnalyticsProvider } from '@/components/ui/AnalyticsProvider';
import { CallMeBack } from '@/components/ui/CallMeBack';
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
    default: 'Tyre Rescue | Emergency Mobile Tyre Fitting Glasgow & Edinburgh',
    template: '%s | Tyre Rescue',
  },
  description:
    'Emergency mobile tyre fitting service in Glasgow and Edinburgh. 24 hours a day, 7 days a week. Call 0141 266 0690 for immediate assistance.',
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
    title: 'Tyre Rescue | Emergency Mobile Tyre Fitting Glasgow & Edinburgh',
    description:
      'Emergency mobile tyre fitting service in Glasgow and Edinburgh. 24 hours a day, 7 days a week.',
    url: 'https://www.tyrerescue.uk',
    siteName: 'Tyre Rescue',
    locale: 'en_GB',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Tyre Rescue — Emergency Mobile Tyre Fitting Glasgow & Edinburgh',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tyre Rescue | Emergency Mobile Tyre Fitting Glasgow & Edinburgh',
    description:
      'Emergency mobile tyre fitting service in Glasgow and Edinburgh. 24 hours a day, 7 days a week.',
  },
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
      <body className={inter.className} suppressHydrationWarning>
        <Providers>
          <a
            href="#main-content"
            className="skip-nav"
          >
            Skip to main content
          </a>
          {children}
          <CookieBanner />
          <AnalyticsProvider />
          <CallMeBack />
        </Providers>
      </body>
    </html>
  );
}
