import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cities, getCityBySlug } from '@/lib/cities';
import { CityServiceContent } from './CityServiceContent';

export async function generateStaticParams() {
  return cities.map((c) => ({ city: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city: slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) return {};
  return {
    title: `Mobile Tyre Fitting ${city.name} | 24/7 Emergency Service | Tyre Rescue`,
    description: `Emergency and scheduled mobile tyre fitting in ${city.name}, Scotland. Available 24 hours, 7 days a week. Our certified fitters come to your exact location. Call 0141 266 0690.`,
    keywords: [
      `mobile tyre fitting ${city.name.toLowerCase()}`,
      `emergency tyre fitting ${city.name.toLowerCase()}`,
      `tyre fitter ${city.name.toLowerCase()}`,
      `flat tyre ${city.name.toLowerCase()}`,
      `24 hour tyre ${city.name.toLowerCase()}`,
    ].join(', '),
    openGraph: {
      title: `Mobile Tyre Fitting ${city.name} | Tyre Rescue`,
      description: `24/7 emergency mobile tyre fitting in ${city.name}`,
      url: `https://www.tyrerescue.uk/services/${city.slug}`,
    },
  };
}

export default async function CityServicePage({ params }: { params: Promise<{ city: string }> }) {
  const { city: slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) notFound();

  return <CityServiceContent city={city} />;
}
