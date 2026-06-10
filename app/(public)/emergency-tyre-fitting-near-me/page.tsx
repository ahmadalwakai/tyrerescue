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
  { name: 'Stirling', href: '/services/stirling' },
  { name: 'Falkirk', href: '/services/falkirk' },
  { name: 'Dundee', href: '/services/dundee' },
];

export const metadata: Metadata = {
  title: 'Emergency Mobile Tyre Fitting Near Me | Tyre Rescue',
  description:
    'Need urgent tyre help? Our mobile fitters come to your location for flat tyres, roadside tyre emergencies and tyre replacement across Glasgow, Edinburgh and Central Scotland. Call 0141 266 0690.',
  alternates: {
    canonical: '/emergency-tyre-fitting-near-me',
  },
  openGraph: {
    title: 'Emergency Mobile Tyre Fitting Near Me | Tyre Rescue',
    description:
      'Flat tyre or roadside emergency? Tyre Rescue mobile fitters come to you across Glasgow, Edinburgh and Central Scotland. 24/7 emergency tyre fitting.',
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
