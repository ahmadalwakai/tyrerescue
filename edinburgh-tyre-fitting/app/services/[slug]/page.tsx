import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { getServiceBySlug, serviceOptions } from '@/lib/pricing';
import { serviceAreas, siteConfig } from '@/lib/site';

export function generateStaticParams() {
  return serviceOptions.map((service) => ({ slug: service.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = getServiceBySlug(slug);

  if (!service) return {};

  return {
    title: service.seoTitle,
    description: `${service.longDescription} Book online with ${siteConfig.name}.`,
    alternates: {
      canonical: `${siteConfig.url}/services/${service.slug}`,
    },
    openGraph: {
      title: service.seoTitle,
      description: service.longDescription,
      url: `${siteConfig.url}/services/${service.slug}`,
      siteName: siteConfig.name,
      type: 'website',
      images: ['/edinburgh-tyre-fitting-hero.png'],
    },
    twitter: {
      card: 'summary_large_image',
      title: service.seoTitle,
      description: service.longDescription,
      images: ['/edinburgh-tyre-fitting-hero.png'],
    },
  };
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = getServiceBySlug(slug);

  if (!service) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.seoTitle,
    description: service.longDescription,
    provider: {
      '@type': 'AutoRepair',
      name: siteConfig.name,
      url: siteConfig.url,
      telephone: siteConfig.phone,
    },
    areaServed: serviceAreas.map((area) => area.name),
    offers: {
      '@type': 'Offer',
      priceCurrency: 'GBP',
      description: 'Live quote provided at booking from Tyre Rescue pricing.',
      availability: 'https://schema.org/InStock',
    },
  };

  return (
    <main className="area-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="area-hero service-page-hero">
        <span className="eyebrow">Edinburgh service</span>
        <h1>{service.seoTitle}</h1>
        <p>{service.longDescription}</p>
        <div className="service-includes">
          {service.includes.map((item) => (
            <span key={item}>
              <CheckCircle2 size={18} aria-hidden="true" />
              {item}
            </span>
          ))}
        </div>
        <div className="button-row">
          <Link className="primary-button" href="/#book">
            Book this service
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link className="secondary-button" href="/#services">
            View all services
          </Link>
        </div>
      </section>
    </main>
  );
}
