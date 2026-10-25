import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AnimatedSection } from '@/components/Animated';
import { AreaGrid } from '@/components/AreaGrid';
import { CtaBanner } from '@/components/CtaBanner';
import { FaqBlock } from '@/components/FaqBlock';
import { JsonLd } from '@/components/JsonLd';
import { getAreaBySlug, getAreaFaqs, getNearbyAreas, getServiceBySlug, SERVICE_DESCRIPTIONS } from '@/lib/content';
import { getBreadcrumbSchema, getFAQSchema, getServiceSchema } from '@/lib/schemas';
import { GLASGOW_AREAS, PHONE_TEL, SERVICES, SITE_URL, WHATSAPP } from '@/lib/seo-data';

type PageProps = {
  params: Promise<{ service: string; area: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return SERVICES.flatMap((service) =>
    GLASGOW_AREAS.map((area) => ({
      service: service.slug,
      area: area.slug,
    })),
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { service: serviceSlug, area: areaSlug } = await params;
  const service = getServiceBySlug(serviceSlug);
  const area = getAreaBySlug(areaSlug);

  if (!service || !area) {
    return { title: 'Area Not Found' };
  }

  const title = `${service.name} ${area.name} Glasgow | ${service.priceFrom} | 247 Mo Glasgow`;
  const description = `${service.name} in ${area.name}, Glasgow. Typical ${area.etaMin} minute response for ${area.postcode}. 24/7 mobile tyre fitting and puncture support.`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${SITE_URL}/${service.slug}/${area.slug}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/${service.slug}/${area.slug}`,
      type: 'website',
    },
  };
}

export default async function ServiceAreaPage({ params }: PageProps) {
  const { service: serviceSlug, area: areaSlug } = await params;
  const service = getServiceBySlug(serviceSlug);
  const area = getAreaBySlug(areaSlug);

  if (!service || !area) notFound();

  const faqs = getAreaFaqs(service.name, area.name, area.etaMin);
  const nearbyAreas = getNearbyAreas(area.slug);

  return (
    <main className="site-shell">
      <JsonLd data={getServiceSchema(service.name, `${area.name}, Glasgow`)} />
      <JsonLd data={getFAQSchema(faqs)} />
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: service.name, path: `/${service.slug}` },
          { name: area.name, path: `/${service.slug}/${area.slug}` },
        ])}
      />
      <section className="page-hero">
        <div className="container">
          <p className="eyebrow">{area.postcode} · {area.etaMin} min typical ETA</p>
          <h1>
            {service.name} {area.name} Glasgow
          </h1>
          <p>
            {service.heroText} Our typical response for {area.name} is around {area.etaMin} minutes, with direct
            Glasgow fitters covering {area.postcode} and nearby postcodes day and night.
          </p>
          <div className="hero-meta">
            <span>{service.priceFrom}</span>
            <span>{area.postcode}</span>
            <span>24/7 Glasgow response</span>
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
            <h2>
              Fast {service.name} in {area.name}
            </h2>
            <p>{SERVICE_DESCRIPTIONS[service.slug]}</p>
            <p>
              We serve {area.name} from the Glasgow mobile tyre network with same-day and emergency availability.
              Whether you are at home, work or stuck roadside, we can fit or repair tyres where it is safe to work.
            </p>
          </div>
          <div className="content-panel">
            <h3>{area.name} coverage</h3>
            <ul>
              <li>Typical ETA: {area.etaMin} minutes</li>
              <li>Postcode focus: {area.postcode}</li>
              <li>Mobile fitting, puncture repair and emergency tyres</li>
              <li>Nearby routes linked for fast dispatch</li>
            </ul>
          </div>
        </AnimatedSection>
      </section>

      <AreaGrid
        areas={nearbyAreas}
        serviceSlug={service.slug}
        title={`NEARBY ${area.name.toUpperCase()} AREAS`}
        lead={`We also cover nearby Glasgow areas around ${area.name} with the same mobile tyre fitting response.`}
      />
      <FaqBlock faqs={faqs} title={`${area.name} ${service.name} FAQ`} />
      <CtaBanner title={`FLAT TYRE IN ${area.name.toUpperCase()}? WE'RE READY.`} />
    </main>
  );
}
