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
];

export const metadata: Metadata = {
  title: 'Emergency Mobile Tyre Fitting Near Me | Tyre Rescue',
  description:
    'Need urgent tyre help? Our mobile fitters come to your exact location for flat tyres, roadside emergencies and tyre replacement across all of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness, Highlands and Islands. Call 0141 266 0690.',
  alternates: {
    canonical: '/emergency-tyre-fitting-near-me',
  },
  openGraph: {
    title: 'Emergency Mobile Tyre Fitting Near Me | Tyre Rescue',
    description:
      'Flat tyre or roadside emergency? Tyre Rescue mobile fitters cover all of Scotland 24/7 — Glasgow, Edinburgh, Aberdeen, Inverness, Highlands and Islands.',
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
