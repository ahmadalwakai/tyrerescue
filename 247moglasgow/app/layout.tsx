import type { Metadata } from 'next';
import { Inter, Bebas_Neue } from 'next/font/google';
import Script from 'next/script';
import { Footer } from '@/components/Footer';
import { MobileCallBar } from '@/components/MobileCallBar';
import { Nav } from '@/components/Nav';
import { PageAmbience } from '@/components/PageAmbience';
import { TopBar } from '@/components/TopBar';
import { getLocalBusinessSchema, getWebSiteSchema } from '@/lib/schemas';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-body' });
const bebas = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://www.247moglasgow.uk'),
  title: {
    default: '24/7 Mobile Tyre Fitting Glasgow | 35 Min Response | 247 Mo Glasgow',
    template: '%s | 247 Mo Glasgow',
  },
  description:
    '24/7 mobile tyre fitting across all Glasgow postcodes. Emergency response, puncture repair and tyre fitting - we come to you. Average 35 min arrival. Call 0141 266 0690.',
  keywords: [
    'mobile tyre fitting glasgow',
    '24 hour tyre fitting glasgow',
    'emergency tyre fitting glasgow',
    'puncture repair glasgow',
    'mobile tyre fitter glasgow',
    'tyre fitting near me glasgow',
    'mobile tyres glasgow',
    'flat tyre glasgow',
    '247 mobile tyre glasgow',
    'tyre repair glasgow',
  ],
  alternates: { canonical: 'https://www.247moglasgow.uk' },
  verification: {
    google: process.env.NEXT_PUBLIC_GSC_VERIFICATION_TOKEN ?? '',
  },
  openGraph: {
    title: '247 Mo Glasgow - 24/7 Mobile Tyre Fitting',
    description:
      '24/7 mobile tyre fitting across all Glasgow postcodes. Average 35 min response. Call 0141 266 0690.',
    url: 'https://www.247moglasgow.uk',
    siteName: '247 Mo Glasgow',
    locale: 'en_GB',
    type: 'website',
    images: [{ url: '/og-default.jpg', width: 1200, height: 630, alt: '247 Mo Glasgow mobile tyre fitting service' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '247 Mo Glasgow - 24/7 Mobile Tyre Fitting',
    description: '24/7 mobile tyre fitting across all Glasgow postcodes. Average 35 min response.',
    images: ['/og-default.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  icons: {
    icon: [{ url: '/favicon.ico' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180' }],
  },
};

function safeJson(data: Record<string, unknown>) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${bebas.variable}`}>
      <head>
        <link rel="preconnect" href="https://www.googletagmanager.com" crossOrigin="" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJson(getLocalBusinessSchema()) }}
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJson(getWebSiteSchema()) }} />
      </head>
      <body className={inter.className}>
        <PageAmbience />
        <TopBar />
        <Nav />
        <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
        <Footer />
        <MobileCallBar />
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">{`
              window.dataLayer=window.dataLayer||[];
              function gtag(){dataLayer.push(arguments)}
              gtag('js',new Date());
              gtag('config','${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}',{send_page_view:true});
            `}</Script>
          </>
        )}
      </body>
    </html>
  );
}
