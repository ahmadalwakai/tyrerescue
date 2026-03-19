/**
 * Single source of truth for all FAQ content across the site.
 * Used by both the FAQ page UI and FAQPage JSON-LD structured data.
 */

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: 'emergency' | 'services' | 'booking' | 'tyres' | 'payment' | 'general';
  isHomepageVisible: boolean;
}

export const faqItems: FAQItem[] = [
  // ── Emergency & Response ──────────────────────────────
  {
    id: 'emergency-response-time',
    question: 'How quickly can you get to me in an emergency?',
    answer:
      'For emergency callouts in Glasgow and Edinburgh city centres, we typically arrive within 45 minutes. For surrounding areas across Central Scotland, arrival times vary based on distance but we always provide an accurate ETA when you book.',
    category: 'emergency',
    isHomepageVisible: true,
  },
  {
    id: 'emergency-availability',
    question: 'Are you available 24 hours a day for emergencies?',
    answer:
      'We operate from 8 am to midnight, seven days a week, including bank holidays. Emergency callouts are available throughout our operating hours. When you book, our system dispatches the nearest available fitter to your location.',
    category: 'emergency',
    isHomepageVisible: false,
  },
  {
    id: 'roadside-assistance',
    question: 'Can you come to me if I am stuck at the roadside?',
    answer:
      'Yes. Our mobile fitters attend roadside callouts across Glasgow, Edinburgh, and surrounding areas. Whether you are on a main road, motorway hard shoulder, or a side street, we come to your exact location. Simply share your position when booking and we will dispatch a fitter.',
    category: 'emergency',
    isHomepageVisible: false,
  },

  // ── Coverage ──────────────────────────────────────────
  {
    id: 'coverage-areas',
    question: 'What areas do you cover?',
    answer:
      'We cover Glasgow, Edinburgh, and all surrounding areas across Central Scotland. This includes Paisley, East Kilbride, Hamilton, Livingston, Falkirk, Stirling, Perth, Dundee, and many more locations. Enter your postcode when booking and our system confirms whether we can reach you.',
    category: 'general',
    isHomepageVisible: true,
  },

  // ── Services ──────────────────────────────────────────
  {
    id: 'puncture-repair-vs-replacement',
    question: 'Can you repair my puncture or do I need a new tyre?',
    answer:
      'Our fitters assess every puncture on arrival. Repairs are only possible when the damage is in the central tread area and the tyre structure is intact. Sidewall damage, shoulder damage, or multiple punctures require a full replacement. If a repair is viable it is always offered as the more affordable option.',
    category: 'services',
    isHomepageVisible: true,
  },
  {
    id: 'fitting-duration',
    question: 'How long does a mobile tyre fitting take?',
    answer:
      'A single tyre fitting typically takes around 30 minutes. If you need multiple tyres replaced, allow roughly 30 minutes per tyre. Emergency callouts including travel time are usually completed within an hour of booking.',
    category: 'services',
    isHomepageVisible: true,
  },
  {
    id: 'home-workplace-fitting',
    question: 'Can you fit tyres at my home or workplace?',
    answer:
      'Absolutely. Our mobile service comes to wherever you are — your driveway, office car park, or any safe, accessible location. You do not need to visit a garage. Just make sure the vehicle is parked on a level, firm surface with enough space around it for our fitter to work safely.',
    category: 'services',
    isHomepageVisible: false,
  },
  {
    id: 'tpms-reset',
    question: 'Do you reset tyre pressure monitoring systems (TPMS)?',
    answer:
      'Yes. If your vehicle has a tyre pressure monitoring system, we offer a TPMS reset as part of the fitting. This is available as an add-on during booking so the warning light is cleared before we leave.',
    category: 'services',
    isHomepageVisible: false,
  },

  // ── Tyres & Brands ───────────────────────────────────
  {
    id: 'tyre-brands',
    question: 'What brands of tyres do you stock?',
    answer:
      'We carry a wide range including premium brands such as Michelin, Continental, Goodyear, Pirelli, Bridgestone, and Dunlop, as well as quality mid-range and budget options. We also stock part-worn tyres. The full selection is shown during booking once you enter your tyre size.',
    category: 'tyres',
    isHomepageVisible: false,
  },
  {
    id: 'own-tyres',
    question: 'Do you fit tyres I have already purchased?',
    answer:
      'We primarily fit tyres purchased through our service to ensure quality and warranty coverage. If you already have tyres that need fitting, please call us on 0141 266 0690 to discuss your requirements.',
    category: 'tyres',
    isHomepageVisible: true,
  },
  {
    id: 'tyre-size-help',
    question: 'I do not know my tyre size. Can you still help?',
    answer:
      'Yes. During booking you can enter your vehicle registration and we look up the correct tyre size automatically. Alternatively, the size is printed on the sidewall of your current tyre — our booking system includes guidance on where to find it.',
    category: 'tyres',
    isHomepageVisible: false,
  },

  // ── Booking & Process ─────────────────────────────────
  {
    id: 'booking-process',
    question: 'How does the booking process work?',
    answer:
      'Book online in minutes: choose your service type, enter your tyre size or registration, pick a time slot, provide your location, and pay securely. Once confirmed, a fitter is assigned and you can track their arrival in real time on our live tracking page.',
    category: 'booking',
    isHomepageVisible: false,
  },
  {
    id: 'booking-info-needed',
    question: 'What information do I need to provide when booking?',
    answer:
      'You will need your vehicle registration (or tyre size), your location, and a contact phone number. We also ask whether you have a locking wheel nut key — if your wheels use locking nuts and you do not have the key, our fitter may not be able to remove the wheel.',
    category: 'booking',
    isHomepageVisible: false,
  },
  {
    id: 'locking-wheel-nuts',
    question: 'What if I do not have my locking wheel nut key?',
    answer:
      'During booking we ask whether you have the key. If you select "no key", we will let you know that our fitter may not be able to remove the affected wheel. It is best to check your glovebox or boot before booking. If the key is missing, a dealer or specialist locksmith can supply a replacement.',
    category: 'booking',
    isHomepageVisible: false,
  },

  // ── Payment ───────────────────────────────────────────
  {
    id: 'payment-methods',
    question: 'What payment methods do you accept?',
    answer:
      'We accept all major credit and debit cards, Apple Pay, and Google Pay through our secure online checkout powered by Stripe. Payment is taken at the time of booking.',
    category: 'payment',
    isHomepageVisible: true,
  },

  // ── Cancellations ─────────────────────────────────────
  {
    id: 'cancellation-policy',
    question: 'Can I cancel or change my booking?',
    answer:
      'Yes. If you cancel more than two hours before your appointment you receive a full refund. Cancellations within two hours or after a fitter has been dispatched are subject to a non-refundable callout fee. Full details are on our refund policy page.',
    category: 'payment',
    isHomepageVisible: false,
  },

  // ── Warranty ──────────────────────────────────────────
  {
    id: 'warranty',
    question: 'Do you provide a warranty on fitted tyres?',
    answer:
      'All new tyres come with the full manufacturer warranty. Our fitting work is also guaranteed — if you experience any issue caused by our fitting, we will resolve it at no extra cost. Part-worn tyres are sold as-is and do not carry a manufacturer warranty.',
    category: 'general',
    isHomepageVisible: false,
  },
];

/**
 * Build a valid FAQPage JSON-LD object from our FAQ data.
 * Pass a subset or the full array — only the items you pass are included in the schema.
 */
export function buildFAQPageJsonLd(items: FAQItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

/** FAQ items shown on the homepage (curated subset). */
export const homepageFAQItems = faqItems.filter((item) => item.isHomepageVisible);
