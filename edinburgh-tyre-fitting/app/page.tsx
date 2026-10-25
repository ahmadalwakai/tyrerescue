import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  Map,
  MapPin,
  Navigation,
  Phone,
  ShieldCheck,
  Wrench,
  Zap,
} from 'lucide-react';
import { BookingForm } from '@/components/BookingForm';
import { MotionEnhancer } from '@/components/MotionEnhancer';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { faqs, serviceAreas, siteConfig } from '@/lib/site';
import { serviceOptions } from '@/lib/pricing';

function JsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    name: siteConfig.name,
    url: siteConfig.url,
    telephone: siteConfig.phone,
    areaServed: [
      'Edinburgh',
      'Leith',
      'Musselburgh',
      'Dalkeith',
      'Livingston',
      'Linlithgow',
      'North Berwick',
      'Penicuik',
      'Peebles',
      'Lothians',
    ],
    serviceArea: {
      '@type': 'GeoCircle',
      geoMidpoint: {
        '@type': 'GeoCoordinates',
        latitude: siteConfig.center.lat,
        longitude: siteConfig.center.lng,
      },
      geoRadius: `${siteConfig.serviceRadiusMiles} miles`,
    },
    makesOffer: serviceOptions.map((service) => ({
      '@type': 'Offer',
      itemOffered: {
        '@type': 'Service',
        name: service.label,
        description: service.description,
      },
    })),
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
    </>
  );
}

const heroHighlights = [
  { value: '30-60 min', label: 'Live ETA from available driver coverage' },
  { value: '50 mi', label: 'Edinburgh, Lothians and nearby countryside' },
  { value: 'Live price', label: 'Tyre Rescue stock, driver and distance pricing' },
];

const bookingSteps = [
  {
    title: 'Choose the help you need',
    text: 'Pick fitting, puncture repair, emergency call-out or locking wheel nut help.',
  },
  {
    title: 'Tell us where the vehicle is',
    text: 'Use a postcode, street, workplace, hotel, car park or safe roadside location.',
  },
  {
    title: 'Confirm tyre and contact details',
    text: 'Add tyre size if you know it. If not, we can check before arranging the visit.',
  },
  {
    title: 'Keep your phone close',
    text: 'We confirm timing, access and any final details before the call-out.',
  },
];

const experienceCards = [
  {
    icon: Map,
    title: 'Address search built for Edinburgh',
    text: 'Start typing a postcode or place and choose a suggested location inside the 50-mile area.',
  },
  {
    icon: CreditCard,
    title: 'Estimate before you submit',
    text: 'The booking shows a starting price, distance band and call-out estimate before you finish.',
  },
  {
    icon: Clock,
    title: 'Designed for urgent moments',
    text: 'Short steps, large controls and clear prompts make the form easier to use from a phone.',
  },
];

const serviceVisuals = [
  {
    src: '/duke-van.webp',
    alt: 'Mobile tyre fitting van ready for a roadside call-out',
  },
  {
    src: '/duke-puncture.webp',
    alt: 'Tyre puncture from a screw before mobile repair or replacement',
  },
  {
    src: '/duke-wheel-night.webp',
    alt: 'Night mobile tyre fitting after a roadside call-out',
  },
  {
    src: '/duke-wheel-bmw.webp',
    alt: 'Fresh tyre fitted on a BMW alloy wheel',
  },
];

const heroGallery = [
  {
    src: '/facebook-duke-01.jpg',
    label: 'Mobile fleet',
  },
  {
    src: '/facebook-duke-03.jpg',
    label: 'Tyre stock ready',
  },
  {
    src: '/facebook-duke-04.jpg',
    label: 'Wheel checks',
  },
];

const heroStripPhotos = [
  {
    src: '/facebook-duke-01.jpg',
    label: 'Mobile fleet',
  },
  {
    src: '/duke-wheel-bmw.webp',
    label: 'Wheel checks',
  },
  {
    src: '/facebook-duke-03.jpg',
    label: 'Tyre stock',
  },
];

const realWorkPhotos = [
  {
    src: '/facebook-duke-01.jpg',
    alt: 'Mobile tyre fitting vans ready for call-outs',
    label: 'Mobile fleet',
  },
  {
    src: '/facebook-duke-02.jpg',
    alt: 'Mobile tyre fitting van on the road',
    label: 'On the road',
  },
  {
    src: '/facebook-duke-03.jpg',
    alt: 'Fresh tyre stock ready for mobile fitting',
    label: 'Tyre stock',
  },
  {
    src: '/facebook-duke-04.jpg',
    alt: 'Wheel and tyre support at the vehicle',
    label: 'At the vehicle',
  },
  {
    src: '/facebook-duke-07.jpg',
    alt: 'Flat tyre inspected before mobile help',
    label: 'Puncture support',
  },
  {
    src: '/facebook-duke-08.jpg',
    alt: 'Wheel check before fitting or repair',
    label: 'Wheel checks',
  },
];

export default function HomePage() {
  return (
    <main className="page-shell">
      <JsonLd />
      <MotionEnhancer />
      <header className="topbar">
        <Link href="/" aria-label="Edinburgh Tyre Fitting home" style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <Image
            className="brand-logo"
            src="/edinburgh-tyre-fitting-logo.svg"
            alt=""
            width={180}
            height={64}
            priority
          />
          <strong className="brand-name">{siteConfig.name}</strong>
        </Link>
        <nav className="nav-actions" aria-label="Quick contact">
          <a className="nav-pill" href="#services">
            Services
          </a>
          <a className="nav-pill" href="#areas">
            Areas
          </a>
          <a className="nav-cta" href="#book">
            Book now
            <ArrowRight size={16} aria-hidden="true" />
          </a>
          <a className="icon-link" href={`tel:${siteConfig.phone.replace(/\s/g, '')}`} aria-label="Call Edinburgh Tyre Fitting">
            <Phone size={20} aria-hidden="true" />
          </a>
          <a
            className="icon-link whatsapp-link"
            href={`https://wa.me/${siteConfig.whatsapp}`}
            aria-label="WhatsApp Edinburgh Tyre Fitting"
          >
            <WhatsAppIcon className="whatsapp-icon" size={22} />
          </a>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <MapPin size={16} aria-hidden="true" />
            Mobile tyre fitting across Edinburgh and nearby countryside
          </span>
          <h1 className="hero-shimmer" data-shimmer="Mobile tyre help that comes to your exact location.">
            Mobile tyre help that comes to your exact location.
          </h1>
          <p className="hero-lede">
            Book from your driveway, workplace, hotel, car park or roadside. Share your current location, add the tyre
            size and get a live Tyre Rescue price before secure checkout.
          </p>
          <div className="hero-inline-photos" aria-label="Mobile tyre fitting photo highlights">
            {heroStripPhotos.map((photo) => (
              <figure className="hero-motion-card" key={photo.src}>
                <Image
                  src={photo.src}
                  alt=""
                  width={760}
                  height={500}
                  loading="eager"
                  sizes="(max-width: 920px) 100vw, 22vw"
                  unoptimized={photo.src.startsWith('/facebook-duke-')}
                />
                <figcaption>
                  {photo.label}
                  <ArrowRight size={15} aria-hidden="true" />
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="hero-actions">
            <a className="primary-button" href="#book">
              Start booking
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <a className="secondary-button" href={`tel:${siteConfig.phone.replace(/\s/g, '')}`}>
              <Phone size={18} aria-hidden="true" />
              Call
            </a>
          </div>
          <div className="hero-trust-line" aria-label="Service highlights">
            <span>
              <Zap size={16} aria-hidden="true" />
              Fast emergency response
            </span>
            <span>
              <ShieldCheck size={16} aria-hidden="true" />
              Fully insured fitting
            </span>
            <span>
              <CreditCard size={16} aria-hidden="true" />
              Secure card checkout
            </span>
          </div>
          <div className="hero-badge-row" aria-label="Booking highlights">
            {heroHighlights.map((item) => (
              <div className="hero-badge" key={item.value}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
        <BookingForm />
        <div className="hero-support">
          <div className="hero-image" aria-hidden="true">
            <Image
              src="/duke-van.webp"
              alt=""
              width={1600}
              height={1200}
              priority
            />
            <div className="image-caption">
              <span>Mobile workshop sent to your location</span>
              <strong>Edinburgh + 50 miles</strong>
            </div>
          </div>
          <div className="hero-gallery" aria-label="Mobile tyre fitting photo examples">
            {heroGallery.map((item) => (
              <figure key={item.src}>
                <Image
                  src={item.src}
                  alt=""
                  width={520}
                  height={680}
                  unoptimized={item.src.startsWith('/facebook-duke-')}
                />
                <figcaption>{item.label}</figcaption>
              </figure>
            ))}
          </div>
          <div className="proof-row">
            <div className="proof-item">
              <CheckCircle2 size={20} aria-hidden="true" />
              <strong>Clear before visit</strong>
              <span>We check tyre size, access and timing so the booking is not vague.</span>
            </div>
            <div className="proof-item">
              <Clock size={20} aria-hidden="true" />
              <strong>Same-day help</strong>
              <span>For fitting, punctures and urgent call-outs when availability allows.</span>
            </div>
            <div className="proof-item">
              <ShieldCheck size={20} aria-hidden="true" />
              <strong>Safety first</strong>
              <span>Roadside details and locking wheel nut status are captured before the visit.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="content-band real-work-band">
        <div className="band-inner real-work-layout">
          <div className="real-work-copy">
            <span className="eyebrow">
              <ShieldCheck size={16} aria-hidden="true" />
              Real mobile tyre work
            </span>
            <h2>Mobile tyre work customers can recognise.</h2>
            <p>
              Vans, tyre stock and wheel-detail photos give the service a clearer local feel before the customer
              confirms a visit.
            </p>
            <div className="real-work-points" aria-label="Photo-backed service proof">
              <span>Mobile vans</span>
              <span>Tyre stock</span>
              <span>Wheel checks</span>
              <span>Roadside support</span>
            </div>
          </div>
          <div className="real-work-grid" aria-label="Recent mobile tyre work photos">
            {realWorkPhotos.map((photo) => (
              <figure className="real-work-photo" key={photo.src}>
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  width={960}
                  height={720}
                  loading="eager"
                  sizes={photo.src === '/facebook-duke-01.jpg' ? '(max-width: 620px) 100vw, 36vw' : '(max-width: 620px) 50vw, 18vw'}
                  unoptimized
                />
                <figcaption>{photo.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="content-band journey-band">
        <div className="band-inner">
          <div className="section-head">
            <h2>A smoother booking from the first tap.</h2>
            <p>Each step asks only for the details needed to price, locate and prepare the tyre visit.</p>
          </div>
          <div className="journey-grid">
            {bookingSteps.map((step, index) => (
              <article className="journey-step" key={step.title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="content-band" id="services">
        <div className="band-inner">
          <div className="section-head">
            <h2>Choose the tyre service that matches the problem.</h2>
            <p>
              Clear service choices help customers book the right help first time, whether the vehicle is parked,
              stranded or missing a locking wheel nut key.
            </p>
          </div>
          <div className="service-detail-grid">
            {serviceOptions.map((service, index) => {
              const Icon = index === 0 ? Wrench : index === 1 ? ShieldCheck : Navigation;
              const visual = serviceVisuals[index];
              return (
                <Link className="service-detail" key={service.value} href={`/services/${service.slug}`}>
                  <Image src={visual.src} alt={visual.alt} width={720} height={540} loading="eager" />
                  <div className="service-icon">
                    <Icon size={24} aria-hidden="true" />
                  </div>
                  <span className="service-kicker">Live Tyre Rescue quote</span>
                  <h3>{service.label}</h3>
                  <p>{service.longDescription}</p>
                  <strong>
                    View service
                    <ArrowRight size={16} aria-hidden="true" />
                  </strong>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="content-band experience-band">
        <div className="band-inner experience-layout">
          <div className="experience-copy">
            <span className="eyebrow">Built for customers in a hurry</span>
            <h2>Less guessing, fewer phone calls, better booking details.</h2>
            <p>
              The page is tuned for real tyre emergencies: easy address entry, plain language, visible pricing cues and
              simple next steps.
            </p>
          </div>
          <div className="experience-grid">
            {experienceCards.map((card) => {
              const Icon = card.icon;
              return (
                <article className="experience-card" key={card.title}>
                  <Icon size={22} aria-hidden="true" />
                  <h3>{card.title}</h3>
                  <p>{card.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="content-band" id="areas">
        <div className="band-inner">
          <div className="section-head">
            <h2>Service areas around Edinburgh.</h2>
            <p>Book inside Edinburgh or nearby countryside routes up to 50 miles from the city centre.</p>
          </div>
          <div className="coverage-layout">
            <div className="coverage-panel">
              <MapPin size={28} aria-hidden="true" />
              <h3>50-mile booking area</h3>
              <p>
                The form checks distance from Edinburgh and shows a distance band where possible before the customer
                finishes the booking.
              </p>
              <a href="#book">
                Check your address
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
            <div className="area-grid compact-area-grid">
              {serviceAreas.map((area) => (
                <Link className="area-card" key={area.slug} href={`/areas/${area.slug}`}>
                  <h3>{area.name}</h3>
                  <p>{area.summary}</p>
                  <span>{area.distance}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="content-band faq-band">
        <div className="band-inner">
          <div className="section-head">
            <h2>Questions customers ask before booking.</h2>
            <p>Clear answers help customers book with the right tyre, location and timing details.</p>
          </div>
          <div className="faq-grid">
            {faqs.map((faq) => (
              <article className="faq-item" key={faq.question}>
                <h3>{faq.question}</h3>
                <p>{faq.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-inner">
          <span>{siteConfig.name}</span>
          <span>Mobile tyre fitting across Edinburgh and 50 miles around it.</span>
        </div>
      </footer>
    </main>
  );
}
