import { Metadata } from 'next';
import { CityServiceContent } from './CityServiceContent';

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city } = await params;
  const cityName = city.charAt(0).toUpperCase() + city.slice(1).replace(/-/g, ' ');
  return {
    title: `Mobile Tyre Fitting ${cityName}`,
    description: `Emergency mobile tyre fitting service in ${cityName}. 24/7 availability. Call 0141 266 0690.`,
  };
}

export default async function CityServicePage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const cityName = city.charAt(0).toUpperCase() + city.slice(1).replace(/-/g, ' ');

  return <CityServiceContent cityName={cityName} />;
}
