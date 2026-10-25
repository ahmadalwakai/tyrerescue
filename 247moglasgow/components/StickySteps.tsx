import { AnimatedItem, AnimatedSection } from '@/components/Animated';

const STEPS = [
  {
    number: '01',
    title: 'BOOK IN 60 SECONDS',
    body: 'Call, WhatsApp, or book online. No holding, no call centres — straight through to dispatch.',
  },
  {
    number: '02',
    title: 'FITTER DISPATCHED IMMEDIATELY',
    body: 'A direct Glasgow fitter is routed to you with the right tyres. You get a call to confirm.',
  },
  {
    number: '03',
    title: 'TYRE FITTED WHERE YOU ARE',
    body: 'Roadside, home, workplace or car park — we fit where it is safe and suits you.',
  },
];

export function StickySteps() {
  return (
    <section className="section how-strip">
      <div className="container">
        <AnimatedSection>
          <p className="eyebrow" style={{ color: 'rgba(0,0,0,0.6)' }}>Simple Process</p>
          <h2 className="section-title" style={{ color: '#000' }}>HOW IT WORKS</h2>
        </AnimatedSection>
        <div className="steps-list">
          {STEPS.map((step, i) => (
            <AnimatedItem key={step.number} delay={i * 0.1}>
              <div className="step-row">
                <span className="step-num">{step.number}</span>
                <div className="step-content">
                  <h3 className="step-title">{step.title}</h3>
                  <p className="step-body">{step.body}</p>
                </div>
              </div>
            </AnimatedItem>
          ))}
        </div>
      </div>
    </section>
  );
}
