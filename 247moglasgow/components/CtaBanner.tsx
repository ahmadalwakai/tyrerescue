import Link from 'next/link';
import { PHONE_DISPLAY, PHONE_TEL } from '@/lib/seo-data';

export function CtaBanner({ title = 'FLAT TYRE IN GLASGOW?' }: { title?: string }) {
  return (
    <section className="cta-banner">
      {/* Testimonial above CTA */}
      <div className="cta-quote-wrap">
        <blockquote className="cta-quote">
          <span className="cta-quote-mark" aria-hidden="true">&ldquo;</span>
          Flat tyre at 2am on the M8. Called 247 Mo, fitter arrived in 28 minutes. Absolute lifesavers.
          <cite className="cta-cite">— Mark T., G3 Glasgow</cite>
        </blockquote>
      </div>

      <div className="container cta-inner">
        <h2 className="cta-title">{title}</h2>
        <p className="cta-sub">WE&apos;RE 35 MINUTES AWAY. CALL NOW.</p>
        <div className="cta-buttons">
          <a className="cta-btn-primary" href={`tel:${PHONE_TEL}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.3 1 .3 2 .5 3.1.5.7 0 1.3.6 1.3 1.3v3.5c0 .7-.6 1.3-1.3 1.3C10.2 21.5 2.5 13.8 2.5 4.3 2.5 3.6 3.1 3 3.8 3h3.5c.7 0 1.3.6 1.3 1.3 0 1.1.2 2.1.5 3.1.1.4 0 .9-.3 1.2l-2.2 2.2Z" />
            </svg>
            CALL {PHONE_DISPLAY}
          </a>
          <Link className="cta-btn-secondary" href="/book">
            BOOK ONLINE →
          </Link>
        </div>
      </div>
    </section>
  );
}
