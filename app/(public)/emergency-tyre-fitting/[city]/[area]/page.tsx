import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { getFAQSchema } from '@/lib/seo/schemas';
import { Nav } from '@/components/ui/Nav';
import { Footer } from '@/components/ui/Footer';
import { EmergencyHero } from '@/components/marketing/EmergencyHero';
import { EmergencyTrustBar } from '@/components/marketing/EmergencyTrustBar';
import { EmergencyServiceCards } from '@/components/marketing/EmergencyServiceCards';
import { EmergencyCoverageSection } from '@/components/marketing/EmergencyCoverageSection';
import { EmergencyPricingSection } from '@/components/marketing/EmergencyPricingSection';
import { EmergencyFaq } from '@/components/marketing/EmergencyFaq';
import { EMERGENCY_PAGE_FAQS } from '@/components/marketing/emergency-faq-data';
import { StickyMobileEmergencyBar } from '@/components/conversion/StickyMobileEmergencyBar';
import {
  EMERGENCY_RESPONSE_MINUTES,
  getEmergencyServiceArea,
  type ServiceArea,
} from '@/lib/ads/emergencyCampaign';
import { getAreaBySlug, getAreasForCity, serviceCities } from '@/lib/areas';
import { getCityBySlug } from '@/lib/cities';
import {
  buildEmergencyBreadcrumbJsonLd,
  buildEmergencyLocalMetadata,
  buildEmergencyServiceJsonLd,
} from '@/lib/seo/emergencyMetadata';

export const dynamicParams = false;

export type EmergencyPageProps = {
  readonly params: Promise<{
    readonly city: string;
    readonly area: string;
  }>;
};

export function generateStaticParams() {
  return serviceCities.flatMap((city) =>
    getAreasForCity(city).map((area) => ({
      city,
      area: area.slug,
    })),
  );
}

function getServiceArea(citySlug: string, areaSlug: string): ServiceArea | undefined {
  const configuredArea = getEmergencyServiceArea(citySlug, areaSlug);
  if (configuredArea) return configuredArea;

  const city = getCityBySlug(citySlug);
  const area = getAreaBySlug(citySlug, areaSlug);
  if (!city || !area) return undefined;

  return {
    citySlug: city.slug,
    cityName: city.name,
    areaSlug: area.slug,
    areaName: area.name,
    postcode: area.postcode,
    county: city.county,
    landmark: area.nearestLandmark,
    responseMinutes: EMERGENCY_RESPONSE_MINUTES,
    emergencyPath: `/emergency-tyre-fitting/${city.slug}/${area.slug}`,
    punctureRepairPath: `/puncture-repair/${city.slug}/${area.slug}`,
  };
}

export async function generateMetadata({ params }: EmergencyPageProps): Promise<Metadata> {
  const { city, area } = await params;
  const serviceArea = getServiceArea(city, area);
  if (!serviceArea) return {};

  return buildEmergencyLocalMetadata(serviceArea, 'emergency');
}

export default async function EmergencyTyreFittingLocalPage({ params }: EmergencyPageProps) {
  const { city, area } = await params;
  const serviceArea = getServiceArea(city, area);
  if (!serviceArea) notFound();

  const location = `${serviceArea.areaName}, ${serviceArea.cityName}`;

  return (
    <>
      <Nav />
      <main id="main-content">
        <EmergencyHero
          area={serviceArea}
          headline={`Emergency tyre fitting in ${location}`}
          copy={`Flat tyre in ${location}? Tyre Rescue dispatches 24/7 mobile tyre fitters across mainland Scotland, with a ${serviceArea.responseMinutes}-minute response target and emergency callout from \u00a349.`}
        />
        <EmergencyTrustBar />
        <EmergencyServiceCards />
        <EmergencyPricingSection />
        <EmergencyCoverageSection currentArea={serviceArea} />
        <EmergencyFaq framed />
      </main>
      <Footer />
      <StickyMobileEmergencyBar />
      <JsonLd data={buildEmergencyServiceJsonLd(serviceArea, 'emergency')} />
      <JsonLd
        data={buildEmergencyBreadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Emergency Tyre Fitting', path: '/emergency' },
          {
            name: `${serviceArea.cityName} ${serviceArea.areaName}`,
            path: serviceArea.emergencyPath,
          },
        ])}
      />
      <JsonLd data={getFAQSchema(EMERGENCY_PAGE_FAQS)} />
    </>
  );
}
