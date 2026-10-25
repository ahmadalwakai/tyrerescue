# 247 Mo Glasgow — Full Build Instructions for Codex

## Project Overview

Build a standalone Next.js 15 app called **247 Mo Glasgow** at domain `247moglasgow.uk`.

- **Brand**: bold orange + white, smart animations, Glasgow-only focus
- **Goal**: rank #1 on Google Scotland for Glasgow mobile tyre keywords
- **DB**: same Neon PostgreSQL as Tyre Rescue (same `DATABASE_URL`)
- **Backend**: bookings POST to Tyre Rescue API via integration secret
- **Admin**: visible in Tyre Rescue web admin + controlled by Assisted Chat iOS app
- **Source app key**: `247_mo_glasgow`

---

## STEP 1 — Scaffold the Next.js App

Inside `c:\tyrerescue\247moglasgow\`, initialise a new Next.js 15 project:

```bash
cd c:\tyrerescue\247moglasgow
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --no-git --import-alias "@/*"
```

Then install additional dependencies:

```bash
npm install framer-motion @neondatabase/serverless drizzle-orm drizzle-orm/pg-core zod
npm install -D @types/node
```

---

## STEP 2 — Environment Variables

Create `.env.local` with the following. **Codex must NOT invent values** — copy the exact values from the parent project's environment (same Vercel project env, same Neon DB, same Mapbox):

```env
# === DATABASE (same Neon DB as Tyre Rescue) ===
DATABASE_URL=                          # copy from Tyre Rescue .env

# === SITE ===
NEXT_PUBLIC_SITE_URL=https://www.247moglasgow.uk
NEXT_PUBLIC_SOURCE_APP=247_mo_glasgow

# === INTEGRATION SECRET (must match Tyre Rescue side) ===
MO_GLASGOW_INTEGRATION_SECRET=        # generate: openssl rand -hex 32

# === TYRE RESCUE BACKEND ===
TYRE_RESCUE_API_BASE=https://www.tyrerescue.uk

# === MAPBOX (same token as Tyre Rescue) ===
NEXT_PUBLIC_MAPBOX_TOKEN=             # copy from Tyre Rescue .env

# === ANALYTICS ===
NEXT_PUBLIC_GA_MEASUREMENT_ID=        # new GA4 property for 247moglasgow.uk
```

Create `.env.example` with the same keys but empty values (for documentation).

---

## STEP 3 — Register in Parent Project Files

Edit these 3 files inside `c:\tyrerescue\` (the PARENT Next.js project, not the new one):

### 3a. `lib/integrations/project-sources.ts`

Add this entry to the `PROJECT_SOURCES` array:

```ts
{
  app: '247_mo_glasgow',
  label: '247 Mo Glasgow',
  origin: 'https://www.247moglasgow.uk',
  secretEnv: 'MO_GLASGOW_INTEGRATION_SECRET',
  campaign: '247_mo_glasgow_booking_handoff',
  description: '247 Mo Glasgow website bookings for Glasgow and surrounding areas.',
},
```

Also add these aliases to `SOURCE_ALIASES`:

```ts
['247_mo_glasgow', '247_mo_glasgow'],
['247moglasgow', '247_mo_glasgow'],
['www_247moglasgow', '247_mo_glasgow'],
['mo_glasgow', '247_mo_glasgow'],
```

### 3b. `lib/integrations/project-links.ts`

Add to `PROJECT_BOOKING_ROUTE_SLUGS`:

```ts
'247_mo_glasgow': '247-mo-glasgow',
```

### 3c. `lib/integrations/project-pricing-origin.ts`

Add to `PROJECT_PRICING_ORIGINS`:

```ts
'247_mo_glasgow': {
  sourceApp: '247_mo_glasgow',
  label: 'Glasgow City Centre, G1',
  lat: 55.8642,
  lng: -4.2518,
  maxServiceMiles: 30,
},
```

### 3d. `assisted-chat-app/src/lib/project-config.ts`

Add `'247_mo_glasgow'` to the `ProjectId` union type and add this entry to `PROJECTS`:

```ts
{
  id: '247_mo_glasgow',
  name: '247 Mo Glasgow',
  apiBaseUrl: 'https://www.247moglasgow.uk',
  brandLine1: '247 MO',
  brandLine2: 'GLASGOW',
  loginSubtitle: 'Use your 247 Mo Glasgow admin credentials.',
  tagline: 'Glasgow mobile tyre fitting — bookings, pricing, drivers and stock.',
},
```

### 3e. Create integration API route in parent project

Create `c:\tyrerescue\app\api\integrations\247-mo-glasgow\bookings\route.ts`:

```ts
import { NextRequest } from 'next/server';
import { handleProjectBookingHandoff } from '@/lib/integrations/project-booking-handoff';

export async function POST(request: NextRequest) {
  return handleProjectBookingHandoff(request, '247_mo_glasgow');
}
```

---

## STEP 4 — Shared DB Client

Create `c:\tyrerescue\247moglasgow\lib\db.ts`:

```ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);
```

---

## STEP 5 — Brand & Design Tokens

Create `c:\tyrerescue\247moglasgow\lib\brand.ts`:

```ts
export const brand = {
  // Primary orange palette
  orange:       '#f97316',
  orangeDark:   '#ea580c',
  orangeLight:  '#fb923c',
  orangeGlow:   'rgba(249,115,22,0.35)',

  // Backgrounds (dark with orange accents — orange IS the hero)
  bg:           '#0a0a0a',
  bgHero:       '#f97316',   // hero section IS orange
  surface:      '#111111',
  card:         '#18181b',

  // Text
  text:         '#ffffff',
  textMuted:    '#d1d5db',
  textOnOrange: '#ffffff',

  // Borders
  border:       'rgba(255,255,255,0.1)',
  borderOrange: 'rgba(249,115,22,0.5)',
} as const;
```

---

## STEP 6 — SEO Data

Create `c:\tyrerescue\247moglasgow\lib\seo-data.ts` with Glasgow-specific data:

```ts
export const SITE_URL = 'https://www.247moglasgow.uk';
export const BRAND_NAME = '247 Mo Glasgow';
export const PHONE_DISPLAY = '0141 266 0690';
export const PHONE_TEL = '01412660690';
export const WHATSAPP = '447423262955';
export const ADDRESS = '3 Gateside Street, Parkhead, Glasgow G31 1PD';

export const SERVICES = [
  {
    slug: 'mobile-tyre-fitting',
    name: 'Mobile Tyre Fitting',
    h1: 'Mobile Tyre Fitting Glasgow',
    priceFrom: 'From £49',
    metaTitle: 'Mobile Tyre Fitting Glasgow | 24/7 | From £49 | 247 Mo Glasgow',
    metaDesc: 'Mobile tyre fitting across all Glasgow postcodes 24/7. We come to you — home, work or roadside. Average 35 min response. Call 0141 266 0690.',
    heroText: 'We bring the tyre shop to your door. Home, work or roadside — anywhere in Glasgow.',
  },
  {
    slug: 'emergency-tyre-fitting',
    name: 'Emergency Tyre Fitting',
    h1: 'Emergency Tyre Fitting Glasgow',
    priceFrom: 'From £69',
    metaTitle: 'Emergency Tyre Fitting Glasgow | 24/7 | 35 Min Response | 247 Mo Glasgow',
    metaDesc: '24/7 emergency tyre fitting across Glasgow. Average 35 minute response. Flat tyre on the M8 or A8? Call us now — 0141 266 0690.',
    heroText: '24/7 emergency response across all Glasgow postcodes. Average 35 minutes from your call.',
  },
  {
    slug: 'puncture-repair',
    name: 'Puncture Repair',
    h1: 'Puncture Repair Glasgow',
    priceFrom: 'From £30',
    metaTitle: 'Puncture Repair Glasgow | Mobile | Same Day | 247 Mo Glasgow',
    metaDesc: 'Mobile puncture repair service across Glasgow. We fix most punctures on-the-spot at your location. No garage visit needed. Call 0141 266 0690.',
    heroText: 'We fix punctures at your location — no recovery truck, no waiting, no garage.',
  },
  {
    slug: 'tyre-fitting',
    name: 'Tyre Fitting',
    h1: 'Tyre Fitting Glasgow',
    priceFrom: 'From £20/tyre',
    metaTitle: 'Tyre Fitting Glasgow | Mobile | Budget to Premium | 247 Mo Glasgow',
    metaDesc: 'Mobile tyre fitting service in Glasgow. We stock budget, mid-range and premium tyres. Fitted at your home or workplace. Call 0141 266 0690.',
    heroText: 'Choose your tyre, we deliver and fit — at home, at work, wherever suits you.',
  },
] as const;

export const GLASGOW_AREAS = [
  { slug: 'city-centre',     name: 'City Centre',     postcode: 'G1',      etaMin: 20 },
  { slug: 'west-end',        name: 'West End',         postcode: 'G11-G12', etaMin: 22 },
  { slug: 'southside',       name: 'Southside',        postcode: 'G41-G44', etaMin: 28 },
  { slug: 'east-end',        name: 'East End',         postcode: 'G31-G33', etaMin: 18 },
  { slug: 'north-glasgow',   name: 'North Glasgow',    postcode: 'G20-G23', etaMin: 25 },
  { slug: 'govan',           name: 'Govan',            postcode: 'G51',     etaMin: 25 },
  { slug: 'partick',         name: 'Partick',          postcode: 'G11',     etaMin: 22 },
  { slug: 'maryhill',        name: 'Maryhill',         postcode: 'G20',     etaMin: 25 },
  { slug: 'shawlands',       name: 'Shawlands',        postcode: 'G41',     etaMin: 30 },
  { slug: 'pollokshields',   name: 'Pollokshields',    postcode: 'G41',     etaMin: 28 },
  { slug: 'bearsden',        name: 'Bearsden',         postcode: 'G61',     etaMin: 35 },
  { slug: 'bishopbriggs',    name: 'Bishopbriggs',     postcode: 'G64',     etaMin: 30 },
  { slug: 'rutherglen',      name: 'Rutherglen',       postcode: 'G73',     etaMin: 28 },
  { slug: 'cambuslang',      name: 'Cambuslang',       postcode: 'G72',     etaMin: 32 },
  { slug: 'baillieston',     name: 'Baillieston',      postcode: 'G69',     etaMin: 25 },
  { slug: 'parkhead',        name: 'Parkhead',         postcode: 'G31',     etaMin: 15 },
  { slug: 'springburn',      name: 'Springburn',       postcode: 'G21',     etaMin: 22 },
  { slug: 'dennistoun',      name: 'Dennistoun',       postcode: 'G31',     etaMin: 18 },
  { slug: 'pollok',          name: 'Pollok',           postcode: 'G53',     etaMin: 32 },
  { slug: 'castlemilk',      name: 'Castlemilk',       postcode: 'G45',     etaMin: 35 },
  { slug: 'easterhouse',     name: 'Easterhouse',      postcode: 'G34',     etaMin: 30 },
  { slug: 'drumchapel',      name: 'Drumchapel',       postcode: 'G15',     etaMin: 30 },
  { slug: 'anniesland',      name: 'Anniesland',       postcode: 'G13',     etaMin: 28 },
  { slug: 'jordanhill',      name: 'Jordanhill',       postcode: 'G13',     etaMin: 26 },
  { slug: 'knightswood',     name: 'Knightswood',      postcode: 'G13',     etaMin: 28 },
  { slug: 'kelvinside',      name: 'Kelvinside',       postcode: 'G12',     etaMin: 22 },
  { slug: 'mount-florida',   name: 'Mount Florida',    postcode: 'G42',     etaMin: 28 },
  { slug: 'king-s-park',     name: "King's Park",      postcode: 'G44',     etaMin: 32 },
  { slug: 'newlands',        name: 'Newlands',         postcode: 'G43',     etaMin: 30 },
  { slug: 'clarkston',       name: 'Clarkston',        postcode: 'G76',     etaMin: 38 },
] as const;
```

---

## STEP 7 — JSON-LD Schemas

Create `c:\tyrerescue\247moglasgow\lib\schemas.ts`:

```ts
const PHONE = '+441412660690';
const EMAIL = 'support@tyrerescue.uk';
const BASE_URL = 'https://www.247moglasgow.uk';

const ADDRESS = {
  '@type': 'PostalAddress',
  streetAddress: '3 Gateside Street',
  addressLocality: 'Glasgow',
  postalCode: 'G31 1PD',
  addressRegion: 'Scotland',
  addressCountry: 'GB',
};

export function getLocalBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'AutoRepair'],
    name: '247 Mo Glasgow',
    description: '24/7 mobile tyre fitting and emergency tyre replacement across all Glasgow postcodes G1–G78. Average 35 minute response.',
    url: BASE_URL,
    telephone: PHONE,
    email: EMAIL,
    address: ADDRESS,
    geo: { '@type': 'GeoCoordinates', latitude: 55.8547, longitude: -4.2206 },
    openingHours: 'Mo-Su 00:00-23:59',
    priceRange: '££',
    areaServed: [
      { '@type': 'City', name: 'Glasgow' },
      { '@type': 'AdministrativeArea', name: 'Greater Glasgow' },
    ],
    sameAs: [
      'https://wa.me/447423262955',
      'https://www.tyrerescue.uk',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: PHONE,
      contactType: 'emergency',
      areaServed: 'Glasgow',
      availableLanguage: 'English',
    },
  };
}

export function getWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: '247 Mo Glasgow',
    url: BASE_URL,
  };
}

export function getServiceSchema(serviceName: string, areaName: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `${serviceName} in ${areaName}`,
    provider: {
      '@type': 'LocalBusiness',
      name: '247 Mo Glasgow',
      url: BASE_URL,
      telephone: PHONE,
      address: ADDRESS,
    },
    areaServed: { '@type': 'City', name: areaName },
    serviceType: serviceName,
  };
}

export function getFAQSchema(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

export function getBreadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${BASE_URL}${item.path}`,
    })),
  };
}
```

---

## STEP 8 — Root Layout

Create `c:\tyrerescue\247moglasgow\app\layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Inter, Bebas_Neue } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-body' });
const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-display' });

export const metadata: Metadata = {
  metadataBase: new URL('https://www.247moglasgow.uk'),
  title: {
    default: '24/7 Mobile Tyre Fitting Glasgow | 35 Min Response | 247 Mo Glasgow',
    template: '%s | 247 Mo Glasgow',
  },
  description: '24/7 mobile tyre fitting across all Glasgow postcodes. Emergency response, puncture repair and tyre fitting — we come to you. Average 35 min arrival. Call 0141 266 0690.',
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
  ].join(', '),
  alternates: { canonical: 'https://www.247moglasgow.uk' },
  openGraph: {
    title: '247 Mo Glasgow — 24/7 Mobile Tyre Fitting',
    description: '24/7 mobile tyre fitting across all Glasgow postcodes. Average 35 min response. Call 0141 266 0690.',
    url: 'https://www.247moglasgow.uk',
    siteName: '247 Mo Glasgow',
    locale: 'en_GB',
    type: 'website',
    images: [{ url: '/og-default.jpg', width: 1200, height: 630, alt: '247 Mo Glasgow mobile tyre fitting service' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '247 Mo Glasgow — 24/7 Mobile Tyre Fitting',
    description: '24/7 mobile tyre fitting across all Glasgow postcodes. Average 35 min response.',
    images: ['/og-default.jpg'],
  },
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  icons: {
    icon: [{ url: '/favicon.ico' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${bebas.variable}`}>
      <head>
        <link rel="preconnect" href="https://www.googletagmanager.com" crossOrigin="" />
      </head>
      <body className={inter.className}>
        {children}
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
```

Create `c:\tyrerescue\247moglasgow\app\globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --orange: #f97316;
  --orange-dark: #ea580c;
  --orange-light: #fb923c;
  --bg: #0a0a0a;
  --surface: #111111;
  --card: #18181b;
  --text: #ffffff;
  --text-muted: #a1a1aa;
  --border: rgba(255,255,255,0.08);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body, sans-serif);
  -webkit-font-smoothing: antialiased;
}

.font-display { font-family: var(--font-display, sans-serif); }
```

---

## STEP 9 — JsonLd Helper

Create `c:\tyrerescue\247moglasgow\components\JsonLd.tsx`:

```tsx
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
```

---

## STEP 10 — Nav Component

Create `c:\tyrerescue\247moglasgow\components\Nav.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { useState } from 'react';

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: 'rgba(10,10,10,0.95)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(249,115,22,0.2)',
      height: '64px',
      display: 'flex', alignItems: 'center',
      padding: '0 24px',
      justifyContent: 'space-between',
    }}>
      <Link href="/" style={{ fontFamily: 'var(--font-display)', fontSize: '22px', color: '#f97316', letterSpacing: '0.05em', textDecoration: 'none' }}>
        247 MO GLASGOW
      </Link>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <a href="tel:01412660690" style={{
          background: 'linear-gradient(135deg, #f97316, #ea580c)',
          color: '#fff',
          padding: '10px 20px',
          borderRadius: '8px',
          fontFamily: 'var(--font-display)',
          fontSize: '15px',
          textDecoration: 'none',
          letterSpacing: '0.05em',
        }}>
          CALL NOW
        </a>
      </div>
    </nav>
  );
}
```

---

## STEP 11 — Footer Component

Create `c:\tyrerescue\247moglasgow\components\Footer.tsx`:

```tsx
import Link from 'next/link';

export function Footer() {
  return (
    <footer style={{ background: '#000', borderTop: '1px solid rgba(249,115,22,0.15)', padding: '48px 24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '32px', marginBottom: '32px' }}>
          <div>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: '#f97316', marginBottom: '8px' }}>247 MO GLASGOW</p>
            <p style={{ fontSize: '13px', color: '#a1a1aa', lineHeight: '1.6' }}>24/7 mobile tyre fitting across all Glasgow postcodes. Emergency response. Real fitters, not a broker.</p>
          </div>
          <div>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '13px', color: '#f97316', marginBottom: '12px', letterSpacing: '0.1em' }}>SERVICES</p>
            {['Mobile Tyre Fitting', 'Emergency Tyre Fitting', 'Puncture Repair', 'Tyre Fitting'].map((s) => (
              <p key={s} style={{ fontSize: '13px', color: '#a1a1aa', marginBottom: '6px' }}>{s}</p>
            ))}
          </div>
          <div>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '13px', color: '#f97316', marginBottom: '12px', letterSpacing: '0.1em' }}>CONTACT</p>
            <a href="tel:01412660690" style={{ display: 'block', fontSize: '20px', color: '#fff', fontFamily: 'var(--font-display)', textDecoration: 'none', marginBottom: '8px' }}>0141 266 0690</a>
            <a href="https://wa.me/447423262955" target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#25D366', textDecoration: 'none' }}>WhatsApp Us</a>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '24px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <p style={{ fontSize: '12px', color: '#52525b' }}>© {new Date().getFullYear()} 247 Mo Glasgow. All rights reserved. Operated by Tyre Rescue Ltd.</p>
          <div style={{ display: 'flex', gap: '16px' }}>
            <Link href="/privacy-policy" style={{ fontSize: '12px', color: '#52525b', textDecoration: 'none' }}>Privacy</Link>
            <Link href="/terms" style={{ fontSize: '12px', color: '#52525b', textDecoration: 'none' }}>Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
```

---

## STEP 12 — Homepage (Landing Page)

Create `c:\tyrerescue\247moglasgow\app\page.tsx` as a **server component** for SEO. The page must have:

### Sections (in order):

1. **HERO** — full-viewport, orange background (`#f97316` gradient to `#ea580c`), white text
   - Small label: `24/7 MOBILE TYRE FITTING · GLASGOW`
   - H1: `GLASGOW'S FASTEST TYRE FITTERS.` (Bebas Neue, 80–120px)
   - Sub: `Emergency response across all Glasgow postcodes. Average 35 minutes from your call.`
   - 3 CTA buttons: CALL NOW (dark on orange), EMERGENCY CALLOUT (white border), WHATSAPP US (green tint)
   - 3 animated stats below buttons: `35 MIN / Avg Response`, `24/7 / Availability`, `G1–G78 / Full Glasgow`
   - Animated orange pulse circle in background (CSS animation)

2. **TRUST BAR** — dark background, single row of 5 trust signals:
   - ✓ Own workshop — Parkhead G31
   - ✓ Direct fitters — not a broker
   - ✓ Fully insured — every job
   - ✓ All Glasgow postcodes G1–G78
   - ✓ Same-day availability

3. **SERVICES GRID** — dark section
   - H2: `WHAT WE DO`
   - 4 cards (one per service): orange accent top border, icon, name, price, brief description, link to `/[service-slug]`

4. **HOW IT WORKS** — 3 numbered steps, orange numbers
   - 1. Call or book online
   - 2. Fitter dispatched immediately
   - 3. Tyre fitted at your location

5. **GLASGOW AREAS** — dark section
   - H2: `WE COVER ALL OF GLASGOW`
   - Lead text: `From Bearsden to Castlemilk, Drumchapel to Baillieston — if it's a Glasgow postcode, we're there.`
   - Responsive grid of area chips (from GLASGOW_AREAS), each links to `/mobile-tyre-fitting/[area-slug]`

6. **WHY US** — dark section, 3 feature cards
   - OWN WORKSHOP: Parkhead G31 — a real tyre shop
   - DIRECT FITTERS: employed or contracted directly by us
   - FULLY INSURED: public liability on every job

7. **FAQ** — dark section, 5 Q&As
   - Q: How fast can you reach me in Glasgow? A: Average 35 minutes across all Glasgow postcodes, often faster in central areas like G1–G5, G11, G31.
   - Q: Do you cover all Glasgow postcodes? A: Yes — G1 through G78, including all surrounding areas like Rutherglen, Cambuslang, Baillieston and Clarkston.
   - Q: What tyres do you carry? A: Budget, mid-range and premium brands including Continental, Michelin, Goodyear, Bridgestone and Pirelli.
   - Q: Is there a callout fee? A: Emergency callouts are from £69 including labour. Scheduled mobile fitting is from £20 per tyre plus the tyre cost.
   - Q: Are you available Christmas Day? A: Yes — 24 hours a day, 365 days a year, including all bank holidays.

8. **CTA BANNER** — full orange background
   - H2: `FLAT TYRE IN GLASGOW? WE'RE 35 MINUTES AWAY.`
   - CALL 0141 266 0690 (big, white)
   - Two buttons: CALL NOW, BOOK ONLINE

### Animation requirements (use Framer Motion):

Import animations as a `'use client'` wrapper component. The page itself stays a server component — pass animated sections as children or use a thin `AnimatedSection` client wrapper that fades/slides content in on scroll using `whileInView` + `viewport={{ once: true }}`.

Animated elements:
- Hero H1: staggered letter/word reveal on mount (`initial: { opacity: 0, y: 40 }` → `animate: { opacity: 1, y: 0 }`, stagger 0.15s)
- Stat numbers: count-up from 0 to value when scrolled into view (use `useInView` + `useMotionValue` + `useTransform`)
- Service cards: slide up on scroll, staggered 0.1s each
- Trust bar items: fade in left to right on scroll
- Orange pulse in hero background: infinite scale/opacity keyframe CSS animation

---

## STEP 13 — Service Landing Pages

Create `c:\tyrerescue\247moglasgow\app\[service]\page.tsx`:

- generateStaticParams: return the 4 service slugs
- generateMetadata: use service data from `seo-data.ts`
- Page content: same structure as homepage but service-specific hero + Glasgow areas grid + FAQ

Create `c:\tyrerescue\247moglasgow\app\[service]\[area]\page.tsx`:

- generateStaticParams: all combinations of 4 services × 30 areas = 120 pages
- generateMetadata with area-specific title: `Mobile Tyre Fitting ${area.name} Glasgow | From £49 | 247 Mo Glasgow`
- canonical: `https://www.247moglasgow.uk/${service}/${area}`
- Page content: hero with area name, ETA for that area, service description, nearby areas grid, FAQ, CTA
- JSON-LD: Service schema + BreadcrumbList schema

---

## STEP 14 — Sitemap

Create `c:\tyrerescue\247moglasgow\app\sitemap.ts`:

```ts
import type { MetadataRoute } from 'next';
import { SERVICES, GLASGOW_AREAS } from '@/lib/seo-data';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.247moglasgow.uk';
  const now = new Date();
  const out: MetadataRoute.Sitemap = [];

  out.push({ url: base, lastModified: now, changeFrequency: 'daily', priority: 1 });
  out.push({ url: `${base}/emergency`, lastModified: now, changeFrequency: 'weekly', priority: 0.95 });
  out.push({ url: `${base}/book`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 });
  out.push({ url: `${base}/areas`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 });

  for (const service of SERVICES) {
    out.push({ url: `${base}/${service.slug}`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 });
    for (const area of GLASGOW_AREAS) {
      out.push({ url: `${base}/${service.slug}/${area.slug}`, lastModified: now, changeFrequency: 'monthly', priority: 0.75 });
    }
  }

  return out;
}
```

---

## STEP 15 — Robots

Create `c:\tyrerescue\247moglasgow\app\robots.ts`:

```ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/admin/'] }],
    sitemap: 'https://www.247moglasgow.uk/sitemap.xml',
  };
}
```

---

## STEP 16 — Booking API Route

Create `c:\tyrerescue\247moglasgow\app\api\booking\route.ts`:

POST handler that:
1. Validates the request body with Zod (name, phone, email, service, location, message)
2. POSTs to `${process.env.TYRE_RESCUE_API_BASE}/api/integrations/projects/bookings` with:
   - `Authorization: Bearer ${process.env.MO_GLASGOW_INTEGRATION_SECRET}`
   - `x-source-app: 247_mo_glasgow`
   - body: `{ sourceApp: '247_mo_glasgow', customerName, customerPhone, customerEmail, serviceType, address, notes }`
3. Returns `{ success: true }` or `{ error: string }` with appropriate status codes

---

## STEP 17 — Emergency Page

Create `c:\tyrerescue\247moglasgow\app\emergency\page.tsx`:

- Title: `Emergency Tyre Fitting Glasgow | 24/7 | 35 Min | 247 Mo Glasgow`
- Hero: red/orange urgent feel, large phone number, "WE ARE ON OUR WAY" messaging
- Steps: Call → Fitter dispatched → Tyre fitted
- FAQ specific to emergencies

---

## STEP 18 — Book Page

Create `c:\tyrerescue\247moglasgow\app\book\page.tsx`:

- Simple booking form: name, phone, email, service dropdown, location (text), message
- On submit: POST to `/api/booking`
- Success state: confirmation message
- No Stripe (bookings are quotes, admin calls back)

---

## STEP 19 — Areas Page

Create `c:\tyrerescue\247moglasgow\app\areas\page.tsx`:

- Title: `Areas We Cover in Glasgow | All G Postcodes | 247 Mo Glasgow`
- Full grid of all 30 Glasgow areas, each linking to `/mobile-tyre-fitting/[area-slug]`
- Map embed (Mapbox) centred on Glasgow showing coverage radius (use `NEXT_PUBLIC_MAPBOX_TOKEN`)

---

## STEP 20 — Next.js Config

Create `c:\tyrerescue\247moglasgow\next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      { protocol: 'https', hostname: 'api.mapbox.com' },
      { protocol: 'https', hostname: '*.blob.vercel-storage.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: '/home', destination: '/', permanent: true },
    ];
  },
};

export default nextConfig;
```

---

## STEP 21 — Vercel Config

Create `c:\tyrerescue\247moglasgow\vercel.json`:

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "outputDirectory": ".next",
  "regions": ["lhr1"]
}
```

The Vercel project should use the same team account as Tyre Rescue. Set domain to `www.247moglasgow.uk` and `247moglasgow.uk` (redirect bare to www).

---

## STEP 22 — Package.json Scripts

Ensure `package.json` has:

```json
{
  "name": "247moglasgow",
  "scripts": {
    "dev": "next dev -p 3010",
    "build": "next build",
    "start": "next start -p 3010",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  }
}
```

Port 3010 to avoid conflicts with Tyre Rescue (3002) and other projects.

---

## STEP 23 — Tailwind Config

Update `tailwind.config.ts` to include the orange brand colours:

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        orange: {
          DEFAULT: '#f97316',
          dark: '#ea580c',
          light: '#fb923c',
        },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
      },
    },
  },
  plugins: [],
};

export default config;
```

---

## STEP 24 — TypeScript Config

Create `c:\tyrerescue\247moglasgow\tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

## STEP 25 — Verification Checklist

After building, verify:

- [ ] `npm run type-check` — zero TypeScript errors
- [ ] `npm run lint` — zero ESLint errors
- [ ] `npm run build` — builds successfully
- [ ] Homepage renders at `localhost:3010`
- [ ] `/mobile-tyre-fitting` service page renders
- [ ] `/mobile-tyre-fitting/city-centre` area page renders with correct meta title
- [ ] `/sitemap.xml` returns all URLs (static export: check build output)
- [ ] `/robots.txt` is correct
- [ ] JSON-LD is present in `<head>` on homepage
- [ ] Booking form POSTs to `/api/booking` and receives a response
- [ ] Parent project `lib/integrations/project-sources.ts` includes `247_mo_glasgow`
- [ ] Parent project `assisted-chat-app/src/lib/project-config.ts` includes `247_mo_glasgow`

---

## SEO Notes for Maximum Glasgow Rankings

1. **Every area page** must have a unique meta title with the area name, "Glasgow", and the service — e.g. `Mobile Tyre Fitting Partick Glasgow | From £49 | 247 Mo Glasgow`
2. **Every area page** must include the ETA specific to that area (from `GLASGOW_AREAS[].etaMin`)
3. **Canonical URLs** must always use `www.247moglasgow.uk` (not bare domain)
4. **Internal linking**: every area page links to 4 nearby areas; homepage links to all 30 areas
5. **H1 must include "Glasgow"** on every page except area pages (where it includes the area name + Glasgow)
6. **Schema.org Service** must be on every service + area page
7. **FAQ schema** must be on every page (minimum 3 FAQs per page)
8. **Page speed**: no client-side data fetching on initial render — all SEO content must be in server-rendered HTML
9. The `'use client'` directive must ONLY appear on components that genuinely need interactivity (booking form, animated wrappers) — all content/SEO sections must be server components
