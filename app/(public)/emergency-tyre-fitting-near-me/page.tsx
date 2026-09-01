import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  getEmergencyServiceSchema,
  getBreadcrumbSchema,
  getFAQSchema,
} from '@/lib/seo/schemas';
import { EmergencyTyreLanding } from '@/components/marketing/EmergencyTyreLanding';
import { EMERGENCY_PAGE_FAQS } from '@/components/marketing/emergency-faq-data';
import type { ServiceArea } from '@/components/marketing/EmergencyServiceAreas';

const PHONE_DISPLAY =
  process.env.NEXT_PUBLIC_PHONE_NUMBER ?? '0141 266 0690';
const PHONE_HREF = `tel:${PHONE_DISPLAY.replace(/\s/g, '')}`;

const SERVICE_AREAS: ServiceArea[] = [
  { name: 'Glasgow', href: '/services/glasgow' },
  { name: 'Edinburgh', href: '/services/edinburgh' },
  { name: 'Aberdeen', href: '/services/aberdeen' },
  { name: 'Inverness', href: '/services/inverness' },
  { name: 'Dundee', href: '/services/dundee' },
  { name: 'Stirling', href: '/services/stirling' },
  { name: 'Falkirk', href: '/services/falkirk' },
  { name: 'Perth', href: '/services/perth' },
  { name: 'Paisley', href: '/services/paisley' },
  { name: 'Hamilton', href: '/services/hamilton' },
  { name: 'Motherwell', href: '/services/motherwell' },
  { name: 'Kilmarnock', href: '/services/kilmarnock' },
  { name: 'Ayr', href: '/services/ayr' },
  { name: 'Kirkcaldy', href: '/services/kirkcaldy' },
  { name: 'Dunfermline', href: '/services/dunfermline' },
  { name: 'Elgin', href: '/services/elgin' },
  { name: 'Fort William', href: '/services/fort-william' },
  { name: 'Galashiels', href: '/services/galashiels' },
  { name: 'Isle of Skye', href: '/services/isle-of-skye' },
  { name: 'Oban', href: '/services/oban' },
];

export const metadata: Metadata = {
  title: 'Emergency Mobile Tyre Fitting Near Me | All of Scotland | Tyre Rescue',
  description:
    'Need urgent tyre help? Our mobile fitters come to your exact location for flat tyres and tyre replacement across all of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness, Highlands, Borders and Islands. 24/7. Call 0141 266 0690.',
  alternates: {
    canonical: 'https://www.tyrerescue.uk/emergency-tyre-fitting-near-me',
  },
  openGraph: {
    title: 'Emergency Mobile Tyre Fitting Near Me | All of Scotland | Tyre Rescue',
    description:
      'Flat tyre or roadside emergency? Tyre Rescue mobile fitters cover all of Scotland 24/7 — Glasgow to Shetland, Borders to Western Isles.',
    images: [{ url: 'https://www.tyrerescue.uk/images/home/slide-1.webp', width: 1200, height: 630 }],
  },
};

export default function EmergencyTyreFittingNearMePage() {
  return (
    <>
      <EmergencyTyreLanding
        phoneDisplay={PHONE_DISPLAY}
        phoneHref={PHONE_HREF}
        serviceAreas={SERVICE_AREAS}
        faqs={EMERGENCY_PAGE_FAQS}
      />
      <JsonLd data={getEmergencyServiceSchema()} />
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Home', path: '/' },
          {
            name: 'Emergency Tyre Fitting Near Me',
            path: '/emergency-tyre-fitting-near-me',
          },
        ])}
      />
      <JsonLd data={getFAQSchema(EMERGENCY_PAGE_FAQS)} />
    </>
  );
}
