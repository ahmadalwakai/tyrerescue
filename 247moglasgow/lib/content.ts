import { GLASGOW_AREAS, SERVICES } from '@/lib/seo-data';

export type ServiceSlug = (typeof SERVICES)[number]['slug'];
export type AreaSlug = (typeof GLASGOW_AREAS)[number]['slug'];
export type Faq = { question: string; answer: string };

export const SERVICE_DESCRIPTIONS: Record<ServiceSlug, string> = {
  'mobile-tyre-fitting':
    'Mobile fitting at home, work or roadside across Glasgow, with stock matched to your tyre size.',
  'emergency-tyre-fitting':
    'Urgent tyre replacement when you are stuck, stranded or need a fitter dispatched immediately.',
  'puncture-repair':
    'Safe puncture repairs at your location when the tyre damage is legal and repairable.',
  'tyre-fitting':
    'Budget, mid-range and premium tyres supplied and fitted without a garage visit.',
};

export const SERVICE_ICONS: Record<ServiceSlug, string> = {
  'mobile-tyre-fitting': '24/7',
  'emergency-tyre-fitting': 'SOS',
  'puncture-repair': 'FIX',
  'tyre-fitting': 'FIT',
};

export const HOME_FAQS: Faq[] = [
  {
    question: 'How fast can you reach me in Glasgow?',
    answer:
      'Average 35 minutes across all Glasgow postcodes, often faster in central areas like G1-G5, G11, G31.',
  },
  {
    question: 'Do you cover all Glasgow postcodes?',
    answer:
      'Yes - G1 through G78, including all surrounding areas like Rutherglen, Cambuslang, Baillieston and Clarkston.',
  },
  {
    question: 'What tyres do you carry?',
    answer:
      'Budget, mid-range and premium brands including Continental, Michelin, Goodyear, Bridgestone and Pirelli.',
  },
  {
    question: 'Is there a callout fee?',
    answer:
      'Emergency callouts are from £69 including labour. Scheduled mobile fitting is from £20 per tyre plus the tyre cost.',
  },
  {
    question: 'Are you available Christmas Day?',
    answer: 'Yes - 24 hours a day, 365 days a year, including all bank holidays.',
  },
];

export const EMERGENCY_FAQS: Faq[] = [
  {
    question: 'Can you come out right now?',
    answer:
      'Yes. Our emergency service runs 24/7 across Glasgow, and the average response time is 35 minutes.',
  },
  {
    question: 'What if I am on the M8 or A8?',
    answer:
      'Call us from a safe location and tell us your exact position. We will confirm the safest fitting plan before dispatch.',
  },
  {
    question: 'Can you replace a tyre at night?',
    answer:
      'Yes. Our mobile fitters carry lighting and equipment for overnight roadside, home and workplace tyre jobs.',
  },
  {
    question: 'Do I need to know my tyre size?',
    answer:
      'It helps, but we can talk you through finding it on the tyre sidewall or match it from your registration.',
  },
];

export function getServiceBySlug(slug: string) {
  return SERVICES.find((service) => service.slug === slug) ?? null;
}

export function getAreaBySlug(slug: string) {
  return GLASGOW_AREAS.find((area) => area.slug === slug) ?? null;
}

export function getServiceFaqs(serviceName: string): Faq[] {
  return [
    {
      question: `Do you offer ${serviceName.toLowerCase()} 24/7 in Glasgow?`,
      answer:
        'Yes. 247 Mo Glasgow runs day and night across Glasgow postcodes, including weekends and bank holidays.',
    },
    {
      question: 'How quickly can a fitter arrive?',
      answer:
        'The Glasgow-wide average response is 35 minutes, with central and east-end jobs often reached faster.',
    },
    {
      question: 'Can you fit tyres at my home or workplace?',
      answer:
        'Yes. We can fit at home, work, roadside or another safe location with enough room for the fitter to work.',
    },
    {
      question: 'What tyre brands are available?',
      answer:
        'We source budget, mid-range and premium tyres, including Continental, Michelin, Goodyear, Bridgestone and Pirelli.',
    },
  ];
}

export function getAreaFaqs(serviceName: string, areaName: string, etaMin: number): Faq[] {
  return [
    {
      question: `How fast is ${serviceName.toLowerCase()} in ${areaName}?`,
      answer: `Typical response in ${areaName} is around ${etaMin} minutes, depending on traffic and tyre availability.`,
    },
    {
      question: `Do you cover all of ${areaName}, Glasgow?`,
      answer:
        'Yes. We cover homes, workplaces, roadside locations and car parks across Glasgow and surrounding G postcodes.',
    },
    {
      question: 'Can I book online instead of calling?',
      answer:
        'Yes. You can book online for a callback, but for urgent flat tyres calling is the fastest option.',
    },
    {
      question: 'Do you repair punctures or replace the tyre?',
      answer:
        'If the puncture is legally repairable we can repair it. If not, we can supply and fit a replacement tyre.',
    },
  ];
}

export function getNearbyAreas(areaSlug: string, count = 4) {
  const index = GLASGOW_AREAS.findIndex((area) => area.slug === areaSlug);
  const start = index >= 0 ? index : 0;
  const nearby = [];

  for (let offset = 1; nearby.length < count && offset < GLASGOW_AREAS.length; offset += 1) {
    nearby.push(GLASGOW_AREAS[(start + offset) % GLASGOW_AREAS.length]);
  }

  return nearby;
}
