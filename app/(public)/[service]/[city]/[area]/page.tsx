import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { services, serviceCities, getAreasForCity, getServiceBySlug, getAreaBySlug } from '@/lib/areas';
import { getCityBySlug } from '@/lib/cities';
import { ServiceAreaContent } from '@/components/seo/ServiceAreaContent';
import { JsonLd } from '@/components/seo/JsonLd';
import { getServiceSchema, getBreadcrumbSchema } from '@/lib/seo/schemas';

export async function generateStaticParams() {
  const params: { service: string; city: string; area: string }[] = [];
  for (const service of services) {
    for (const citySlug of serviceCities) {
      const areas = getAreasForCity(citySlug);
      for (const area of areas) {
        params.push({ service: service.slug, city: citySlug, area: area.slug });
      }
    }
  }
  return params;
}

export async function generateMetadata({ params }: { params: Promise<{ service: string; city: string; area: string }> }): Promise<Metadata> {
  const { service: serviceSlug, city: citySlug, area: areaSlug } = await params;
  const service = getServiceBySlug(serviceSlug);
  const city = getCityBySlug(citySlug);
  const area = getAreaBySlug(citySlug, areaSlug);
  if (!service || !city || !area) return {};

  const estimatedArrival = Math.round(area.distanceFromCentre * 3.5 + 18);

  return {
    title: `${service.name} ${area.name} ${area.postcode} | ${estimatedArrival} Min Response | Tyre Rescue`,
    description: `${service.name} in ${area.name}, ${city.name} (${area.postcode}). Response time approximately ${estimatedArrival} minutes. Near ${area.nearestLandmark}. Call 0141 266 0690 — available 24/7.`,
    keywords: [
      `${service.name.toLowerCase()} ${area.name.toLowerCase()}`,
      `${service.name.toLowerCase()} ${area.postcode}`,
      `tyre fitting ${area.name.toLowerCase()}`,
      `mobile tyre ${area.name.toLowerCase()}`,
      `tyre repair ${area.name.toLowerCase()}`,
      `tyre fitting ${area.postcode}`,
    ].join(', '),
    openGraph: {
      title: `${service.name} in ${area.name}, ${city.name} | Tyre Rescue`,
      description: `${service.name} in ${area.name} (${area.postcode}). ~${estimatedArrival} min response. Call 0141 266 0690.`,
      url: `https://www.tyrerescue.uk/${service.slug}/${city.slug}/${area.slug}`,
      images: [{ url: 'https://www.tyrerescue.uk/images/home/slide-1.png', width: 1200, height: 630, alt: `${service.name} in ${area.name}, ${city.name}` }],
    },
    alternates: {
      canonical: `https://www.tyrerescue.uk/${service.slug}/${city.slug}/${area.slug}`,
    },
  };
}

export default async function ServiceAreaPage({ params }: { params: Promise<{ service: string; city: string; area: string }> }) {
  const { service: serviceSlug, city: citySlug, area: areaSlug } = await params;
  const service = getServiceBySlug(serviceSlug);
  const city = getCityBySlug(citySlug);
  const area = getAreaBySlug(citySlug, areaSlug);
  if (!service || !city || !area) notFound();

  const allCityAreas = getAreasForCity(citySlug);

  return (
    <>
      <JsonLd data={getServiceSchema({
        serviceName: `${service.name} in ${area.name}, ${city.name}`,
        areaName: area.name,
        areaType: 'Place',
        geo: { latitude: area.lat, longitude: area.lng },
        postcode: area.postcode,
        county: city.county,
        mapUrl: `https://maps.google.com/?q=${area.lat},${area.lng}`,
      })} />
      <JsonLd data={getBreadcrumbSchema([
        { name: 'Home', path: '/' },
        { name: `${service.name} ${city.name}`, path: `/${service.slug}/${city.slug}` },
        { name: area.name, path: `/${service.slug}/${city.slug}/${area.slug}` },
      ])} />
      <ServiceAreaContent service={service} city={city} area={area} allCityAreas={allCityAreas} />
    </>
  );
}
