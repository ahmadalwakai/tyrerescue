import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAreasForCity, getServiceBySlug, getAreaBySlug } from '@/lib/areas';
import { getCityBySlug } from '@/lib/cities';
import { ServiceAreaContent } from '@/components/seo/ServiceAreaContent';
import { JsonLd } from '@/components/seo/JsonLd';
import { getServiceSchema, getBreadcrumbSchema, getFAQSchema } from '@/lib/seo/schemas';
import { getNeighborhoodEnrichment } from '@/lib/data/neighborhoodEnrichment';
import { getPriorityServiceAreaParams } from '@/lib/seo/priority';
import { cityContent } from '@/lib/data/cityContent';

// Hybrid rendering: prebuild only the highest-priority routes, generate the
// remaining ~3,000 service-area pages on-demand and cache for 7 days. Keeps
// SEO coverage intact while avoiding a static-export explosion on Vercel.
export const revalidate = 604800; // 7 days
export const dynamicParams = true;

export async function generateStaticParams() {
  return getPriorityServiceAreaParams();
}

export async function generateMetadata({ params }: { params: Promise<{ service: string; city: string; area: string }> }): Promise<Metadata> {
  const { service: serviceSlug, city: citySlug, area: areaSlug } = await params;
  const service = getServiceBySlug(serviceSlug);
  const city = getCityBySlug(citySlug);
  const area = getAreaBySlug(citySlug, areaSlug);
  if (!service || !city || !area) return {};

  const estimatedArrival = Math.round(area.distanceFromCentre * 3.5 + 18);
  const enrichment = getNeighborhoodEnrichment(citySlug, areaSlug);
  const enrichedDesc = enrichment
    ? `${service.name} in ${area.name}, ${city.name} (${area.postcode}). ~${estimatedArrival} min response near ${area.nearestLandmark}. ${enrichment.characterDescription} Call 0141 266 0690 — 24/7.`
    : `${service.name} in ${area.name}, ${city.name} (${area.postcode}). Response time approximately ${estimatedArrival} minutes. Near ${area.nearestLandmark}. Call 0141 266 0690 — available 24/7.`;

  return {
    title: `${service.name} ${area.name} ${area.postcode} | ${estimatedArrival} Min Response | Tyre Rescue`,
    description: enrichedDesc,
    keywords: [
      `${service.name.toLowerCase()} ${area.name.toLowerCase()}`,
      `${service.name.toLowerCase()} ${area.postcode}`,
      `tyre fitting ${area.name.toLowerCase()}`,
      `mobile tyre ${area.name.toLowerCase()}`,
      `tyre repair ${area.name.toLowerCase()}`,
      `tyre fitting ${area.postcode}`,
      ...(enrichment?.landmarks.slice(0, 3).map(l => `tyre fitting near ${l.toLowerCase()}`) ?? []),
    ].join(', '),
    openGraph: {
      title: `${service.name} in ${area.name}, ${city.name} | Tyre Rescue`,
      description: `${service.name} in ${area.name} (${area.postcode}). ~${estimatedArrival} min response. Call 0141 266 0690.`,
      url: `https://www.tyrerescue.uk/${service.slug}/${city.slug}/${area.slug}`,
      images: [{ url: 'https://www.tyrerescue.uk/images/home/slide-1.webp', width: 1200, height: 630, alt: `${service.name} in ${area.name}, ${city.name}` }],
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
  const enrichment = getNeighborhoodEnrichment(citySlug, areaSlug);
  const estimatedArrival = Math.round(area.distanceFromCentre * 3.5 + 18);
  const cityData = cityContent[citySlug];

  const areaFaqs = [
    {
      question: `How quickly can you reach ${area.name} (${area.postcode}) for ${service.name.toLowerCase()}?`,
      answer: `Our estimated response time in ${area.name} is ${estimatedArrival} minutes. We dispatch from our Glasgow base and navigate directly to your exact location — whether you are near ${area.nearestLandmark} or anywhere else in the ${area.postcode} postcode.`,
    },
    {
      question: `How much does ${service.name.toLowerCase()} cost in ${area.name}?`,
      answer: `${service.name} in ${area.name} starts from ${service.priceFrom}. There are no hidden charges — the price includes professional fitting, torqueing to manufacturer spec, and old tyre disposal. Call 0141 266 0690 for an instant quote.`,
    },
    {
      question: `Do you cover ${area.name} 24 hours a day?`,
      answer: `Yes — we provide ${service.name.toLowerCase()} in ${area.name} 24 hours a day, 7 days a week including bank holidays. Emergency callouts are prioritised. Call 0141 266 0690 at any time.`,
    },
    {
      question: `Where exactly in ${area.name} do you come to?`,
      answer: `We come to your exact location in ${area.name} — your driveway, a car park, a road, or the roadside. You do not need to drive anywhere. Just tell us the street address or nearest landmark when you call.`,
    },
    ...(cityData ? [{
      question: `Do you also cover the rest of ${city.name} near ${area.name}?`,
      answer: `Yes — ${area.name} is part of our ${city.name} service zone. ${cityData.uniqueIntro} We also cover all other areas across ${city.name}.`,
    }] : []),
  ];

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
      <JsonLd data={getFAQSchema(areaFaqs)} />
      <ServiceAreaContent service={service} city={city} area={area} allCityAreas={allCityAreas} enrichment={enrichment} />
    </>
  );
}
