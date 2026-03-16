import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { services, serviceCities, getAreasForCity, getServiceBySlug } from '@/lib/areas';
import { getCityBySlug } from '@/lib/cities';
import { ServiceCityContent } from '@/components/seo/ServiceCityContent';

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
  return {
    title: service.metaTitleTemplate.replace('{location}', location),
    description: service.metaDescTemplate.replace(/{location}/g, location),
    keywords: [
      `${service.name.toLowerCase()} ${city.name.toLowerCase()}`,
      `${service.name.toLowerCase()} near me`,
      `mobile tyre fitter ${city.name.toLowerCase()}`,
      `emergency tyre ${city.name.toLowerCase()}`,
      `tyre repair ${city.name.toLowerCase()}`,
      `puncture repair ${city.name.toLowerCase()}`,
    ].join(', '),
    openGraph: {
      title: service.metaTitleTemplate.replace('{location}', location),
      description: service.metaDescTemplate.replace(/{location}/g, location),
      url: `https://www.tyrerescue.uk/${service.slug}/${city.slug}`,
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Service',
            name: `${service.name} in ${city.name}`,
            provider: {
              '@type': 'LocalBusiness',
              name: 'Tyre Rescue',
              telephone: '0141 266 0690',
              address: {
                '@type': 'PostalAddress',
                streetAddress: '3, 10 Gateside St',
                addressLocality: 'Glasgow',
                postalCode: 'G31 1PD',
                addressCountry: 'GB',
              },
            },
            areaServed: {
              '@type': 'City',
              name: city.name,
            },
            serviceType: service.name,
          }),
        }}
      />
      <ServiceCityContent service={service} city={city} areas={areas} />
    </>
  );
}
