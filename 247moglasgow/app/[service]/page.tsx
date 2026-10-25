import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AnimatedItem, AnimatedSection } from '@/components/Animated';
import { AreaGrid } from '@/components/AreaGrid';
import { CtaBanner } from '@/components/CtaBanner';
import { FaqBlock } from '@/components/FaqBlock';
import { JsonLd } from '@/components/JsonLd';
import { ServiceGrid } from '@/components/ServiceGrid';
import { getServiceBySlug, getServiceFaqs, SERVICE_DESCRIPTIONS } from '@/lib/content';
import { getBreadcrumbSchema, getFAQSchema, getServiceSchema } from '@/lib/schemas';
import { PHONE_TEL, SERVICES, SITE_URL, WHATSAPP } from '@/lib/seo-data';

type PageProps = {
  params: Promise<{ service: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return SERVICES.map((service) => ({ service: service.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { service: serviceSlug } = await params;
  const service = getServiceBySlug(serviceSlug);

  if (!service) {
    return { title: 'Service Not Found' };
  }

  return {
    title: { absolute: service.metaTitle },
    description: service.metaDesc,
    alternates: { canonical: `${SITE_URL}/${service.slug}` },
    openGraph: {
      title: service.metaTitle,
      description: service.metaDesc,
      url: `${SITE_URL}/${service.slug}`,
      type: 'website',
    },
  };
}

export default async function ServicePage({ params }: PageProps) {
  const { service: serviceSlug } = await params;
  const service = getServiceBySlug(serviceSlug);

  if (!service) notFound();

  const faqs = getServiceFaqs(service.name);

  return (
    <main className="site-shell">
      <JsonLd data={getServiceSchema(service.name, 'Glasgow')} />
      <JsonLd data={getFAQSchema(faqs)} />
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: service.name, path: `/${service.slug}` },
        ])}
      />
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow">247 Mo Glasgow</p>
          <h1>{service.h1}</h1>
          <p>{service.heroText}</p>
          <div className="hero-meta">
            <span>{service.priceFrom}</span>
            <span>Average 35 min response</span>
            <span>All Glasgow postcodes</span>
          </div>
          <div className="button-row" style={{ marginTop: '30px' }}>
            <a className="button button-orange" href={`tel:${PHONE_TEL}`}>
              Call Now
            </a>
            <Link className="button button-outline" href="/book">
              Book Online
            </Link>
            <a className="button button-whatsapp" href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer">
              WhatsApp Us
            </a>
          </div>
        </div>
      </section>

      <section className="section section-dark">
        <AnimatedSection className="container content-band">
          <div className="content-panel">
            <h2>{service.name} across Glasgow</h2>
            <p>{SERVICE_DESCRIPTIONS[service.slug]}</p>
            <p>
              247 Mo Glasgow covers G1 through G78 with mobile tyre vans dispatched from the Glasgow area. We fit
              tyres at homes, workplaces, roadside locations and car parks where it is safe to work.
            </p>
          </div>
          <div className="content-panel">
            <h3>What you get</h3>
            <ul>
              <li>Direct Glasgow tyre fitters</li>
              <li>Budget, mid-range and premium tyres</li>
              <li>Mobile fitting with no garage visit</li>
              <li>Emergency and same-day availability</li>
            </ul>
          </div>
        </AnimatedSection>
      </section>

      <section className="section section-dark">
        <AnimatedSection className="container">
          <p className="eyebrow">How it works</p>
          <h2 className="section-title">CALL. DISPATCH. FITTED.</h2>
          <div className="steps-grid">
            {['Call or book online', 'Fitter dispatched immediately', 'Tyre fitted at your location'].map(
              (step, index) => (
                <AnimatedItem key={step} delay={index * 0.1}>
                  <div className="card step-card">
                    <span className="step-number">{index + 1}</span>
                    <h3>{step}</h3>
                    <p>
                      {index === 0
                        ? 'Tell us your location and tyre size if you have it.'
                        : index === 1
                          ? 'A Glasgow mobile tyre fitter is routed to you.'
                          : 'We complete the fitting or repair safely at your location.'}
                    </p>
                  </div>
                </AnimatedItem>
              ),
            )}
          </div>
        </AnimatedSection>
      </section>

      <AreaGrid serviceSlug={service.slug} />
      <ServiceGrid />
      <FaqBlock faqs={faqs} title={`${service.name} FAQ`} />
      <CtaBanner title={`${service.name.toUpperCase()} IN GLASGOW? CALL 247 MO NOW.`} />
    </main>
  );
}
