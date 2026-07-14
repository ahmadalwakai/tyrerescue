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
  getPunctureRepairServiceArea,
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

export type PunctureRepairPageProps = {
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
  const configuredArea = getPunctureRepairServiceArea(citySlug, areaSlug);
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

export async function generateMetadata({ params }: PunctureRepairPageProps): Promise<Metadata> {
  const { city, area } = await params;
  const serviceArea = getServiceArea(city, area);
  if (!serviceArea) return {};

  return buildEmergencyLocalMetadata(serviceArea, 'puncture');
}

export default async function PunctureRepairLocalPage({ params }: PunctureRepairPageProps) {
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
          serviceLabel="Mobile puncture repair"
          headline={`Puncture repair in ${location}`}
          copy={`Puncture in ${location}? Tyre Rescue can repair safe punctures from \u00a325 or fit a replacement tyre if the damage is not legally repairable. 24/7 mobile help across mainland Scotland.`}
        />
        <EmergencyTrustBar />
        <EmergencyServiceCards />
        <EmergencyPricingSection />
        <EmergencyCoverageSection currentArea={serviceArea} />
        <EmergencyFaq framed />
      </main>
      <Footer />
      <StickyMobileEmergencyBar />
      <JsonLd data={buildEmergencyServiceJsonLd(serviceArea, 'puncture')} />
      <JsonLd
        data={buildEmergencyBreadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Puncture Repair', path: '/puncture-repair/glasgow/city-centre' },
          {
            name: `${serviceArea.cityName} ${serviceArea.areaName}`,
            path: serviceArea.punctureRepairPath ?? serviceArea.emergencyPath,
          },
        ])}
      />
      <JsonLd data={getFAQSchema(EMERGENCY_PAGE_FAQS)} />
    </>
  );
}
