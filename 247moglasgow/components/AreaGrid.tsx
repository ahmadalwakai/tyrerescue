import Link from 'next/link';
import { AnimatedItem, AnimatedSection } from '@/components/Animated';
import { GLASGOW_AREAS } from '@/lib/seo-data';

type Area = (typeof GLASGOW_AREAS)[number];

export function AreaGrid({
  areas = GLASGOW_AREAS,
  serviceSlug = 'mobile-tyre-fitting',
  title = 'WE COVER ALL OF GLASGOW',
  lead = "From Bearsden to Castlemilk, Drumchapel to Baillieston - if it's a Glasgow postcode, we're there.",
}: {
  areas?: readonly Area[];
  serviceSlug?: string;
  title?: string;
  lead?: string;
}) {
  return (
    <section className="section section-black areas-section">
      <AnimatedSection className="container">
        <p className="eyebrow">Glasgow coverage</p>
        <h2 className="section-title bordered-title">{title}</h2>
        <p className="lead area-lead">{lead}</p>
        <div className="area-grid">
          {areas.map((area, index) => (
            <AnimatedItem key={area.slug} delay={index * 0.015}>
              <Link className="area-chip" href={`/${serviceSlug}/${area.slug}`}>
                <span>{area.name}</span>
                <small>
                  {area.postcode} · {area.etaMin} min
                </small>
              </Link>
            </AnimatedItem>
          ))}
        </div>
      </AnimatedSection>
    </section>
  );
}
