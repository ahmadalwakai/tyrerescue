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
  {
    id: 'shetland-western-isles-coverage',
    question: 'Do you cover Shetland and the Western Isles (Outer Hebrides)?',
    answer:
      'Yes — we cover both Shetland (Lerwick, ZE postcodes) and the Western Isles (Stornoway, Lewis, Harris, Uists, Barra — HS postcodes). Island services require a minimum 24 hours advance booking due to ferry and logistics scheduling. Call 0141 266 0690 as early as possible to arrange island cover. For genuine emergencies, we will explore all available options including local partner fitters.',
    category: 'general',
    isHomepageVisible: false,
  },
  {
    id: 'isle-of-skye-coverage',
    question: 'Do you cover the Isle of Skye?',
    answer:
      'Yes — the Isle of Skye is accessible via the Skye Bridge and is within our coverage area. We serve Portree (IV51), Broadford (IV49), Kyle of Lochalsh (IV40), Uig, Dunvegan, and the Sleat Peninsula. Response times on Skye are typically 90–140 minutes depending on your location on the island. Call 0141 266 0690 as soon as you notice a tyre fault — the earlier you call, the faster we can reach you.',
    category: 'general',
    isHomepageVisible: false,
  },
  {
    id: 'scottish-borders-coverage',
    question: 'Do you cover the Scottish Borders — Galashiels, Hawick, Peebles?',
    answer:
      'Yes — we cover all Scottish Borders towns including Galashiels (TD1), Hawick (TD9), Peebles (EH45), Melrose (TD6), Jedburgh (TD8), Kelso (TD5), and Duns (TD11). Response times from Glasgow and Edinburgh bases are typically 60–100 minutes. We cover the full A68 (Edinburgh to Jedburgh) and A7 (Edinburgh to Hawick) corridors.',
    category: 'general',
    isHomepageVisible: false,
  },
  {
    id: 'nc500-wick-thurso',
    question: 'Do you cover Wick, Thurso and the far north of Scotland?',
    answer:
      'Yes — we cover Wick (KW1), Thurso (KW14), and Caithness (KW postcodes). These are among our most remote mainland locations, so response times are typically 150–180 minutes from our nearest Highland base. For NC500 breakdowns in Caithness, call 0141 266 0690 immediately rather than waiting — the sooner you call, the faster we can reach you. We cover the full NC500 route including the north coast.',
    category: 'general',
    isHomepageVisible: false,
  },
  {
    id: 'argyll-oban-coverage',
    question: 'Do you cover Oban, Argyll and the Rest and Be Thankful area?',
    answer:
      'Yes — we cover Oban (PA34), Inveraray, Lochgilphead, Campbeltown, and the wider Argyll region (PA postcodes). We also attend callouts on the A83 through the Rest and Be Thankful mountain pass. Response times to Oban are typically 90–120 minutes from Glasgow. For Campbeltown at the tip of Kintyre, response times are 150–180 minutes — please call as soon as you notice a problem.',
    category: 'general',
    isHomepageVisible: false,
  },
  {
    id: 'cumbernauld-motherwell-coverage',
    question: 'Do you cover Cumbernauld, Motherwell and North Lanarkshire?',
    answer:
      'Yes — North Lanarkshire is fully covered. This includes Motherwell (ML1–ML2), Wishaw, Coatbridge (ML5), Airdrie (ML6), Cumbernauld (G67–G68), Kilsyth, and Bellshill. Response times are typically 30–60 minutes from our Glasgow base. We also cover the M74 and M80 motorway corridors that run through North Lanarkshire.',
    category: 'general',
    isHomepageVisible: false,
  },
  {
    id: 'dunfermline-fife-coverage',
    question: 'Do you cover Dunfermline and West Fife?',
    answer:
      'Yes — we cover Dunfermline (KY11–KY12), Rosyth, Inverkeithing, Cowdenbeath, and surrounding West Fife communities. Response times are typically 45–65 minutes. We also cover drivers who notice problems after crossing the Forth Road Bridge or Queensferry Crossing — common callout locations near the north end of the bridge.',
    category: 'general',
    isHomepageVisible: false,
  },

  // ── Tyres & Technical ────────────────────────────────
  {
    id: 'tyre-tread-depth-legal',
    question: 'What is the legal minimum tyre tread depth in Scotland?',
    answer:
      'The UK legal minimum tyre tread depth is 1.6mm across the central three-quarters of the tyre, around the full circumference. Driving below this is a criminal offence — up to £2,500 fine and 3 penalty points per tyre. On Scotland\'s wet roads, we recommend replacing tyres when tread reaches 3mm, as braking performance degrades significantly below this level. Use the 20p coin test: if you can see the outer rim of the coin in the tread groove, you are approaching the limit.',
    category: 'tyres',
    isHomepageVisible: false,
  },
  {
    id: 'tyre-pressure-check',
    question: 'What tyre pressure should I use and where do I check?',
    answer:
      'Your recommended tyre pressure is on a sticker inside the driver\'s door, on the fuel cap, or in the vehicle handbook. Pressures are typically 30–36 PSI for standard cars and 42–45 PSI for electric vehicles. Check pressures monthly and before long journeys using a gauge at a petrol station air pump. In Scotland\'s cold winters, tyre pressure drops approximately 1 PSI per 10°C temperature fall — pressures that were correct in summer may be 2–3 PSI low by January.',
    category: 'tyres',
    isHomepageVisible: false,
  },
  {
    id: 'tpms-light-meaning',
    question: 'My TPMS (tyre pressure) warning light has come on — what should I do?',
    answer:
      'A solid TPMS warning light means at least one tyre is 25% or more below its recommended pressure. Do not ignore it — check all four tyres as soon as possible. If the light flashes for 60–90 seconds then stays on, this indicates a sensor fault rather than a pressure problem, often after a tyre change. Tyre Rescue resets TPMS sensors as standard when fitting tyres. If you are in a remote location and the tyre looks visibly flat, do not drive on it — call 0141 266 0690 immediately.',
    category: 'tyres',
    isHomepageVisible: false,
  },
  {
    id: 'mot-tyre-check',
    question: 'What do MOT inspectors check on tyres, and what causes a fail?',
    answer:
      'MOT tyre checks cover: tread depth (must be above 1.6mm across the central three-quarters), sidewall condition (no bulges, cuts, or cracks exposing cords), correct fitment (no mixing of radial and cross-ply on the same axle), and load/speed rating suitability. An automatic fail is triggered by tread below 1.6mm, any bulge or structural damage, or cuts exposing the tyre cords. We recommend checking your tyres before your MOT and fitting replacements beforehand if needed — a tyre fail means paying for a re-test. We offer pre-MOT tyre fitting across Scotland.',
    category: 'tyres',
    isHomepageVisible: false,
  },
  {
    id: 'tyre-age-replacement',
    question: 'How old is too old for a tyre, and how do I check my tyre\'s age?',
    answer:
      'Tyres over 10 years old should be replaced regardless of tread depth — aged rubber becomes brittle and can crack internally even when tread looks fine. Tyres between 5 and 10 years old should be inspected annually by a qualified fitter. To check age, find the DOT code on the tyre sidewall — the last four digits give the week and year of manufacture (e.g., 3218 = week 32 of 2018). Scottish temperature extremes and UV on Highland routes accelerate tyre ageing slightly compared to urban driving.',
    category: 'tyres',
    isHomepageVisible: false,
  },
  {
    id: 'spare-tyre-uk-law',
    question: 'Is it illegal to drive without a spare tyre in the UK?',
    answer:
      'No — there is no legal requirement to carry a spare tyre in the UK. Many modern cars do not include one, instead providing run-flat tyres, a space-saver spare, or a tyre inflation kit. For Highland and remote Scottish routes, we strongly recommend either a space-saver spare or run-flat tyres, as a flat tyre 50+ miles from the nearest garage can leave you stranded well beyond the 50-mile run-flat range. If you have a flat with no spare in Scotland, call 0141 266 0690 and we will come to you.',
    category: 'tyres',
    isHomepageVisible: false,
  },
  {
    id: 'ev-tyre-replacement',
    question: 'Do you fit electric vehicle (EV) tyres in Scotland?',
    answer:
      'Yes — we fit EV-specific and EV-compatible tyres for all major electric vehicle brands including Tesla, BMW i-Series, Volkswagen ID, Hyundai Ioniq, Kia EV6, Polestar, and others. EV tyres require a higher load index than equivalent petrol car tyres due to battery weight, and many EVs need acoustic (noise-reducing) tyres. When booking, mention your vehicle model and we will confirm the correct specification and EV-appropriate tyre options.',
    category: 'tyres',
    isHomepageVisible: false,
  },
  {
    id: 'winter-tyre-switch-timing',
    question: 'When should I switch to winter tyres in Scotland?',
    answer:
      'The threshold for winter tyres is 7°C — below this temperature, standard summer tyre compound hardens and wet grip reduces significantly. In Scotland, this means: Central Belt (Glasgow, Edinburgh) switch from late October; Dundee, Perth and Aberdeen from mid-October; Highlands, Caithness, and northern Scotland from early to mid-October. For Central Belt drivers who do not want seasonal swaps, premium all-season tyres with the Three Peak Mountain Snowflake symbol (Michelin CrossClimate 2, Continental AllSeasonContact) offer year-round performance. We fit both winter and all-season tyres across Scotland.',
    category: 'tyres',
    isHomepageVisible: false,
  },
  {
    id: 'van-commercial-tyre-fitting',
    question: 'Do you fit tyres on vans and commercial vehicles?',
    answer:
      'Yes — we carry and fit commercial (C-rated) tyres for Ford Transit, Mercedes Sprinter, Vauxhall Vivaro, VW Crafter, Renault Trafic, and other vans across Scotland. Commercial tyres require higher load ratings than passenger car tyres and must be correctly specified for the vehicle\'s payload. We offer emergency van tyre fitting 24/7 across Scotland, plus scheduled fleet tyre management for businesses running multiple vehicles. Call 0141 266 0690 with your van registration for a quote.',
    category: 'services',
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
