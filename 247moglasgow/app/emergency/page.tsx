import type { Metadata } from 'next';
import Link from 'next/link';
import { AnimatedItem, AnimatedSection } from '@/components/Animated';
import { CtaBanner } from '@/components/CtaBanner';
import { FaqBlock } from '@/components/FaqBlock';
import { JsonLd } from '@/components/JsonLd';
import { EMERGENCY_FAQS } from '@/lib/content';
import { getBreadcrumbSchema, getFAQSchema, getServiceSchema } from '@/lib/schemas';
import { PHONE_DISPLAY, PHONE_TEL, SITE_URL, WHATSAPP } from '@/lib/seo-data';

export const metadata: Metadata = {
  title: { absolute: 'Emergency Tyre Fitting Glasgow | 24/7 | 35 Min | 247 Mo Glasgow' },
  description:
    'Emergency tyre fitting in Glasgow 24/7. Call 0141 266 0690 for urgent mobile tyre replacement and puncture help across G1-G78.',
  alternates: { canonical: `${SITE_URL}/emergency` },
};

const steps = ['Call 0141 266 0690', 'Fitter dispatched', 'Tyre fitted'];

export default function EmergencyPage() {
  return (
    <main className="site-shell">
      <JsonLd data={getServiceSchema('Emergency Tyre Fitting', 'Glasgow')} />
      <JsonLd data={getFAQSchema(EMERGENCY_FAQS)} />
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Emergency', path: '/emergency' },
        ])}
      />
      <section className="page-hero page-hero-orange">
        <div className="container">
          <p className="eyebrow">Emergency Glasgow tyre callout</p>
          <h1>WE ARE ON OUR WAY.</h1>
          <p>
            24/7 emergency tyre fitting across Glasgow. Call now, speak to a real dispatcher and get a mobile tyre
            fitter moving toward you.
          </p>
          <a className="cta-phone" href={`tel:${PHONE_TEL}`}>
            {PHONE_DISPLAY}
          </a>
          <div className="button-row">
            <a className="button button-dark" href={`tel:${PHONE_TEL}`}>
              Call Now
            </a>
            <a className="button button-whatsapp" href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer">
              WhatsApp Us
            </a>
            <Link className="button button-outline" href="/book">
              Book Online
            </Link>
          </div>
        </div>
      </section>

      <section className="section section-dark">
        <AnimatedSection className="container content-band">
          <div className="content-panel">
            <h2>Urgent tyre help across Glasgow</h2>
            <p>
              Flat tyre, blowout, pothole damage or a tyre warning before a journey - 247 Mo Glasgow can dispatch a
              mobile tyre fitter to safe roadside locations, homes, workplaces and car parks.
            </p>
            <p>
              Average response is 35 minutes across Glasgow, with faster arrival often possible around the city centre,
              Parkhead, Dennistoun, Partick and the M8 corridor.
            </p>
          </div>
          <div className="content-panel emergency-steps">
            {steps.map((step, index) => (
              <AnimatedItem key={step} delay={index * 0.1}>
                <div>
                  <span className="step-number">{index + 1}</span>
                  <h3>{step}</h3>
                </div>
              </AnimatedItem>
            ))}
          </div>
        </AnimatedSection>
      </section>

      <FaqBlock faqs={EMERGENCY_FAQS} title="Emergency FAQ" />
      <CtaBanner title="EMERGENCY TYRE FITTING GLASGOW - CALL NOW." />
    </main>
  );
}
