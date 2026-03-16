import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { services, serviceCities, getAreasForCity, getServiceBySlug, getAreaBySlug } from '@/lib/areas';
import { getCityBySlug } from '@/lib/cities';
import { ServiceAreaContent } from '@/components/seo/ServiceAreaContent';

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

  return {
    title: `${service.name} in ${area.name} | ${city.name} | Tyre Rescue`,
    description: `${service.name} in ${area.name}, ${city.name} (${area.postcode}). Our mobile tyre fitters cover ${area.name} and surrounding areas. Call 0141 266 0690.`,
    keywords: [
      `${service.name.toLowerCase()} ${area.name.toLowerCase()}`,
      `${service.name.toLowerCase()} ${area.postcode}`,
      `tyre fitting ${area.name.toLowerCase()}`,
      `mobile tyre ${area.name.toLowerCase()}`,
      `tyre repair ${area.name.toLowerCase()}`,
    ].join(', '),
    openGraph: {
      title: `${service.name} in ${area.name}, ${city.name} | Tyre Rescue`,
      description: `${service.name} in ${area.name} (${area.postcode}). Call 0141 266 0690.`,
      url: `https://www.tyrerescue.uk/${service.slug}/${city.slug}/${area.slug}`,
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Service',
            name: `${service.name} in ${area.name}, ${city.name}`,
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
              '@type': 'Place',
              name: area.name,
              address: {
                '@type': 'PostalAddress',
                postalCode: area.postcode,
                addressLocality: city.name,
                addressCountry: 'GB',
              },
            },
            serviceType: service.name,
          }),
        }}
      />
      <ServiceAreaContent service={service} city={city} area={area} />
    </>
  );
}
