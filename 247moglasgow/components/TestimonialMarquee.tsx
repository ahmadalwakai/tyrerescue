'use client';

import { AnimatedSection } from '@/components/Animated';

const TESTIMONIALS_ROW1 = [
  { name: 'James M.', area: 'G42', quote: 'Flat tyre at 2am on the M8. Called 247 Mo, fitter arrived in 28 minutes. Absolute lifesavers.' },
  { name: 'Sarah K.', area: 'G12', quote: 'Brilliant service. Came to my workplace in under 40 minutes and sorted the tyre while I was in a meeting.' },
  { name: 'David R.', area: 'G31', quote: 'Professional, fast and fair price. The fitter knew exactly what he was doing. Highly recommend.' },
  { name: 'Fiona T.', area: 'G1', quote: 'Locked wheel nut removal done in 20 minutes at my home. Saved me a fortune vs the garage price.' },
  { name: 'Mark B.', area: 'G21', quote: 'Emergency callout at Christmas. They actually came out and sorted my car. Five stars, no question.' },
  { name: 'Claire W.', area: 'G41', quote: 'Needed two tyres on a Sunday morning. Booked online, fitter came within the hour. Easy process.' },
];

const TESTIMONIALS_ROW2 = [
  { name: 'Ali H.', area: 'G51', quote: 'Puncture on the Clydeside at night. Friendly fitter, great equipment. Back on the road in 25 minutes.' },
  { name: 'Kat D.', area: 'G13', quote: 'Quoted me honestly and matched a competitor price. Great tyres, properly fitted. Will use again.' },
  { name: 'Ross P.', area: 'G44', quote: 'Third time using 247 Mo. They never disappoint. Fast, professional, reasonably priced.' },
  { name: 'Lynn A.', area: 'G11', quote: 'My daughter broke down near Glasgow Uni. They were there in 30 minutes. Really reassuring service.' },
  { name: 'Connor F.', area: 'G61', quote: 'Came all the way to Bearsden on a Sunday evening. Great attitude, great service.' },
  { name: 'Priya S.', area: 'G3', quote: 'Booked via WhatsApp, fitter confirmed in minutes, arrived exactly on time. Seamless experience.' },
];

function StarRating() {
  return (
    <span className="tcard-stars" aria-label="5 stars">
      ★★★★★
    </span>
  );
}

function TestimonialCard({ name, area, quote }: { name: string; area: string; quote: string }) {
  return (
    <div className="tcard">
      <StarRating />
      <p className="tcard-quote">&ldquo;{quote}&rdquo;</p>
      <div className="tcard-meta">
        <span className="tcard-name">{name}</span>
        <span className="tcard-area">{area}</span>
      </div>
    </div>
  );
}

function MarqueeRow({ items, reverse = false }: { items: typeof TESTIMONIALS_ROW1; reverse?: boolean }) {
  const all = [...items, ...items, ...items];
  return (
    <div className="marquee-row" aria-hidden={reverse}>
      <div className={`marquee-track ${reverse ? 'marquee-reverse' : ''}`}>
        {all.map((item, i) => (
          <TestimonialCard key={`${item.name}-${i}`} {...item} />
        ))}
      </div>
    </div>
  );
}

export function TestimonialMarquee() {
  return (
    <section className="section testimonial-section" aria-label="Customer testimonials">
      <AnimatedSection>
        <div className="testimonial-head">
          <p className="eyebrow">Real Reviews</p>
          <h2 className="section-title">WHAT GLASGOW SAYS</h2>
          <p className="testimonial-rating">
            <span className="testimonial-stars">★★★★★</span> 4.9 average · Google &amp; Facebook
          </p>
        </div>
      </AnimatedSection>
      <div className="marquee-wrapper">
        <MarqueeRow items={TESTIMONIALS_ROW1} />
        <MarqueeRow items={TESTIMONIALS_ROW2} reverse />
      </div>
    </section>
  );
}
