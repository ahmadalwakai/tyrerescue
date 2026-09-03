/**
 * Dynamic FAQ generator for service+city pages.
 * Produces 5 unique Q&A per service/city combination for FAQPage JSON-LD
 * and the visible FAQ section on the page.
 */

export interface FaqItem {
  question: string;
  answer: string;
}

const serviceLabels: Record<string, string> = {
  'mobile-tyre-fitting': 'mobile tyre fitting',
  'emergency-tyre-fitting': 'emergency tyre fitting',
  'tyre-repair': 'tyre repair',
  'puncture-repair': 'puncture repair',
  'tyre-fitting': 'tyre fitting',
};

const servicePriceFrom: Record<string, string> = {
  'mobile-tyre-fitting': '£20 per tyre (fitting fee)',
  'emergency-tyre-fitting': '£49 callout fee',
  'tyre-repair': '£25',
  'puncture-repair': '£25',
  'tyre-fitting': '£20 per tyre (fitting fee)',
};

const serviceResponseNote: Record<string, string> = {
  'mobile-tyre-fitting': 'For scheduled fittings we provide a confirmed two-hour arrival window.',
  'emergency-tyre-fitting': 'Emergency callouts are prioritised — we aim to reach you within 45 minutes of your call.',
  'tyre-repair': 'We assess the damage on arrival and advise you before doing any work.',
  'puncture-repair': 'Most standard punctures are repaired within 30 minutes of our arrival.',
  'tyre-fitting': 'We confirm your tyre size and availability before dispatching a fitter.',
};

export function getServiceCityFaqs(
  serviceSlug: string,
  cityName: string,
  avgResponseMin: number,
  priceFrom?: string,
): FaqItem[] {
  const label = serviceLabels[serviceSlug] ?? serviceSlug.replace(/-/g, ' ');
  const price = priceFrom ?? servicePriceFrom[serviceSlug] ?? 'competitive rates';
  const responseNote = serviceResponseNote[serviceSlug] ?? '';

  return [
    {
      question: `How much does ${label} cost in ${cityName}?`,
      answer: `Our ${label} in ${cityName} starts from ${price} plus the cost of any tyres required. There are no hidden charges — the price we quote includes labour and balancing. ${responseNote}`,
    },
    {
      question: `How long will it take for a fitter to reach me in ${cityName}?`,
      answer: `Our average response time in ${cityName} is ${avgResponseMin} minutes. This can vary slightly depending on traffic and the time of day, but we always give you an accurate ETA when you book. We cover all postcodes in ${cityName} and the surrounding areas.`,
    },
    {
      question: `Do you offer ${label} in ${cityName} at night or on weekends?`,
      answer: `Yes — we operate 24 hours a day, 7 days a week across ${cityName}. Whether you need us at 3am on a Sunday or first thing on a bank holiday morning, you can call 0141 266 0690 and we will dispatch the nearest available fitter.`,
    },
    {
      question: `What areas of ${cityName} do you cover?`,
      answer: `We cover the whole of ${cityName} and all surrounding postcodes. Our fitters come to your exact location — whether you are at home, at work, in a car park, or at the roadside. You do not need to drive to a garage. Just tell us where you are and we come to you.`,
    },
    {
      question: `Do I need to book in advance for ${label} in ${cityName}?`,
      answer: `Emergency callouts in ${cityName} do not require advance booking — just call 0141 266 0690. For scheduled or planned fittings we recommend booking online or by phone at least a few hours ahead to guarantee fitter availability in your area.`,
    },
    {
      question: `Is Tyre Rescue a real tyre fitting company or a booking broker?`,
      answer: `Tyre Rescue is a real mobile tyre fitting company with our own workshop at 3 Gateside Street, Parkhead, Glasgow G31 1PD. Every fitter who attends your vehicle is employed or directly contracted by us — not a random contractor sourced from a WhatsApp group. We are fully insured, trained, and accountable. You will always speak to our own team when you call 0141 266 0690.`,
    },
  ];
}
