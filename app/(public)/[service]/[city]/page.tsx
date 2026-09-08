import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAreasForCity, getServiceBySlug } from '@/lib/areas';
import { getCityBySlug } from '@/lib/cities';
import { ServiceCityContent } from '@/components/seo/ServiceCityContent';
import { JsonLd } from '@/components/seo/JsonLd';
import { getServiceSchema, getBreadcrumbSchema, getFAQSchema } from '@/lib/seo/schemas';
import { getPriorityServiceCityParams } from '@/lib/seo/priority';
import { cityContent } from '@/lib/data/cityContent';
import { getServiceCityFaqs } from '@/lib/content/serviceCityFaq';

// All 95 service-city combinations are prebuilt; ISR refresh weekly so the
// pricing/landmark copy stays in sync with config changes without rebuilds.
export const revalidate = 604800; // 7 days
export const dynamicParams = true;

export async function generateStaticParams() {
  return getPriorityServiceCityParams();
}

export async function generateMetadata({ params }: { params: Promise<{ service: string; city: string }> }): Promise<Metadata> {
  const { service: serviceSlug, city: citySlug } = await params;
  const service = getServiceBySlug(serviceSlug);
  const city = getCityBySlug(citySlug);
  if (!service || !city) return {};

  const location = city.name;
  const cityData = cityContent[citySlug];
  const avgResponseMin = cityData?.avgResponseMin ?? 45;
  const title = `${service.name} ${location} | 24/7 | ${service.priceFrom}`;
  const description = `${service.metaDescTemplate.replace(/{location}/g, location)} ${service.priceFrom}. Average ${avgResponseMin} min response. Fully insured. Call 0141 266 0690.`;
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
      `24 hour tyre fitting ${city.name.toLowerCase()}`,
      `tyre fitting near me ${city.name.toLowerCase()}`,
    ].join(', '),
    openGraph: {
      title: `${service.name} in ${location} — Tyre Rescue`,
      description,
      url: `https://www.tyrerescue.uk/${service.slug}/${city.slug}`,
      // Static fallback until a working city OG image route exists.
      images: [{
        url: '/images/home/slide-1.webp',
        width: 1200,
        height: 630,
        alt: `${service.name} in ${location}`,
      }],
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
  const cityData = cityContent[citySlug];
  const avgResponseMin = cityData?.avgResponseMin ?? 45;
  const faqs = getServiceCityFaqs(serviceSlug, city.name, avgResponseMin, service.priceFrom);

  return (
    <>
      <JsonLd data={getServiceSchema({
        serviceName: `${service.name} in ${city.name}`,
        areaName: city.name,
        areaType: 'City',
      })} />
      {/* BreadcrumbList matches the visual breadcrumb: Home → Service → City */}
      <JsonLd data={getBreadcrumbSchema([
        { name: 'Home', path: '/' },
        { name: service.name, path: `/${service.slug}` },
        { name: `${service.name} ${city.name}`, path: `/${service.slug}/${city.slug}` },
      ])} />
      <JsonLd data={getFAQSchema(faqs)} />
      {/*
        NOTE: LocalBusiness schema is intentionally omitted here.
        layout.tsx injects getLocalBusinessSchema() site-wide — adding
        CityLocalBusinessSchema here would send two LocalBusiness nodes to
        Google per city page, which can confuse structured-data parsing.
      */}
      <ServiceCityContent service={service} city={city} areas={areas} avgResponseMin={avgResponseMin} faqs={faqs} />
    </>
  );
}
