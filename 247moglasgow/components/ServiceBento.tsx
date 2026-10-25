import Link from 'next/link';
import Image from 'next/image';
import { AnimatedItem, AnimatedSection } from '@/components/Animated';

export function ServiceBento() {
  return (
    <section className="section services-section" id="services">
      <div className="container">
        <AnimatedSection>
          <p className="eyebrow">What We Do</p>
          <h2 className="section-title bordered-title">SERVICES</h2>
        </AnimatedSection>

        <div className="bento-grid">
          {/* Emergency — large */}
          <AnimatedItem delay={0.05}>
            <Link href="/book?type=emergency" className="bento-card bento-emergency">
              <div className="bento-emergency-inner">
                <span className="bento-badge">~35 MIN</span>
                <div>
                  <svg className="bento-icon-svg" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                    <path d="M13 2 4.5 13.5H11L10 22l9.5-11.5H13.5L13 2Z" />
                  </svg>
                  <h3 className="bento-title">EMERGENCY CALLOUT</h3>
                  <p className="bento-sub">Fitter dispatched immediately to your location. 24/7, 365.</p>
                </div>
                <span className="bento-arrow">→</span>
              </div>
            </Link>
          </AnimatedItem>

          {/* Tyre Replacement */}
          <AnimatedItem delay={0.1}>
            <Link href="/mobile-tyre-fitting" className="bento-card bento-dark">
              <span className="bento-icon">🔧</span>
              <h3 className="bento-title-dark">TYRE REPLACEMENT</h3>
              <p className="bento-sub-dark">Budget to premium brands. Fitted where you are.</p>
              <span className="bento-price">From £49</span>
            </Link>
          </AnimatedItem>

          {/* Locking Nut Removal */}
          <AnimatedItem delay={0.15}>
            <Link href="/tyre-fitting" className="bento-card bento-dark">
              <span className="bento-icon">🔩</span>
              <h3 className="bento-title-dark">LOCKING NUT REMOVAL</h3>
              <p className="bento-sub-dark">Lost your locking wheel nut key? We remove them on site.</p>
              <span className="bento-price">From £60</span>
            </Link>
          </AnimatedItem>

          {/* Workshop strip */}
          <AnimatedItem delay={0.2}>
            <div className="bento-card bento-workshop">
              <div className="bento-workshop-text">
                <p className="bento-workshop-label">OWN WORKSHOP</p>
                <p className="bento-workshop-name">PARKHEAD · G31</p>
                <p className="bento-workshop-address">3 Gateside Street, Glasgow G31 1PD</p>
                <div className="bento-trust-badges">
                  <span>✓ Fully Insured</span>
                  <span>✓ Real Stock</span>
                  <span>✓ Direct Dispatch</span>
                </div>
              </div>
              <div className="bento-workshop-map">
                <Image
                  src={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/-4.2127,55.8554,13,0/480x220@2x?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''}`}
                  alt="247 Mo Glasgow workshop location in Parkhead G31"
                  width={480}
                  height={220}
                  loading="lazy"
                />
              </div>
            </div>
          </AnimatedItem>

          {/* Puncture Repair */}
          <AnimatedItem delay={0.12}>
            <Link href="/puncture-repair" className="bento-card bento-dark">
              <span className="bento-icon">🛠️</span>
              <h3 className="bento-title-dark">PUNCTURE REPAIR</h3>
              <p className="bento-sub-dark">Repaired on site where legally safe to do so.</p>
              <span className="bento-price">From £30</span>
            </Link>
          </AnimatedItem>
        </div>
      </div>
    </section>
  );
}
