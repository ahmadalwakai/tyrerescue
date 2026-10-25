import Link from 'next/link';
import { AnimatedItem, AnimatedSection } from '@/components/Animated';
import { SERVICE_DESCRIPTIONS, SERVICE_ICONS } from '@/lib/content';
import { SERVICES } from '@/lib/seo-data';

export function ServiceGrid() {
  return (
    <section className="section section-black services-section">
      <AnimatedSection className="container">
        <h2 className="section-title bordered-title">WHAT WE DO</h2>
        <p className="lead service-sub">Every Glasgow tyre job, done at your location.</p>
        <div className="services-grid">
          {SERVICES.map((service, index) => (
            <AnimatedItem key={service.slug} delay={index * 0.1}>
              <Link className="service-card" href={`/${service.slug}`}>
                <span className="service-icon" aria-hidden="true">
                  {SERVICE_ICONS[service.slug]}
                </span>
                <h3>{service.name}</h3>
                <p className="service-price">{service.priceFrom}</p>
                <p>{SERVICE_DESCRIPTIONS[service.slug]}</p>
                <span className="service-link">→</span>
              </Link>
            </AnimatedItem>
          ))}
        </div>
      </AnimatedSection>
    </section>
  );
}
