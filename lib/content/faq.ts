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
      'For emergency callouts in Glasgow and Edinburgh city centres, we typically arrive within 45 minutes. For other cities across Scotland — Aberdeen, Inverness, Dundee, Perth and beyond — response times vary by distance and we always provide an accurate ETA when you book.',
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
      'Yes. Our mobile fitters attend roadside callouts across all of Scotland — from Glasgow and Edinburgh to Aberdeen, Inverness, Fort William and the Highlands. Whether you are on a main road, motorway hard shoulder, or a rural B-road, we come to your exact location. Simply share your position when booking and we will dispatch the nearest available fitter.',
    category: 'emergency',
    isHomepageVisible: false,
  },

  // ── Coverage ──────────────────────────────────────────
  {
    id: 'coverage-areas',
    question: 'What areas do you cover?',
    answer:
      'We cover the whole of Scotland — from Glasgow, Edinburgh, Aberdeen and Inverness to the Highlands, Argyll, the Scottish Borders, Orkney, the Western Isles and Shetland. Every Scottish postcode from G to ZE is in our coverage area. Enter your postcode when booking and our system confirms your exact availability and response time.',
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

  // ── City-Specific ─────────────────────────────────────
  {
    id: 'aberdeen-coverage',
    question: 'Do you offer mobile tyre fitting in Aberdeen?',
    answer:
      'Yes. We cover Aberdeen and all AB postcodes including the city centre, Bridge of Don, Dyce, Westhill, Portlethen and Stonehaven. Response time to Aberdeen city centre is approximately 90 minutes. We also cover Inverurie, Ellon, Peterhead and Fraserburgh — call 0141 266 0690 for your exact ETA.',
    category: 'general',
    isHomepageVisible: false,
  },
  {
    id: 'inverness-coverage',
    question: 'Do you cover Inverness and the Scottish Highlands?',
    answer:
      'Yes. We cover Inverness and all IV postcodes, plus Aviemore, Grantown-on-Spey, Nairn, Dingwall, and Invergordon. For most Inverness city locations, response time is 90–120 minutes. We also serve the NC500 route — if you have a flat tyre in the Highlands, call 0141 266 0690 immediately and we will dispatch the nearest available fitter.',
    category: 'general',
    isHomepageVisible: false,
  },
  {
    id: 'dundee-coverage',
    question: 'Do you offer mobile tyre fitting in Dundee?',
    answer:
      'Yes. We cover Dundee and all DD postcodes including the city centre, Broughty Ferry, Monifieth, and the Angus towns of Arbroath and Forfar. Response time to Dundee city centre is approximately 65 minutes from our base.',
    category: 'general',
    isHomepageVisible: false,
  },
  {
    id: 'nc500-flat-tyre',
    question: 'What should I do if I get a flat tyre on the NC500?',
    answer:
      'Pull safely off the road, turn on hazard lights, and call 0141 266 0690 immediately. We cover the entire NC500 route. Tell us your exact location — a postcode, road number, nearest village, or what3words address. Response times vary depending on your location on the route, from 90 minutes near Inverness to 3+ hours on the most remote north-west sections. For remote sections of the NC500 we recommend checking all four tyres before setting off.',
    category: 'emergency',
    isHomepageVisible: false,
  },
  {
    id: 'rural-scotland-coverage',
    question: 'Can you reach rural areas and villages in Scotland?',
    answer:
      'Yes. We cover rural Scotland including Perthshire, Angus, Aberdeenshire, the Scottish Borders, Argyll, and the Highlands. For most rural locations we can dispatch a fitter the same day. In very remote areas — beyond 30 miles from a major town — we recommend calling in advance so we can confirm a realistic ETA and ensure the right tyres are on the van.',
    category: 'general',
    isHomepageVisible: false,
  },
  {
    id: 'scotland-islands',
    question: 'Do you cover the Scottish Islands?',
    answer:
      'We operate mobile tyre fitting on the larger Scottish islands including Lewis and Harris (Stornoway), Shetland (Lerwick), and Orkney (Kirkwall), as well as Skye, Arran, and the Inner Hebrides. Island services require advance booking of at least 24 hours due to ferry logistics. Call 0141 266 0690 to check availability and confirm your booking.',
    category: 'general',
    isHomepageVisible: false,
  },
  {
    id: 'winter-tyres-scotland',
    question: 'Do you fit winter tyres in Scotland?',
    answer:
      'Yes. We stock winter tyres for common vehicle sizes and can fit them at your location across Scotland. Winter tyre fitting is recommended from October to March, particularly for drivers in the Highlands, rural areas, or anyone who regularly uses the A9, A82, A93 or other Highland routes in snow conditions. Book early in autumn as demand is high.',
    category: 'tyres',
    isHomepageVisible: false,
  },
  {
    id: 'tpms-scotland',
    question: 'Do you offer TPMS sensor replacement in Scotland?',
    answer:
      'Yes. We carry TPMS sensors for most common vehicle makes and models and can replace faulty sensors and reset the system at your location. TPMS sensor issues are common after tyre changes, especially on German-brand vehicles. If your tyre pressure warning light remains on after a fitting, call us on 0141 266 0690 and we will diagnose and resolve it.',
    category: 'services',
    isHomepageVisible: false,
  },
  {
    id: 'tyre-blowout-motorway',
    question: 'What should I do if a tyre blows out on the motorway?',
    answer:
      'Do not brake sharply. Grip the steering wheel firmly with both hands and let the car slow gradually. Once below 50mph, signal left and move to the hard shoulder. Switch on hazard lights, exit via the left-side door only, and stand well away from the vehicle behind the barrier. Then call Tyre Rescue on 0141 266 0690. We cover all Scottish motorways including the M8, M74, M77, M80 and M9. For further safety guidance, see our full tyre blowout emergency guide.',
    category: 'emergency',
    isHomepageVisible: false,
  },
  {
    id: 'run-flat-tyre-replacement',
    question: 'Can you replace run-flat tyres at the roadside?',
    answer:
      'Yes. We carry a range of run-flat tyre sizes and can replace them at your location across Scotland. Run-flat tyres (marked RFT, SSR, or ROF on the sidewall) can be driven at reduced speed for up to 50 miles after a puncture, but must be replaced promptly — driving beyond this can damage the rim. When calling, let us know your vehicle make and tyre size so we can confirm stock.',
    category: 'tyres',
    isHomepageVisible: false,
  },
  {
    id: 'glasgow-airport-flat-tyre',
    question: 'Can you come to Glasgow Airport if I have a flat tyre?',
    answer:
      'Yes. Glasgow Airport (PA3) is one of our most frequent callout locations. We cover all car parks including long-stay, short-stay and multi-storey. If you return from a flight to find a flat tyre, call 0141 266 0690 and we typically reach the airport in 25–35 minutes. For the multi-storey, meet us at the ground-floor barrier or give the bay number.',
    category: 'emergency',
    isHomepageVisible: false,
  },
  {
    id: 'motorway-hard-shoulder-safety',
    question: 'Is it safe to wait for you on a motorway hard shoulder?',
    answer:
      'No — do not stay in or near your vehicle on the hard shoulder. Statistics show stationary vehicles on Scottish motorway hard shoulders are at high risk of being struck from behind. Exit via the LEFT-side door only, move well away from the carriageway, and stand behind the barrier or on the embankment. Keep away from the side of the vehicle facing traffic. When you call us, we will keep you updated on the fitter\'s ETA so you know when it is safe to return.',
    category: 'emergency',
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
