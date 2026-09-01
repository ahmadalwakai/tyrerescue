/**
 * Competitor comparison data for "Tyre Rescue vs X" pages.
 * Each entry produces a page at /compare/tyre-rescue-vs-{slug}
 */

export interface ComparisonFeature {
  feature: string;
  tyreRescue: string;
  competitor: string;
  winner: 'tyrerescue' | 'competitor' | 'tie';
}

export interface CompetitorComparison {
  slug: string;
  competitorName: string;
  competitorShortName: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  description: string;
  features: ComparisonFeature[];
  faq: { question: string; answer: string }[];
  summary: string;
  keywords: string[];
  lastModified: string;
}

export const competitors: CompetitorComparison[] = [
  {
    slug: 'tyre-rescue-vs-kwik-fit',
    competitorName: 'Kwik Fit',
    competitorShortName: 'Kwik Fit',
    title: 'Tyre Rescue vs Kwik Fit: Which Is Better for Mobile Tyre Fitting in Scotland?',
    metaTitle: 'Tyre Rescue vs Kwik Fit: Mobile Tyre Fitting Comparison 2025',
    metaDescription:
      'Compare Tyre Rescue vs Kwik Fit for mobile tyre fitting across Scotland. 24/7 emergency callout, pricing, response times & customer reviews compared.',
    description:
      'A detailed comparison of Tyre Rescue and Kwik Fit for tyre fitting services in Scotland. We compare mobile service availability, pricing, response times, and customer satisfaction to help you choose the right provider.',
    features: [
      { feature: 'Mobile Service', tyreRescue: 'Yes — we come to you anywhere in Scotland', competitor: 'Limited — mainly garage-based with select mobile options', winner: 'tyrerescue' },
      { feature: '24/7 Emergency Callout', tyreRescue: 'Yes — 24 hours, 7 days a week', competitor: 'No — standard business hours only', winner: 'tyrerescue' },
      { feature: 'Average Response Time', tyreRescue: '45 minutes average', competitor: 'Appointment-based, next available slot', winner: 'tyrerescue' },
      { feature: 'Starting Price', tyreRescue: 'Callout from £49 + tyre price', competitor: 'From £45 (garage visit, tyre extra)', winner: 'tie' },
      { feature: 'Coverage Area', tyreRescue: 'All of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness, Highlands and Islands', competitor: 'Nationwide chain with local branches', winner: 'tyrerescue' },
      { feature: 'Tyre Brands', tyreRescue: 'Budget to premium — Michelin, Continental, Bridgestone', competitor: 'Wide range — budget to premium', winner: 'tie' },
      { feature: 'Puncture Repair', tyreRescue: 'Mobile puncture repair — we come to you', competitor: 'In-store puncture repair', winner: 'tyrerescue' },
      { feature: 'Online Booking', tyreRescue: 'Yes — instant online booking with live pricing', competitor: 'Yes — online booking available', winner: 'tie' },
      { feature: 'Trustpilot Rating', tyreRescue: '4.8/5 stars', competitor: '3.7/5 stars', winner: 'tyrerescue' },
      { feature: 'Real-Time Tracking', tyreRescue: 'Yes — live GPS tracking of your fitter', competitor: 'No', winner: 'tyrerescue' },
    ],
    faq: [
      {
        question: 'Is Tyre Rescue cheaper than Kwik Fit?',
        answer: 'Tyre Rescue mobile tyre fitting starts with a £49 emergency callout fee plus the tyre price (varies by size and brand). That is comparable to Kwik Fit garage prices once you add the tyre. The big saving is your time and fuel — our fitters come to your home, office, or roadside.',
      },
      {
        question: 'Does Kwik Fit offer 24/7 mobile tyre fitting?',
        answer: 'Kwik Fit operates primarily from garage locations during standard business hours. Tyre Rescue provides genuine 24/7 emergency mobile tyre fitting across all of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness, Highlands and Islands.',
      },
      {
        question: 'Which has better customer reviews — Tyre Rescue or Kwik Fit?',
        answer: 'Tyre Rescue holds a 4.8/5 Trustpilot rating compared to Kwik Fit\'s 3.7/5. Our smaller, dedicated team can provide more personalised service.',
      },
    ],
    summary:
      'While Kwik Fit offers a well-known nationwide garage network, Tyre Rescue provides a fundamentally different service: we come to you. With 24/7 emergency availability, 45-minute average response times, real-time GPS tracking, and a 4.8-star Trustpilot rating, Tyre Rescue is the superior choice for mobile tyre fitting in Scotland.',
    keywords: [
      'tyre rescue vs kwik fit', 'kwik fit alternative glasgow', 'mobile tyre fitting vs kwik fit',
      'kwik fit mobile tyres', 'kwik fit reviews glasgow', 'better than kwik fit',
    ],
    lastModified: '2025-06-20',
  },
  {
    slug: 'tyre-rescue-vs-national-tyres',
    competitorName: 'National Tyres and Autocare',
    competitorShortName: 'National Tyres',
    title: 'Tyre Rescue vs National Tyres: Mobile Tyre Fitting Comparison',
    metaTitle: 'Tyre Rescue vs National Tyres: Which Is Better in Scotland? (2025)',
    metaDescription:
      'Compare Tyre Rescue vs National Tyres for tyre fitting across Scotland. Emergency callout, mobile service, pricing & reviews side by side.',
    description:
      'National Tyres and Autocare operates a network of garage locations across the UK. Here we compare their service with Tyre Rescue\'s mobile-first approach to help you decide which is right for your tyre needs in Scotland.',
    features: [
      { feature: 'Mobile Service', tyreRescue: 'Yes — fully mobile, we come to any location', competitor: 'Yes — mobile fitting available in some areas', winner: 'tyrerescue' },
      { feature: '24/7 Emergency Callout', tyreRescue: 'Yes — round the clock, every day', competitor: 'No — limited mobile hours', winner: 'tyrerescue' },
      { feature: 'Average Response Time', tyreRescue: '45 minutes average', competitor: 'Pre-booked appointments, typically next day', winner: 'tyrerescue' },
      { feature: 'Starting Price', tyreRescue: 'Callout from £49 + tyre price', competitor: 'From £50 (mobile fitting surcharge, tyre extra)', winner: 'tyrerescue' },
      { feature: 'Coverage Area', tyreRescue: 'All of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness, Dundee, Highlands and more', competitor: 'Select UK areas with mobile service', winner: 'tyrerescue' },
      { feature: 'Tyre Brands', tyreRescue: 'Budget to premium — competitive pricing', competitor: 'Wide range of brands available', winner: 'tie' },
      { feature: 'Puncture Repair', tyreRescue: 'Yes — mobile puncture repair included', competitor: 'Garage-based repairs, some locations offer mobile', winner: 'tyrerescue' },
      { feature: 'Online Booking', tyreRescue: 'Yes — live pricing, instant confirmation', competitor: 'Yes — online booking', winner: 'tie' },
      { feature: 'Trustpilot Rating', tyreRescue: '4.8/5 stars', competitor: '4.3/5 stars', winner: 'tyrerescue' },
      { feature: 'Real-Time Tracking', tyreRescue: 'Yes — live GPS tracking', competitor: 'No', winner: 'tyrerescue' },
    ],
    faq: [
      {
        question: 'Does National Tyres offer mobile tyre fitting in Glasgow?',
        answer: 'National Tyres has some mobile fitting coverage, but availability varies by location. Tyre Rescue guarantees mobile fitting coverage across all of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness, Dundee, Highlands and Islands — 24 hours a day, 7 days a week.',
      },
      {
        question: 'Is Tyre Rescue better value than National Tyres?',
        answer: 'Tyre Rescue starts with a £49 callout fee plus the tyre price, with no hidden mobile surcharges. National Tyres may add a mobile fitting fee on top of tyre prices. Factor in the time and fuel saved not driving to a garage, and Tyre Rescue often works out more cost-effective.',
      },
      {
        question: 'Can I get an emergency tyre change from National Tyres?',
        answer: 'National Tyres operates during standard business hours and requires pre-booking. Tyre Rescue provides genuine emergency callout 24/7 across all of Scotland — average 45 minutes in Glasgow and Edinburgh, 60–90 minutes in Aberdeen and Inverness.',
      },
    ],
    summary:
      'National Tyres offers solid garage-based service with some mobile options. Tyre Rescue focuses exclusively on mobile tyre fitting with genuine 24/7 emergency availability. For time-critical tyre issues or the convenience of home/office fitting, Tyre Rescue is the smarter choice in Scotland.',
    keywords: [
      'tyre rescue vs national tyres', 'national tyres glasgow', 'national tyres mobile fitting',
      'national tyres alternative', 'mobile tyre fitting vs national tyres',
    ],
    lastModified: '2025-06-20',
  },
  {
    slug: 'tyre-rescue-vs-ats-euromaster',
    competitorName: 'ATS Euromaster',
    competitorShortName: 'ATS',
    title: 'Tyre Rescue vs ATS Euromaster: Mobile Tyre Fitting Compared',
    metaTitle: 'Tyre Rescue vs ATS Euromaster: Scotland Tyre Fitting Comparison 2025',
    metaDescription:
      'Tyre Rescue vs ATS Euromaster — compare mobile tyre fitting, 24/7 emergency service, pricing & customer reviews. Find the best tyre fitter in Scotland.',
    description:
      'ATS Euromaster is a major European tyre and auto service provider. We compare their services with Tyre Rescue\'s mobile-first emergency tyre fitting to help Scottish drivers choose the right option.',
    features: [
      { feature: 'Mobile Service', tyreRescue: 'Yes — fully mobile across Scotland', competitor: 'Limited mobile service, mainly fleet-focused', winner: 'tyrerescue' },
      { feature: '24/7 Emergency Callout', tyreRescue: 'Yes — 24/7 in Glasgow, Edinburgh and beyond', competitor: 'Roadside assistance via fleet contract', winner: 'tyrerescue' },
      { feature: 'Average Response Time', tyreRescue: '45 minutes average', competitor: 'Varies — appointment-based for consumers', winner: 'tyrerescue' },
      { feature: 'Starting Price', tyreRescue: 'Callout from £49 + tyre price', competitor: 'From £45 (in-centre, tyre extra)', winner: 'tie' },
      { feature: 'Coverage Area', tyreRescue: 'All of Scotland — deep local knowledge from Glasgow to Shetland', competitor: 'Nationwide chain, limited Scottish centres', winner: 'tyrerescue' },
      { feature: 'Tyre Brands', tyreRescue: 'Budget to premium selection', competitor: 'Wide brand range, strong fleet partnerships', winner: 'tie' },
      { feature: 'Puncture Repair', tyreRescue: 'Mobile puncture repair — at your location', competitor: 'In-centre repair', winner: 'tyrerescue' },
      { feature: 'Online Booking', tyreRescue: 'Yes — instant, transparent pricing', competitor: 'Yes — online booking', winner: 'tie' },
      { feature: 'Trustpilot Rating', tyreRescue: '4.8/5 stars', competitor: '4.1/5 stars', winner: 'tyrerescue' },
      { feature: 'Real-Time Tracking', tyreRescue: 'Yes — live GPS tracking of fitter', competitor: 'No consumer tracking', winner: 'tyrerescue' },
    ],
    faq: [
      {
        question: 'Is ATS Euromaster good for mobile tyre fitting?',
        answer: 'ATS Euromaster focuses primarily on fleet and commercial vehicle services for mobile fitting. For personal vehicle mobile tyre fitting in Scotland, Tyre Rescue is purpose-built for consumer service with 24/7 availability.',
      },
      {
        question: 'How does ATS Euromaster pricing compare to Tyre Rescue?',
        answer: 'ATS Euromaster in-centre fitting starts around £45 plus the tyre. Tyre Rescue starts at a £49 mobile callout fee plus the tyre price — meaning you save on travel time and fuel. For emergency situations, only Tyre Rescue offers round-the-clock mobile service.',
      },
      {
        question: 'Does ATS Euromaster have centres in Scotland?',
        answer: 'ATS Euromaster has a limited number of centres in Scotland. Tyre Rescue covers all of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness, Dundee, Stirling, Falkirk, Paisley, Highlands and Islands — with genuine mobile service. We come to you wherever you are.',
      },
    ],
    summary:
      'ATS Euromaster excels in fleet management and commercial tyre services. For consumer mobile tyre fitting in Scotland, Tyre Rescue provides a more tailored experience with 24/7 emergency callout, faster response times, GPS fitter tracking, and higher customer satisfaction ratings.',
    keywords: [
      'tyre rescue vs ats euromaster', 'ats euromaster glasgow', 'ats euromaster mobile',
      'ats alternative scotland', 'euromaster tyre fitting',
    ],
    lastModified: '2025-06-20',
  },
  {
    slug: 'tyre-rescue-vs-halfords',
    competitorName: 'Halfords Autocentres',
    competitorShortName: 'Halfords',
    title: 'Tyre Rescue vs Halfords: Mobile Tyre Fitting or Garage Visit?',
    metaTitle: 'Tyre Rescue vs Halfords Autocentres: Tyre Fitting Compared 2025',
    metaDescription:
      'Tyre Rescue vs Halfords Autocentres — compare mobile tyre fitting with garage tyre fitting. 24/7 service, pricing, reviews & coverage in Scotland.',
    description:
      'Halfords Autocentres offers a garage-based tyre fitting service across the UK. Here\'s how their offering compares to Tyre Rescue\'s 24/7 mobile tyre fitting service in Scotland.',
    features: [
      { feature: 'Mobile Service', tyreRescue: 'Yes — fully mobile tyre fitting', competitor: 'Halfords Mobile Expert (limited areas)', winner: 'tyrerescue' },
      { feature: '24/7 Emergency Callout', tyreRescue: 'Yes — always available', competitor: 'No — garage hours only', winner: 'tyrerescue' },
      { feature: 'Average Response Time', tyreRescue: '45 minutes average', competitor: 'Pre-booked only', winner: 'tyrerescue' },
      { feature: 'Starting Price', tyreRescue: 'Callout from £49 + tyre price', competitor: 'From £40 (in-store tyre only)', winner: 'tie' },
      { feature: 'Coverage Area', tyreRescue: 'All of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness, Highlands and more', competitor: 'Nationwide garage network', winner: 'tyrerescue' },
      { feature: 'Tyre Brands', tyreRescue: 'Full range — budget to premium', competitor: 'Wide retail range', winner: 'tie' },
      { feature: 'Puncture Repair', tyreRescue: 'Mobile puncture repair', competitor: 'In-store puncture repair', winner: 'tyrerescue' },
      { feature: 'Online Booking', tyreRescue: 'Yes — instant pricing', competitor: 'Yes — tyre search and booking', winner: 'tie' },
      { feature: 'Trustpilot Rating', tyreRescue: '4.8/5 stars', competitor: '3.5/5 stars', winner: 'tyrerescue' },
      { feature: 'Real-Time Tracking', tyreRescue: 'Yes — GPS live tracking', competitor: 'No', winner: 'tyrerescue' },
    ],
    faq: [
      {
        question: 'Should I use Halfords or Tyre Rescue for tyre fitting?',
        answer: 'If you can drive to a garage during business hours, Halfords is a reasonable option. If you need emergency help, prefer the convenience of a fitter coming to you, or face a flat tyre outside normal hours, Tyre Rescue is the better choice.',
      },
      {
        question: 'Does Halfords offer mobile tyre fitting in Glasgow?',
        answer: 'Halfords Mobile Expert has limited mobile coverage in select UK cities. Tyre Rescue provides comprehensive mobile tyre fitting across all of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness, Dundee, Highlands and Islands — available 24/7.',
      },
      {
        question: 'Which is more affordable — Halfords or Tyre Rescue?',
        answer: 'Halfords in-store fitting may start slightly cheaper for the tyre alone, but once you add your travel time and fuel costs, Tyre Rescue\'s mobile service (£49 callout fee + tyre price) is very competitive — and far more convenient.',
      },
    ],
    summary:
      'Halfords is a trusted high street name with good in-store deals. For mobile convenience, emergency situations, or fitting outside business hours, Tyre Rescue is the superior option in Scotland with 24/7 availability and a significantly higher customer satisfaction rating.',
    keywords: [
      'tyre rescue vs halfords', 'halfords tyre fitting glasgow', 'halfords mobile expert',
      'halfords alternative', 'mobile tyre fitting vs halfords',
    ],
    lastModified: '2025-06-20',
  },
  {
    slug: 'tyre-rescue-vs-arnold-clark-tyres',
    competitorName: 'Arnold Clark Tyres',
    competitorShortName: 'Arnold Clark',
    title: 'Tyre Rescue vs Arnold Clark Tyres: Mobile Fitting or Garage Visit in Scotland?',
    metaTitle: 'Tyre Rescue vs Arnold Clark Tyres: Scotland Tyre Fitting Compared 2025',
    metaDescription:
      'Tyre Rescue vs Arnold Clark Tyres — compare mobile tyre fitting vs garage service across Scotland. 24/7 emergency callout, pricing, response times & reviews side by side.',
    description:
      'Arnold Clark is one of Scotland\'s most recognisable automotive brands, operating dozens of service centres across the country. Here we compare their tyre fitting service with Tyre Rescue\'s mobile-first 24/7 approach to help Scottish drivers choose the right option.',
    features: [
      { feature: 'Mobile Service', tyreRescue: 'Yes — fully mobile, we come to your location', competitor: 'Garage-based only — you must bring your vehicle in', winner: 'tyrerescue' },
      { feature: '24/7 Emergency Callout', tyreRescue: 'Yes — 24 hours, 7 days a week', competitor: 'No — standard business hours only', winner: 'tyrerescue' },
      { feature: 'Average Response Time', tyreRescue: '45 minutes average (Glasgow/Edinburgh)', competitor: 'Appointment-based — earliest available slot', winner: 'tyrerescue' },
      { feature: 'Starting Price', tyreRescue: 'Callout from £49 + tyre price', competitor: 'From £45 (garage visit, tyre extra)', winner: 'tie' },
      { feature: 'Coverage Area', tyreRescue: 'All of Scotland — Glasgow, Edinburgh, Aberdeen, Inverness, Highlands and Islands', competitor: 'Multiple Scottish branches — must be near a centre', winner: 'tyrerescue' },
      { feature: 'Tyre Brands', tyreRescue: 'Budget to premium — Michelin, Continental, Bridgestone', competitor: 'Wide range including manufacturer-approved fitments', winner: 'tie' },
      { feature: 'Puncture Repair', tyreRescue: 'Mobile puncture repair — at your location', competitor: 'In-garage puncture repair only', winner: 'tyrerescue' },
      { feature: 'Online Booking', tyreRescue: 'Yes — instant online booking with live pricing', competitor: 'Yes — online appointment booking', winner: 'tie' },
      { feature: 'Trustpilot Rating', tyreRescue: '4.8/5 stars', competitor: 'Varies by branch', winner: 'tyrerescue' },
      { feature: 'Real-Time Tracking', tyreRescue: 'Yes — live GPS tracking of your fitter', competitor: 'No customer tracking', winner: 'tyrerescue' },
    ],
    faq: [
      {
        question: 'Is Arnold Clark cheaper than Tyre Rescue for tyre fitting?',
        answer: 'Arnold Clark\'s garage-based tyre prices are broadly competitive with Tyre Rescue\'s supply prices. The key difference is the callout fee: Tyre Rescue charges £49 for mobile fitting, but you save the time and fuel cost of driving to a centre. For emergency situations or when you cannot drive the vehicle, Tyre Rescue is the only option.',
      },
      {
        question: 'Does Arnold Clark offer 24-hour tyre fitting?',
        answer: 'No. Arnold Clark service centres operate during standard business hours. Tyre Rescue provides genuine 24/7 emergency mobile tyre fitting across all of Scotland — available immediately, any time of day or night.',
      },
      {
        question: 'Can I use Tyre Rescue if I have an Arnold Clark warranty?',
        answer: 'In most cases, yes. Standard vehicle warranties are not voided by having tyres fitted by a reputable independent mobile fitter. Tyre-specific manufacturer warranties (on the tyre itself) are transferred to whoever fitted the tyre. Contact your warranty provider to confirm specific terms.',
      },
      {
        question: 'Which is better for a flat tyre emergency in Scotland?',
        answer: 'For any emergency — flat tyre, blowout, or a tyre warning light — Tyre Rescue is the clear choice. We dispatch immediately and reach you at your exact location. Arnold Clark centres require you to bring the vehicle in and may not have same-day availability.',
      },
    ],
    summary:
      'Arnold Clark is a trusted Scotland-wide brand for car sales and servicing. For tyre fitting, their garage-based model is fine if you can drive to a centre during business hours. For emergencies, 24/7 availability, or the convenience of mobile fitting at home or work, Tyre Rescue provides a fundamentally superior service.',
    keywords: [
      'tyre rescue vs arnold clark', 'arnold clark tyres scotland', 'arnold clark tyre fitting glasgow',
      'arnold clark tyre fitting edinburgh', 'arnold clark mobile tyres', 'arnold clark tyre prices',
      'better than arnold clark tyres', 'mobile tyre fitting vs arnold clark',
    ],
    lastModified: '2025-08-01',
  },
  {
    slug: 'tyre-rescue-vs-protyre',
    competitorName: 'Protyre',
    competitorShortName: 'Protyre',
    title: 'Tyre Rescue vs Protyre: Mobile Tyre Fitting Compared in Scotland',
    metaTitle: 'Tyre Rescue vs Protyre: Scotland Tyre Fitting Comparison 2025',
    metaDescription:
      'Tyre Rescue vs Protyre — compare mobile tyre fitting vs garage service in Scotland. 24/7 emergency callout, pricing, reviews & coverage across Glasgow, Edinburgh and beyond.',
    description:
      'Protyre operates a network of tyre and autocare centres across the UK, including locations in Scotland. We compare their service with Tyre Rescue\'s mobile-first approach to help you decide which works best for your situation.',
    features: [
      { feature: 'Mobile Service', tyreRescue: 'Yes — fully mobile across all of Scotland', competitor: 'Limited mobile options — primarily garage-based', winner: 'tyrerescue' },
      { feature: '24/7 Emergency Callout', tyreRescue: 'Yes — around the clock, every day', competitor: 'No — standard operating hours only', winner: 'tyrerescue' },
      { feature: 'Average Response Time', tyreRescue: '45 minutes average in Central Scotland', competitor: 'Pre-booked appointments required', winner: 'tyrerescue' },
      { feature: 'Starting Price', tyreRescue: 'Callout from £49 + tyre price', competitor: 'From £45 in-centre (tyre extra)', winner: 'tie' },
      { feature: 'Coverage Area', tyreRescue: 'All of Scotland — Glasgow to Shetland', competitor: 'Selected UK locations with some Scottish branches', winner: 'tyrerescue' },
      { feature: 'Tyre Brands', tyreRescue: 'Budget to premium — competitive pricing', competitor: 'Wide range, strong brand partnerships', winner: 'tie' },
      { feature: 'Puncture Repair', tyreRescue: 'Mobile puncture repair at your location', competitor: 'In-centre repair — must attend a branch', winner: 'tyrerescue' },
      { feature: 'Online Booking', tyreRescue: 'Yes — live pricing, instant confirmation', competitor: 'Yes — online appointment booking', winner: 'tie' },
      { feature: 'Trustpilot Rating', tyreRescue: '4.8/5 stars', competitor: '4.2/5 stars', winner: 'tyrerescue' },
      { feature: 'Real-Time Tracking', tyreRescue: 'Yes — live GPS tracking of fitter', competitor: 'No consumer tracking available', winner: 'tyrerescue' },
    ],
    faq: [
      {
        question: 'Does Protyre operate in Scotland?',
        answer: 'Protyre has a limited number of centres in Scotland. Coverage varies by location and they do not offer a comprehensive Scotland-wide mobile service. Tyre Rescue covers all of Scotland — from Glasgow and Edinburgh to Aberdeen, Inverness, and the Highlands — with mobile fitting available 24/7.',
      },
      {
        question: 'Is Protyre good for emergency tyre fitting?',
        answer: 'Protyre operates during standard business hours from fixed locations. For emergency tyre fitting — flat tyres, blowouts, or roadside assistance — Tyre Rescue is the better choice, with genuine 24/7 mobile service and an average 45-minute response time in Central Scotland.',
      },
      {
        question: 'How do Protyre prices compare to Tyre Rescue?',
        answer: 'Protyre in-centre fitting is broadly competitive on tyre prices. Tyre Rescue adds a £49 mobile callout fee, but you save the time and fuel cost of visiting a centre. For emergency situations where you cannot drive the car, only Tyre Rescue provides an immediate mobile solution.',
      },
    ],
    summary:
      'Protyre is a solid choice for planned tyre work at a nearby centre. For mobile fitting, 24/7 emergency service, or coverage across all of Scotland including rural and Highland areas, Tyre Rescue offers a significantly better service proposition for Scottish drivers.',
    keywords: [
      'tyre rescue vs protyre', 'protyre scotland', 'protyre glasgow', 'protyre edinburgh',
      'protyre mobile tyres', 'protyre alternative', 'mobile tyre fitting vs protyre',
    ],
    lastModified: '2025-08-01',
  },
];

export function getCompetitorBySlug(slug: string): CompetitorComparison | undefined {
  return competitors.find((c) => c.slug === slug);
}

export function getAllCompetitorSlugs(): string[] {
  return competitors.map((c) => c.slug);
}
