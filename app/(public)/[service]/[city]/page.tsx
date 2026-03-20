import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { services, serviceCities, getAreasForCity, getServiceBySlug } from '@/lib/areas';
import { getCityBySlug } from '@/lib/cities';
import { ServiceCityContent } from '@/components/seo/ServiceCityContent';
import { JsonLd } from '@/components/seo/JsonLd';
import { getServiceSchema, getBreadcrumbSchema } from '@/lib/seo/schemas';

export async function generateStaticParams() {
  const params: { service: string; city: string }[] = [];
  for (const service of services) {
    for (const citySlug of serviceCities) {
      params.push({ service: service.slug, city: citySlug });
    }
  }
  return params;
}

export async function generateMetadata({ params }: { params: Promise<{ service: string; city: string }> }): Promise<Metadata> {
  const { service: serviceSlug, city: citySlug } = await params;
  const service = getServiceBySlug(serviceSlug);
  const city = getCityBySlug(citySlug);
  if (!service || !city) return {};

  const location = city.name;
  const title = `${service.name} ${location} | 24/7 | ${service.priceFrom} | Tyre Rescue`;
  const description = `${service.metaDescTemplate.replace(/{location}/g, location)} ${service.priceFrom}. Average 45 min response. Fully insured.`;
  return {
    title,
    description,
    keywords: [
      `${service.name.toLowerCase()} ${city.name.toLowerCase()}`,
      `${service.name.toLowerCase()} near me`,
      `mobile tyre fitter ${city.name.toLowerCase()}`,
      `emergency tyre ${city.name.toLowerCase()}`,
      `tyre repair ${city.name.toLowerCase()}`,
      `puncture repair ${city.name.toLowerCase()}`,
    ].join(', '),
    openGraph: {
      title: `${service.name} in ${location} — Tyre Rescue`,
      description,
      url: `https://www.tyrerescue.uk/${service.slug}/${city.slug}`,
      images: [{ url: 'https://www.tyrerescue.uk/images/home/slide-1.png', width: 1200, height: 630, alt: `${service.name} in ${location}` }],
    },
    alternates: {
      canonical: `https://www.tyrerescue.uk/${service.slug}/${city.slug}`,
    },
  };
}

export default async function ServiceCityPage({ params }: { params: Promise<{ service: string; city: string }> }) {
  const { service: serviceSlug, city: citySlug } = await params;
  const service = getServiceBySlug(serviceSlug);
  const city = getCityBySlug(citySlug);
  if (!service || !city) notFound();

  const areas = getAreasForCity(citySlug);

  return (
    <>
      <JsonLd data={getServiceSchema({
        serviceName: `${service.name} in ${city.name}`,
        areaName: city.name,
        areaType: 'City',
      })} />
      <JsonLd data={getBreadcrumbSchema([
        { name: 'Home', path: '/' },
        { name: `${service.name} ${city.name}`, path: `/${service.slug}/${city.slug}` },
      ])} />
      <ServiceCityContent service={service} city={city} areas={areas} />
    </>
  );
}
