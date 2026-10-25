import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowRight, MapPin } from 'lucide-react';
import { getServiceArea, serviceAreas, siteConfig } from '@/lib/site';

export function generateStaticParams() {
  return serviceAreas.map((area) => ({ slug: area.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const area = getServiceArea(slug);

  if (!area) return {};

  return {
    title: `Mobile Tyre Fitting ${area.name}`,
    description: `${area.summary} Book online with ${siteConfig.name}.`,
    alternates: {
      canonical: `${siteConfig.url}/areas/${area.slug}`,
    },
    openGraph: {
      title: `Mobile Tyre Fitting ${area.name}`,
      description: area.summary,
      url: `${siteConfig.url}/areas/${area.slug}`,
      siteName: siteConfig.name,
      type: 'website',
      images: ['/edinburgh-tyre-fitting-hero.png'],
    },
    twitter: {
      card: 'summary_large_image',
      title: `Mobile Tyre Fitting ${area.name}`,
      description: area.summary,
      images: ['/edinburgh-tyre-fitting-hero.png'],
    },
  };
}

export default async function AreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const area = getServiceArea(slug);

  if (!area) notFound();

  return (
    <main className="area-page">
      <section className="area-hero">
        <span className="eyebrow">
          <MapPin size={16} aria-hidden="true" />
          {area.distance} from Edinburgh
        </span>
        <h1>Mobile tyre fitting in {area.name}</h1>
        <p>{area.summary}</p>
        <p>
          Use the main booking form to request fitting, puncture repair, locking wheel nut help or emergency tyre
          assistance. The team will review your location, tyre details and preferred time before confirming the
          call-out.
        </p>
        <div className="button-row">
          <Link className="primary-button" href="/#book">
            Book now
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link className="secondary-button" href="/">
            Back to Edinburgh Tyre Fitting
          </Link>
        </div>
      </section>
    </main>
  );
}
